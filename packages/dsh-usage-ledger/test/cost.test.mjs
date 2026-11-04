import assert from 'node:assert/strict'
import test from 'node:test'

import {
  beijingClock, estimateCost, holidayCoverageCovers, microToDecimal, normalizeModelName, priceToMicro,
  pricingFamilyOf, splitTiers, tierOfInstant,
} from '../src/cost.js'
import { COVERED_YEARS, HOLIDAY_SET } from '../src/holidays.js'

/** Beijing wall-clock instant as epoch milliseconds. */
function beijing(year, month, day, hour, minute = 0) {
  return Date.UTC(year, month - 1, day, hour - 8, minute, 0)
}

/** A token bucket whose whole input was billed at one tier. */
function bucketAt(tier, input = 1_000_000) {
  return {
    input, output: 0, cacheRead: 0, total: input, calls: 1,
    peak: tier === 'peak' ? { input, output: 0, cacheRead: 0 } : { input: 0, output: 0, cacheRead: 0 },
  }
}

test('Beijing clock is UTC+8 with no daylight saving', () => {
  const clock = beijingClock(Date.UTC(2026, 9, 21, 2, 30, 0))
  assert.equal(clock.year, 2026)
  assert.equal(clock.month, 10)
  assert.equal(clock.day, 21)
  assert.equal(clock.hours ?? clock.minutes, 10 * 60 + 30)
})

test('peak windows are the two published weekday blocks', () => {
  // Wednesday 2026-10-21.
  assert.equal(tierOfInstant(beijing(2026, 10, 21, 8, 59)), 'offPeak')
  assert.equal(tierOfInstant(beijing(2026, 10, 21, 9, 0)), 'peak')
  assert.equal(tierOfInstant(beijing(2026, 10, 21, 11, 59)), 'peak')
  assert.equal(tierOfInstant(beijing(2026, 10, 21, 12, 0)), 'offPeak')
  assert.equal(tierOfInstant(beijing(2026, 10, 21, 13, 59)), 'offPeak')
  assert.equal(tierOfInstant(beijing(2026, 10, 21, 14, 0)), 'peak')
  assert.equal(tierOfInstant(beijing(2026, 10, 21, 17, 59)), 'peak')
  assert.equal(tierOfInstant(beijing(2026, 10, 21, 18, 0)), 'offPeak')
})

test('weekends are off-peak all day', () => {
  // Saturday 2026-10-24 and Sunday 2026-10-25.
  assert.equal(tierOfInstant(beijing(2026, 10, 24, 10, 0)), 'offPeak')
  assert.equal(tierOfInstant(beijing(2026, 10, 25, 15, 0)), 'offPeak')
})

test('a statutory holiday is off-peak even on a weekday morning', () => {
  // 2026-10-01 is a Thursday and a National Day holiday.
  assert.equal(tierOfInstant(beijing(2026, 10, 1, 10, 0)), 'offPeak')
  assert.equal(HOLIDAY_SET.has('2026-10-01'), true)
})

test('make-up working weekends stay off-peak', () => {
  // The published rule exempts all weekend hours, so a shifted working Saturday
  // is still charged at the cheap rate even though it is a working day.
  const makeUp = [...HOLIDAY_SET].length > 0
  assert.equal(makeUp, true)
  assert.equal(tierOfInstant(beijing(2026, 10, 10, 10, 0)), 'offPeak')
})

test('model names normalize separators, case and routing prefixes', () => {
  assert.equal(normalizeModelName('opensource/deepseek_v4_1_flash'), 'deepseekv41flash')
  assert.equal(normalizeModelName('DeepSeek-V4.1-Flash'), 'deepseekv41flash')
  assert.equal(normalizeModelName(''), '')
  assert.equal(normalizeModelName(null), '')
})

test('a relay hosting an official model maps to the official price', () => {
  // The local relay spells it `opensource/deepseek_v4_1_flash`; the same weights
  // are billed at the published Flash price.
  assert.equal(pricingFamilyOf('opensource/deepseek_v4_1_flash'), 'flash')
  assert.equal(pricingFamilyOf('deepseek-v4.1-flash'), 'flash')
  assert.equal(pricingFamilyOf('deepseek-flash'), 'flash')
  assert.equal(pricingFamilyOf('deepseek-v4-pro'), 'pro')
  assert.equal(pricingFamilyOf('DeepSeek-V4-Pro-0813'), 'pro')
})

test('a model with no published price is never assigned one', () => {
  assert.equal(pricingFamilyOf('gpt-4o'), null)
  assert.equal(pricingFamilyOf('claude-sonnet-4'), null)
  assert.equal(pricingFamilyOf('qwen-max'), null)
  assert.equal(pricingFamilyOf(undefined), null)
})

