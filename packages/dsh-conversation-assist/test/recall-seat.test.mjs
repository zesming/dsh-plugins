import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PromptRecall, historyFor, isLeaveGesture, isRecallGesture, recallAction, sessionOfEvent,
} from '../src/ui/recall.mjs'

/** Minimal event shape the shortcut adapter delivers. */
function keyEvent(code, patch = {}) {
  return {
    type: 'keydown',
    gesture: { code, control: false, alt: false, shift: false, meta: false, repeat: false,
      composing: false, defaultPrevented: false, ...patch },
    context: { region: 'editable', modal: null, target: { closest: () => null } },
    consume() {},
  }
}

function targetEvent(code, sessionId, patch = {}) {
  const occurrence = { dataset: { conversationSession: sessionId } }
  const target = { closest: (selector) => selector === '[data-conversation-session]' ? occurrence : null }
  const event = keyEvent(code, patch)
  return { ...event, context: { ...event.context, target } }
}

test('recall claims only bare, non-composing arrow keys', () => {
  assert.equal(isRecallGesture(keyEvent('ArrowUp')), true)
  assert.equal(isRecallGesture(keyEvent('ArrowDown')), true)
  assert.equal(isRecallGesture(keyEvent('Escape')), false)
  assert.equal(isRecallGesture(keyEvent('ArrowUp', { composing: true })), false)
  assert.equal(isRecallGesture(keyEvent('ArrowUp', { repeat: true })), false)
  for (const modifier of ['control', 'alt', 'shift', 'meta']) {
    assert.equal(isRecallGesture(keyEvent('ArrowUp', { [modifier]: true })), false, modifier)
  }
})

test('recall yields to the trigger menu and to modals', () => {
  // The host composer preventDefaults an arrow its menu consumed.
  assert.equal(isRecallGesture(keyEvent('ArrowUp', { defaultPrevented: true })), false)
  const modal = keyEvent('ArrowUp')
  assert.equal(isRecallGesture({ ...modal, context: { ...modal.context, modal: 'dialog' } }), false)
  const noTarget = keyEvent('ArrowUp')
  assert.equal(isRecallGesture({ ...noTarget, context: { ...noTarget.context, target: null } }), false)
  assert.equal(isRecallGesture({ type: 'reset' }), false)
})

test('Escape leaves history only while the Session is idle', () => {
  assert.equal(isLeaveGesture(keyEvent('Escape'), { running: false, removed: false }), true)
  // A running Session keeps Escape for the host two-press Stop.
  assert.equal(isLeaveGesture(keyEvent('Escape'), { running: true, removed: false }), false)
  assert.equal(isLeaveGesture(keyEvent('Escape'), { running: false, removed: true }), false)
  assert.equal(isLeaveGesture(keyEvent('Escape', { shift: true }), { running: false }), false)
  assert.equal(isLeaveGesture(keyEvent('ArrowUp'), { running: false }), false)
})

test('recall addresses the Session of the focused composer', () => {
  assert.equal(sessionOfEvent(targetEvent('ArrowUp', 's7')), 's7')
  assert.equal(sessionOfEvent(keyEvent('ArrowUp')), '')
  assert.equal(sessionOfEvent({ type: 'reset' }), '')
})

test('history reads the loaded event window of one Session', () => {
  const sessions = {
    binding: id => id === 's1'
      ? { eventSource: { getSnapshot: () => ({ entries: [
        { type: 'event', event: { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'P1' }] } } },
        { type: 'event', event: { type: 'tool/result', data: {} } },
        { type: 'event', event: { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'P2' }] } } },
      ] }) } }
      : undefined,
  }
  assert.deepEqual(historyFor(sessions, 's1'), ['P1', 'P2'])
})

test('history of an unknown or unopened Session is empty rather than thrown', () => {
  assert.deepEqual(historyFor({ binding: () => undefined }, 's1'), [])
  assert.deepEqual(historyFor(undefined, 's1'), [])
  assert.deepEqual(historyFor({ binding() { throw new Error('cold') } }, 's1'), [])
  assert.deepEqual(historyFor({ binding: () => ({}) }, 's1'), [])
})

