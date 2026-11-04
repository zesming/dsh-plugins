/** Read-only HTTP handlers for settings and already-started Turn assistance. */

import { parseSettingsPatch } from '../shared/settings.mjs'
import { replyFingerprint } from '../shared/identity.mjs'
import { parseRecapBody, parseSuggestBody } from '../shared/prediction.mjs'

/** Build one JSON response with no-store semantics. */
export function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function readJson(request) {
  const length = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(length) && length > 4096) return { ok: false, tooLarge: true }
  try {
    return { ok: true, value: await request.json() }
  } catch {
    return { ok: false }
  }
}

function validCompletedTurn(turn, identity) {
  return turn !== undefined && turn.turn === identity.turn && turn.endSeq === identity.endSeq
    && turn.reason?.kind === 'completed' && Number.isSafeInteger(turn.endSeq)
}

function sameSelection(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

function sameSurfaceGeneration(session, turn) {
  const captured = turn?.surfaceGeneration
  const current = session?.surface?.contentGeneration
  return !Number.isSafeInteger(captured) || !Number.isSafeInteger(current) || captured === current
}

function surfaceIsCurrent(session, turn, isSurfaceCurrent) {
  return typeof isSurfaceCurrent === 'function'
    ? isSurfaceCurrent(session, turn)
    : sameSurfaceGeneration(session, turn)
}

/** Settings route. */
export function createSettingsHandler({ getSettings, saveSettings }) {
  return async request => {
    if (request.method === 'GET') return json(getSettings())
    if (request.method !== 'POST') return json({ state: 'error', error: 'method' }, 405)
    const body = await readJson(request)
    if (!body.ok) return json({ state: 'error', error: body.tooLarge ? 'too-large' : 'invalid-json' }, body.tooLarge ? 413 : 400)
    const patch = parseSettingsPatch(body.value)
    if (patch === null) return json({ state: 'error', error: 'invalid-patch' }, 400)
    try {
      return json(await saveSettings(patch))
    } catch {
      return json({ state: 'error', error: 'write-failed' }, 500)
    }
  }
}

/** Suggestion value handler over an already parsed body. */
export function createSuggestValueHandler({ getSettings, getSession, getTurn, getResult, isSurfaceCurrent }) {
  return async value => {
    const identity = parseSuggestBody(value)
    if (identity === null) return json({ state: 'error', error: 'invalid-body' }, 400)
    if (getSettings().prediction !== true) return json({ state: 'disabled' })
    const session = getSession(identity.sessionId)
    if (session === undefined || session === null || session.header?.origin === 'subagent') return json({ state: 'none' })
    const turn = getTurn(identity.sessionId)
    if (!validCompletedTurn(turn, identity)) return json({ state: 'none', reason: 'historical' })
    if (!surfaceIsCurrent(session, turn, isSurfaceCurrent)) return json({ state: 'none', reason: 'historical' })
    try {
      const result = await getResult({ ...identity, generation: turn.generation })
      const latestSession = getSession(identity.sessionId)
      const latestTurn = getTurn(identity.sessionId)
      if (latestSession !== session || !validCompletedTurn(latestTurn, identity)
        || latestTurn.generation !== turn.generation
        || !sameSelection(latestTurn.sourceSelection, turn.sourceSelection)
        || !surfaceIsCurrent(latestSession, latestTurn, isSurfaceCurrent)) return json({ state: 'none', reason: 'historical' })
      if (result?.state !== 'ready' || typeof result.suggestion !== 'string') {
        return json({ state: 'none', reason: result?.suggestionReason ?? result?.reason ?? 'unavailable' })
      }
      if (getSettings().prediction !== true) return json({ state: 'disabled' })
      return json({
        state: 'ready',
        sessionId: identity.sessionId,
        turn: identity.turn,
        endSeq: identity.endSeq,
        text: result.suggestion,
        route: turn.sourceSelection ?? null,
      })
    } catch {
      return json({ state: 'none', reason: 'unavailable' })
    }
  }
}

/** Suggestion route: it can only read or await the auto-started Turn attempt. */
export function createSuggestHandler(deps) {
  const onValue = createSuggestValueHandler(deps)
  return async request => {
    if (request.method !== 'POST') return json({ state: 'error', error: 'method' }, 405)
    const body = await readJson(request)
    if (!body.ok) return json({ state: 'error', error: body.tooLarge ? 'too-large' : 'invalid-json' }, body.tooLarge ? 413 : 400)
    return onValue(body.value)
  }
}

/** Recap value handler supports a hash-bound read from the persistent cache. */
export function createRecapValueHandler({ getSettings, getSession, getTurn, getResult, getSummary, promptVersion, isSurfaceCurrent }) {
  return async value => {
    const identity = parseRecapBody(value)
    if (identity === null) return json({ state: 'error', error: 'invalid-body' }, 400)
    const settings = getSettings()
    if (settings.recap !== true) return json({ state: 'none', reason: 'disabled' })
    const session = getSession(identity.sessionId)
    if (session?.header?.origin === 'subagent') return json({ state: 'none', reason: 'historical' })
    const turn = getTurn(identity.sessionId)
    const currentTurn = validCompletedTurn(turn, identity)
    if (session !== undefined && session !== null && currentTurn
      && !surfaceIsCurrent(session, turn, isSurfaceCurrent)) return json({ state: 'none', reason: 'historical' })
    if (currentTurn && typeof turn.finalText === 'string'
      && replyFingerprint(turn.finalText) !== identity.replyHash) return json({ state: 'none', reason: 'historical' })
    const cached = getSummary({ ...identity, promptVersion })
    if (cached?.omitted === true) return json({ state: 'none', reason: 'not-needed' })
    if (typeof cached?.recap === 'string') {
      return json({ ...identity, state: 'ready', recap: cached.recap, persisted: cached.persisted === true })
    }
    if (session === undefined || session === null || session.header?.origin === 'subagent') {
      return json({ state: 'none', reason: 'historical' })
    }
    if (!validCompletedTurn(turn, identity)) return json({ state: 'none', reason: 'historical' })
    if (typeof turn.finalText !== 'string' || turn.finalText === '') return json({ state: 'none', reason: 'no-context' })
    try {
      const result = await getResult({ ...identity, generation: turn.generation })
      const latestSettings = getSettings()
      if (latestSettings.recap !== true) return json({ state: 'none', reason: 'disabled' })
      const latestSession = getSession(identity.sessionId)
      const latestTurn = getTurn(identity.sessionId)
      if (latestSession !== session || !validCompletedTurn(latestTurn, identity)
        || latestTurn.generation !== turn.generation
        || !sameSelection(latestTurn.sourceSelection, turn.sourceSelection)
        || !surfaceIsCurrent(latestSession, latestTurn, isSurfaceCurrent)) return json({ state: 'none', reason: 'historical' })
      if (result?.recapReason === 'not-needed') return json({ state: 'none', reason: 'not-needed' })
      if (result?.state === 'ready' && typeof result.recap === 'string' && result.replyHash === identity.replyHash) {
        return json({ ...identity, state: 'ready', recap: result.recap, persisted: result.persisted === true })
      }
      return json({ state: 'none', reason: result?.recapReason ?? result?.reason ?? 'unavailable' })
    } catch {
      return json({ state: 'none', reason: 'unavailable' })
    }
  }
}

/** Recap route never starts or retries model work. */
export function createRecapHandler(deps) {
  const onValue = createRecapValueHandler(deps)
  return async request => {
    if (request.method !== 'POST') return json({ state: 'error', error: 'method' }, 405)
    const body = await readJson(request)
    if (!body.ok) return json({ state: 'error', error: body.tooLarge ? 'too-large' : 'invalid-json' }, body.tooLarge ? 413 : 400)
    return onValue(body.value)
  }
}
