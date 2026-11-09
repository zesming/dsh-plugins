import assert from 'node:assert/strict'
import test from 'node:test'

import { createSettingsHandler } from '../src/host/routes.mjs'

/**
 * The 4 KiB body cap must hold even when a client omits Content-Length
 * (chunked transfer): the header-only guard used to be bypassable.
 */
test('an undeclared oversize body is refused with 413 (F-15)', async () => {
  const handler = createSettingsHandler({
    getSettings: () => ({ recap: true, prediction: true, loaded: true }),
    saveSettings: async () => {},
  })
  const big = JSON.stringify({ prediction: false, pad: 'x'.repeat(5000) })
  // No content-length header, so the cap can only be enforced by counting the
  // bytes actually read.
  const request = new Request('http://host/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: big,
  })
  assert.equal(request.headers.get('content-length'), null)
  const response = await handler(request)
  assert.equal(response.status, 413)
  const value = await response.json()
  assert.deepEqual(value, { state: 'error', error: 'too-large' })
})

test('a small body without a declared length still parses', async () => {
  let saved = null
  const handler = createSettingsHandler({
    getSettings: () => ({ recap: true, prediction: true, loaded: true }),
    saveSettings: async patch => { saved = patch },
  })
  const request = new Request('http://host/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prediction: false }),
    // duplex is required for streaming Request bodies in some runtimes; undici
    // infers it for a string body.
  })
  const response = await handler(request)
  assert.equal(response.status, 200)
  assert.equal(saved.prediction, false)
})
