import assert from 'node:assert/strict'
import test from 'node:test'

import { applySettingsPatch, DEFAULT_SETTINGS, normalizeSettings, parseSettingsPatch } from '../src/shared/settings.mjs'

test('settings default recap and semantic recap on and suggestions off', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { recap: true, semanticRecap: true, prediction: false })
  assert.deepEqual(normalizeSettings(undefined), { ...DEFAULT_SETTINGS })
  assert.deepEqual(normalizeSettings('nonsense'), { ...DEFAULT_SETTINGS })
  assert.deepEqual(normalizeSettings([]), { ...DEFAULT_SETTINGS })
  assert.deepEqual(normalizeSettings({ recap: false, semanticRecap: false, prediction: 1 }), {
    recap: false, semanticRecap: false, prediction: false,
  })
})

test('old settings preserve known values and apply the confirmed default to new fields', () => {
  assert.deepEqual(normalizeSettings({ recap: false, prediction: true, extra: 3 }), {
    recap: false, semanticRecap: true, prediction: true,
  })
  assert.deepEqual(normalizeSettings({ semanticRecap: false }), {
    recap: true, semanticRecap: false, prediction: false,
  })
})

test('a patch needs at least one known boolean and preserves independent switches', () => {
  assert.deepEqual(parseSettingsPatch({ prediction: true }), { prediction: true })
  assert.deepEqual(parseSettingsPatch({ semanticRecap: false }), { semanticRecap: false })
  assert.deepEqual(parseSettingsPatch({ recap: false, prediction: true }), { recap: false, prediction: true })
  assert.equal(parseSettingsPatch({}), null)
  assert.equal(parseSettingsPatch({ other: true }), null)
  assert.equal(parseSettingsPatch({ prediction: 'yes' }), null)
  assert.equal(parseSettingsPatch(null), null)
})

test('patches merge without changing the other feature state', () => {
  assert.deepEqual(applySettingsPatch(DEFAULT_SETTINGS, { prediction: true }), {
    recap: true, semanticRecap: true, prediction: true,
  })
  assert.deepEqual(applySettingsPatch({ recap: true, semanticRecap: true, prediction: true }, { semanticRecap: false }), {
    recap: true, semanticRecap: false, prediction: true,
  })
})
