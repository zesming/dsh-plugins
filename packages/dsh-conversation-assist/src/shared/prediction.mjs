/** Pure decisions for suggestion eligibility, output and route identities. */

import { LIMITS } from './limits.mjs'

/**
 * Whether the current composer state allows asking for a suggestion.
 *
 * This is only the request gate: whether an already-received candidate should
 * be shown is decided by the per-Turn hidden marker in the client store.
 * @param options - current settings and snapshots.
 * @returns true when a request may start.
 */
export function canRequest({ prediction, sessionId, input, session }) {
  if (prediction !== true) return false
  if (typeof sessionId !== 'string' || sessionId === '') return false
  if (session === undefined || session === null) return false
  if (session.running === true || session.removed === true) return false
  if (session.awaitingFirstTurn === true) return false
  if ((session.pendingSubmissions?.length ?? 0) > 0) return false
  if (session.subagent !== null && session.subagent !== undefined) return false
  if (input === undefined || input === null) return false
  if (input.draft !== '') return false
  if ((input.attachmentIds?.length ?? 0) > 0) return false
  if ((input.occurrences?.length ?? 0) > 0) return false
  if ((input.queue?.length ?? 0) > 0) return false
  if (input.phase !== undefined && input.phase !== 'plain') return false
  if (input.claim !== undefined && input.claim !== null) return false
  return true
}

/**
 * Accept only a single short line that can be inserted as a draft.
 * @param raw - model output.
 * @returns cleaned text, or null when the output is unusable.
 */
export function sanitizeSuggestion(raw) {
  if (typeof raw !== 'string') return null
  let text = raw.trim()
  if (text === '' || text.includes('\n') || text.includes('\r') || text.startsWith('```')) return null
  text = text.replace(/^[“”"'‘’]+|[“”"'‘’]+$/gu, '').trim()
  if (text === '' || [...text].length > LIMITS.maxSuggestionChars) return null
  return text
}

/**
 * Validate the suggestion route body.
 * @param value - parsed JSON.
 * @returns `{ sessionId, turn, endSeq }`, or null for a malformed body.
 */
export function parseSuggestBody(value) {
  return parseTurnIdentity(value)
}

/** Validate the recap request's content identity. */
export function parseRecapBody(value) {
  const identity = parseTurnIdentity(value)
  if (identity === null || typeof value.replyHash !== 'string' || !/^[a-f0-9]{16}$/iu.test(value.replyHash)) return null
  return { ...identity, replyHash: value.replyHash.toLowerCase() }
}

/** Validate the common live-turn request identity. */
export function parseTurnIdentity(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { sessionId, turn, endSeq } = value
  if (typeof sessionId !== 'string' || sessionId === '' || sessionId.length > 128) return null
  if (!Number.isSafeInteger(turn) || turn < 0 || !Number.isSafeInteger(endSeq) || endSeq < 0) return null
  return { sessionId, turn, endSeq }
}

/**
 * Stable identity for one suggestion.
 * @param sessionId - Session identity.
 * @param turn - Turn number.
 * @returns the cache key.
 */
export function candidateKey(sessionId, turn, endSeq, promptVersion, generation = '') {
  return JSON.stringify([sessionId, turn, endSeq, promptVersion, generation])
}
