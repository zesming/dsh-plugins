import assert from 'node:assert/strict'
import test from 'node:test'

import { applySettingsPatch, DEFAULT_SETTINGS, normalizeSettings, parseSettingsPatch } from '../src/shared/settings.mjs'

test('settings default recaps on and suggestions off', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { recap: true, prediction: false })
  assert.deepEqual(normalizeSettings(undefined), { ...DEFAULT_SETTINGS })
  assert.deepEqual(normalizeSettings('nonsense'), { ...DEFAULT_SETTINGS })
  assert.deepEqual(normalizeSettings([]), { ...DEFAULT_SETTINGS })
  assert.deepEqual(normalizeSettings({ recap: false, semanticRecap: false, prediction: 1 }), {
    recap: false, prediction: false,
  })
})

test('legacy recap mode is ignored while recap and suggestion preferences are preserved', () => {
  assert.deepEqual(normalizeSettings({ recap: false, semanticRecap: true, prediction: true, extra: 3 }), {
    recap: false, prediction: true,
  })
  assert.deepEqual(normalizeSettings({ semanticRecap: false }), {
    recap: true, prediction: false,
  })
})

test('a patch accepts only recap and suggestion preferences', () => {
  assert.deepEqual(parseSettingsPatch({ prediction: true }), { prediction: true })
  assert.equal(parseSettingsPatch({ semanticRecap: false }), null)
  assert.deepEqual(parseSettingsPatch({ recap: false, prediction: true, semanticRecap: false }), { recap: false, prediction: true })
  assert.equal(parseSettingsPatch({}), null)
  assert.equal(parseSettingsPatch({ other: true }), null)
  assert.equal(parseSettingsPatch({ prediction: 'yes' }), null)
  assert.equal(parseSettingsPatch(null), null)
})

test('patches merge without changing the other feature state', () => {
  assert.deepEqual(applySettingsPatch(DEFAULT_SETTINGS, { prediction: true }), {
    recap: true, prediction: true,
  })
  assert.deepEqual(applySettingsPatch({ recap: true, prediction: true }, { recap: false }), {
    recap: false, prediction: true,
  })
})
