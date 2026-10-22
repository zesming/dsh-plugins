import assert from 'node:assert/strict'
import test from 'node:test'

import { decimalOfMicro, microOf, restrictSeries, sumCost, sumSeries, sumWindow, weekStacks } from '../src/ui/aggregate.js'
import { estimateCost, pricingFamilyOf } from '../src/cost.js'
import { keyOf } from '../src/ui/format.js'

/** A day map with `days` populated entries ending today. */
function daysOf(days, perDay = 100) {
  const map = {}
  const today = new Date()
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(today.getTime() - offset * 86_400_000)
    map[keyOf(date)] = { total: perDay, input: 1, output: 2, cacheRead: perDay - 3, calls: 1 }
  }
  return map
}

test('sumSeries adds every field across models', () => {
  const series = [
    { row: { id: 'a' }, days: { '2026-10-20': { total: 10, input: 1, output: 2, cacheRead: 7, calls: 1 } } },
    { row: { id: 'b' }, days: { '2026-10-21': { total: 5, input: 2, output: 1, cacheRead: 2, calls: 3 } } },
  ]
  assert.deepEqual(sumSeries(series), {
    total: 15, input: 3, output: 3, cacheRead: 9, calls: 4,
    peak: { input: 0, output: 0, cacheRead: 0 },
  })
})

test('sumSeries tolerates empty and missing day maps', () => {
  assert.deepEqual(sumSeries([]), {
    total: 0, input: 0, output: 0, cacheRead: 0, calls: 0,
    peak: { input: 0, output: 0, cacheRead: 0 },
  })
  assert.equal(sumSeries([{ row: { id: 'a' } }]).total, 0)
})

test('sumWindow counts today and the days before it, never tomorrow', () => {
  const today = new Date()
  const tomorrow = keyOf(new Date(today.getTime() + 86_400_000))
  const series = [{ row: { id: 'a' }, days: { ...daysOf(7, 10), [tomorrow]: { total: 999, input: 0, output: 0, cacheRead: 0, calls: 1 } } }]
  assert.equal(sumWindow(series, today, 7), 70, 'seven days are included and tomorrow is not')
  assert.equal(sumWindow(series, today, 1), 10)
})

test('sumWindow over an empty series is zero', () => {
  assert.equal(sumWindow([], new Date(), 7), 0)
})

test('weekStacks keeps model order and sums each week', () => {
  const weeks = [
    { key: '2026-10-13', days: ['2026-10-13', '2026-10-14'] },
    { key: '2026-10-20', days: ['2026-10-20', '2026-10-21'] },
  ]
  const series = [
    { row: { id: 'a', model: 'prov/a' }, days: { '2026-10-13': { total: 3 }, '2026-10-21': { total: 5 } } },
    { row: { id: 'b', model: 'prov/b' }, days: { '2026-10-14': { total: 7 } } },
  ]
  const stacks = weekStacks(series, weeks)
  assert.deepEqual(stacks[0].parts.map(part => part.value), [3, 7])
  assert.equal(stacks[0].total, 10)
  assert.equal(stacks[1].total, 5)
  assert.deepEqual(stacks[1].parts.map(part => part.label), ['a', 'b'])
})

test('weekStacks reports zero for a week with no usage', () => {
  const stacks = weekStacks([{ row: { id: 'a', model: 'm' }, days: {} }], [{ key: 'k', days: ['x'] }])
  assert.deepEqual(stacks[0], { key: 'k', parts: [{ id: 'a', label: 'm', value: 0 }], total: 0 })
})

test('cost sums per model, never blending two different rates', () => {
  const oneMillion = { peak: { input: 0, output: 0, cacheRead: 0 } }
  const series = [
    { row: { id: 'a', model: 'deepseek-flash' }, days: { '2026-10-21': { input: 1_000_000, output: 0, cacheRead: 0, total: 1_000_000, calls: 1, ...oneMillion } } },
    { row: { id: 'b', model: 'deepseek-v4-pro' }, days: { '2026-10-21': { input: 1_000_000, output: 0, cacheRead: 0, total: 1_000_000, calls: 1, ...oneMillion } } },
  ]
  const pricing = {
    currency: 'CNY',
    models: {
      flash: { prices: { peak: { cacheHit: '0.04', cacheMiss: '2', output: '8' }, offPeak: { cacheHit: '0.02', cacheMiss: '1', output: '4' } } },
      pro: { prices: { peak: { cacheHit: '0.30', cacheMiss: '9', output: '27' }, offPeak: { cacheHit: '0.15', cacheMiss: '4.5', output: '13.5' } } },
    },
  }
  const result = sumCost(series, pricing, estimateCost, pricingFamilyOf)
  assert.equal(result.priced, 2)
  assert.equal(result.unpriced, 0)
  // ¥1 (flash off-peak) + ¥4.5 (pro off-peak) = ¥5.50
  assert.equal(decimalOfMicro(result.total), '5.500000')
  assert.equal(decimalOfMicro(result.offPeak), '5.500000')
  assert.equal(decimalOfMicro(result.peak), '0.000000')
})