test('one arbitrated event resolves to the browse step it performs', () => {
  const history = ['P1', 'P2']
  const state = () => ({
    sessionId: 's1',
    input: { phase: 'plain', draft: '', attachmentIds: [] },
    session: { running: false, removed: false },
    recall: new PromptRecall(),
    history,
  })

  // Empty composer, ArrowUp: recall the newest prompt.
  const entering = state()
  assert.deepEqual(recallAction(targetEvent('ArrowUp', 's1'), entering), { kind: 'recall', text: 'P2' })
  assert.deepEqual(recallAction(targetEvent('ArrowUp', 's1'), entering), { kind: 'recall', text: 'P1' })
  // At the oldest prompt the key is handed back so the caret can move.
  assert.equal(recallAction(targetEvent('ArrowUp', 's1'), entering), null)
  assert.deepEqual(recallAction(targetEvent('ArrowDown', 's1'), entering), { kind: 'recall', text: 'P2' })
  assert.deepEqual(recallAction(targetEvent('ArrowDown', 's1'), entering), { kind: 'restore', text: '' })
  assert.equal(entering.recall.browsing, false)
})

test('another composer, another Session, and a consumed arrow stay out of recall', () => {
  const entering = {
    sessionId: 's1',
    input: { phase: 'plain', draft: '', attachmentIds: [] },
    session: { running: false },
    recall: new PromptRecall(),
    history: ['P1'],
  }
  assert.equal(recallAction(targetEvent('ArrowUp', 's2'), entering), null)
  assert.equal(recallAction(keyEvent('ArrowUp'), entering), null)
  assert.equal(recallAction(targetEvent('ArrowUp', 's1', { defaultPrevented: true }), entering), null)
  assert.equal(recallAction(targetEvent('ArrowUp', 's1', { composing: true }), entering), null)
  assert.equal(recallAction(targetEvent('ArrowDown', 's1'), entering), null)
  assert.equal(entering.recall.browsing, false)
})

test('a draft in progress is never overwritten by recall', () => {
  const entering = {
    sessionId: 's1',
    input: { phase: 'plain', draft: 'my draft', attachmentIds: [] },
    session: { running: false },
    recall: new PromptRecall(),
    history: ['P1'],
  }
  assert.equal(recallAction(targetEvent('ArrowUp', 's1'), entering), null)
  assert.equal(entering.recall.browsing, false)
})

test('Escape leaves history on an idle Session and is ignored on a running one', () => {
  const idle = {
    sessionId: 's1',
    input: { phase: 'plain', draft: '', attachmentIds: [] },
    session: { running: false },
    recall: new PromptRecall(),
    history: ['P1'],
  }
  recallAction(targetEvent('ArrowUp', 's1'), idle)
  assert.deepEqual(recallAction(targetEvent('Escape', 's1'), idle), { kind: 'restore', text: '' })

  const busy = { ...idle, session: { running: true }, recall: new PromptRecall() }
  recallAction(targetEvent('ArrowUp', 's1'), busy)
  assert.equal(recallAction(targetEvent('Escape', 's1'), busy), null)
  // Still browsing: the turn's Stop gesture keeps Escape.
  assert.equal(busy.recall.browsing, true)
})

test('recall works while the agent is running, where drafting a follow-up is common', () => {
  const entering = {
    sessionId: 's1',
    input: { phase: 'plain', draft: '', attachmentIds: [] },
    session: { running: true },
    recall: new PromptRecall(),
    history: ['P1'],
  }
  assert.deepEqual(recallAction(targetEvent('ArrowUp', 's1'), entering), { kind: 'recall', text: 'P1' })
})

test('a reset event and a menu-owned key resolve to nothing', () => {
  const entering = {
    sessionId: 's1',
    input: { phase: 'plain', draft: '', attachmentIds: [] },
    session: { running: false },
    recall: new PromptRecall(),
    history: ['P1'],
  }
  assert.equal(recallAction({ type: 'reset' }, entering), null)
  assert.equal(recallAction(targetEvent('Escape', 's1'), entering), null)
})
