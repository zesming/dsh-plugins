import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

/**
 * Structural guards for the heatmap hover behaviour.
 *
 * The view is a React factory the repo cannot mount under plain node (no DOM
 * stack), so these pin the two hover requirements at source level, matching the
 * existing hotload/nav-seat structural tests:
 *  1. no SVG <title>: it raises a browser-native gray tooltip that duplicates
 *     the custom dark Tooltip after a longer hover; accessibility is carried by
 *     aria-label instead.
 *  2. the single-model case still names its model in the custom tooltip
 *     (detail must be populated for one model, not only for several).
 */

const source = readFileSync(new URL('../src/ui/usage-view.js', import.meta.url), 'utf8')

test('the heatmap uses aria-label, never an SVG <title> that spawns a native tooltip', () => {
  assert.ok(!/h\('title'/.test(source), 'no SVG title element may be rendered')
  assert.match(source, /'aria-label': ariaLabel/)
  assert.match(source, /'aria-label': `\$\{column\.label\}/)
})

test('a single-model cell still surfaces its model in the custom tooltip detail', () => {
  // detail is omitted only when there is no entry or no models; a length of one
  // must produce a line, not be treated like the no-model case.
  assert.match(source, /entry === undefined \|\| entry\.models\.length === 0\s*\n?\s*\?\s*undefined\s*\n?\s*:\s*entry\.models\.slice\(0, 3\)/)
  assert.ok(!/entry\.models\.length <= 1[\s\S]*undefined/.test(source),
    'the old >1-only gate that hid a single model must not return')
})
