import assert from 'node:assert/strict'
import test from 'node:test'

import { createHiddenTurns, translate } from '../src/ui/store.js'

test('hidden Turns are keyed per Session and cleared explicitly', () => {
  const hidden = createHiddenTurns()
  hidden.hide('s1', 3)
  assert.equal(hidden.isHidden('s1', 3), true)
  assert.equal(hidden.isHidden('s1', 2), false)
  assert.equal(hidden.isHidden('s2', 3), false)
  hidden.clear('s1')
  assert.equal(hidden.isHidden('s1', 3), false)
})

test('translate follows the interface language and falls back to English', () => {
  assert.equal(translate('zh-CN', 'suggestion.send'), '发送')
  assert.equal(translate('en', 'suggestion.send'), 'Send')
  assert.equal(translate('fr', 'suggestion.send'), 'Send')
  assert.equal(translate('en', 'missing.key'), 'missing.key')
})
