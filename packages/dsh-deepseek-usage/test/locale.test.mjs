import assert from 'node:assert/strict'
import test from 'node:test'

import { dictionaries, dictionaryFor, interpolate, keys } from '../src/ui/locale.js'

test('every dictionary carries the full key set', () => {
  for (const [name, rows] of Object.entries(dictionaries)) {
    assert.deepEqual(Object.keys(rows).sort(), [...keys].sort(), `${name} is missing or has extra rows`)
  }
})

test('placeholders stay in sync across languages', () => {
  const placeholders = text => (text.match(/\{(\w+)\}/g) ?? []).sort()
  for (const key of keys) {
    assert.deepEqual(placeholders(dictionaries.en[key]), placeholders(dictionaries.zh[key]), `placeholder drift in ${key}`)
  }
})

test('interpolation fills known names and keeps unknown ones', () => {
  assert.equal(interpolate('将在 {when}过期', { when: '6 天后' }), '将在 6 天后过期')
  assert.equal(interpolate('{a} {b}', { a: 1 }), '1 {b}')
})

test('language selection falls back to English', () => {
  assert.equal(dictionaryFor('zh-CN').usage, '用量')
  assert.equal(dictionaryFor('en-US').usage, 'Usage')
  assert.equal(dictionaryFor(undefined).usage, 'Usage')
})
