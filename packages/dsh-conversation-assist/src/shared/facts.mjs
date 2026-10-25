/** Facts retained for one turn-tail recap, without making a claim from prose. */

import { replyFingerprint, textOfMessage } from './identity.mjs'

/** Maximum fallback excerpt stored in the client-side turn data. */
export const MAX_EXCERPT_CHARS = 4_000

/**
 * Create the state for one Turn.
 * @param turn - Turn number.
 * @returns a fresh mutable fold state.
 */
export function emptyFacts(turn) {
  return {
    turn,
    calls: new Map(),
    hasReply: false,
    lastText: undefined,
    excerptTruncated: false,
    replyHash: undefined,
    finalReply: false,
    reasonKind: undefined,
    cancelKind: undefined,
    errorCode: undefined,
    endSeq: undefined,
    endTime: undefined,
  }
}

/** @param state - fold state. @returns a copy whose call map is independent. */
function copy(state) {
  return { ...state, calls: new Map(state.calls) }
}

/**
 * Keep a bounded, readable excerpt while hashing the complete source text.
 * @param text - full visible text from one assistant message.
 * @returns bounded text and whether any source text was omitted.
 */
function excerpt(text) {
  const characters = [...text]
  if (characters.length <= MAX_EXCERPT_CHARS) return { text, truncated: false }
  return {
    text: `${characters.slice(0, MAX_EXCERPT_CHARS).join('')}…`,
    truncated: true,
  }
}

/**
 * Apply one durable event to a Turn's facts.
 * @param state - current fold state.
 * @param event - one client Session event.
 * @returns the next state (the same object when the event is unrelated).
 */
export function foldFacts(state, event) {
  const turn = event?.data?.turn
  if (typeof turn !== 'number' || turn !== state.turn) return state
  if (event.type === 'tool/call') {
    const callId = String(event.data.callId ?? '')
    const next = copy(state)
    if (callId !== '' && !next.calls.has(callId)) next.calls.set(callId, 'pending')
    next.replyHash = undefined
    next.finalReply = false
    return next
  }
  if (event.type === 'tool/result') {
    const callId = event.data.message?.toolCallId ?? event.data.message?.source?.callId
    if (callId === undefined || !state.calls.has(String(callId))) return state
    const next = copy(state)
    const failed = event.data.message?.isError === true
    const code = typeof event.data.error?.code === 'string' ? event.data.error.code : ''
    next.calls.set(String(callId), failed ? (code.includes('UNKNOWN') ? 'unknown' : 'fail') : 'ok')
    return next
  }
  if (event.type === 'assistant/message') {
    const message = event.data.message
    const text = textOfMessage(message)
    const hasVisibleText = text.trim() !== ''
    const blocks = Array.isArray(message?.content) ? message.content : []
    if (!hasVisibleText) {
      return {
        ...state,
        // Empty and reasoning-only messages can follow visible progress, for
        // example when a max-token finish carries usage but no final text.
        // Keep that excerpt for the fallback while disqualifying it as a final
        // reply source for a generated recap.
        replyHash: undefined,
        finalReply: false,
      }
    }
    const isFinalText = hasVisibleText
      && event.data.interrupted !== true
      && message?.interrupted !== true
      && !blocks.some(block => block?.type === 'tool-call')
    const bounded = excerpt(text)
    return {
      ...state,
      hasReply: hasVisibleText,
      // Every text block is kept in source order for a readable fallback.
      // Reasoning, tool calls, and other blocks are excluded by textOfMessage.
      lastText: bounded.text,
      excerptTruncated: bounded.truncated,
      // The Host validates this full-content fingerprint before returning a
      // model recap. A tool-call or interrupted prefix is never its source.
      replyHash: isFinalText ? replyFingerprint(text) : undefined,
      finalReply: isFinalText,
    }
  }
  if (event.type === 'turn/end') {
    const reason = event.data.reason
    if (typeof reason !== 'object' || reason === null) return state
    return {
      ...copy(state),
      reasonKind: typeof reason.kind === 'string' ? reason.kind : 'unknown',
      cancelKind: typeof reason.reason?.kind === 'string' ? reason.reason.kind : undefined,
      errorCode: typeof reason.error?.code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/u.test(reason.error.code)
        ? reason.error.code
        : undefined,
      endSeq: event.seq,
      endTime: event.time,
    }
  }
  return state
}

/**
 * Publishable facts for the Turn-tail entry.
 * @param state - fold state after `turn/end`.
 * @returns plain facts for the tail entry.
 */
export function factsValue(state) {
  let failures = 0
  let unknown = 0
  let pending = 0
  for (const status of state.calls.values()) {
    if (status === 'ok') continue
    if (status === 'fail') failures += 1
    else if (status === 'unknown') unknown += 1
    else pending += 1
  }
  return {
    turn: state.turn,
    calls: state.calls.size,
    lastText: state.lastText,
    excerptTruncated: state.excerptTruncated,
    replyHash: state.replyHash,
    finalReply: state.finalReply,
    failures,
    unknown,
    pending,
    hasReply: state.hasReply,
    reasonKind: state.reasonKind,
    cancelKind: state.cancelKind,
    errorCode: state.errorCode,
    endSeq: state.endSeq,
    endTime: state.endTime,
  }
}
