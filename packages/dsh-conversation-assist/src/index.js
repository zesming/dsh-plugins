/** Host half: the live Turn tracker, owned settings, and the two exact routes. */

import { candidateKey } from './shared/prediction.mjs'
import { LIMITS } from './shared/limits.mjs'
import { createTracker } from './host/tracker.mjs'
import { createPredictor, routeFromHeader, routeFromProjection } from './host/predict.mjs'
import { createSettingsHandler, createSuggestHandler } from './host/routes.mjs'
import { createStateStore, resolveHome } from './host/state.mjs'

/** Settings route. */
export const SETTINGS_PATH = '/api/dsh-conversation-assist.settings'
/** Suggestion route. */
export const SUGGEST_PATH = '/api/dsh-conversation-assist.suggest'

/** Day key for the per-session daily budget. */
function today() {
  return new Date().toISOString().slice(0, 10)
}

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

  const cache = new Map()
  const inflight = new Map()
  const budget = new Map()
  let active = 0

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
  async function generateSuggestion({ session, turn, language, signal }) {
    const key = candidateKey(session.id, turn.turn)
    const cached = cache.get(session.id)
    if (cached !== undefined && cached.turn === turn.turn) {
      return { state: 'ready', text: cached.text, turn: turn.turn, endSeq: turn.endSeq }
    }
    const pending = inflight.get(key)
    if (pending !== undefined) return pending
    const day = today()
    const spent = budget.get(session.id)
    if (spent === undefined || spent.day !== day) budget.set(session.id, { day, count: 0 })
    const slot = budget.get(session.id)
    if (slot.count >= LIMITS.dailyPerSession) return { state: 'none' }
    if (active >= LIMITS.maxConcurrent) return { state: 'none' }
    slot.count += 1
    active += 1
    const task = predictor.generate({ session, turn, language, signal })
      .then((result) => {
        if (result.state === 'ready') cache.set(session.id, { turn: turn.turn, text: result.text })
        return result
      })
      .catch(() => ({ state: 'none' }))
      .finally(() => {
        active -= 1
        inflight.delete(key)
      })
    inflight.set(key, task)
    return task
  }

  const settingsCore = createSettingsHandler({
    getSettings: () => state.getSettings(),
    saveSettings: async (patch) => {
      await ready
      return state.saveSettings(patch)
    },
  })
  const suggestCore = createSuggestHandler({
    getSettings: () => state.getSettings(),
    getSession: id => ctx.sessions.get(id),
    getTurn: id => tracker.get(id),
    generate: generateSuggestion,
  })
  const settingsHandler = async (request) => { await ready; return settingsCore(request) }
  const suggestHandler = async (request) => { await ready; return suggestCore(request) }

  ctx.on('session/event', (session, event) => {
    tracker.observe(session, event)
    if (event.type === 'turn/start') cache.delete(session.id)
  })
  ctx.on('session/disposed', (session) => {
    tracker.forget(session.id)
    cache.delete(session.id)
    budget.delete(session.id)
  })

  ctx.inject(['connection'], (scope) => {
    scope.effect(() => {
      const disposers = [
        scope.connection.fetch.register({
          path: SETTINGS_PATH,
          methods: ['GET', 'POST'],
          requestBody: 'buffered',
          fetch: settingsHandler,
        }),
        scope.connection.fetch.register({
          path: SUGGEST_PATH,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: suggestHandler,
        }),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-conversation-assist: routes')
  })
}
