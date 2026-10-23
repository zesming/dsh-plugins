import assert from 'node:assert/strict'
import test from 'node:test'

import { stylesheet } from '../src/ui/styles.js'

/**
 * Read one rule's declarations from the generated stylesheet.
 *
 * The stylesheet is built by a function, so this asserts against what the
 * plugin actually ships rather than against the source text a reader approved.
 *
 * @param selector - exact selector to find.
 * @returns the declaration block, or undefined.
 */
function ruleOf(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}\\{([^}]*)\\}`).exec(stylesheet())
  return match?.[1]
}

test('the KPI value row has a fixed height, not a minimum', () => {
  // A minimum still lets the row grow: a bare em dash and a number followed by
  // a smaller unit suffix produce different line boxes, and the page shifted by
  // five pixels every time a range had no usage. A fixed height removes the
  // dependency on what is inside the row.
  const rule = ruleOf('.dsu-kpi-value')
  assert.ok(rule, '.dsu-kpi-value must be styled')
  assert.match(rule, /(^|;)height:\d+px/, 'a fixed height, not min-height')
  assert.doesNotMatch(rule, /min-height/, 'min-height reintroduces the jump')
})

test('the KPI value row centres whatever it contains', () => {
  // Fixed height alone would leave a dash sitting on the top edge while a
  // number fills the row; the content has to stay put.
  const rule = ruleOf('.dsu-kpi-value')
  assert.match(rule, /display:flex/)
  assert.match(rule, /align-items:/)
})

test('the KPI meta line is pinned the same way', () => {
  const rule = ruleOf('.dsu-kpi-meta')
  assert.ok(rule, '.dsu-kpi-meta must be styled')
  assert.match(rule, /line-height:\d+px/)
})

test('every KPI cell reserves the same height', () => {
  // The band is a grid, so the tallest cell sets the row; pinning the cell
  // keeps a single-line cell from shrinking the whole band.
  const rule = ruleOf('.dsu-kpi')
  assert.ok(rule, '.dsu-kpi must be styled')
  assert.match(rule, /min-height:\d+px/)
})
