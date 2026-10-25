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

test('settings copy describes recap fallback, next suggestions, and shared usage', () => {
  assert.equal(zh['settings.intro'], '设置即时生效，重启后保留。')
  assert.equal(zh['settings.recap.desc'], '显示每轮的智能回顾或回复摘录。关闭后，所有回顾隐藏。')
  assert.equal(zh['settings.prediction.desc'], '有明确后续意图时，在输入框上方显示一条建议，可填入聊天或点击发送。默认关闭')
  assert.equal(zh['settings.note.body'], '显示回顾和下一条建议共用每轮最多一次辅助请求，会增加微量用量。')
  assert.match(en['settings.intro'], /take effect immediately.*persist across restarts/iu)
  assert.match(en['settings.prediction.desc'], /above the composer/iu)
  assert.match(en['settings.note.body'], /share at most one auxiliary request per turn, with a small amount of added usage/iu)
  assert.equal(Object.hasOwn(zh, 'settings.semanticRecap.name'), false)
  assert.equal(Object.hasOwn(en, 'settings.semanticRecap.name'), false)
  assert.equal(zh['suggestion.insert'], '填入聊天')
  assert.equal(en['suggestion.insert'], 'Insert into chat')
  assert.equal(zh['suggestion.send'], '发送')
  assert.equal(en['suggestion.send'], 'Send')
  assert.match(zh['recap.notPersisted'], /重启后可能无法显示/u)
  assert.match(en['recap.notPersisted'], /may be unavailable after a restart/iu)
  assert.doesNotMatch([...Object.values(zh), ...Object.values(en)].join('\n'), /Tab|直接发送|send this suggestion|开头一段|opening paragraph/iu)
})
