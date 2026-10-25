import assert from 'node:assert/strict'
import test from 'node:test'

import { RECAP_ROUTE, SUGGEST_ROUTE, createHiddenTurns, createSettingsStore,
  requestRecap, requestSuggestion, translate } from '../src/ui/store.js'

const response = value => new Response(JSON.stringify(value), {
  status: 200,
  headers: { 'content-type': 'application/json' },
})

test('hidden markers distinguish a turn identity and can be cleared per Session', () => {
  const hidden = createHiddenTurns()
  hidden.hide('s1', 3, 20)
  assert.equal(hidden.isHidden('s1', 3, 20), true)
  assert.equal(hidden.isHidden('s1', 3, 21), false)
  assert.equal(hidden.isHidden('s1', 2, 20), false)
  assert.equal(hidden.isHidden('s2', 3, 20), false)
  hidden.clear('s1')
  assert.equal(hidden.isHidden('s1', 3, 20), false)
})

test('translate follows the interface language and falls back to English', () => {
  assert.equal(translate('zh-CN', 'suggestion.insert'), '填入聊天')
  assert.equal(translate('en', 'suggestion.insert'), 'Insert into chat')
  assert.equal(translate('fr', 'suggestion.insert'), 'Insert into chat')
  assert.equal(translate('en', 'suggestion.send'), 'Send')
  assert.equal(translate('en', 'missing.key'), 'missing.key')
})

test('settings ignore the retired recap mode and preserve recap and suggestion preferences', async () => {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  const writes = []
  globalThis.document = { baseURI: 'http://host/' }
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'http://host/api/dsh-conversation-assist.settings')
    if (init?.method === 'POST') {
      const patch = JSON.parse(init.body)
      writes.push(patch)
      return response({ recap: true, prediction: patch.prediction ?? true })
    }
    return response({ recap: true, semanticRecap: false, prediction: true })
  }
  try {
    const settings = createSettingsStore({ language: () => 'en' })
    await settings.start()
    assert.deepEqual({ recap: settings.getSnapshot().recap, prediction: settings.getSnapshot().prediction }, {
      recap: true, prediction: true,
    })
    assert.equal('semanticRecap' in settings.getSnapshot(), false)
    assert.equal(await settings.update({ semanticRecap: false }), false)
    assert.deepEqual(writes, [])
    assert.equal(await settings.update({ prediction: false, semanticRecap: false }), true)
    assert.deepEqual(writes, [{ prediction: false }])
    assert.equal(settings.getSnapshot().prediction, false)
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})

test('a failed setting write rolls back only that setting and clears its pending state', async () => {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  globalThis.document = { baseURI: 'http://host/' }
  globalThis.fetch = async (_url, init) => init?.method === 'POST'
    ? new Response('', { status: 500 })
    : response({ recap: false, prediction: true })
  try {
    const settings = createSettingsStore({ language: () => 'en' })
    await settings.start()
    assert.equal(await settings.update({ recap: true }), false)
    assert.deepEqual({
      recap: settings.getSnapshot().recap,
      prediction: settings.getSnapshot().prediction,
      pending: settings.getSnapshot().pending.recap,
      failed: settings.getSnapshot().failed,
    }, { recap: false, prediction: true, pending: false, failed: 'recap' })
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})

test('prediction off epoch survives a rapid off/on pair', async () => {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  globalThis.document = { baseURI: 'http://host/' }
  globalThis.fetch = async (_url, init) => {
    if (init?.method !== 'POST') return response({ recap: true, prediction: true })
    return response(JSON.parse(init.body))
  }
  try {
    const settings = createSettingsStore({ language: () => 'en' })
    await settings.start()
    const initialEpoch = settings.getSnapshot().predictionOffEpoch
    await settings.update({ prediction: false })
    const disabledEpoch = settings.getSnapshot().predictionOffEpoch
    assert.equal(disabledEpoch, initialEpoch + 1)
    await settings.update({ prediction: true })
    assert.equal(settings.getSnapshot().prediction, true)
    assert.equal(settings.getSnapshot().predictionOffEpoch, disabledEpoch)
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})

test('suggestion reads send the exact latest Turn identity to the final route', async () => {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.document = { baseURI: 'http://host/' }
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    return response({ state: 'none' })
  }
  try {
    assert.deepEqual(await requestSuggestion('s1', 7, 31), { state: 'none' })
    assert.equal(SUGGEST_ROUTE, 'api/dsh-conversation-assist.rpc')
    assert.equal(calls[0].url, 'http://host/api/dsh-conversation-assist.rpc')
    assert.deepEqual(calls[0].body, { sessionId: 's1', turn: 7, endSeq: 31 })
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})

test('recap reads stay document-relative under a nested mount and bind the final reply fingerprint', async () => {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  const calls = []
  const result = {
    state: 'ready', sessionId: 's1', turn: 7, endSeq: 31,
    replyHash: 'reply-identity', recap: '通过了本地检查；深色模式未验证。',
  }
  globalThis.document = { baseURI: 'http://host/document/' }
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    return response(result)
  }
  try {
    assert.deepEqual(await requestRecap('s1', 7, 31, 'reply-identity'), result)
    assert.equal(RECAP_ROUTE, 'api/dsh-conversation-assist.recap')
    assert.equal(calls[0].url, 'http://host/document/api/dsh-conversation-assist.recap')
    assert.deepEqual(calls[0].body, {
      sessionId: 's1', turn: 7, endSeq: 31, replyHash: 'reply-identity',
    })
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})
