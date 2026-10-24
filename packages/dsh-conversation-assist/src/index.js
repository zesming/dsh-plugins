/** Host half: the live Turn tracker, owned settings, and the two exact routes. */

import { candidateKey } from './shared/prediction.mjs'
import { createSuggestionGate } from './host/gate.mjs'
import { createTracker } from './host/tracker.mjs'
import { createPredictor, routeFromHeader, routeFromProjection } from './host/predict.mjs'
import { createDebugHandler, createSettingsHandler, createSuggestHandler } from './host/routes.mjs'
import { createStateStore, resolveHome } from './host/state.mjs'

/** Settings route. */
export const SETTINGS_PATH = '/api/dsh-conversation-assist.settings'
/** Suggestion route. */
export const SUGGEST_PATH = '/api/dsh-conversation-assist.next'
/** Temporary eligibility-report route used during verification. */
export const DEBUG_PATH = '/api/dsh-conversation-assist.debug'

/**
 * Mount the Host half.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  const tracker = createTracker()
  const home = (() => {
    try {
      const resolve = ctx.get('dshHomePath')
      return typeof resolve === 'function' ? resolve() : resolveHome()
    } catch {
      return resolveHome()
    }
  })()
  const state = createStateStore({ home, logger: ctx.logger })
  const ready = state.load().catch(() => state.getSettings())

  const gate = createSuggestionGate()
  const inflight = new Map()
  const lifetime = new AbortController()
  ctx.effect(() => () => lifetime.abort(), 'dsh-conversation-assist: lifetime')

  const resolveRoute = (session, turn) => {
    const fromHeader = routeFromHeader(turn.header)
    if (fromHeader !== undefined) return fromHeader
    try {
      const snapshot = ctx.get('sessionProjections')?.snapshot?.(session, ['modelSelection'])
      return routeFromProjection(snapshot?.values)
    } catch {
      return undefined
    }
  }

  const predictor = createPredictor({
    getLlm: () => ctx.get('llm'),
    resolveRoute,
    audit: record => state.appendAudit(record),
  })

  /**
   * Generate at most one suggestion per Session and Turn, with a small budget.
   * @param request - Session, tracked Turn, language, caller signal.
   * @returns a ready/none result.
   */
  async function generateSuggestion({ session, turn, language }) {
    const remembered = gate.check(session.id, turn.turn)
    if (remembered.hit) {
      return remembered.none === true
        ? { state: 'none' }
        : { state: 'ready', text: remembered.text, turn: turn.turn, endSeq: turn.endSeq, route: turn.header ?? null }
    }
    const key = candidateKey(session.id, turn.turn)
    const pending = inflight.get(key)
    if (pending !== undefined) return pending
    if (!gate.take(session.id)) {
      gate.remember(session.id, turn.turn, undefined)
      return { state: 'none' }
    }
    const task = predictor.generate({ session, turn, language, signal: lifetime.signal })
      .then((result) => {
        gate.remember(session.id, turn.turn, result.state === 'ready' ? result.text : undefined)
        return result.state === 'ready' ? { ...result, route: turn.header ?? null } : result
      })
      .catch(() => {
        gate.remember(session.id, turn.turn, undefined)
        return { state: 'none' }
      })
      .finally(() => {
        gate.release()
        inflight.delete(key)
      })
    inflight.set(key, task)
    return task
  }

  const suggestCore = createSuggestHandler({
    getSettings: () => state.getSettings(),
    getSession: id => ctx.sessions.get(id),
    getTurn: id => tracker.get(id),
    generate: generateSuggestion,
    // Temporary verification aid; remove before the merge.
    onRequest: info => { void state.appendDebug({ at: Date.now(), kind: 'request', ...info }) },
  })
  const suggestHandler = async (request) => { await ready; return suggestCore(request) }
  const settingsCore = createSettingsHandler({
    getSettings: () => state.getSettings(),
    saveSettings: async (patch) => {
      await ready
      return state.saveSettings(patch)
    },
    // The app protocol intercepts the standalone suggestion path before our
    // handler runs, so the proven settings path carries the suggestion action.
    onSuggest: async (value) => {
      const forwarded = new Request('http://conversation-assist.local/api/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value),
      })
      return suggestHandler(forwarded)
    },
  })
  const settingsHandler = async (request) => { await ready; return settingsCore(request) }
  const debugHandler = createDebugHandler({
    onReport: report => { void state.appendDebug({ at: Date.now(), kind: 'eligibility', ...report }) },
  })

  ctx.on('session/event', (session, event) => {
    tracker.observe(session, event)
    if (event.type === 'turn/start') gate.forgetCandidate(session.id)
  })
  ctx.on('session/disposed', (session) => {
    tracker.forget(session.id)
    gate.clear(session.id)
  })

  ctx.inject(['connection'], (scope) => {
    scope.effect(() => {
      const routes = [
        { path: SETTINGS_PATH, methods: ['GET', 'POST'], requestBody: 'buffered', fetch: settingsHandler },
        { path: SUGGEST_PATH, methods: ['POST'], requestBody: 'buffered', fetch: suggestHandler },
        { path: DEBUG_PATH, methods: ['POST'], requestBody: 'buffered', fetch: debugHandler },
      ]
      const disposers = []
      // One bad route must not take the other two down; record why it failed in
      // the verification log instead of losing the whole Host half.
      for (const route of routes) {
        try {
          disposers.push(scope.connection.fetch.register(route))
        } catch (error) {
          void state.appendDebug({
            at: Date.now(),
            kind: 'route-error',
            path: route.path,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-conversation-assist: routes')
  })
}
