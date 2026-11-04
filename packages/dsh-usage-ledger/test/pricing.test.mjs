import assert from 'node:assert/strict'
import test from 'node:test'

import { BUNDLED_PRICING, PRICING_URL, createPricingSource, localDayKey, parsePricingPage } from '../src/pricing.js'

/**
 * A miniature of the published table.
 *
 * It keeps the structure that the parser depends on — a `rowspan` label, a pair
 * of tier rows per quantity, one column per model — because that structure, not
 * the specific numbers, is what the real page guarantees.
 */
const TABLE = `
<table><tbody>
<tr><td colspan="3">模型</td><td>deepseek-flash</td><td>deepseek-v4-pro</td></tr>
<tr><td colspan="3">模型版本</td><td>DeepSeek-V4.1-Flash-1017</td><td>DeepSeek-V4-Pro-0813</td></tr>
<tr><td rowspan="6">价格</td><td rowspan="2">百万tokens输入<br>（缓存命中）</td><td>空闲时段</td><td>0.02元</td><td>0.15元</td></tr>
<tr><td>高峰时段</td><td>0.04元</td><td>0.30元</td></tr>
<tr><td rowspan="2">百万tokens输入<br>（缓存未命中）</td><td>空闲时段</td><td>1元</td><td>4.5元</td></tr>
<tr><td>高峰时段</td><td>2元</td><td>9.0元</td></tr>
<tr><td rowspan="2">百万tokens输出</td><td>空闲时段</td><td>4元</td><td>13.5元</td></tr>
<tr><td>高峰时段</td><td>8元</td><td>27.0元</td></tr>
</tbody></table>`

/** The same table as the English page writes it: symbol first, dollars. */
const TABLE_USD = `
<table><tbody>
<tr><td colspan="3">MODEL</td><td>deepseek-flash</td><td>deepseek-v4-pro</td></tr>
<tr><td rowspan="6">PRICING</td><td rowspan="2">1M INPUT TOKENS (CACHE HIT)</td><td>OFF-PEAK</td><td>$0.003</td><td>$0.022</td></tr>
<tr><td>PEAK</td><td>$0.006</td><td>$0.044</td></tr>
<tr><td rowspan="2">1M INPUT TOKENS (CACHE MISS)</td><td>OFF-PEAK</td><td>$0.15</td><td>$0.66</td></tr>
<tr><td>PEAK</td><td>$0.3</td><td>$1.32</td></tr>
<tr><td rowspan="2">1M OUTPUT TOKENS</td><td>OFF-PEAK</td><td>$0.6</td><td>$1.98</td></tr>
<tr><td>PEAK</td><td>$1.2</td><td>$3.96</td></tr>
</tbody></table>`

test('the published table parses into both tiers of every quantity', () => {
  const table = parsePricingPage(TABLE)
  assert.ok(table)
  assert.equal(table.currency, 'CNY')
  assert.deepEqual(table.models.flash.prices.offPeak, { cacheHit: '0.02', cacheMiss: '1', output: '4' })
  assert.deepEqual(table.models.flash.prices.peak, { cacheHit: '0.04', cacheMiss: '2', output: '8' })
  assert.deepEqual(table.models.pro.prices.peak, { cacheHit: '0.30', cacheMiss: '9.0', output: '27.0' })
})

test('the English page reads as dollars with the symbol first', () => {
  const table = parsePricingPage(TABLE_USD)
  assert.ok(table)
  assert.equal(table.currency, 'USD')
  assert.equal(table.models.flash.prices.peak.cacheMiss, '0.3')
  assert.equal(table.models.flash.prices.offPeak.output, '0.6')
})

test('a page without a price table is rejected instead of half-read', () => {
  assert.equal(parsePricingPage(''), null)
  assert.equal(parsePricingPage('<p>暂无价格</p>'), null)
  assert.equal(parsePricingPage(undefined), null)
})

test('an incomplete table yields no model rather than a partial price', () => {
  const broken = TABLE.replace('<tr><td>高峰时段</td><td>8元</td><td>27.0元</td></tr>', '')
  const table = parsePricingPage(broken)
  // Both tiers of the output quantity are now missing, so no model survives.
  assert.equal(table, null)
})