test('prices parse into exact micro-units', () => {
  assert.equal(priceToMicro('4'), 4_000_000n)
  assert.equal(priceToMicro('4.5'), 4_500_000n)
  assert.equal(priceToMicro('0.02'), 20_000n)
  assert.equal(priceToMicro('27.0'), 27_000_000n)
  assert.equal(priceToMicro('n/a'), null)
  assert.equal(priceToMicro(4), null)
})

test('micro-units render back to a six-decimal string', () => {
  assert.equal(microToDecimal(1_234_567n), '1.234567')
  assert.equal(microToDecimal(-20_000n), '-0.020000')
  assert.equal(microToDecimal(0n), '0.000000')
})

test('splitTiers derives off-peak by subtraction', () => {
  const split = splitTiers({ input: 100, output: 40, cacheRead: 60, peak: { input: 30, output: 10, cacheRead: 20 } })
  assert.deepEqual(split.peak, { input: 30, output: 10, cacheRead: 20 })
  assert.deepEqual(split.offPeak, { input: 70, output: 30, cacheRead: 40 })
})

test('a bucket without a peak sub-tally counts entirely off-peak', () => {
  const split = splitTiers({ input: 10, output: 5, cacheRead: 1 })
  assert.deepEqual(split.peak, { input: 0, output: 0, cacheRead: 0 })
  assert.deepEqual(split.offPeak, { input: 10, output: 5, cacheRead: 1 })
})

test('peak input costs twice the off-peak rate', () => {
  const plan = { prices: { peak: { cacheHit: '0.04', cacheMiss: '2', output: '8' }, offPeak: { cacheHit: '0.02', cacheMiss: '1', output: '4' } } }
  assert.equal(estimateCost(bucketAt('peak'), plan).total, '2.000000')
  assert.equal(estimateCost(bucketAt('offPeak'), plan).total, '1.000000')
})

test('cache hits are priced apart from cache misses', () => {
  const plan = { prices: { peak: { cacheHit: '0.04', cacheMiss: '2', output: '8' }, offPeak: { cacheHit: '0.02', cacheMiss: '1', output: '4' } } }
  const bucket = { input: 0, output: 0, cacheRead: 1_000_000, total: 1_000_000, calls: 1, peak: { input: 0, output: 0, cacheRead: 0 } }
  assert.equal(estimateCost(bucket, plan).offPeak, '0.020000')
})

test('output tokens are priced separately from input', () => {
  const plan = { prices: { peak: { cacheHit: '0.04', cacheMiss: '2', output: '8' }, offPeak: { cacheHit: '0.02', cacheMiss: '1', output: '4' } } }
  const bucket = { input: 0, output: 1_000_000, cacheRead: 0, total: 1_000_000, calls: 1, peak: { input: 0, output: 1_000_000, cacheRead: 0 } }
  assert.equal(estimateCost(bucket, plan).peak, '8.000000')
})

test('the cost of both tiers adds up to the reported total', () => {
  const plan = { prices: { peak: { cacheHit: '0.04', cacheMiss: '2', output: '8' }, offPeak: { cacheHit: '0.02', cacheMiss: '1', output: '4' } } }
  const bucket = {
    input: 2_000_000, output: 500_000, cacheRead: 3_000_000, total: 5_500_000, calls: 4,
    peak: { input: 1_000_000, output: 200_000, cacheRead: 1_000_000 },
  }
  const cost = estimateCost(bucket, plan)
  // Compare as integers: the whole point of the micro-unit representation is
  // that `5.88` never becomes `5.880000000000001` when two halves are added.
  assert.equal(priceToMicro(cost.peak) + priceToMicro(cost.offPeak), priceToMicro(cost.total))
})

test('an unpriced model yields no cost rather than zero', () => {
  assert.equal(estimateCost(bucketAt('peak'), null), null)
  assert.equal(estimateCost(bucketAt('peak'), undefined), null)
})

test('a zero bucket costs nothing without throwing', () => {
  const plan = { prices: { peak: { cacheHit: '0.04', cacheMiss: '2', output: '8' }, offPeak: { cacheHit: '0.02', cacheMiss: '1', output: '4' } } }
  const cost = estimateCost({ input: 0, output: 0, cacheRead: 0, total: 0, calls: 0 }, plan)
  assert.equal(cost.total, '0.000000')
})

test('holiday coverage is reported for the whole requested window', () => {
  assert.equal(holidayCoverageCovers('2026-01-01', '2026-12-31', COVERED_YEARS), true)
  assert.equal(holidayCoverageCovers('2025-06-01', '2026-06-01', COVERED_YEARS), true)
  assert.equal(holidayCoverageCovers('2023-01-01', '2026-01-01', COVERED_YEARS), false)
  assert.equal(holidayCoverageCovers(undefined, undefined, COVERED_YEARS), true)
})
