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
export function createSettingsHandler({ getSettings, saveSettings }) {
  return async (request) => {
    if (request.method === 'GET') return json(getSettings())
    if (request.method !== 'POST') return json({ state: 'error', error: 'method' }, 405)
    const body = await readJson(request)
    if (!body.ok) return json({ state: 'error', error: 'invalid-json' }, 400)
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
 * Suggestion route: validate the request, then ask the predictor.
 * @param deps - settings, Session/Turn lookup, and the generator.
 * @returns a fetch-compatible handler.
 */
export function createSuggestHandler({ getSettings, getSession, getTurn, generate }) {
  return async (request) => {
    if (request.method !== 'POST') return json({ state: 'error', error: 'method' }, 405)
    const body = await readJson(request)
    if (!body.ok) return json({ state: 'error', error: 'invalid-json' }, 400)
    const parsed = parseSuggestBody(body.value)
    if (parsed === null) return json({ state: 'error', error: 'invalid-body' }, 400)
    if (getSettings().prediction !== true) return json({ state: 'disabled' })
    const session = getSession(parsed.sessionId)
    if (session === undefined) return json({ state: 'none' })
    const turn = getTurn(parsed.sessionId)
    if (turn === undefined || turn.reason?.kind !== 'completed' || typeof turn.endSeq !== 'number') {
      return json({ state: 'none' })
    }
    if (parsed.notBefore !== undefined && typeof turn.endTime === 'number' && turn.endTime < parsed.notBefore) {
      return json({ state: 'none' })
    }
    try {
      const result = await generate({ session, turn, language: parsed.language, signal: request.signal })
      return json(result ?? { state: 'none' })
    } catch {
      return json({ state: 'none' })
    }
  }
}
