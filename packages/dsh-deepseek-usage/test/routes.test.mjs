import assert from 'node:assert/strict'
import test from 'node:test'

import { BALANCE_PATH, SERIES_PATH, apply } from '../src/index.js'

/** A minimal Cordis-shaped context capturing the routes a plugin registers. */
function harness(services = {}) {
  const routes = new Map()
  const effects = []
  const warns = []
  const connection = {
    fetch: {
      register: route => {
        assert.equal(routes.has(route.path), false, `duplicate route ${route.path}`)
        routes.set(route.path, route)
        return () => routes.delete(route.path)
      },
    },
  }
  const ctx = {
    get: name => services[name],
    inject: (deps, callback) => {
      if (!deps.includes('connection')) return
      callback({ connection })
    },
    effect: (factory, label) => { effects.push({ factory, label }) },
    logger: { warn: (...args) => warns.push(args) },
  }
  apply(ctx, {})
  return { routes, effects, warns, services }
}

/** Call one registered route with a URL. */
async function call(routes, path, query = '') {
  const route = routes.get(path)
  assert.ok(route, `route ${path} was not registered`)
  const response = await route.fetch(new Request(`http://127.0.0.1:1${path}${query}`))
  const text = await response.text()
  return { status: response.status, type: response.headers.get('content-type'), body: JSON.parse(text) }
}

/** A signed-in account that answers the given reads. */
function account({ state = { status: 'credential-stored' }, balance, bonuses } = {}) {
  return {
    getState: async () => state,
    getBalance: async () => balance ?? { status: 'ready', value: [{ currency: 'CNY', balance: '10.00' }], bonusWallets: [] },
    getUnnotifiedBonuses: async () => bonuses ?? { bonuses: [] },
  }
}

test('every route declares a body mode the carrier understands', async () => {
  // The carrier recognizes exactly `buffered` and `streaming`; anything else is
  // treated as streaming and hands the handler a half-duplex Request.
  const { routes } = harness({ sessionQuery: undefined })
  for (const route of routes.values()) {
    assert.ok(['buffered', 'streaming'].includes(route.requestBody), `${route.path}: ${String(route.requestBody)}`)
  }
})

test('both routes register and answer JSON without store caching', async () => {
  const { routes } = harness({ sessionQuery: { listSessions: async () => [], readSession: async () => ({ events: [] }) } })
  assert.deepEqual([...routes.keys()].sort(), [BALANCE_PATH, SERIES_PATH])
  const response = await routes.get(SERIES_PATH).fetch(new Request(`http://127.0.0.1:1${SERIES_PATH}`))
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  assert.match(response.headers.get('content-type') ?? '', /application\/json/)
})

test('a signed-out account reports signedIn false rather than an error', async () => {
  const { routes } = harness({ deepseekAccount: account({ state: { status: 'signed-out' } }) })
  const { body } = await call(routes, BALANCE_PATH)
  assert.equal(body.signedIn, false)
  assert.equal(body.available, false)
})

test('a stored credential produces the balance payload', async () => {
  const { routes } = harness({ deepseekAccount: account() })
  const { body } = await call(routes, BALANCE_PATH, '?locale=zh-CN&tz=28800')
  assert.equal(body.signedIn, true)
  assert.equal(body.available, true)
  assert.equal(body.total, '10.00')
})

test('a throwing balance read becomes unavailable, not zero', async () => {
  const { routes } = harness({
    deepseekAccount: { ...account(), getBalance: async () => { throw new Error('boom') } },
  })
  const { body } = await call(routes, BALANCE_PATH)
  assert.equal(body.available, false)
  assert.equal('total' in body, false)
})

test('a throwing bonus read still returns the balance it has', async () => {
  const { routes } = harness({
    deepseekAccount: { ...account(), getUnnotifiedBonuses: async () => { throw new Error('boom') } },
  })
  const { body } = await call(routes, BALANCE_PATH)
  assert.equal(body.available, true)
  assert.deepEqual(body.expiring, [])
})

test('the balance cache serves a second read without re-querying', async () => {
  let reads = 0
  const base = account()
  const { routes } = harness({
    deepseekAccount: { ...base, getBalance: async () => { reads += 1; return { status: 'ready', value: [{ currency: 'CNY', balance: `${String(reads)}` }], bonusWallets: [] } } },
  })
  await call(routes, BALANCE_PATH)
  const second = await call(routes, BALANCE_PATH)
  assert.equal(reads, 1)
  assert.equal(second.body.balance, '1')
  const forced = await call(routes, BALANCE_PATH, '?force=1')
  assert.equal(reads, 2)
  assert.equal(forced.body.balance, '2')
})

test('concurrent reads de-duplicate into one Platform call', async () => {
  let reads = 0
  const base = account()
  const { routes } = harness({
    deepseekAccount: { ...base, getBalance: async () => { reads += 1; await new Promise(r => setTimeout(r, 20)); return { status: 'ready', value: [{ currency: 'CNY', balance: '1' }], bonusWallets: [] } } },
  })
  await Promise.all([call(routes, BALANCE_PATH), call(routes, BALANCE_PATH), call(routes, BALANCE_PATH)])
  assert.equal(reads, 1)
})

