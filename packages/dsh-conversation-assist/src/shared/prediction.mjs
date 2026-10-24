/** Pure decisions for the next-suggestion request: eligibility, trimming, parsing. */

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
  if (session.running !== false || session.removed === true) return false
  if (session.subagent !== null && session.subagent !== undefined) return false
  if ((session.pendingSubmissions?.length ?? 0) > 0) return false
  if (input === undefined || input === null) return false
  if (input.draft !== '') return false
  if ((input.attachmentIds?.length ?? 0) > 0) return false
  if ((input.occurrences?.length ?? 0) > 0) return false
  if ((input.queue?.length ?? 0) > 0) return false
  if (input.phase !== 'plain') return false
  if (input.claim !== undefined) return false
  return true
}

/**
 * Keep the newest messages that fit the byte and count caps.
 * @param messages - durable derived history.
 * @param maxBytes - UTF-8 byte ceiling.
 * @param maxMessages - message-count ceiling.
 * @returns a new tail array; at least the last message when the history is non-empty.
 */
export function trimHistory(messages, maxBytes = LIMITS.maxContextBytes, maxMessages = LIMITS.maxMessages) {
  if (!Array.isArray(messages) || messages.length === 0) return []
  const encoder = new TextEncoder()
  const out = []
  let bytes = 0
  for (let index = messages.length - 1; index >= 0 && out.length < maxMessages; index -= 1) {
    const message = messages[index]
    // The auxiliary call has its own system instruction; the agent's system and
    // developer messages would duplicate that role and eat the byte budget.
    if (message?.role === 'system' || message?.role === 'developer') continue
    let size = 0
    try {
      size = encoder.encode(JSON.stringify(message)).length
    } catch {
      continue
    }
    // A single oversized message is skipped rather than breaking the cap; an
    // empty result simply means no suggestion.
    if (size > maxBytes) continue
    if (out.length > 0 && bytes + size > maxBytes) break
    out.unshift(message)
    bytes += size
  }
  // A tail that opens on a tool result would be rejected as an orphaned result.
  while (out.length > 0 && out[0]?.role === 'tool') out.shift()
  return out
}

/**
 * Accept only a single short line that can be inserted as a draft.
 * @param raw - model output.
 * @returns cleaned text, or null when the output is unusable.
 */
export function sanitizeSuggestion(raw) {
  if (typeof raw !== 'string') return null
  const firstLine = raw.split(/\r?\n/u).map(line => line.trim()).find(line => line !== '')
  if (firstLine === undefined) return null
  let text = firstLine
  if (text.startsWith('```')) return null
  text = text.replace(/^[“”"'‘’]+|[“”"'‘’]+$/gu, '')
  text = text.replace(/^(?:suggestion|建议|用户|user)\s*[:：]\s*/iu, '')
  text = text.replace(/\s+/gu, ' ').trim()
  if (text === '' || text.length > LIMITS.maxSuggestionChars) return null
  return text
}

/**
 * Validate the suggestion route body.
 * @param value - parsed JSON.
 * @returns `{ sessionId, language }`, or null for a malformed body.
 */
export function parseSuggestBody(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const sessionId = value.sessionId
  if (typeof sessionId !== 'string' || sessionId === '' || sessionId.length > 128) return null
  const language = typeof value.language === 'string' && /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/u.test(value.language)
    ? value.language
    : 'en'
  const notBefore = typeof value.notBefore === 'number' && Number.isFinite(value.notBefore)
    ? value.notBefore
    : undefined
  return { sessionId, language, ...(notBefore === undefined ? {} : { notBefore }) }
}

/**
 * Language name for the prediction instruction.
 * @param language - BCP-47-ish tag from the browser.
 * @returns `Chinese` for Chinese tags, otherwise `English`.
 */
export function languageName(language) {
  return typeof language === 'string' && language.toLowerCase().startsWith('zh') ? 'Chinese' : 'English'
}

/**
 * Stable identity for one suggestion.
 * @param sessionId - Session identity.
 * @param turn - Turn number.
 * @returns the cache key.
 */
export function candidateKey(sessionId, turn) {
  return `${sessionId}:${turn}`
}
