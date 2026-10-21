import assert from 'node:assert/strict'
import test from 'node:test'

import { sumSeries, sumWindow, weekStacks } from '../src/ui/aggregate.js'
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
  assert.deepEqual(sumSeries(series), { total: 15, input: 3, output: 3, cacheRead: 9, calls: 4 })
})

test('sumSeries tolerates empty and missing day maps', () => {
  assert.deepEqual(sumSeries([]), { total: 0, input: 0, output: 0, cacheRead: 0, calls: 0 })
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