test('the usage route reports an unavailable service explicitly', async () => {
  const { routes } = harness({ sessionQuery: undefined })
  const { body } = await call(routes, SERIES_PATH)
  assert.equal(body.available, false)
  assert.equal(body.error, 'session-query-unavailable')
})

test('the usage route rejects a malformed window', async () => {
  const { routes } = harness({ sessionQuery: { listSessions: async () => [], readSession: async () => ({ events: [] }) } })
  for (const query of ['?windowDays=abc', '?windowDays=0', '?windowDays=-1', '?windowDays=801', '?windowDays=1.5']) {
    const { status, body } = await call(routes, SERIES_PATH, query)
    assert.equal(status, 400, query)
    assert.equal(body.error, 'invalid-window')
  }
})

test('the usage route folds a session and honours the subagent switch', async () => {
  const header = { id: 's1', createdAt: Date.now(), origin: 'root', parentSession: null }
  const events = [{
    type: 'assistant/message',
    time: Date.now(),
    data: {
      message: { source: { provider: 'deepseek-account', model: 'deepseek-v4' } },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 1000, cacheReadTokens: 900 },
    },
  }]
  const sessionQuery = { listSessions: async () => [{ header }], readSession: async () => ({ events }) }
  const { routes } = harness({ sessionQuery })
  const withSub = await call(routes, SERIES_PATH, '?includeSubagents=1')
  assert.equal(withSub.body.models.length, 1)
  assert.equal(withSub.body.models[0].totals.total, 1000)
  assert.deepEqual(withSub.body.channels, ['official'])
  const without = await call(routes, SERIES_PATH, '?includeSubagents=0&force=1')
  assert.equal(without.body.models.length, 1, 'a root session survives the subagent switch')
})

test('a session with a parent is excluded when subagents are off', async () => {
  const events = [{
    type: 'assistant/message',
    time: Date.now(),
    data: {
      message: { source: { provider: 'deepseek', model: 'm' } },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 50, cacheReadTokens: 0 },
    },
  }]
  const sessionQuery = {
    listSessions: async () => [{ header: { id: 'child', createdAt: Date.now(), origin: 'subagent', parentSession: 'root' } }],
    readSession: async () => ({ events }),
  }
  const { routes } = harness({ sessionQuery })
  const { body } = await call(routes, SERIES_PATH, '?includeSubagents=0')
  assert.deepEqual(body.models, [])
  assert.equal(body.scannedSessions, 0)
})

test('a failing session read is counted, not fatal', async () => {
  const sessionQuery = {
    listSessions: async () => [{ header: { id: 'bad', createdAt: Date.now(), origin: 'root', parentSession: null } }],
    readSession: async () => { throw new Error('corrupt') },
  }
  const { routes } = harness({ sessionQuery })
  const { body } = await call(routes, SERIES_PATH)
  assert.equal(body.available, true)
  assert.equal(body.failedSessions, 1)
  assert.deepEqual(body.models, [])
})

test('the usage cache is keyed by window and subagent scope', async () => {
  let scans = 0
  const sessionQuery = {
    listSessions: async () => { scans += 1; return [] },
    readSession: async () => ({ events: [] }),
  }
  const { routes } = harness({ sessionQuery })
  await call(routes, SERIES_PATH, '?windowDays=30')
  await call(routes, SERIES_PATH, '?windowDays=30')
  assert.equal(scans, 1)
  await call(routes, SERIES_PATH, '?windowDays=60')
  assert.equal(scans, 2)
})

test('disposing the plugin removes both routes', () => {
  const { routes, effects } = harness({ sessionQuery: undefined })
  assert.equal(routes.size, 2)
  const disposer = effects[0].factory()
  disposer()
  assert.equal(routes.size, 0)
})

test('a transient balance failure is retried on the next read', async () => {
  let attempts = 0
  const base = account()
  const { routes } = harness({
    deepseekAccount: {
      ...base,
      getBalance: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('transient')
        return { status: 'ready', value: [{ currency: 'CNY', balance: '7' }], bonusWallets: [] }
      },
    },
  })
  const first = await call(routes, BALANCE_PATH)
  assert.equal(first.body.available, false)
  const second = await call(routes, BALANCE_PATH)
  assert.equal(second.body.available, true)
  assert.equal(second.body.balance, '7')
  assert.equal(attempts, 2, 'the failure must not be cached for the TTL')
})

test('a success still short-circuits the next read', async () => {
  let attempts = 0
  const base = account()
  const { routes } = harness({
    deepseekAccount: {
      ...base,
      getBalance: async () => {
        attempts += 1
        return { status: 'ready', value: [{ currency: 'CNY', balance: '1' }], bonusWallets: [] }
      },
    },
  })
  await call(routes, BALANCE_PATH)
  await call(routes, BALANCE_PATH)
  assert.equal(attempts, 1)
})

test('a transient usage failure is retried on the next read', async () => {
  let attempts = 0
  const sessionQuery = {
    listSessions: async () => {
      attempts += 1
      if (attempts === 1) throw new Error('backend down')
      return []
    },
    readSession: async () => ({ events: [] }),
  }
  const { routes } = harness({ sessionQuery })
  const first = await call(routes, SERIES_PATH)
  assert.equal(first.body.available, false)
  const second = await call(routes, SERIES_PATH)
  assert.equal(second.body.available, true)
  assert.equal(attempts, 2)
})
