import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_BLOCKS, blockColumns, blockCount, blockUnit, runningTotal } from '../src/ui/blocks.js'

test('the unit is the smallest step that fits the tallest column', () => {
  // A month of light use must still draw something: the unit has to shrink to
  // the data, because an all-zero chart is indistinguishable from no usage.
  assert.equal(blockUnit(70e6), 1e7, '70M over 7 blocks needs 10M per block, which is on the ladder')
  assert.equal(blockUnit(75e6), 2e7, 'a value between steps rounds up to the next one')
  assert.equal(blockUnit(14e9), 2e9)
  assert.equal(blockUnit(0), 1e6, 'an empty chart still needs a unit')
})

test('the tallest column always fits inside the block ceiling', () => {
  for (const max of [1e6, 37e6, 1.4e9, 88e9, 3e12]) {
    const unit = blockUnit(max)
    assert.ok(blockCount(max, unit) <= MAX_BLOCKS, `${max} with unit ${unit}`)
    assert.ok(blockCount(max, unit) >= 1, `${max} should draw at least one block`)
  }
})

test('the unit never breaks the ceiling for the value it was chosen for', () => {
  // The ladder is discrete, so the chosen step must be at least `max / 7`.
  for (const max of [7e6, 700e6, 7e9, 700e9]) {
    const unit = blockUnit(max)
    assert.ok(unit >= max / MAX_BLOCKS, `${max} -> ${unit}`)
  }
})

test('any usage at all shows at least one block', () => {
  // A week that spent a tenth of a block is not nothing; drawing it as zero
  // would make a quiet week look like an idle one.
  assert.equal(blockCount(1, 2e9), 1)
  assert.equal(blockCount(0.5, 2e9), 1)
  assert.equal(blockCount(0, 2e9), 0, 'no usage is no blocks')
})

test('blocks round up, so a partial block still reads as present', () => {
  assert.equal(blockCount(2e9, 2e9), 1)
  assert.equal(blockCount(2.1e9, 2e9), 2)
  assert.equal(blockCount(4e9, 2e9), 2)
})

test('the block count is capped so one outlier cannot flatten the chart', () => {
  assert.equal(blockCount(1e12, 2e9), MAX_BLOCKS)
})

test('blockColumns picks one unit and applies it to every column', () => {
  const { unit, columns, clipped } = blockColumns([1e9, 3e9, 0, 14e9])
  assert.equal(unit, 2e9)
  assert.deepEqual(columns.map(column => column.blocks), [1, 2, 0, 7])
  assert.equal(clipped, false)
})

test('blockColumns reports when a column was clipped', () => {
  // The unit is chosen for the largest column, so clipping can only happen when
  // the caller supplies a smaller ceiling than the default.
  const { clipped } = blockColumns([1e9, 9e9], { max: 3 })
  assert.equal(clipped, true)
})

test('an empty chart has a unit and no blocks', () => {
  const { unit, columns, clipped } = blockColumns([0, 0])
  assert.ok(unit > 0)
  assert.deepEqual(columns.map(column => column.blocks), [0, 0])
  assert.equal(clipped, false)
})

test('running totals accumulate oldest to newest', () => {
  assert.deepEqual(runningTotal([1, 2, 3]), [1, 3, 6])
  assert.deepEqual(runningTotal([]), [])
})

test('running totals ignore negative and non-finite values', () => {
  assert.deepEqual(runningTotal([5, -3, Number.NaN, 5]), [5, 5, 5, 10])
})
