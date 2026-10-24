import assert from 'node:assert/strict'
import test from 'node:test'

import { SUGGEST_ROUTE, createHiddenTurns, requestSuggestion, translate } from '../src/ui/store.js'

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

test('the client suggestion request uses the final route and no action field', async () => {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.document = { baseURI: 'http://host/' }
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    return new Response(JSON.stringify({ state: 'none' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    assert.deepEqual(await requestSuggestion('s1', 'zh-CN', 123), { state: 'none' })
    assert.equal(SUGGEST_ROUTE, 'api/dsh-conversation-assist.rpc')
    assert.equal(calls[0].url, 'http://host/api/dsh-conversation-assist.rpc')
    assert.deepEqual(calls[0].body, { sessionId: 's1', language: 'zh-CN', notBefore: 123 })
    assert.equal('action' in calls[0].body, false)
    await requestSuggestion('s1', 'en')
    assert.deepEqual(calls[1].body, { sessionId: 's1', language: 'en' })
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})