test('an unpriced model is counted, not billed at zero', () => {
  const series = [
    { row: { id: 'a', model: 'deepseek-flash' }, days: { '2026-10-21': { input: 1_000_000, output: 0, cacheRead: 0, total: 1_000_000, calls: 1 } } },
    { row: { id: 'b', model: 'gpt-4o' }, days: { '2026-10-21': { input: 1_000_000, output: 0, cacheRead: 0, total: 1_000_000, calls: 1 } } },
  ]
  const pricing = {
    models: {
      flash: { prices: { peak: { cacheHit: '0.04', cacheMiss: '2', output: '8' }, offPeak: { cacheHit: '0.02', cacheMiss: '1', output: '4' } } },
    },
  }
  const result = sumCost(series, pricing, estimateCost, pricingFamilyOf)
  assert.equal(result.priced, 1)
  assert.equal(result.unpriced, 1)
  assert.equal(decimalOfMicro(result.total), '1.000000', 'the priced row is not diluted by the unpriced one')
})

test('a relay-hosted official model is priced like the official one', () => {
  const series = [{ row: { id: 'a', model: 'opensource/deepseek_v4_1_flash' }, days: { '2026-10-21': { input: 1_000_000, output: 0, cacheRead: 0, total: 1_000_000, calls: 1 } } }]
  const pricing = { models: { flash: { prices: { peak: { cacheHit: '0.04', cacheMiss: '2', output: '8' }, offPeak: { cacheHit: '0.02', cacheMiss: '1', output: '4' } } } } }
  const result = sumCost(series, pricing, estimateCost, pricingFamilyOf)
  assert.equal(result.priced, 1)
  assert.equal(result.unpriced, 0)
})

test('no price list means no cost, rather than free usage', () => {
  const series = [{ row: { id: 'a', model: 'deepseek-flash' }, days: {} }]
  assert.equal(sumCost(series, undefined, estimateCost, pricingFamilyOf), null)
  assert.equal(sumCost(series, null, estimateCost, pricingFamilyOf), null)
})

test('restrictSeries keeps only the requested days', () => {
  const series = [{
    row: { id: 'a' },
    days: {
      '2026-10-20': { total: 10, input: 1, output: 1, cacheRead: 8, calls: 1 },
      '2026-10-21': { total: 20, input: 1, output: 1, cacheRead: 18, calls: 1 },
    },
  }]
  const scoped = restrictSeries(series, new Set(['2026-10-21']))
  assert.deepEqual(Object.keys(scoped[0].days), ['2026-10-21'])
  assert.equal(restrictSeries(series, null), series, 'null means no restriction')
})

test('micro-units round-trip through their decimal form', () => {
  for (const micro of [0, 1, 20_000, 1_234_567, -20_000]) {
    assert.equal(microOf(decimalOfMicro(micro)), micro)
  }
})

test('sumCost reports the call count of the range it priced', () => {
  // "priced" counts models with a published price; "calls" answers whether the
  // current range spent anything at all. The page needs both: one to word the
  // exclusion notice, the other to avoid claiming a month cost ¥0.00.
  const pricing = { models: { flash: { prices: { peak: { cacheHit: '0.04', cacheMiss: '2', output: '8' }, offPeak: { cacheHit: '0.02', cacheMiss: '1', output: '4' } } } } }
  const withCalls = [{ row: { id: 'a', model: 'deepseek-flash' }, days: { '2026-10-21': { input: 1_000_000, output: 0, cacheRead: 0, total: 1_000_000, calls: 3 } } }]
  const result = sumCost(withCalls, pricing, estimateCost, pricingFamilyOf)
  assert.equal(result.priced, 1)
  assert.equal(sumSeries(withCalls).calls, 3)

  const noCalls = [{ row: { id: 'a', model: 'deepseek-flash' }, days: {} }]
  const emptyResult = sumCost(noCalls, pricing, estimateCost, pricingFamilyOf)
  // A priced model with no calls covers nothing, so it must not be counted as
  // having priced the range: doing so would hide that the range's actual usage
  // came from models with no published price at all.
  assert.equal(emptyResult.priced, 0)
  assert.equal(sumSeries(noCalls).calls, 0, 'and nothing was spent')
})
