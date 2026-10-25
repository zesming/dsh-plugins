import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAssistanceContext } from '../src/shared/context.mjs'
import { LIMITS } from '../src/shared/limits.mjs'
import { replyFingerprint, textOfMessage } from '../src/shared/identity.mjs'

test('message text joins all text blocks and fingerprints the complete reply deterministically', () => {
  const message = { content: [
    { type: 'text', text: 'first' },
    { type: 'tool-call', id: 'x' },
    { type: 'text', text: 'final result' },
  ] }
  assert.equal(textOfMessage(message), 'first\n\nfinal result')
  assert.equal(replyFingerprint('first\n\nfinal result'), replyFingerprint(textOfMessage(message)))
  assert.notEqual(replyFingerprint('first'), replyFingerprint('first\n\nfinal result'))
})

test('current over-limit input keeps the newest Turn and tail conclusions, then declines generation', () => {
  const newest = {
    turn: 12,
    endSeq: 100,
    userMessages: [{ seq: 50, text: `${'新'.repeat(10_000)}最新意图尾`, partial: false }],
    finalText: `${'回'.repeat(10_000)}最后结论仍未发布`,
    replyPartial: false,
    evidence: [],
    evidencePartial: false,
  }
  const context = buildAssistanceContext(newest, [{
    turn: 11,
    userMessages: [{ seq: 40, text: '旧轮计划发布', partial: false }],
    finalText: '旧轮回复',
  }], LIMITS.maxContextBytes, 's1')
  assert.equal(context.state, 'partial')
  assert.equal(context.currentComplete, false)
  assert.ok(context.inputBytes <= LIMITS.maxContextBytes)
  const payload = JSON.stringify(context.messages)
  assert.match(payload, /最新意图尾/u)
  assert.match(payload, /最后结论仍未发布/u)
  assert.doesNotMatch(payload, /旧轮计划发布/u)
  assert.equal(context.messages[0].role, 'user')
  assert.equal(context.messages[0].source.kind, 'user')
  assert.equal(Array.isArray(context.messages[0].content), true)
  assert.equal(context.messages[0].content[0].type, 'text')
})

test('missing human intent or a final reply is not summarized as a completed context', () => {
  assert.equal(buildAssistanceContext({ userMessages: [], finalText: 'reply' }).reason, 'no-context')
  assert.equal(buildAssistanceContext({ userMessages: [{ text: 'intent' }], finalText: '' }).reason, 'no-context')
})

test('previous aborted Turn context preserves only user-sourced intent and its incomplete reason', () => {
  const context = buildAssistanceContext({
    turn: 3,
    endSeq: 30,
    userMessages: [{ seq: 21, text: 'continue after interruption', partial: false }],
    finalText: 'current reply',
    evidence: [],
  }, [{
    turn: 2,
    reason: { kind: 'aborted' },
    userMessages: [{ seq: 12, text: 'interrupted correction', partial: false }],
    finalText: 'partial reply',
    replyPartial: true,
  }], LIMITS.maxContextBytes, 's1')
  const value = JSON.parse(context.messages[0].content[0].text)
  assert.deepEqual(value.previousTurns.map(turn => ({
    turn: turn.turn,
    reason: turn.reason,
    completed: turn.completed,
    incomplete: turn.incomplete,
    intent: turn.intent.map(message => message.text),
  })), [{
    turn: 2,
    reason: 'aborted',
    completed: false,
    incomplete: true,
    intent: ['interrupted correction'],
  }])
})
