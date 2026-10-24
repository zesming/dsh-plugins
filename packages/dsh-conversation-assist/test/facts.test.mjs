import assert from 'node:assert/strict'
import test from 'node:test'

import { emptyFacts, factsValue, foldFacts } from '../src/shared/facts.mjs'

const event = (type, data, seq = 0, time = 1_000) => ({ type, seq, time, data })
const end = (reason, turn = 1, seq = 9) => event('turn/end', { turn, reason }, seq)

test('facts count calls, failures, unknown outcomes and pending results', () => {
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

test('assistant text marks the reply and only for this turn', () => {
  let state = emptyFacts(3)
  state = foldFacts(state, event('assistant/message', { turn: 3, message: { content: [{ type: 'text', text: '   ' }] } }))
  assert.equal(factsValue(state).hasReply, false)
  state = foldFacts(state, event('assistant/message', { turn: 3, message: { content: [{ type: 'text', text: 'done' }] } }))
  assert.equal(factsValue(state).hasReply, true)
  assert.equal(foldFacts(state, event('assistant/message', { turn: 4, message: { content: [{ type: 'text', text: 'x' }] } })), state)
})

test('turn/end keeps the abort cause and error code', () => {
  let state = emptyFacts(1)
  state = foldFacts(state, end({ kind: 'aborted', reason: { kind: 'user' } }))
  assert.equal(factsValue(state).cancelKind, 'user')
  state = emptyFacts(1)
  state = foldFacts(state, end({ kind: 'error', error: { code: 'RATE_LIMIT', message: 'x' } }))
  assert.equal(factsValue(state).errorCode, 'RATE_LIMIT')
})