test('a table mixing two currencies is refused', () => {
  const mixed = TABLE.replace('0.04元', '$0.04')
  assert.equal(parsePricingPage(mixed), null)
})

test('the bundled snapshot carries the same shape as a live table', () => {
  assert.equal(BUNDLED_PRICING.currency, 'CNY')
  assert.equal(BUNDLED_PRICING.source, PRICING_URL)
  for (const family of ['flash', 'pro']) {
    const model = BUNDLED_PRICING.models[family]
    for (const tier of ['peak', 'offPeak']) {
      for (const slot of ['cacheHit', 'cacheMiss', 'output']) {
        assert.equal(typeof model.prices[tier][slot], 'string', `${family}.${tier}.${slot}`)
      }
    }
  }
})

test('a live read is cached for the rest of the day', async () => {
  let calls = 0
  const source = createPricingSource({
    now: () => Date.UTC(2026, 9, 22, 4, 0, 0),
    fetchImpl: async () => { calls += 1; return { ok: true, text: async () => TABLE } },
  })
  const first = await source()
  const second = await source()
  assert.equal(calls, 1, 'the page is read once, not once per request')
  assert.equal(first.origin, 'live')
  assert.equal(first.currency, 'CNY')
  assert.equal(second.origin, 'live')
})

test('the price list is refreshed on the next local day', async () => {
  let calls = 0
  let clock = Date.UTC(2026, 9, 22, 4, 0, 0)
  const source = createPricingSource({
    now: () => clock,
    fetchImpl: async () => { calls += 1; return { ok: true, text: async () => TABLE } },
  })
  await source()
  clock += 24 * 60 * 60 * 1000
  await source()
  assert.equal(calls, 2)
})

test('an unreachable page falls back to the bundled snapshot', async () => {
  const source = createPricingSource({
    now: () => Date.UTC(2026, 9, 22, 4, 0, 0),
    fetchImpl: async () => { throw new Error('offline') },
  })
  const payload = await source()
  assert.equal(payload.origin, 'bundled')
  assert.equal(payload.currency, 'CNY')
  assert.deepEqual(payload.models.flash.prices, BUNDLED_PRICING.models.flash.prices)
})

test('an HTTP error or an unparsable page also falls back', async () => {
  for (const response of [{ ok: false, status: 429 }, { ok: true, text: async () => '<html>no table</html>' }]) {
    const source = createPricingSource({
      now: () => Date.UTC(2026, 9, 22, 4, 0, 0),
      fetchImpl: async () => response,
    })
    assert.equal((await source()).origin, 'bundled')
  }
})

test('a fallback is not cached for the day, so the next ask retries', async () => {
  let calls = 0
  let fail = true
  const source = createPricingSource({
    now: () => Date.UTC(2026, 9, 22, 4, 0, 0),
    fetchImpl: async () => {
      calls += 1
      if (fail) throw new Error('offline')
      return { ok: true, text: async () => TABLE }
    },
  })
  assert.equal((await source()).origin, 'bundled')
  fail = false
  assert.equal((await source()).origin, 'live')
  assert.equal(calls, 2)
})

test('concurrent asks share one page read', async () => {
  let calls = 0
  const source = createPricingSource({
    now: () => Date.UTC(2026, 9, 22, 4, 0, 0),
    fetchImpl: async () => {
      calls += 1
      await new Promise(resolve => setTimeout(resolve, 5))
      return { ok: true, text: async () => TABLE }
    },
  })
  await Promise.all([source(), source(), source()])
  assert.equal(calls, 1)
})

test('a missing fetch implementation degrades instead of throwing', async () => {
  const source = createPricingSource({ now: () => Date.UTC(2026, 9, 22, 4, 0, 0), fetchImpl: undefined })
  assert.equal((await source()).origin, 'bundled')
})

test('local day keys follow the reader timezone', () => {
  assert.equal(localDayKey(new Date(2026, 9, 22, 23, 30).getTime()), '2026-10-22')
})
