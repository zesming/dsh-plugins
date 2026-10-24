import assert from 'node:assert/strict'
import test from 'node:test'

import { applySettingsPatch, DEFAULT_SETTINGS, normalizeSettings, parseSettingsPatch } from '../src/shared/settings.mjs'

test('settings fall back to the defaults for anything unusable', () => {
  assert.deepEqual(normalizeSettings(undefined), { ...DEFAULT_SETTINGS })
  assert.deepEqual(normalizeSettings('nonsense'), { ...DEFAULT_SETTINGS })
  assert.deepEqual(normalizeSettings([]), { ...DEFAULT_SETTINGS })
  assert.deepEqual(normalizeSettings({ recap: 'yes', prediction: 1 }), { ...DEFAULT_SETTINGS })
})

test('settings keep known booleans and ignore unknown keys', () => {
  assert.deepEqual(normalizeSettings({ recap: false, prediction: true, extra: 3 }), { recap: false, prediction: true })
})

test('a settings patch must carry at least one known boolean', () => {
  assert.deepEqual(parseSettingsPatch({ prediction: true }), { prediction: true })
  assert.deepEqual(parseSettingsPatch({ recap: false, prediction: true }), { recap: false, prediction: true })
  assert.equal(parseSettingsPatch({}), null)
  assert.equal(parseSettingsPatch({ other: true }), null)
  assert.equal(parseSettingsPatch({ prediction: 'yes' }), null)
  assert.equal(parseSettingsPatch(null), null)
})

test('applySettingsPatch merges and normalizes', () => {
  assert.deepEqual(applySettingsPatch({ recap: true, prediction: false }, { prediction: true }), { recap: true, prediction: true })
})
