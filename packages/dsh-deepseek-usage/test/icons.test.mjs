import assert from 'node:assert/strict'
import test from 'node:test'

import { CLOCK, PLUS, USAGE, WALLET } from '../src/ui/icons.js'

const all = { USAGE, WALLET, CLOCK, PLUS }

test('every glyph uses the product icon box and inherits its color', () => {
  for (const [name, glyph] of Object.entries(all)) {
    assert.equal(glyph.viewBox, '0 0 16 16', `${name} must sit in the 16-unit box`)
    assert.equal(glyph.fill, 'none', `${name} must not fill by default`)
    assert.equal(glyph.stroke, 'currentColor', `${name} must inherit the icon color`)
    assert.equal(glyph['aria-hidden'], true, `${name} is decorative only`)
    assert.ok(Number.isFinite(glyph.strokeWidth) && glyph.strokeWidth > 0, `${name} needs a stroke width`)
    assert.ok(Array.isArray(glyph.children) && glyph.children.length > 0, `${name} needs shapes`)
  }
})

test('glyph strokes stay within the product weight range', () => {
  for (const [name, glyph] of Object.entries(all)) {
    assert.ok(glyph.strokeWidth >= 1 && glyph.strokeWidth <= 1.5, `${name}: ${String(glyph.strokeWidth)}`)
  }
})

test('the usage mark is distinguishable from the wallet and the plus', () => {
  const signature = glyph => JSON.stringify(glyph.children.map(child => child.d ?? 'circle'))
  const seen = new Map()
  for (const [name, glyph] of Object.entries(all)) {
    const key = signature(glyph)
    assert.equal(seen.has(key), false, `${name} duplicates ${String(seen.get(key))}`)
    seen.set(key, name)
  }
})

test('the usage mark encodes an intensity scale, not a uniform grid', () => {
  // Four cells, exactly one filled solid and one outlined: the mark has to read
  // as a scale, so identical cells would defeat its purpose.
  const cells = USAGE.children
  assert.equal(cells.length, 4)
  const solid = cells.filter(child => child.fill === 'currentColor' && child.stroke === 'none')
  const outlined = cells.filter(child => child.fill === undefined)
  assert.equal(solid.length, 1, 'exactly one solid cell')
  assert.equal(outlined.length, 1, 'exactly one outline-only cell')
  assert.ok(cells.some(child => typeof child['fill-opacity'] === 'number'), 'at least one graded cell')
})

test('every glyph starts inside the 16-unit box', () => {
  // Arc and curve parameters are relative, so only absolute command points are
  // meaningful here; that still catches a mark drawn off its own canvas.
  const starts = path => {
    const points = []
    const commands = /([MLHVCZmlhvcz])([^MLHVCZmlhvcz]*)/g
    let match
    while ((match = commands.exec(path)) !== null) {
      const [x, y] = (match[2].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
      if (x !== undefined && (match[1] === 'M' || match[1] === 'L')) points.push([x, y])
    }
    return points
  }
  for (const [name, glyph] of Object.entries(all)) {
    for (const child of glyph.children) {
      if (child.cx !== undefined) {
        assert.ok(child.cx - child.r >= 0 && child.cx + child.r <= 16, `${name}: circle escapes the box`)
        continue
      }
      for (const [x, y] of starts(child.d)) {
        assert.ok(x >= 0 && x <= 16, `${name}: x ${String(x)} escapes the box`)
        if (y !== undefined) assert.ok(y >= 0 && y <= 16, `${name}: y ${String(y)} escapes the box`)
      }
    }
  }
})
