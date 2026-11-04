/**
 * The recall controller: listener install/dispose, the order of the edit check,
 * the write, and the consume. The gesture rules it calls are covered in
 * recall-seat.test.mjs; this file exercises the wiring the seat delegates to,
 * without mounting React.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { createRecallController } from '../src/ui/recall.mjs'

/** One event shaped the way the shortcut adapter delivers it. */
function key(code, sessionId, patch = {}, onConsume = () => {}) {
  const occurrence = { dataset: { conversationSession: sessionId } }
  const composer = {}
  const target = {
    closest(selector) {
      if (selector === '[data-conversation-session]') return occurrence
      if (selector === '[data-composer-input]') return composer
      return null
    },
  }
  return {
    type: 'keydown',
    gesture: {
      code, control: false, alt: false, shift: false, meta: false, repeat: false,
      composing: false, defaultPrevented: false, ...patch,
    },
    context: { region: 'editable', modal: null, target },
    consume: onConsume,
  }
}

/** A controller over a mutable composer snapshot. */
function bench(prompts, { run } = {}) {
  const state = {
    consumed: 0,
    draft: '',
    phase: 'plain',
    running: false,
    removed: false,
    writes: [],
    historyReads: 0,
  }
  let listener = null
  let observed = null
  const controller = createRecallController({
    latest: () => ({
      sessionId: 's1',
      input: { phase: state.phase, draft: state.draft, attachmentIds: [] },
      session: { running: state.running, removed: state.removed },
      inputActions: {
        setDraft(text) {
          state.writes.push(text)
          state.draft = text
          if (typeof run === 'function') state.draft = run(text, state)
        },
      },
    }),
    observeFixedInput(fn) {
      listener = fn
      return () => { listener = null }
    },
    historyFor() {
      state.historyReads += 1
      return prompts
    },
  })
  observed = () => listener !== null
  return {
    state,
    get installed() { return observed() },
    press(code, patch) {
      listener(key(code, 's1', patch, () => { state.consumed += 1 }))
    },
    dispose: controller.dispose,
  }
}

test('the controller writes the recalled prompt and consumes the key', () => {
  const b = bench(['P1', 'P2'])
  b.press('ArrowUp')
  assert.deepEqual(b.state.writes, ['P2'])
  assert.equal(b.state.consumed, 1)
  assert.equal(b.state.draft, 'P2')
})

test('an ordinary keystroke is left alone and folds no history', () => {
  const b = bench(['P1'])
  b.press('KeyA')
  assert.deepEqual(b.state.writes, [])
  assert.equal(b.state.consumed, 0)
  // The expensive fold never ran for a key that is not a recall gesture.
  assert.equal(b.state.historyReads, 0)
})

test('a modifier and a menu-owned arrow are left alone without folding history', () => {
  const b = bench(['P1'])
  b.press('ArrowUp', { shift: true })
  b.press('ArrowUp', { defaultPrevented: true })
  assert.deepEqual(b.state.writes, [])
  assert.equal(b.state.historyReads, 0)
})

test('repeated presses walk back, and an edited draft keeps its caret behaviour', () => {
  const b = bench(['P1', 'P2'])
  b.press('ArrowUp')
  b.press('ArrowUp')
  assert.deepEqual(b.state.writes, ['P2', 'P1'])
  // The user types over the recalled text. The composer now holds a draft, so
  // the arrow belongs to the editor again and nothing is recalled.
  b.state.draft = 'P1 plus my edit'
  b.press('ArrowUp')
  assert.deepEqual(b.state.writes, ['P2', 'P1'])
  assert.equal(b.state.draft, 'P1 plus my edit')
  // Clearing it re-enters at the newest prompt rather than resuming the cursor.
  b.state.draft = ''
  b.press('ArrowUp')
  assert.deepEqual(b.state.writes, ['P2', 'P1', 'P2'])
})

test('deleting all recalled text still counts as an edit', () => {
  const b = bench(['P1', 'P2'])
  b.press('ArrowUp')
  b.state.draft = ''
  b.press('ArrowUp')
  // Restarted at the newest prompt instead of stepping past it.
  assert.deepEqual(b.state.writes, ['P2', 'P2'])
})

test('down walks forward and restores the pre-recall draft', () => {
  const b = bench(['P1', 'P2'])
  b.state.draft = ''
  b.press('ArrowUp')
  b.press('ArrowDown')
  assert.deepEqual(b.state.writes, ['P2', ''])
  assert.equal(b.state.draft, '')
})

test('nothing is written while a submission owns the composer', () => {
  const b = bench(['P1'])
  b.state.phase = 'submitting'
  b.press('ArrowUp')
  assert.deepEqual(b.state.writes, [])
  assert.equal(b.state.consumed, 0)
})

test('Escape restores the stashed draft only while the Session is idle', () => {
  const idle = bench(['P1', 'P2'])
  idle.press('ArrowUp')
  idle.press('Escape')
  assert.deepEqual(idle.state.writes, ['P2', ''])

  const busy = bench(['P1', 'P2'])
  busy.state.running = true
  busy.press('ArrowUp')
  busy.press('Escape')
  // The running turn keeps Escape for the host's two-press stop.
  assert.deepEqual(busy.state.writes, ['P2'])
})

test('a write the host refuses is treated as an edit, not as this seat own text', () => {
  // The host may refuse a write (locked editor). Its draft then keeps the value
  // it had, which must read as a foreign draft instead of this seat's output.
  const b = bench(['P1', 'P2'], { run: () => '' })
  b.press('ArrowUp')
  assert.deepEqual(b.state.writes, ['P2'])
  b.press('ArrowUp')
  assert.deepEqual(b.state.writes, ['P2', 'P2'])
})

test('dispose releases the listener', () => {
  const b = bench(['P1'])
  assert.equal(b.installed, true)
  b.dispose()
  assert.equal(b.installed, false)
})

test('a missing observer is tolerated', () => {
  const controller = createRecallController({
    latest: () => undefined,
    observeFixedInput: undefined,
    historyFor: () => [],
  })
  assert.equal(typeof controller.dispose, 'function')
  controller.dispose()
})
