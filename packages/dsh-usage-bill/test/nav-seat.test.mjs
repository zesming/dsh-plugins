import assert from 'node:assert/strict'
import test from 'node:test'

import { stylesheet } from '../src/ui/styles.js'

const clientSource = await import('node:fs/promises').then(fs => fs.readFile(
  new URL('../src/client.js', import.meta.url), 'utf8'))

test('the usage section contributes an icon through settings.section.icon', () => {
  assert.ok(clientSource.includes("ctx.slots.inject('settings.section.icon'"),
    'the nav glyph must use the dedicated icon slot')
  // The icon contribution has to match the section contribution by id, or the
  // shell never renders it.
  const idMatch = clientSource.match(/const SECTION_ID = '([^']+)'/)
  assert.ok(idMatch, 'the section id is a named constant')
  const sectionId = idMatch[1]
  const iconBlock = clientSource.slice(
    clientSource.indexOf("ctx.slots.inject('settings.section.icon'"),
    clientSource.indexOf('}, UsageNavIcon)') + 20)
  assert.ok(iconBlock.includes(`id: SECTION_ID`), 'the icon registers with the section id')
})

test('the nav label is plain text, not a marker plus glyph', () => {
  assert.ok(!clientSource.includes('data-dsu-navmark'), 'the DOM marker hack is gone')
  assert.ok(!clientSource.includes('UsageNavLabel'), 'the label-carrying component is gone')
  const sectionBlock = clientSource.slice(clientSource.indexOf("ctx.slots.inject('settings.section'"))
  assert.match(sectionBlock, /label:\s*\(\)\s*=>\s*t\(\)\('nav'\)/,
    'the section label is the localized plain string')
})

test('no rule in the stylesheet tries to hide the shell nav gear', () => {
  const css = stylesheet()
  assert.equal(css.includes('data-dsu-navmark'), false)
  assert.equal(css.includes(':has('), false, 'shell-structure selectors are no longer needed')
})

test('the stylesheet does not depend on the usage section being rendered', async () => {
  // The nav icon is a slot contribution rendered by the shell, but the
  // component styles still mount with the plugin's own surfaces.
  const source = await import('node:fs/promises').then(fs => fs.readFile(
    new URL('../src/ui/usage-view.js', import.meta.url), 'utf8'))
  assert.ok(source.includes('installStyles'), 'the sheet must be installable outside the tree')
  assert.equal(/export function Styles\s*\(/.test(source), false, 'no per-render style component may remain')

  assert.ok(clientSource.includes('installStyles()'), 'the plugin entry must install it')
  assert.ok(clientSource.includes('ctx.effect'), 'installation must be owned by the plugin lifetime')
})
