import assert from 'node:assert/strict'
import test from 'node:test'

import { canRequest, candidateKey, parseRecapBody, parseSuggestBody, sanitizeSuggestion } from '../src/shared/prediction.mjs'

const base = {
  prediction: true,
  sessionId: 's1',
  input: { draft: '', attachmentIds: [], occurrences: [], queue: [], phase: 'plain', claim: undefined },
  session: { running: false, removed: false, subagent: null, pendingSubmissions: [], awaitingFirstTurn: false },
}

test('canRequest accepts an idle, empty, ordinary composer', () => {
  assert.equal(canRequest(base), true)
})

test('canRequest rejects drafts, session activity, pending submissions, and unsupported input', () => {
  const cases = [
    [{ prediction: false }, 'prediction off'],
    [{ sessionId: '' }, 'no session'],
    [{ session: { ...base.session, running: true } }, 'running'],
    [{ session: { ...base.session, removed: true } }, 'removed'],
    [{ session: { ...base.session, subagent: { address: {} } } }, 'subagent'],
    [{ session: { ...base.session, pendingSubmissions: [{}] } }, 'pending submission'],
    [{ session: { ...base.session, awaitingFirstTurn: true } }, 'awaiting first Turn'],
    [{ input: { ...base.input, draft: 'x' } }, 'draft'],
    [{ input: { ...base.input, attachmentIds: ['a'] } }, 'attachment'],
    [{ input: { ...base.input, occurrences: [{}] } }, 'chip'],
    [{ input: { ...base.input, queue: [{}] } }, 'queue'],
    [{ input: { ...base.input, phase: 'submitting' } }, 'phase'],
    [{ input: { ...base.input, claim: { name: 'goal' } } }, 'claim'],
  ]
  for (const [patch, label] of cases) assert.equal(canRequest({ ...base, ...patch }), false, label)
})

test('suggestion sanitizer rejects multiline and oversized output without truncating a field', () => {
  assert.equal(sanitizeSuggestion('检查深色模式。'), '检查深色模式。')
  assert.equal(sanitizeSuggestion('“检查键盘焦点顺序。”'), '检查键盘焦点顺序。')
  assert.equal(sanitizeSuggestion('first line\nsecond line'), null)
  assert.equal(sanitizeSuggestion('x'.repeat(161)), null)
  assert.equal(sanitizeSuggestion('   '), null)
  assert.equal(sanitizeSuggestion('```js\ncode\n```'), null)
  assert.equal(sanitizeSuggestion(42), null)
})

test('suggest and recap bodies require exact safe live identities', () => {
  assert.deepEqual(parseSuggestBody({ sessionId: 's1', turn: 3, endSeq: 9 }), { sessionId: 's1', turn: 3, endSeq: 9 })
  assert.deepEqual(parseRecapBody({ sessionId: 's1', turn: 3, endSeq: 9, replyHash: 'A'.repeat(16) }), {
    sessionId: 's1', turn: 3, endSeq: 9, replyHash: 'a'.repeat(16),
  })
  assert.equal(parseSuggestBody({ sessionId: 's1' }), null)
  assert.equal(parseSuggestBody({ sessionId: 's1', turn: -1, endSeq: 2 }), null)
  assert.equal(parseSuggestBody({ sessionId: 's1', turn: 1, endSeq: Number.MAX_SAFE_INTEGER + 1 }), null)
  assert.equal(parseSuggestBody({ sessionId: '', turn: 1, endSeq: 2 }), null)
  assert.equal(parseRecapBody({ sessionId: 's1', turn: 1, endSeq: 2, replyHash: 'bad' }), null)
})

test('attempt identity contains the exact end sequence, prompt version, and generation', () => {
  assert.notEqual(candidateKey('s1', 2, 7, 5, 'g1'), candidateKey('s1', 2, 8, 5, 'g1'))
  assert.notEqual(candidateKey('s1', 2, 7, 5, 'g1'), candidateKey('s1', 2, 7, 5, 'g2'))
  assert.notEqual(candidateKey('s1', 2, 7, 5, 'g1'), candidateKey('s1', 2, 7, 6, 'g1'))
})
