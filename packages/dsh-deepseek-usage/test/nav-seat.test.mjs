import assert from 'node:assert/strict'
import test from 'node:test'

import { stylesheet } from '../src/ui/styles.js'

const css = stylesheet()

test('the settings nav rule keys on this plugin\'s marker, never on a class name', () => {
  // The shell hashes its class tokens every build, so a rule that named one
  // would silently stop applying after an upgrade.
  assert.ok(css.includes('[data-dsu-navmark]'), 'the marker is the hook')
  assert.equal(/Dws9Sa|navCell/.test(css), false, 'no hashed class token may appear')
})

test('the gear is hidden only for a row that carries the marker', () => {
  const rules = css.split('\n').filter(line => line.includes('svg') && line.includes('display: none'))
  assert.ok(rules.length > 0, 'a rule must hide the shell glyph')
  for (const rule of rules) {
    assert.ok(rule.includes(':has('), `${rule} must be conditional`)
    assert.ok(rule.includes('data-dsu-navmark'), `${rule} must be scoped to the marker`)
  }
})

test('the row layout is applied only inside a marked row', () => {
  const layout = css.split('\n').filter(line => line.includes('data-dsu-navmark') && line.includes('display: flex'))
  assert.ok(layout.length > 0, 'a rule must provide the icon/text layout')
  for (const rule of layout) assert.ok(rule.includes(':has('), `${rule} must be scoped to the marked row`)
})

test('the marker itself is a fixed 16-unit seat', () => {
  const marker = css.split('\n').find(line => line.startsWith('[data-dsu-navmark]'))
  assert.ok(marker, 'the marker needs its own sizing rule')
  assert.match(marker, /width:\s*16px/)
  assert.match(marker, /height:\s*16px/)
  assert.match(marker, /currentColor/)
})
