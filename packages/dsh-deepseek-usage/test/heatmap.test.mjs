import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DAY_COLUMNS, WEEK_COLUMNS, dayGrid, monthLabels, quantileLevels, sumDays, weekGrid, weekSums,
} from '../src/ui/heatmap.js'

/** A fixed local reference day. */
const TODAY = new Date(2026, 9, 21, 12, 0, 0)

test('zero usage is always the empty level', () => {
  const level = quantileLevels([0, 5, 10, 20, 40, 80, 160])
  assert.equal(level(0), 0)
  assert.equal(level(undefined), 0)
  assert.equal(level(-3), 0)
})

test('an empty lane classifies everything as empty', () => {
  const level = quantileLevels([0, 0, 0])
  assert.equal(level(0), 0)
  assert.equal(level(99), 0)
})

test('quantiles spread a heavy tail across all five shades', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1000000]
  const level = quantileLevels(values)
  const seen = new Set(values.map(value => level(value)))
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5])
})

test('a single distinct value still lands on the darkest shade', () => {
  const level = quantileLevels([7, 7, 7])
  assert.equal(level(7), 5)
})

test('the day grid is 53 whole weeks ending with the reference week', () => {
  const grid = dayGrid(TODAY)
  assert.equal(grid.length, DAY_COLUMNS)
  assert.equal(grid[0].length, 7)
  for (const column of grid) for (const date of column) assert.ok(date instanceof Date)
  const flat = grid.flat()
  assert.equal(flat.length, DAY_COLUMNS * 7)
  assert.equal(flat[0].getDay(), 1, 'the first column starts on a Monday')
  assert.ok(flat.at(-1) >= TODAY)
})

test('the week grid is 26 whole weeks starting on a Monday', () => {
  const grid = weekGrid(TODAY)
  assert.equal(grid.length, WEEK_COLUMNS)
  assert.equal(grid[0][0].getDay(), 1)
})

test('month labels are ordered, unique, and inside the grid', () => {
  const labels = monthLabels(dayGrid(TODAY))
  // Half a year of columns carries six or seven month labels, not twelve.
  assert.ok(labels.length >= 5 && labels.length <= 8, `saw ${labels.length} labels`)
  for (let index = 1; index < labels.length; index += 1) assert.ok(labels[index].column > labels[index - 1].column)
  for (const label of labels) assert.ok(label.column >= 0 && label.column < DAY_COLUMNS)
})

test('sumDays tolerates missing and malformed buckets', () => {
  assert.equal(sumDays({ a: { total: 5 }, b: { total: 7 } }), 12)
  assert.equal(sumDays({}), 0)
  assert.equal(sumDays(undefined), 0)
})

test('weekSums buckets every day into exactly one column', () => {
  const grid = weekGrid(TODAY)
  const key = date => `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const days = {}
  for (const column of grid) for (const date of column) days[key(date)] = { total: 2 }
  const sums = weekSums(days, grid)
  assert.equal(sums.length, WEEK_COLUMNS)
  assert.equal(sums.reduce((a, b) => a + b, 0), WEEK_COLUMNS * 7 * 2)
})



test('the day grid is Monday-first, matching its row labels', () => {
  // The gutter labels are 一/三/五/日. A Sunday-first grid under Monday-first
  // labels shifts every row by one day, which silently misattributes usage to
  // the wrong weekday.
  const grid = dayGrid(new Date(2026, 9, 22))
  for (const column of grid) {
    assert.equal(column[0].getDay(), 1, 'row 0 is Monday')
    assert.equal(column[6].getDay(), 0, 'row 6 is Sunday')
  }
})

test('today lands on its own weekday row', () => {
  const today = new Date(2026, 9, 22) // a Thursday
  const grid = dayGrid(today)
  const last = grid[grid.length - 1]
  const row = last.findIndex(date => date.toDateString() === today.toDateString())
  assert.equal(row, 3, 'Thursday is the fourth row of a Monday-first week')
})
