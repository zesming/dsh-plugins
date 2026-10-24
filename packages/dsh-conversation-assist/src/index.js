/** Host half: the live Turn tracker, owned settings, and the two exact routes. */

import { candidateKey } from './shared/prediction.mjs'
import { createSuggestionGate } from './host/gate.mjs'
import { createTracker } from './host/tracker.mjs'
import { createPredictor, routeFromHeader, routeFromProjection } from './host/predict.mjs'
import { createSettingsHandler, createSuggestHandler } from './host/routes.mjs'
import { createStateStore, resolveHome } from './host/state.mjs'

/** Settings route. */
export const SETTINGS_PATH = '/api/dsh-conversation-assist.settings'
/** Suggestion route. */
export const SUGGEST_PATH = '/api/dsh-conversation-assist.rpc'

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
    // A cap rejection never reached the model: leave the Turn unremembered so
    // a released concurrency slot can still serve it. Only a real attempt is
    // negatively cached below.
    if (!gate.take(session.id)) return { state: 'none' }
    // Deliberately use the plugin lifetime, not the browser request signal: a
    // draft edit cancels the fetch but the Host still finishes this Turn so the
    // retained candidate can reappear without a second model call. The 8s
    // prediction timeout bounds the attempt.
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
    getSession: id => ctx.get('sessions')?.get?.(id),
    getTurn: id => tracker.get(id),
    generate: generateSuggestion,
  })
  const suggestHandler = async (request) => { await ready; return suggestCore(request) }
  const settingsCore = createSettingsHandler({
    getSettings: () => state.getSettings(),
    saveSettings: async (patch) => {
      await ready
      return state.saveSettings(patch)
    },
  })
  const settingsHandler = async (request) => { await ready; return settingsCore(request) }

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
      ]
      const disposers = routes.map(route => scope.connection.fetch.register(route))
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-conversation-assist: routes')
  })
}
