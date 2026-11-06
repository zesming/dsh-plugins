import assert from 'node:assert/strict'
import test from 'node:test'

import { costCardState, periodKeys } from '../src/ui/usage-period.js'

/**
 * The panel's window and cost-card decisions are pure; covering them here
 * pins the Monday anchor, the calendar-week (not rolling-7-day) window, and
 * the three distinct no-figure gaps without rendering the panel (F-13).
 */

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0)

test('daily window is exactly today', () => {
  const keys = periodKeys('day', [{ days: { '2026-10-21': {} } }], at(2026, 10, 21))
  assert.deepEqual([...keys], ['2026-10-21'])
})

test('weekly window is the Monday-to-Sunday calendar week containing today', () => {
  // 2026-10-21 is a Wednesday; the window must start Monday the 19th and run
  // through Sunday the 25th, including days after today.
  const keys = [...periodKeys('week', [], at(2026, 10, 21))].sort()
  assert.deepEqual(keys, ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
})

test('a Sunday anchors the window six days earlier, not on itself', () => {
  // 2026-10-25 is a Sunday.
  const keys = periodKeys('week', [], at(2026, 10, 25))
  assert.ok(keys.has('2026-10-19'))
  assert.ok(keys.has('2026-10-25'))
  assert.equal(keys.size, 7)
})

test('a Monday anchors the window on itself', () => {
  // 2026-10-19 is a Monday.
  const keys = periodKeys('week', [], at(2026, 10, 19))
  assert.ok(keys.has('2026-10-19'))
  assert.ok(keys.has('2026-10-25'))
})

test('cumulative window is the union of every recorded day across models', () => {
  const series = [
    { days: { '2026-10-20': {}, '2026-10-21': {} } },
    { days: { '2026-10-21': {}, '2026-10-22': {} } },
  ]
  const keys = [...periodKeys('total', series, at(2026, 10, 21))].sort()
  assert.deepEqual(keys, ['2026-10-20', '2026-10-21', '2026-10-22'])
})

test('cost card resolves a figure only when pricing is ready and priced calls exist', () => {
  const cost = { calls: 3, priced: 2, unpriced: 1, total: 100, peak: 60, offPeak: 40 }
  assert.deepEqual(costCardState({ pricingPhase: 'ready', cost }),
    { loading: false, resolved: true, gap: 'costUnpricedAll' })
})

test('cost card gaps distinguish unavailable, no data, and unpriced', () => {
  assert.deepEqual(costCardState({ pricingPhase: 'failed', cost: null }),
    { loading: false, resolved: false, gap: 'costUnavailable' })
  assert.deepEqual(costCardState({ pricingPhase: 'ready', cost: null }),
    { loading: false, resolved: false, gap: 'costUnavailable' })
  assert.deepEqual(costCardState({ pricingPhase: 'ready', cost: { calls: 0, priced: 0 } }),
    { loading: false, resolved: false, gap: 'costNoData' })
  assert.deepEqual(costCardState({ pricingPhase: 'ready', cost: { calls: 4, priced: 0 } }),
    { loading: false, resolved: false, gap: 'costUnpricedAll' })
})

test('loading never resolves a figure', () => {
  const state = costCardState({ pricingPhase: 'loading', cost: null })
  assert.equal(state.loading, true)
  assert.equal(state.resolved, false)
})
