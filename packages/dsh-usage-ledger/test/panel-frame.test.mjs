import assert from 'node:assert/strict'
import test from 'node:test'

import { stylesheet } from '../src/ui/styles.js'

/** Read one rule's declarations from the generated stylesheet. */
function ruleOf(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}\\{([^}]*)\\}`).exec(stylesheet())
  return match?.[1]
}

// The host's own page frame, taken from its automation-tasks page, is the
// reference: a 960px column, a 20px/500 heading on a 28px line, 28px of top
// clearance above the heading, and 24px between the heading and the content.

test('the panel heading matches the host page heading', () => {
  const rule = ruleOf('.dsu-panel-title')
  assert.ok(rule, '.dsu-panel-title must be styled')
  assert.match(rule, /font-size:20px/, 'host page headings are 20px')
  assert.match(rule, /font-weight:500/, 'host page headings are 500, not 600')
  assert.match(rule, /line-height:28px/, 'matching the line box keeps the baseline aligned')
})

test('the panel heading sits where the host puts its own', () => {
  const rule = ruleOf('.dsu-panel-head')
  assert.ok(rule, '.dsu-panel-head must be styled')
  assert.match(rule, /28px/, 'the host adds 28px of top clearance')
  // The host adds its frame-top clearance on top of the 28px; leaving it out
  // misplaces the heading on platforms that reserve a title bar.
  assert.match(rule, /--dsh-frame-top-clearance/)
})

test('the panel body is the same width and inset as a host page', () => {
  const head = ruleOf('.dsu-panel-head')
  const view = ruleOf('.dsu-view[data-container=panel]')
  assert.match(head, /max-width:960px/, 'host page content column')
  assert.match(view, /max-width:960px/)
  // Both have to use the same horizontal inset, or the heading stops lining up
  // with the content beneath it.
  assert.match(head, /clamp\(24px,4vw,48px\)/)
  assert.match(view, /clamp\(24px,4vw,48px\)/)
})

test('the gap under the heading is the host spacing, not a guess', () => {
  const view = ruleOf('.dsu-view[data-container=panel]')
  assert.match(view, /padding:24px/, 'host pageHeading carries margin-bottom:24px')
})

test('the settings mount keeps its own inset', () => {
  // The Settings dialog already insets this view, so the panel rule must not
  // leak into it: that mount was correct before the panel was fixed.
  const base = ruleOf('.dsu-view')
  assert.ok(base)
  assert.match(base, /padding:0 24px 28px/)
  assert.doesNotMatch(base, /960px/, 'the base rule must not cap the settings width')
})
