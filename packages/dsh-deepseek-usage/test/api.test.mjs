import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchBalance } from '../src/ui/api.js'

/** Install a `document` and `fetch` for one case, then restore them. */
async function withFetch(implementation, run) {
  const previous = { document: globalThis.document, fetch: globalThis.fetch }
  globalThis.document = { baseURI: 'http://127.0.0.1:1/' }
  globalThis.fetch = implementation
  try {
    return await run()
  } finally {
    globalThis.document = previous.document
    globalThis.fetch = previous.fetch
  }
}

test('a signed-out payload keeps signedIn false', async () => {
  const payload = await withFetch(
    async () => new Response(JSON.stringify({ signedIn: false, available: false, error: null })),
    () => fetchBalance(),
  )
  assert.equal(payload.signedIn, false)
})

test('an HTTP error never claims an account is signed in', async () => {
  for (const status of [401, 404, 500, 503]) {
    const payload = await withFetch(
      async () => new Response('nope', { status }),
      () => fetchBalance(),
    )
    assert.equal(payload.signedIn, false, `status ${status} must not imply a stored credential`)
    assert.equal(payload.available, false)
    assert.equal(payload.error, `http-${String(status)}`)
  }
})

test('a transport failure never claims an account is signed in', async () => {
  const payload = await withFetch(
    async () => { throw new TypeError('Failed to fetch') },
    () => fetchBalance(),
  )
  assert.equal(payload.signedIn, false)
  assert.equal(payload.error, 'network')
})

test('a malformed body never claims an account is signed in', async () => {
  const payload = await withFetch(
    async () => new Response('not json at all', { headers: { 'content-type': 'application/json' } }),
    () => fetchBalance(),
  )
  assert.equal(payload.signedIn, false)
  assert.equal(payload.error, 'malformed')
})

test('an abort is rethrown so the caller can ignore it', async () => {
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
  await assert.rejects(
    withFetch(async () => { throw abort }, () => fetchBalance()),
    error => error.name === 'AbortError',
  )
})

test('a ready payload passes through untouched', async () => {
  const body = { signedIn: true, available: true, currency: 'CNY', balance: '1.00', bonus: null, total: '1.00', expiring: [] }
  const payload = await withFetch(
    async () => new Response(JSON.stringify(body)),
    () => fetchBalance(),
  )
  assert.deepEqual(payload, body)
})

test('force adds the cache-bypass parameter', async () => {
  let seen
  await withFetch(async url => {
    seen = String(url)
    return new Response(JSON.stringify({ signedIn: false }))
  }, () => fetchBalance({ force: true }))
  assert.match(seen, /force=1/)
})
