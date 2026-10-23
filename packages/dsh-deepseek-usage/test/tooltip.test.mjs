import assert from 'node:assert/strict'
import test from 'node:test'

import { tooltipPosition } from '../src/ui/tooltip.js'

/** A viewport the size of a laptop window. */
const VIEW = { viewportWidth: 1200, viewportHeight: 800 }

test('the readout sits down-right of the cursor when there is room', () => {
  const pos = tooltipPosition({ ...VIEW, x: 400, y: 400, width: 180, height: 60 })
  assert.equal(pos.left, 412)
  assert.equal(pos.top, 366)
})

test('a cursor near the right edge flips the readout to the left', () => {
  // This is the reported case: the last column of the heatmap sits against the
  // window edge and the readout ran past it.
  const pos = tooltipPosition({ ...VIEW, x: 1180, y: 400, width: 180, height: 60 })
  assert.ok(pos.left + 180 <= VIEW.viewportWidth, 'must stay inside the viewport')
  assert.ok(pos.left < 1180, 'and land on the cursor side with room')
})

test('a cursor near the bottom edge flips the readout upward', () => {
  const pos = tooltipPosition({ ...VIEW, x: 400, y: 790, width: 180, height: 60 })
  assert.ok(pos.top + 60 <= VIEW.viewportHeight)
})

test('a box wider than the viewport is clamped, never pushed outside', () => {
  // Clamping rather than flipping: a flipped box still cannot fit, so the only
  // way to keep it on screen is to pin it to the margin.
  const pos = tooltipPosition({ viewportWidth: 200, viewportHeight: 200, x: 190, y: 190, width: 400, height: 400 })
  assert.equal(pos.left, 8)
  assert.equal(pos.top, 8)
})

test('the readout never crosses the top-left margin', () => {
  const pos = tooltipPosition({ ...VIEW, x: 2, y: 10, width: 180, height: 60 })
  assert.ok(pos.left >= 8)
  assert.ok(pos.top >= 8)
})

test('every placement stays inside the viewport for any cursor', () => {
  const width = 200
  const height = 80
  for (let x = 0; x <= 1200; x += 40) {
    for (let y = 0; y <= 800; y += 40) {
      const pos = tooltipPosition({ ...VIEW, x, y, width, height })
      assert.ok(pos.left >= 8 && pos.left + width <= 1200 - 8 + 0.001, `left ${pos.left} at x=${x}`)
      assert.ok(pos.top >= 8 && pos.top + height <= 800 - 8 + 0.001, `top ${pos.top} at y=${y}`)
    }
  }
})
