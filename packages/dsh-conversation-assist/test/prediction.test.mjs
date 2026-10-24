import assert from 'node:assert/strict'
import test from 'node:test'

import { canRequest, isMetaExchange, languageName, parseSuggestBody, sanitizeSuggestion, trimHistory } from '../src/shared/prediction.mjs'

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
  assert.equal(tiny.length, 0)
  assert.equal(trimHistory([], 100, 10).length, 0)
})

test('trimHistory drops system/developer messages and orphan tool output', () => {
  const messages = [
    { role: 'system', content: 'agent instructions' },
    { role: 'developer', content: 'dev' },
    { role: 'tool', content: 'orphan' },
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
  ]
  const tail = trimHistory(messages, 8192, 24)
  assert.deepEqual(tail.map(message => message.role), ['user', 'assistant'])
})

test('trimHistory never splits a Turn that contains a tool call and its result', () => {
  const toolCall = { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'a', name: 'bash', arguments: {} }] }
  const toolResult = { role: 'tool', toolCallId: 'a', content: [{ type: 'text', text: 'y'.repeat(5000) }] }
  const text = { role: 'assistant', content: [{ type: 'text', text: 'done' }] }
  const messages = [{ role: 'user', content: 'run it' }, toolCall, toolResult, text]
  // The oversized Turn is skipped whole, not reduced to an unresolved call.
  assert.deepEqual(trimHistory(messages, 2000, 24), [])
  // A Turn that fits keeps the call and its result together.
  const small = trimHistory(messages, 8192, 24)
  assert.deepEqual(small.map(message => message.role), ['user', 'assistant', 'tool', 'assistant'])
  assert.equal(small[1].content[0].toolCallId, 'a')
  assert.equal(small[2].toolCallId, 'a')
})

test('trimHistory keeps whole newest Turns under both caps', () => {
  const messages = [
    { role: 'user', content: 'one' },
    { role: 'assistant', content: 'a' },
    { role: 'user', content: 'two' },
    { role: 'assistant', content: 'b' },
  ]
  const tail = trimHistory(messages, 8192, 2)
  assert.deepEqual(tail.map(message => message.content), ['two', 'b'])
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

test('meta/acceptance exchanges are skipped and coding exchanges are not', () => {
  const meta = [
    { role: 'user', content: [{ type: 'text', text: '都正常' }] },
    { role: 'assistant', content: [{ type: 'text', text: '已合并 PR #2 并清理，设置导航和建议条都正常。' }] },
  ]
  assert.equal(isMetaExchange(meta), true)
  const complaint = [
    { role: 'user', content: [{ type: 'text', text: '这次会话的建议条又有问题了，看起来仍然是上次的' }] },
    { role: 'assistant', content: [{ type: 'text', text: '我查一下。' }] },
  ]
  assert.equal(isMetaExchange(complaint), true)
  const coding = [
    { role: 'user', content: [{ type: 'text', text: '把 README 的标题改一下' }] },
    { role: 'assistant', content: [{ type: 'text', text: '已修改标题。' }] },
  ]
  assert.equal(isMetaExchange(coding), false)
  for (const ordinary of [
    'strip 一下多余的空白，顺便修正 expression 的解析',
    '用 Stripe 做结账页，补测试',
    '优化 composer 的 prompt 长度，测试一下',
    '回顾一下这个 PR 的 diff',
  ]) {
    assert.equal(isMetaExchange([
      { role: 'user', content: [{ type: 'text', text: ordinary }] },
      { role: 'assistant', content: [{ type: 'text', text: '已处理。' }] },
    ]), false)
  }
  assert.equal(isMetaExchange([
    { role: 'user', content: [{ type: 'text', text: '好的' }] },
    { role: 'assistant', content: [{ type: 'text', text: '已修复。' }] },
  ]), true)
})
