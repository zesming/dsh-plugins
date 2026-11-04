import assert from 'node:assert/strict'
import test from 'node:test'

import { emptyFacts, factsValue, foldFacts, MAX_EXCERPT_CHARS } from '../src/shared/facts.mjs'
import { replyFingerprint, textOfMessage } from '../src/shared/identity.mjs'

const event = (type, data, seq = 0, time = 1_000) => ({ type, seq, time, data })
const end = (reason, turn = 1, seq = 9) => event('turn/end', { turn, reason }, seq)

test('facts count call results as successes, failures, or unknown outcomes', () => {
  let state = emptyFacts(1)
  state = foldFacts(state, event('turn/start', { turn: 1 }))
  state = foldFacts(state, event('tool/call', { turn: 1, callId: 'a', name: 'bash' }))
  state = foldFacts(state, event('tool/call', { turn: 1, callId: 'b', name: 'edit' }))
  state = foldFacts(state, event('tool/call', { turn: 1, callId: 'c', name: 'web' }))
  state = foldFacts(state, event('tool/result', { turn: 1, message: { isError: false, toolCallId: 'a' } }))
  state = foldFacts(state, event('tool/result', { turn: 1, message: { isError: true, source: { callId: 'b' } }, error: { code: 'E_FAIL' } }))
  state = foldFacts(state, event('tool/result', { turn: 1, message: { isError: true, source: { callId: 'c' } }, error: { code: 'TOOL_OUTCOME_UNKNOWN' } }))
  state = foldFacts(state, end({ kind: 'completed', reason: undefined }))
  assert.deepEqual(factsValue(state), {
    turn: 1,
    calls: 3,
    lastText: undefined,
    excerptTruncated: false,
    replyHash: undefined,
    finalReply: false,
    failures: 1,
    unknown: 1,
    pending: 0,
    hasReply: false,
    reasonKind: 'completed',
    cancelKind: undefined,
    errorCode: undefined,
    endSeq: 9,
    endTime: 1_000,
  })
})

test('facts count an unanswered call as pending', () => {
  let state = emptyFacts(2)
  state = foldFacts(state, event('tool/call', { turn: 2, callId: 'a', name: 'bash' }))
  state = foldFacts(state, end({ kind: 'blocked' }, 2))
  const value = factsValue(state)
  assert.equal(value.pending, 1)
  assert.equal(value.reasonKind, 'blocked')
})

test('all assistant text blocks are preserved while reasoning and non-text are excluded', () => {
  const message = { content: [
    { type: 'text', text: '第一块结论。' },
    { type: 'reasoning', text: '不得显示的推理。' },
    { type: 'text', text: '第二块包含验证和限制。' },
    { type: 'image', url: 'private' },
  ] }
  const state = foldFacts(emptyFacts(3), event('assistant/message', { turn: 3, message }))
  const value = factsValue(state)
  const fullText = textOfMessage(message)
  assert.equal(value.hasReply, true)
  assert.equal(value.lastText, fullText)
  assert.equal(value.finalReply, true)
  assert.equal(value.replyHash, replyFingerprint(fullText))
  assert.doesNotMatch(value.lastText, /不得显示的推理|private/u)
})

test('tool-call and interrupted assistant messages may be excerpts but never final recap sources', () => {
  const toolMessage = { content: [
    { type: 'text', text: '我准备调用工具。' },
    { type: 'tool-call', id: 'call-1' },
  ] }
  let state = foldFacts(emptyFacts(4), event('assistant/message', { turn: 4, message: toolMessage }))
  assert.equal(factsValue(state).lastText, '我准备调用工具。')
  assert.equal(factsValue(state).replyHash, undefined)
  assert.equal(factsValue(state).finalReply, false)

  state = foldFacts(emptyFacts(4), event('assistant/message', {
    turn: 4, message: { content: [{ type: 'text', text: '工具前的说明。' }] },
  }))
  state = foldFacts(state, event('tool/call', { turn: 4, callId: 'call-2', name: 'test' }))
  assert.equal(factsValue(state).replyHash, undefined)
  assert.equal(factsValue(state).finalReply, false)

  state = foldFacts(emptyFacts(4), event('assistant/message', {
    turn: 4,
    message: { content: [{ type: 'text', text: '中断前的部分回复。' }], interrupted: true },
  }))
  assert.equal(factsValue(state).lastText, '中断前的部分回复。')
  assert.equal(factsValue(state).replyHash, undefined)
  assert.equal(factsValue(state).finalReply, false)
})

test('empty or reasoning-only assistant messages retain visible progress on a max-token finish', () => {
  const emptyWithUsage = { turn: 6, message: { content: [] }, usage: { inputTokens: 4, outputTokens: 2 } }
  const reasoningOnly = {
    turn: 6,
    message: { content: [{ type: 'reasoning', text: '仅有推理内容。' }] },
    usage: { inputTokens: 4, outputTokens: 2 },
  }
  for (const messageData of [emptyWithUsage, reasoningOnly]) {
    let state = foldFacts(emptyFacts(6), event('assistant/message', {
      turn: 6, message: { content: [{ type: 'text', text: '已完成部分工作；验证尚未结束。' }] },
    }))
    const previous = factsValue(state)
    state = foldFacts(state, event('assistant/message', messageData))
    state = foldFacts(state, end({ kind: 'max-tokens' }, 6, 23))
    const value = factsValue(state)
    assert.equal(value.reasonKind, 'max-tokens')
    assert.equal(value.hasReply, true)
    assert.equal(value.lastText, previous.lastText)
    assert.equal(value.excerptTruncated, previous.excerptTruncated)
    assert.equal(value.replyHash, undefined)
    assert.equal(value.finalReply, false)
  }
})

test('a bounded fallback retains the full reply fingerprint and declares omitted source text', () => {
  const message = { content: [{ type: 'text', text: '甲'.repeat(MAX_EXCERPT_CHARS + 75) }] }
  const state = foldFacts(emptyFacts(5), event('assistant/message', { turn: 5, message }))
  const value = factsValue(state)
  assert.equal([...value.lastText].length, MAX_EXCERPT_CHARS + 1)
  assert.equal(value.excerptTruncated, true)
  assert.equal(value.replyHash, replyFingerprint(textOfMessage(message)))
})

test('turn/end keeps the abort cause and error code', () => {
  let state = emptyFacts(1)
  state = foldFacts(state, end({ kind: 'aborted', reason: { kind: 'user' } }))
  assert.equal(factsValue(state).cancelKind, 'user')
  state = emptyFacts(1)
  state = foldFacts(state, end({ kind: 'error', error: { code: 'RATE_LIMIT', message: 'x' } }))
  assert.equal(factsValue(state).errorCode, 'RATE_LIMIT')
})
