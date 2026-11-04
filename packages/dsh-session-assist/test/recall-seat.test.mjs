import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PromptRecall, historyFor, inComposer, isLeaveGesture, isRecallGesture, recallAction, sessionOfEvent,
} from '../src/ui/recall.mjs'

/**
 * A target inside the composer: the conversation marker wraps the whole body,
 * while the composer's own contenteditable is what must hold focus.
 * @param sessionId - owning Session.
 * @param options - focus destination and host exclusion that applies.
 */
function composerTarget(sessionId, { focus = 'composer', blocked = null } = {}) {
  const occurrence = { dataset: { conversationSession: sessionId } }
  const composer = {}
  const target = {
    closest(selector) {
      if (selector === '[data-conversation-session]') return occurrence
      if (selector === '[data-composer-input]') return focus === 'composer' ? composer : null
      if (selector === '[data-approval-key], iframe, .xterm, [inert]') return blocked === null ? null : composer
      return null
    },
  }
  return target
}

/** Minimal event shape the shortcut adapter delivers. */
function keyEvent(code, patch = {}, target = composerTarget('s1')) {
  return {
    type: 'keydown',
    gesture: { code, control: false, alt: false, shift: false, meta: false, repeat: false,
      composing: false, defaultPrevented: false, ...patch },
    context: { region: 'editable', modal: null, target },
    consume() {},
  }
}

function targetEvent(code, sessionId, patch = {}, options) {
  return keyEvent(code, patch, composerTarget(sessionId, options))
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
  assert.equal(sessionOfEvent(keyEvent('ArrowUp', {}, { closest: () => null })), '')
  assert.equal(sessionOfEvent({ type: 'reset' }), '')
})

test('recall needs focus in the composer, not merely the conversation body', () => {
  // A toolbar button, the transcript, or the hidden file input sits inside the
  // Session marker but must keep its own arrow and Escape behaviour.
  assert.equal(isRecallGesture(targetEvent('ArrowUp', 's1', {}, { focus: 'elsewhere' })), false)
  assert.equal(isRecallGesture(targetEvent('ArrowDown', 's1', {}, { focus: 'elsewhere' })), false)
  assert.equal(isLeaveGesture(targetEvent('Escape', 's1', {}, { focus: 'elsewhere' }), { running: false }), false)
  assert.equal(isRecallGesture(targetEvent('ArrowUp', 's1')), true)
})

test('recall keeps the host exclusions off approval keys, frames, terminals, and inert subtrees', () => {
  assert.equal(isRecallGesture(targetEvent('ArrowUp', 's1', {}, { blocked: 'approval' })), false)
  const outside = keyEvent('ArrowUp')
  assert.equal(inComposer({ ...outside.context, region: 'page' }), false)
  assert.equal(inComposer({ ...outside.context, region: 'terminal' }), false)
  assert.equal(inComposer({ ...outside.context, target: null }), false)
})

test('recall writes nothing while a submission owns the composer', () => {
  const entering = {
    sessionId: 's1',
    input: { phase: 'submitting', draft: '', attachmentIds: [] },
    session: { running: false },
    recall: new PromptRecall(),
    history: ['P1'],
  }
  assert.equal(recallAction(targetEvent('ArrowUp', 's1'), entering), null)
  assert.equal(entering.recall.browsing, false)
  // Even an already-browsing cursor stops writing once the phase leaves plain.
  entering.input = { phase: 'plain', draft: '', attachmentIds: [] }
  recallAction(targetEvent('ArrowUp', 's1'), entering)
  entering.input = { phase: 'adjudicating', draft: 'P1', attachmentIds: [] }
  assert.equal(recallAction(targetEvent('ArrowDown', 's1'), entering), null)
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
  // A composer outside any Session marker has nothing to recall.
  assert.equal(recallAction(keyEvent('ArrowUp', {}, { closest: () => null }), entering), null)
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
