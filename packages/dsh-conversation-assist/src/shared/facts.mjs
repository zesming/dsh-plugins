/**
 * Fold one Turn's durable events into the facts a recap sentence may state.
 *
 * The fold is deliberately literal: a call is only "ok" when a non-error result
 * arrived, an error result carrying an UNKNOWN code stays "unknown", and a call
 * without any result stays "pending". Nothing here infers success from prose.
 */

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
    if (callId === '') return state
    const next = copy(state)
    if (!next.calls.has(callId)) next.calls.set(callId, 'pending')
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
    const blocks = event.data.message?.content
    const text = Array.isArray(blocks)
      ? blocks.find(block => block?.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '')?.text
      : undefined
    if (typeof text !== 'string') return state
    return {
      ...state,
      hasReply: true,
      // The latest assistant text is the final reply; keep a bounded prefix so
      // the recap can name what the turn actually said without storing a body.
      lastText: text.trim().slice(0, 1200),
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
 * Publishable summary of a closed Turn.
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
