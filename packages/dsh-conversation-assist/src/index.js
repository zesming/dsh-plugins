/** Host capture, durable settings, and read-only per-Turn assistance routes. */

import { createSuggestionGate, localDayKey } from './host/gate.mjs'
import { createPredictor, PROMPT_VERSION, routeFromHeader, routeFromProjection } from './host/predict.mjs'
import { createRecapHandler, createSettingsHandler, createSuggestHandler } from './host/routes.mjs'
import { createStateStore, resolveHome } from './host/state.mjs'
import { createTracker } from './host/tracker.mjs'
import { buildAssistanceContext } from './shared/context.mjs'
import { LIMITS } from './shared/limits.mjs'
import { candidateKey } from './shared/prediction.mjs'
import { replyFingerprint } from './shared/identity.mjs'
import { isBriefReply } from './shared/recap-policy.mjs'

export const SETTINGS_PATH = '/api/dsh-conversation-assist.settings'
export const SUGGEST_PATH = '/api/dsh-conversation-assist.rpc'
export const RECAP_PATH = '/api/dsh-conversation-assist.recap'

/** Mount the Host capture and its three exact routes. */
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
  const outcomes = new Map()
  const invalidatedSuggestions = new Map()
  const selectionEpochs = new Map()
  const turnSelectionEpochs = new Map()
  const turnControllers = new Map()
  const lifetime = new AbortController()
  let predictionEpoch = 0

  ctx.effect(() => () => {
    lifetime.abort()
    for (const controller of turnControllers.values()) controller.abort()
    turnControllers.clear()
  }, 'dsh-conversation-assist: lifetime')

  const resolveRoute = (session, turn) => {
    const captured = routeFromHeader(turn?.sourceSelection ?? turn?.header)
    if (captured !== undefined) return captured
    try {
      const snapshot = ctx.get('sessionProjections')?.snapshot?.(session, ['modelSelection'])
      const selected = routeFromProjection(snapshot?.values)
      if (selected !== undefined) return selected
    } catch {
      // Projection access may be absent until the Session is promoted.
    }
    try {
      return routeFromHeader(session?.requestHeader?.())
    } catch {
      return undefined
    }
  }

  const predictor = createPredictor({
    getLlm: () => ctx.get('llm'),
    audit: record => state.appendAudit(record),
  })

  const identityKey = (sessionId, turn) => candidateKey(
    sessionId,
    turn.turn,
    turn.endSeq,
    PROMPT_VERSION,
    JSON.stringify([turn.generation, turn.sourceSelection ?? null]),
  )

  function isLive(session, turn) {
    try {
      const sessions = ctx.get('sessions')
      if (typeof sessions?.get === 'function' && sessions.get(session?.id) !== session) return false
    } catch {
      return false
    }
    return tracker.matches(session, turn)
      && tracker.surfaceMatches(session, turn)
  }

  function cancelSession(sessionId) {
    const active = turnControllers.get(sessionId)
    if (active !== undefined) active.abort()
    turnControllers.delete(sessionId)
    invalidatedSuggestions.delete(sessionId)
    for (const [key, value] of outcomes) {
      if (value.sessionId === sessionId) outcomes.delete(key)
    }
  }

  function invalidateCurrentSuggestion(session, turn) {
    if (turn?.reason?.kind !== 'completed' || !Number.isSafeInteger(turn.endSeq)) return
    const key = identityKey(session.id, turn)
    invalidatedSuggestions.set(session.id, key)
    const outcome = outcomes.get(key)
    if (outcome?.result !== null && typeof outcome?.result === 'object') {
      outcome.result.suggestion = null
      outcome.result.suggestionReason = 'selection-changed'
    }
  }

  function getResult(identity) {
    const turn = tracker.get(identity.sessionId)
    if (turn === undefined || turn.turn !== identity.turn || turn.endSeq !== identity.endSeq || turn.generation !== identity.generation) return undefined
    const key = identityKey(identity.sessionId, turn)
    const pending = inflight.get(key)
    if (pending !== undefined) return pending.promise
    return outcomes.get(key)?.result
  }

  function recordOutcome(key, sessionId, result, requestPredictionEpoch) {
    if (requestPredictionEpoch !== predictionEpoch && result !== null && typeof result === 'object') {
      result.suggestion = null
    }
    if (invalidatedSuggestions.get(sessionId) === key && result !== null && typeof result === 'object') {
      result.suggestion = null
      result.suggestionReason = 'selection-changed'
    }
    outcomes.set(key, { sessionId, result })
    while (outcomes.size > 256) outcomes.delete(outcomes.keys().next().value)
  }

  function startAttempt(session, turn) {
    if (turn.reason?.kind !== 'completed' || !Number.isSafeInteger(turn.endSeq)) return
    if (session?.header?.origin === 'subagent') return
    if (turn.sourceSelection === undefined) {
      const fallback = resolveRoute(session, turn)
      if (fallback !== undefined && tracker.setSourceSelection(session.id, fallback)) turn = tracker.get(session.id)
    }
    const key = identityKey(session.id, turn)
    if (inflight.has(key) || outcomes.has(key)) return

    const old = turnControllers.get(session.id)
    if (old !== undefined) old.abort()
    const controller = new AbortController()
    turnControllers.set(session.id, controller)
    const selectionEpoch = selectionEpochs.get(session.id) ?? 0
    const entry = { sessionId: session.id, controller, promise: undefined, features: { recap: false, prediction: false }, predictionEpoch, selectionEpoch }
    const promise = (async () => {
      try {
        await ready
        if (!isLive(session, turn) || controller.signal.aborted || lifetime.signal.aborted) return { state: 'none', reason: 'historical' }
        const settings = state.getSettings()
        const recapEnabled = settings.recap === true && settings.semanticRecap === true
        const recapNotNeeded = recapEnabled && isBriefReply(turn.finalText)
        const features = {
          recap: recapEnabled && !recapNotNeeded,
          prediction: settings.prediction === true,
        }
        entry.features = features
        if (!features.recap && !features.prediction) {
          return recapNotNeeded
            ? { state: 'none', reason: 'not-needed', recapReason: 'not-needed' }
            : { state: 'none', reason: 'disabled' }
        }

        const sourceSelection = turn.sourceSelection
        if (sourceSelection === undefined) return { state: 'none', reason: 'unavailable' }
        const context = buildAssistanceContext(turn, tracker.history(session.id), LIMITS.maxContextBytes, session.id)
        if (context.state !== 'ready' || !context.currentComplete) return { state: 'none', reason: 'no-context' }
        if (controller.signal.aborted || lifetime.signal.aborted || !isLive(session, turn)) return { state: 'none', reason: 'historical' }

        if (!gate.take()) return { state: 'none', reason: 'busy' }
        try {
          const reserved = await state.reserveAttempt(session.id, localDayKey())
          if (reserved?.reserved !== true) return { state: 'none', reason: reserved?.reason === 'budget' ? 'budget' : 'unavailable' }
          if (controller.signal.aborted || lifetime.signal.aborted || !isLive(session, turn)) return { state: 'none', reason: 'historical' }
          const signal = AbortSignal.any([lifetime.signal, controller.signal])
          const generated = await predictor.generate({ session, turn, context, sourceSelection, features, signal })
          if (!isLive(session, turn) || controller.signal.aborted || lifetime.signal.aborted) return { state: 'none', reason: 'historical' }
          const currentSettings = state.getSettings()
          const replyHash = replyFingerprint(turn.finalText)
          const suggestionInvalidated = invalidatedSuggestions.get(session.id) === key
            || entry.selectionEpoch !== (selectionEpochs.get(session.id) ?? 0)
          const result = {
            ...generated,
            sessionId: session.id,
            turn: turn.turn,
            endSeq: turn.endSeq,
            replyHash,
            route: sourceSelection,
            recapReason: recapNotNeeded ? 'not-needed' : generated.recapReason,
            recap: currentSettings.recap === true && currentSettings.semanticRecap === true ? generated.recap : null,
            suggestion: currentSettings.prediction === true && entry.predictionEpoch === predictionEpoch && !suggestionInvalidated ? generated.suggestion : null,
            suggestionReason: suggestionInvalidated ? 'selection-changed' : generated.suggestionReason,
          }
          if (typeof result.recap === 'string') {
            const generation = turn.surfaceGeneration ?? turn.generation
            result.persisted = await state.saveSummary({
              sessionId: session.id,
              turn: turn.turn,
              endSeq: turn.endSeq,
              replyHash,
              promptVersion: PROMPT_VERSION,
              generation,
              recap: result.recap,
            }) === true
          } else if (features.recap === true && currentSettings.recap === true
            && currentSettings.semanticRecap === true && generated.recapReason === 'not-needed') {
            const generation = turn.surfaceGeneration ?? turn.generation
            result.persisted = await state.saveSummary({
              sessionId: session.id,
              turn: turn.turn,
              endSeq: turn.endSeq,
              replyHash,
              promptVersion: PROMPT_VERSION,
              generation,
              omitted: true,
            }) === true
          }
          return result
        } finally {
          gate.release()
        }
      } catch (error) {
        return { state: 'none', reason: controller.signal.aborted ? 'historical' : String(error?.code ?? 'unavailable') }
      }
    })()
    entry.promise = promise
    inflight.set(key, entry)
    void promise.then(result => {
      if (isLive(session, turn) && !controller.signal.aborted) recordOutcome(key, session.id, result, entry.predictionEpoch)
    }).finally(() => {
      if (inflight.get(key) === entry) inflight.delete(key)
      if (turnControllers.get(session.id) === controller) turnControllers.delete(session.id)
    })
  }

  const suggestCore = createSuggestHandler({
    getSettings: () => state.getSettings(),
    getSession: id => ctx.get('sessions')?.get?.(id),
    getTurn: id => tracker.get(id),
    getResult,
    isSurfaceCurrent: (session, turn) => tracker.surfaceMatches(session, turn),
  })
  const recapCore = createRecapHandler({
    getSettings: () => state.getSettings(),
    getSession: id => ctx.get('sessions')?.get?.(id),
    getTurn: id => tracker.get(id),
    getResult,
    getSummary: value => state.getSummary(value),
    promptVersion: PROMPT_VERSION,
    isSurfaceCurrent: (session, turn) => tracker.surfaceMatches(session, turn),
  })
  const suggestHandler = async request => { await ready; return suggestCore(request) }
  const recapHandler = async request => { await ready; return recapCore(request) }
  const settingsCore = createSettingsHandler({
    getSettings: () => state.getSettings(),
    saveSettings: async patch => {
      await ready
      const wasPredictionEnabled = state.getSettings().prediction === true
      if (wasPredictionEnabled && patch.prediction === false) {
        predictionEpoch += 1
        for (const value of outcomes.values()) {
          if (value.result !== null && typeof value.result === 'object') value.result.suggestion = null
        }
      }
      const settings = await state.saveSettings(patch)
      for (const entry of inflight.values()) {
        const stillNeeded = (entry.features.recap && settings.recap && settings.semanticRecap)
          || (entry.features.prediction && settings.prediction)
        if (!stillNeeded) entry.controller.abort()
      }
      return settings
    },
  })
  const settingsHandler = async request => { await ready; return settingsCore(request) }

  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/start') {
      cancelSession(session.id)
      turnSelectionEpochs.set(session.id, { turn: event.data?.turn, epoch: selectionEpochs.get(session.id) ?? 0 })
      const initialSelection = routeFromHeader(event.data?.header) ?? resolveRoute(session, undefined)
      tracker.observe(session, event, initialSelection)
      return
    }
    tracker.observe(session, event, routeFromHeader(event.data?.header))
    if (event.type === 'model/selection') {
      selectionEpochs.set(session.id, (selectionEpochs.get(session.id) ?? 0) + 1)
      invalidateCurrentSuggestion(session, tracker.get(session.id))
      return
    }
    if (event.type === 'turn/end' && event.data?.reason?.kind === 'completed') {
      const turn = tracker.get(session.id)
      if (turn !== undefined) {
        const startedAtSelection = turnSelectionEpochs.get(session.id)
        if (startedAtSelection?.turn === turn.turn && startedAtSelection.epoch !== (selectionEpochs.get(session.id) ?? 0)) {
          invalidatedSuggestions.set(session.id, identityKey(session.id, turn))
        }
        startAttempt(session, turn)
      }
    }
    if (event.type === 'turn/end') turnSelectionEpochs.delete(session.id)
  })

  ctx.on('session/disposed', session => {
    cancelSession(session.id)
    selectionEpochs.delete(session.id)
    turnSelectionEpochs.delete(session.id)
    tracker.forget(session.id)
  })

  ctx.inject(['connection'], scope => {
    scope.effect(() => {
      const routes = [
        { path: SETTINGS_PATH, methods: ['GET', 'POST'], requestBody: 'buffered', fetch: settingsHandler },
        { path: SUGGEST_PATH, methods: ['POST'], requestBody: 'buffered', fetch: suggestHandler },
        { path: RECAP_PATH, methods: ['POST'], requestBody: 'buffered', fetch: recapHandler },
      ]
      const disposers = routes.map(route => scope.connection.fetch.register(route))
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-conversation-assist: routes')
  })
}
