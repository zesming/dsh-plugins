import assert from 'node:assert/strict'
import test from 'node:test'

import { dictionaryFor, en, formatRow, zh } from '../src/shared/locales.mjs'

test('both dictionaries expose the same keys and placeholders', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  for (const key of Object.keys(zh)) {
    const placeholders = text => [...text.matchAll(/\{(\w+)\}/gu)].map(match => match[1]).sort()
    assert.deepEqual(placeholders(zh[key]), placeholders(en[key]), key)
  }
})

test('unknown languages fall back to English and placeholders interpolate', () => {
  assert.equal(dictionaryFor('fr'), en)
  assert.equal(dictionaryFor('zh-Hans'), zh)
  assert.equal(formatRow('已确认 {parts}。', { parts: '3 个工具调用' }), '已确认 3 个工具调用。')
  assert.equal(formatRow('keep {other}', {}), 'keep {other}')
})

test('the interface copy names three independent settings and a shared request cap', () => {
  assert.equal(zh['settings.semanticRecap.name'], '智能回顾')
  assert.match(zh['settings.note.body'], /共用每轮最多一次/u)
  assert.match(en['settings.note.body'], /share at most one bounded auxiliary request per turn/u)
  assert.match(zh['settings.prediction.desc'], /输入框上方/u)
  assert.match(en['settings.prediction.desc'], /above the composer/iu)
  assert.equal(zh['suggestion.insert'], '填入聊天')
  assert.equal(en['suggestion.insert'], 'Insert into chat')
  assert.equal(zh['suggestion.send'], '发送')
  assert.equal(en['suggestion.send'], 'Send')
  assert.match(zh['recap.notPersisted'], /重启后可能无法显示/u)
  assert.match(en['recap.notPersisted'], /may be unavailable after a restart/iu)
  assert.doesNotMatch([...Object.values(zh), ...Object.values(en)].join('\n'), /Tab|直接发送|send this suggestion|开头一段|opening paragraph/iu)
})
