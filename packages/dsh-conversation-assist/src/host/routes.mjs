/** HTTP handlers with every dependency injected, so they can be unit-tested. */

import { parseSettingsPatch } from '../shared/settings.mjs'
import { parseSuggestBody } from '../shared/prediction.mjs'

/**
 * Build one JSON response.
 * @param value - serializable body.
 * @param status - HTTP status.
 * @returns a Response with no-store caching.
 */
export function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Read a JSON request body.
 * @param request - incoming Request.
 * @returns `{ ok: true, value }` or `{ ok: false }`.
 */
async function readJson(request) {
  const length = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(length) && length > 4096) return { ok: false, tooLarge: true }
  try {
    return { ok: true, value: await request.json() }
  } catch {
    return { ok: false }
  }
}

/**
 * Settings route: read the shared document or write one validated patch.
 * @param deps - settings access and persistence.
 * @returns a fetch-compatible handler.
 */
export function createSettingsHandler({ getSettings, saveSettings, onSuggest }) {
  return async (request) => {
    if (request.method === 'GET') return json(getSettings())
    if (request.method !== 'POST') return json({ state: 'error', error: 'method' }, 405)
    const body = await readJson(request)
    if (!body.ok) return json({ state: 'error', error: body.tooLarge === true ? 'too-large' : 'invalid-json' }, body.tooLarge === true ? 413 : 400)
    if (body.value?.action === 'suggest' && typeof onSuggest === 'function') {
      return onSuggest(body.value)
    }
    const patch = parseSettingsPatch(body.value)
    if (patch === null) return json({ state: 'error', error: 'invalid-patch' }, 400)
    try {
      return json(await saveSettings(patch))
    } catch {
      return json({ state: 'error', error: 'write-failed' }, 500)
    }
  }
}

/**
 * Temporary eligibility-report route used during verification.
 * @param options.onReport - receives the small, content-free report.
 * @returns a fetch-compatible handler.
 */
export function createDebugHandler({ onReport, onSuggest }) {
  return async (request) => {
    const body = await readJson(request)
    if (!body.ok) return json({ error: body.tooLarge === true ? 'too-large' : 'invalid-body' }, body.tooLarge === true ? 413 : 400)
    if (typeof body.value !== 'object' || body.value === null) return json({ error: 'invalid-body' }, 400)
    if (body.value.action === 'suggest' && typeof onSuggest === 'function') {
      try {
        return await onSuggest(body.value)
      } catch (error) {
        onReport?.({ stage: 'suggest-error', message: error instanceof Error ? error.message : String(error) })
        return json({ state: 'none' })
      }
    }
    onReport?.(body.value)
    return json({ ok: true })
  }
}

/**
 * Suggestion core over an already-parsed body. The debug/settings dispatch can
 * call it without inventing a Request, which keeps the Host fetch primitive out
 * of the shared path.
 * @param deps - settings, Session/Turn lookup, and the generator.
 * @returns a handler over the decoded object.
 */
export function createSuggestValueHandler({ getSettings, getSession, getTurn, generate, onRequest }) {
  return async (value) => {
    const parsed = parseSuggestBody(value)
    if (parsed === null) return json({ state: 'error', error: 'invalid-body' }, 400)
    const tracked = getTurn(parsed.sessionId)
    onRequest?.({
      stage: 'request',
      sessionId: parsed.sessionId,
      language: parsed.language,
      notBefore: parsed.notBefore ?? null,
      prediction: getSettings().prediction === true,
      hasSession: getSession(parsed.sessionId) !== undefined,
      tracked: tracked === undefined
        ? null
        : {
          turn: tracked.turn,
          endSeq: tracked.endSeq ?? null,
          endTime: tracked.endTime ?? null,
          reason: tracked.reason?.kind ?? null,
        },
    })
    if (getSettings().prediction !== true) return json({ state: 'disabled' })
    const session = getSession(parsed.sessionId)
    if (session === undefined) return json({ state: 'none' })
    if (session.header?.origin === 'subagent') return json({ state: 'none' })
    const turn = getTurn(parsed.sessionId)
    if (turn === undefined || turn.reason?.kind !== 'completed' || typeof turn.endSeq !== 'number') {
      return json({ state: 'none' })
    }
    if (parsed.notBefore !== undefined && typeof turn.endTime === 'number' && turn.endTime < parsed.notBefore) {
      return json({ state: 'none' })
    }
    try {
      const result = await generate({ session, turn, language: parsed.language })
      return json(result ?? { state: 'none' })
    } catch {
      return json({ state: 'none' })
    }
  }
}

/**
 * Suggestion route: decode the request, then delegate to the value handler.
 * @param deps - settings, Session/Turn lookup, and the generator.
 * @returns a fetch-compatible handler.
 */
export function createSuggestHandler(deps) {
  const onValue = createSuggestValueHandler(deps)
  return async (request) => {
    if (request.method !== 'POST') return json({ state: 'error', error: 'method' }, 405)
    const body = await readJson(request)
    if (!body.ok) return json({ state: 'error', error: body.tooLarge === true ? 'too-large' : 'invalid-json' }, body.tooLarge === true ? 413 : 400)
    return onValue(body.value)
  }
}
