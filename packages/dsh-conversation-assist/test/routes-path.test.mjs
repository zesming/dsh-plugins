import assert from 'node:assert/strict'
import test from 'node:test'

import { SETTINGS_PATH, SUGGEST_PATH } from '../src/index.js'
import { SETTINGS_ROUTE, SUGGEST_ROUTE } from '../src/ui/store.js'

test('client and Host agree on the final exact routes', () => {
  assert.equal(SETTINGS_PATH, '/api/dsh-conversation-assist.settings')
  assert.equal(SUGGEST_PATH, '/api/dsh-conversation-assist.rpc')
  assert.equal(`/${SETTINGS_ROUTE}`, SETTINGS_PATH)
  assert.equal(`/${SUGGEST_ROUTE}`, SUGGEST_PATH)
})
