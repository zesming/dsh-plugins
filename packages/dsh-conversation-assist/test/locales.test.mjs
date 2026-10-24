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
