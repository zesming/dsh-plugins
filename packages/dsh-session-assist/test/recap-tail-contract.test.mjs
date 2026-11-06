import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

/**
 * Structural contract tests for the DSH turnTail slot.
 *
 * The client bundle cannot be imported under plain node (it is a React factory
 * the host window loads), and the repo deliberately has no DOM test stack. These
 * assertions pin the 0.2.1-rc.3 contract instead: the shell passes a Turn
 * NUMBER, so the registration must resolve rich data through the chat keyed
 * data source and the view must not treat the `turn` prop as a Turn object.
 * A host or refactor that reintroduces the old shape fails here.
 */

const clientSource = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
const recapViewSource = await readFile(new URL('../src/ui/recap.js', import.meta.url), 'utf8')

test('turnTail registration resolves per-turn data through nodes.turnDataSource', () => {
  const block = clientSource.slice(clientSource.indexOf("name: 'conversation.chat.turnTail'"))
  assert.match(block, /keyedHooks:\s*\{/)
  assert.match(block, /turnDataSource\(Number\(turn\)/)
  assert.match(block, /session-assist\.recap/)
})

test('turnTail inject binds the chat target through the session binding', () => {
  const block = clientSource.slice(clientSource.indexOf("name: 'conversation.chat.turnTail'"))
  assert.match(block, /ctx\.sessions\?\.binding\?\.\(sessionId\)/)
  assert.match(block, /ctx\.uiConversation\.binding\(binding\)\.target\('chat'\)/)
})

test('RecapTail receives the turn as a number and does not read .end off the prop', () => {
  // The old broken contract read turn?.end / turn?.data off the prop. It must
  // now resolve the rich record from useChat under the numeric prop.
  assert.match(recapViewSource, /turn:\s*turnNumber/)
  assert.match(recapViewSource, /snapshot\.timeline\.turns\.get\(turnNumber\)/)
  assert.ok(!/turn\?\.end/.test(recapViewSource), 'no turn?.end prop access may remain')
  assert.ok(!/turn\?\.data\?\.get/.test(recapViewSource), 'no turn?.data.get prop access may remain')
})
