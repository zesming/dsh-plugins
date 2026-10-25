/** Build a bounded, provenance-labelled prompt from one captured live Turn. */

import { LIMITS } from './limits.mjs'

const encoder = new TextEncoder()
const byteSize = value => encoder.encode(JSON.stringify(value)).length

function clipText(text, maxBytes) {
  if (typeof text !== 'string') return { text: '', partial: false }
  if (encoder.encode(text).length <= maxBytes) return { text, partial: false }
  const chars = [...text]
  const budget = Math.max(0, maxBytes - 24)
  const headLimit = Math.floor(budget * 0.62)
  const tailLimit = budget - headLimit
  let head = ''
  let headBytes = 0
  let cursor = 0
  while (cursor < chars.length) {
    const length = encoder.encode(chars[cursor]).length
    if (headBytes + length > headLimit) break
    head += chars[cursor]
    headBytes += length
    cursor += 1
  }
  let tail = ''
  let tailBytes = 0
  for (let index = chars.length - 1; index >= cursor; index -= 1) {
    const length = encoder.encode(chars[index]).length
    if (tailBytes + length > tailLimit) break
    tail = chars[index] + tail
    tailBytes += length
  }
  return { text: `${head}\n[…]\n${tail}`, partial: true }
}

function intentOf(turn) {
  const messages = Array.isArray(turn?.userMessages) ? turn.userMessages : []
  return messages.map(({ seq, text, partial }) => ({
    seq: Number.isSafeInteger(seq) ? seq : null,
    text: typeof text === 'string' ? text : '',
    partial: partial === true,
  }))
}

function replyOf(turn) {
  return {
    text: typeof turn?.finalText === 'string' ? turn.finalText : '',
    partial: turn?.replyPartial === true,
  }
}

function previousOf(history) {
  return history.slice(-2).map(turn => ({
    turn: Number.isSafeInteger(turn.turn) ? turn.turn : null,
    intent: intentOf(turn),
    intentPartial: turn.intentPartial === true,
    reason: typeof turn.reason?.kind === 'string' ? turn.reason.kind : 'unknown',
    completed: turn.reason?.kind === 'completed',
    incomplete: turn.reason?.kind !== 'completed',
    reply: replyOf(turn),
  }))
}

function currentOf(turn) {
  return {
    turn: turn.turn,
    intent: intentOf(turn),
    intentPartial: turn.intentPartial === true,
    reply: replyOf(turn),
    toolEvidence: (turn.evidence ?? []).map(item => ({
      callId: item.callId,
      callSeq: item.callSeq,
      resultSeq: item.resultSeq,
      name: item.name,
      isError: item.isError,
      errorCode: item.errorCode,
      resultText: item.resultText,
      partial: item.resultPartial === true,
    })),
    evidencePartial: turn.evidencePartial === true,
    interrupted: turn.hasInterruptedAssistant === true,
  }
}

function makeMessages(current, history, sessionId) {
  const transcript = JSON.stringify({ current, previousTurns: history })
  return [{
    id: `conversation-assist:${sessionId}:${current.turn}:${current.endSeq}`,
    role: 'user',
    source: { kind: 'user' },
    content: [{ type: 'text', text: transcript }],
  }]
}

/**
 * Prepare current-turn evidence within the full serialized request cap. Older
 * Turns are dropped first; clipping current intent or reply makes generation
 * ineligible so an older Turn can never stand in for the latest one.
 * @param turn - exact completed capture.
 * @param history - at most two earlier captured turns.
 * @param maxBytes - complete messages-array JSON byte cap.
 * @returns request messages and completeness metadata.
 */
export function buildAssistanceContext(turn, history = [], maxBytes = LIMITS.maxContextBytes, sessionId = 'unknown') {
  if (!Array.isArray(turn?.userMessages) || turn.userMessages.length === 0 || typeof turn.finalText !== 'string' || turn.finalText.trim() === '') {
    return { state: 'no-context', reason: 'no-context', messages: [], inputBytes: 0, currentComplete: false }
  }
  const current = currentOf(turn)
  current.endSeq = Number.isSafeInteger(turn.endSeq) ? turn.endSeq : null
  let previous = previousOf(Array.isArray(history) ? history : [])
  let messages = makeMessages(current, previous, sessionId)
  if (byteSize(messages) > maxBytes) {
    previous = []
    messages = makeMessages(current, previous, sessionId)
  }
  if (byteSize(messages) > maxBytes) {
    const evidence = current.toolEvidence
    current.toolEvidence = evidence.map(item => ({
      ...item,
      resultText: clipText(item.resultText, 96).text,
      partial: item.partial || encoder.encode(item.resultText).length > 96,
    }))
    current.evidencePartial = current.evidencePartial || evidence.some((item, index) => current.toolEvidence[index].partial)
    messages = makeMessages(current, previous, sessionId)
  }
  if (byteSize(messages) > maxBytes) {
    const intentText = current.intent.map(item => item.text).join('\n\n')
    const replyText = current.reply.text
    const intent = clipText(intentText, Math.floor(maxBytes * 0.32))
    const reply = clipText(replyText, Math.floor(maxBytes * 0.42))
    current.intent = [{ seq: current.intent.at(-1)?.seq ?? null, text: intent.text, partial: true }]
    current.reply = { text: reply.text, partial: true }
    messages = makeMessages(current, [], sessionId)
  }
  const inputBytes = byteSize(messages)
  if (inputBytes > maxBytes) {
    return { state: 'partial', reason: 'context-too-large', messages: [], inputBytes, currentComplete: false }
  }
  const currentComplete = current.intent.every(item => item.partial !== true)
    && current.intentPartial !== true
    && current.reply.partial !== true
    && turn.intentPartial !== true
    && turn.userMessages.every(item => item.partial !== true)
    && turn.replyPartial !== true
  return {
    state: currentComplete ? 'ready' : 'partial',
    reason: currentComplete ? undefined : 'context-partial',
    messages,
    inputBytes,
    currentComplete,
    evidencePartial: current.evidencePartial,
  }
}
