import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

/**
 * Structural contract tests for the DSH turnTail slot.
 *
 * The client bundle cannot be imported under plain node (it is a React factory
 * the host window loads) and the repo has no DOM test stack, so these pin the
 * owner-prop contract the tail depends on.
 *
 * Verified against the host bundle (dsh-client-ui-chat): the slot is rendered
 * with `renderSlot("conversation.chat.turnTail", { turn, seq, openFile })`
 * where `turn = node.location.turn` is the RICH Timeline Turn
 * `{ turn: <number>, start, end, status, steps, data }` (the Location resolver
 * returns `{ kind: "turn", turn: timeline.turns.get(n) }`). The rich object's
 * `.turn` is the number; `seq` is the final assistant node seq, not the
 * turn/end event seq. The folded facts live on the rich turn's `data` store
 * (`turn.data.get(KEY)`, populated by this plugin's scope:"turn"
 * buildLocationData), NOT on chat's node index (turnDataSource only covers
 * definitions with a `target:"chat"` view node).
 */

const clientSource = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
const recapViewSource = await readFile(new URL('../src/ui/recap.js', import.meta.url), 'utf8')

test('RecapTail reads the rich Turn prop: numeric .turn, .end, and its data store', () => {
  assert.match(recapViewSource, /function RecapTail\(\{[^}]*\bturn\b[^}]*\}/)
  assert.match(recapViewSource, /turn\?\.end/)
  assert.match(recapViewSource, /turnIdentity\(sessionId,\s*turn\?\.turn,\s*endSeq\)/)
  assert.match(recapViewSource, /turn\?\.data\?\.get\(RECAP_KIND\)/)
})

test('endSeq is the turn/end event seq, not the slot final-node seq', () => {
  assert.match(recapViewSource, /end\?\.seq/)
})

test('the turnTail registration injects settings/runtime and no keyed data source', () => {
  const block = clientSource.slice(clientSource.indexOf("name: 'conversation.chat.turnTail'"))
  // The rich turn already carries the folded facts, so no keyed hook / chat
  // node source is needed or correct here.
  assert.ok(!block.includes('keyedHooks'), 'turnTail must not register a keyed hook')
  assert.ok(!block.includes('turnDataSource'), 'turn facts are not read from the chat node index')
  assert.ok(!/Number\(turn\)/.test(block), 'the slot prop is a rich Turn, never coerced to a number')
  assert.match(block, /inject:\s*\(\)\s*=>\s*\(\{\s*hooks:\s*\{\s*settings\s*\},\s*runtime:\s*\{\s*requestRecap\s*\}\s*\}\)/)
})
