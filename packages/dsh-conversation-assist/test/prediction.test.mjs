import assert from 'node:assert/strict'
import test from 'node:test'

import { canRequest, languageName, parseSuggestBody, sanitizeSuggestion, trimHistory } from '../src/shared/prediction.mjs'

const base = {
  prediction: true,
  sessionId: 's1',
  input: { draft: '', attachmentIds: [], occurrences: [], queue: [], phase: 'plain', claim: undefined },
  session: { running: false, removed: false, subagent: null, pendingSubmissions: [] },
}

test('canRequest accepts an idle, empty, ordinary composer', () => {
  assert.equal(canRequest(base), true)
})

test('canRequest rejects every disqualifying condition', () => {
  const cases = [
    [{ prediction: false }, 'prediction off'],
    [{ sessionId: '' }, 'no session'],
    [{ session: { ...base.session, running: true } }, 'running'],
    [{ session: { ...base.session, removed: true } }, 'removed'],
    [{ session: { ...base.session, subagent: { address: {} } } }, 'subagent'],
    [{ session: { ...base.session, pendingSubmissions: [{}] } }, 'pending echo'],
    [{ input: { ...base.input, draft: 'x' } }, 'draft'],
    [{ input: { ...base.input, attachmentIds: ['a'] } }, 'attachment'],
    [{ input: { ...base.input, occurrences: [{}] } }, 'chip'],
    [{ input: { ...base.input, queue: [{}] } }, 'queue'],
    [{ input: { ...base.input, phase: 'submitting' } }, 'phase'],
    [{ input: { ...base.input, claim: { name: 'goal' } } }, 'claim'],
  ]
  for (const [patch, label] of cases) assert.equal(canRequest({ ...base, ...patch }), false, label)
})

test('trimHistory keeps the newest messages under both caps', () => {
  const messages = Array.from({ length: 30 }, (_, index) => ({ role: 'user', content: [{ type: 'text', text: `message ${index}` }] }))
  const short = trimHistory(messages, 100_000, 5)
  assert.equal(short.length, 5)
  assert.match(short.at(-1).content[0].text, /message 29/u)
  const tiny = trimHistory([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], 20)
  assert.equal(tiny.length, 1)
  assert.equal(trimHistory([], 100, 10).length, 0)
})

test('sanitizeSuggestion returns one clean line or null', () => {
  assert.equal(sanitizeSuggestion('“帮我补一个测试。”'), '帮我补一个测试。')
  assert.equal(sanitizeSuggestion('Suggestion: 写一条回归'), '写一条回归')
  assert.equal(sanitizeSuggestion('建议：补一个 hover 测试'), '补一个 hover 测试')
  assert.equal(sanitizeSuggestion('first line\nsecond line'), 'first line')
  assert.equal(sanitizeSuggestion('   '), null)
  assert.equal(sanitizeSuggestion('```js\ncode\n```'), null)
  assert.equal(sanitizeSuggestion('x'.repeat(200)), null)
  assert.equal(sanitizeSuggestion(42), null)
})

test('parseSuggestBody validates the session and falls back to English', () => {
  assert.deepEqual(parseSuggestBody({ sessionId: 's1', language: 'zh-CN' }), { sessionId: 's1', language: 'zh-CN' })
  assert.deepEqual(parseSuggestBody({ sessionId: 's1' }), { sessionId: 's1', language: 'en' })
  assert.deepEqual(parseSuggestBody({ sessionId: 's1', language: 'not a tag!' }), { sessionId: 's1', language: 'en' })
  assert.equal(parseSuggestBody({}), null)
  assert.equal(parseSuggestBody({ sessionId: 42 }), null)
  assert.equal(parseSuggestBody([]), null)
})

test('languageName picks Chinese only for zh tags', () => {
  assert.equal(languageName('zh-CN'), 'Chinese')
  assert.equal(languageName('en-US'), 'English')
  assert.equal(languageName('fr'), 'English')
})
