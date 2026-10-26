import assert from 'node:assert/strict'
import test from 'node:test'

import { candidateMatches, canShowSuggestion, insertCandidate, shortcutAction,
  editableComposerFor, recapRequestView, recapResultMatches, submissionStarted,
  sendCandidate, turnIdentity } from '../src/ui/behavior.mjs'
import { isBriefCompletedReply, recapPresentation, shouldRequestRecap } from '../src/ui/recap-policy.mjs'

const route = { provider: 'fixture', model: 'model-a', reasoningEffort: 'medium' }
const identity = turnIdentity('s1', 4, 29)
const session = {
  running: false, removed: false, subagent: null, pendingSubmissions: [], awaitingFirstTurn: false,
}
const emptyInput = {
  draft: '', draftRev: 4, attachmentIds: [], occurrences: [], queue: [], phase: 'plain', claim: undefined,
}

function eligible(overrides = {}) {
  return canShowSuggestion({
    prediction: true,
    sessionId: 's1',
    input: emptyInput,
    session,
    identity,
    route,
    ...overrides,
  })
}

function composer(sessionId = 's1') {
  const occurrence = {
    dataset: { conversationSession: sessionId },
    hidden: false,
    isConnected: true,
    getClientRects() { return [{ width: 1, height: 1 }] },
    closest(selector) { return selector === '[hidden]' && this.hidden ? this : null },
    contains(value) { return value === seat || value === input || value === row },
  }
  const seat = {
    hidden: false,
    inert: false,
    isConnected: true,
    getClientRects() { return [{ width: 1, height: 1 }] },
    closest(selector) {
      if (selector === '[data-composer-seat]') return seat
      if (selector === '[data-conversation-session]') return occurrence
      if (selector === '[hidden]' && this.hidden) return this
      if (selector === '[inert]' && this.inert) return this
      return null
    },
    querySelector(selector) { return selector === '[data-composer-input]' ? input : null },
  }
  const input = {
    disabled: false,
    isContentEditable: true,
    readOnly: false,
    hidden: false,
    inert: false,
    isConnected: true,
    getClientRects() { return [{ width: 1, height: 1 }] },
    closest(selector) {
      if (selector === '[data-composer-input]') return input
      if (selector === '[data-composer-seat]') return seat
      if (selector === '[data-conversation-session]') return occurrence
      if (selector === '[hidden]' && (this.hidden || seat.hidden || occurrence.hidden)) return this.hidden ? this : this.hidden ? seat : occurrence
      if (selector === '[inert]' && (this.inert || seat.inert)) return this.inert ? this : seat
      return null
    },
    getAttribute(name) {
      if (name === 'contenteditable') return this.isContentEditable ? 'true' : 'false'
      if (name === 'disabled' && this.disabled) return ''
      if (name === 'readonly' && this.readOnly) return ''
      return null
    },
    focus() {},
  }
  const row = {
    hidden: false,
    isConnected: true,
    getClientRects() { return [{ width: 1, height: 1 }] },
    closest(selector) {
      if (selector === '[data-composer-seat]') return seat
      if (selector === '[hidden]' && this.hidden) return this
      if (selector === '[inert]' && seat.inert) return seat
      return null
    },
  }
  return { occurrence, seat, input, row }
}

const keyEvent = (target, patch = {}) => ({
  type: 'keydown',
  gesture: {
    code: 'Tab', repeat: false, composing: false, defaultPrevented: false,
    control: false, alt: false, shift: false, meta: false, ...patch,
  },
  context: { modal: null, target },
})

test('candidate acceptance requires the exact session, turn, end sequence, and full source route', () => {
  const candidate = { state: 'ready', sessionId: 's1', turn: 4, endSeq: 29, text: '检查深色模式', route }
  assert.equal(candidateMatches(candidate, identity, route), true)
  assert.equal(candidateMatches(candidate, turnIdentity('s1', 5, 30), route), false)
  assert.equal(candidateMatches({ ...candidate, endSeq: 28 }, identity, route), false)
  assert.equal(candidateMatches({ ...candidate, sessionId: 's2' }, identity, route), false)
  assert.equal(candidateMatches(candidate, identity, { ...route, reasoningEffort: 'low' }), false)
  assert.equal(candidateMatches({ ...candidate, predictionOffEpoch: 2 }, identity, route, 2), true)
  assert.equal(candidateMatches({ ...candidate, predictionOffEpoch: 1 }, identity, route, 2), false)
})

test('recap results require the matching reply hash and retain the full generated text', () => {
  const summary = '结论。\n\n验证与限制。'.repeat(40)
  const result = {
    state: 'ready', sessionId: 's1', turn: 4, endSeq: 29,
    replyHash: 'reply-hash', recap: summary,
  }
  assert.equal(recapResultMatches(result, identity, 'reply-hash'), true)
  assert.equal(recapResultMatches({ ...result, endSeq: 28 }, identity, 'reply-hash'), false)
  assert.equal(recapResultMatches({ ...result, replyHash: 'stale-hash' }, identity, 'reply-hash'), false)
  assert.equal(recapResultMatches(result, turnIdentity('s1', 5, 30), 'reply-hash'), false)
  assert.equal(result.recap, summary)
})

test('temporary composer content hides eligibility while submissions permanently invalidate it', () => {
  assert.equal(eligible(), true)
  assert.equal(eligible({ input: { ...emptyInput, draft: '正在输入' } }), false)
  assert.equal(eligible({ input: { ...emptyInput, attachmentIds: ['file-1'] } }), false)
  assert.equal(eligible({ input: { ...emptyInput, occurrences: [{ kind: 'reference' }] } }), false)
  assert.equal(eligible({ input: { ...emptyInput, queue: [{ id: 'queued' }] } }), false)

  for (const [activeSession, activeInput] of [
    [{ ...session, running: true }, emptyInput],
    [{ ...session, pendingSubmissions: [{ id: 'pending' }] }, emptyInput],
    [{ ...session, awaitingFirstTurn: true }, emptyInput],
    [session, { ...emptyInput, phase: 'adjudicating' }],
    [session, { ...emptyInput, claim: { name: 'command' } }],
  ]) {
    assert.equal(eligible({ session: activeSession, input: activeInput }), false)
    assert.equal(submissionStarted(activeSession, activeInput), true)
  }
  assert.equal(submissionStarted(session, { ...emptyInput, draft: 'transient' }), false)
})

test('fixed input leaves Tab navigation native and only claims Escape in the owning composer', () => {
  const owner = composer()
  const escapeEvent = patch => keyEvent(owner.input, { code: 'Escape', ...patch })
  assert.equal(shortcutAction(keyEvent(owner.input), { sessionId: 's1', row: owner.row, eligible: true }), null)
  assert.equal(shortcutAction(keyEvent(owner.input, { shift: true }), { sessionId: 's1', row: owner.row, eligible: true }), null)
  assert.equal(shortcutAction(escapeEvent(), { sessionId: 's1', row: owner.row, eligible: true }), 'dismiss')
  assert.equal(shortcutAction(escapeEvent({ shift: true }), { sessionId: 's1', row: owner.row, eligible: true }), null)
  assert.equal(shortcutAction(keyEvent(owner.input, { code: 'Enter' }), { sessionId: 's1', row: owner.row, eligible: true }), null)
  assert.equal(shortcutAction(escapeEvent({ repeat: true }), { sessionId: 's1', row: owner.row, eligible: true }), null)
  assert.equal(shortcutAction(escapeEvent({ composing: true }), { sessionId: 's1', row: owner.row, eligible: true }), null)
  assert.equal(shortcutAction(escapeEvent({ defaultPrevented: true }), { sessionId: 's1', row: owner.row, eligible: true }), null)
  assert.equal(shortcutAction({ ...escapeEvent(), context: { modal: 'dialog', target: owner.input } }, { sessionId: 's1', row: owner.row, eligible: true }), null)
  assert.equal(shortcutAction(escapeEvent(), { sessionId: 's2', row: owner.row, eligible: true }), null)
  assert.equal(shortcutAction(escapeEvent(), { sessionId: 's1', row: owner.row, eligible: true, composing: true }), null)
  owner.input.disabled = true
  assert.equal(shortcutAction(escapeEvent(), { sessionId: 's1', row: owner.row, eligible: true }), null)
  owner.input.disabled = false
  owner.input.isContentEditable = false
  assert.equal(shortcutAction(escapeEvent(), { sessionId: 's1', row: owner.row, eligible: true }), null)
  owner.input.isContentEditable = true
  owner.seat.inert = true
  assert.equal(shortcutAction(escapeEvent(), { sessionId: 's1', row: owner.row, eligible: true }), null)
  owner.seat.inert = false
  owner.row.hidden = true
  assert.equal(shortcutAction(escapeEvent(), { sessionId: 's1', row: owner.row, eligible: true }), null)
})

test('click acceptance shares the visible editable seat gate and checks the live draft revision', () => {
  const owner = composer()
  const calls = []
  let composing = false
  let draftWrites = 0
  const actions = {
    captureInsertion() { calls.push('capture'); return { start: 0, end: 0, draftRev: 4 } },
    insertText(text, span) { calls.push(['insert', text, span.draftRev]); draftWrites += 1; return true },
  }
  const gate = () => !composing && editableComposerFor(owner.row, 's1') !== null
  assert.equal(editableComposerFor(owner.row, 's1')?.input, owner.input)
  assert.equal(insertCandidate(actions, '草稿文本', () => true, { expectedDraftRev: 4, canInsert: gate }), true)
  assert.deepEqual(calls, ['capture', 'capture', ['insert', '草稿文本', 4]])
  assert.equal(draftWrites, 1)

  calls.length = 0
  owner.input.disabled = true
  assert.equal(editableComposerFor(owner.row, 's1'), null)
  assert.equal(insertCandidate(actions, '草稿文本', () => true, { expectedDraftRev: 4, canInsert: gate }), false)
  assert.deepEqual(calls, [])
  owner.input.disabled = false

  owner.seat.inert = true
  assert.equal(editableComposerFor(owner.row, 's1'), null)
  owner.seat.inert = false
  owner.row.hidden = true
  assert.equal(editableComposerFor(owner.row, 's1'), null)
  owner.row.hidden = false
  owner.input.isContentEditable = false
  assert.equal(editableComposerFor(owner.row, 's1'), null)
  owner.input.isContentEditable = true

  let revision = 5
  actions.captureInsertion = () => ({ start: 0, end: 0, draftRev: revision })
  assert.equal(insertCandidate(actions, '草稿文本', () => true, { expectedDraftRev: 4, canInsert: gate }), false)
  revision = 4
  assert.equal(insertCandidate(actions, '草稿文本', () => { revision = 5; return true }, {
    expectedDraftRev: 4, canInsert: gate,
  }), false)
  revision = 4
  composing = false
  assert.equal(insertCandidate(actions, '草稿文本', () => { composing = true; return true }, {
    expectedDraftRev: 4, canInsert: gate,
  }), false)
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === 'insert'), false)
  assert.equal(draftWrites, 1)
})

test('recap loading persists for the same key until a delayed result resolves', async () => {
  const key = 's1:4:29:reply-hash:on'
  let request = { key, state: 'loading' }
  let resolveRequest
  const pending = new Promise(resolve => { resolveRequest = resolve })
  const finishing = pending.then(result => { request = result })
  assert.deepEqual(recapRequestView(request, key, true), { current: request, state: 'loading' })
  resolveRequest({ key, state: 'ready', recap: '已完成并验证。', persisted: false })
  await finishing
  assert.deepEqual(recapRequestView(request, key, true), { current: request, state: 'ready' })
  assert.equal(request.persisted, false)

  request = { key, state: 'loading' }
  let resolveFailure
  const failedRead = new Promise(resolve => { resolveFailure = resolve })
  const failed = failedRead.then(result => { request = result })
  assert.equal(recapRequestView(request, key, true).state, 'loading')
  resolveFailure({ key, state: 'none', reason: 'unavailable' })
  await failed
  assert.deepEqual(recapRequestView(request, key, true), {
    current: request, state: 'none', reason: 'unavailable',
  })
})

test('recap visibility requests model summaries while brief replies are omitted', () => {
  const facts = {
    reasonKind: 'completed', finalReply: true, replyHash: 'brief-reply',
    lastText: '检查通过，未发现问题。', excerptTruncated: false,
  }
  const options = {
    settingsLoaded: true, enabled: true,
    subagent: null, identity, facts,
  }
  assert.equal(isBriefCompletedReply(facts), true)
  assert.equal(shouldRequestRecap(options), false)

  const complete = {
    ...facts,
    reasonKind: 'completed', finalReply: true, replyHash: 'complete-reply',
    lastText: 'The change is complete. Validation passed. One item remains.',
  }
  assert.equal(shouldRequestRecap({ ...options, facts: complete }), true)
  assert.equal(shouldRequestRecap({ ...options, enabled: false, facts: complete }), false)

  const abnormal = { ...facts, reasonKind: 'blocked' }
  assert.equal(isBriefCompletedReply(abnormal), false)
  assert.equal(shouldRequestRecap({ ...options, facts: abnormal }), false)

  const incomplete = { ...facts, finalReply: false }
  assert.equal(isBriefCompletedReply(incomplete), false)

  // A bounded excerpt is not sufficient evidence that the original reply is brief.
  const truncated = { ...facts, excerptTruncated: true }
  assert.equal(isBriefCompletedReply(truncated), false)
  assert.equal(shouldRequestRecap({ ...options, facts: truncated }), true)
  const unknownTruncation = { ...facts, excerptTruncated: undefined }
  assert.equal(isBriefCompletedReply(unknownTruncation), false)
})

test('the recap row renders only when a model recap is ready', () => {
  const base = { enabled: true, subagent: null, closed: true }

  assert.deepEqual(recapPresentation({ ...base, requestView: { state: 'ready' } }), { kind: 'recap' })

  // Nothing to show yet: no placeholder and no status line while generating.
  assert.equal(recapPresentation({ ...base, requestView: { state: 'loading' } }), null)
  assert.equal(recapPresentation({ ...base, requestView: { state: 'idle' } }), null)

  // Nothing to show at all: the transcript already states the reply and ending.
  for (const reason of ['historical', 'unavailable', 'budget', 'disabled', 'not-needed', 'no-context']) {
    assert.equal(recapPresentation({ ...base, requestView: { state: 'none', reason } }), null, reason)
  }

  // Settings, subagent turns, and still-open turns stay empty regardless.
  assert.equal(recapPresentation({ ...base, enabled: false, requestView: { state: 'ready' } }), null)
  assert.equal(recapPresentation({ ...base, subagent: {}, requestView: { state: 'ready' } }), null)
  assert.equal(recapPresentation({ ...base, closed: false, requestView: { state: 'ready' } }), null)
})

test('the insertion transaction rechecks its revision, focuses its composer, and never submits', () => {
  const calls = []
  const actions = {
    captureInsertion() { calls.push('capture'); return { draftRev: 2 } },
    insertText(text, span) {
      calls.push(['insert', text, span.draftRev])
      return true
    },
    submit() { calls.push('submit') },
  }
  assert.equal(insertCandidate(actions, '检查深色模式', () => { calls.push('focus'); return true }), true)
  assert.deepEqual(calls, ['capture', 'focus', 'capture', ['insert', '检查深色模式', 2]])
})

test('failed editor insertion does not count as accepted', () => {
  const calls = []
  let draft = 'existing draft'
  const actions = {
    captureInsertion() { calls.push('capture'); return { draftRev: 1 } },
    insertText() { calls.push('insert'); return false },
    submit() { calls.push('submit') },
  }
  assert.equal(insertCandidate(actions, 'text', () => { calls.push('focus'); return true }), false)
  assert.deepEqual(calls, ['capture', 'focus', 'capture', 'insert'])
  assert.equal(draft, 'existing draft')
  assert.equal(calls.includes('submit'), false)
  const beforeFocusFailure = calls.length
  assert.equal(insertCandidate(actions, 'text', () => { calls.push('focus-refused'); return false }), false)
  assert.deepEqual(calls.slice(beforeFocusFailure), ['capture', 'focus-refused'])
  assert.equal(draft, 'existing draft')
})

test('send inserts through the guarded editor before standard submit', () => {
  const calls = []
  let revision = 4
  let draft = ''
  let editable = true
  const actions = {
    captureInsertion() { calls.push('capture'); return { start: 0, end: 0, draftRev: revision } },
    insertText(text, span) {
      calls.push(['insert', text, span.draftRev])
      if (!editable || span.draftRev !== revision) return false
      draft = text
      return true
    },
    submit() { calls.push('submit') },
    setDraft() { calls.push('setDraft') },
  }
  const focus = () => { calls.push('focus'); return true }
  assert.equal(sendCandidate(actions, '检查深色模式', focus, {
    expectedDraftRev: 4, canInsert: () => editable,
  }), true)
  assert.deepEqual(calls, [
    'capture', 'focus', 'capture', ['insert', '检查深色模式', 4], 'submit',
  ])
  assert.equal(draft, '检查深色模式')
  assert.equal(calls.includes('setDraft'), false)

  calls.length = 0
  draft = 'existing draft'
  const refusesInsert = {
    ...actions,
    insertText() { calls.push('insert-refused'); return false },
  }
  assert.equal(sendCandidate(refusesInsert, '检查深色模式', focus, {
    expectedDraftRev: 4, canInsert: () => editable,
  }), false)
  assert.deepEqual(calls, ['capture', 'focus', 'capture', 'insert-refused'])
  assert.equal(draft, 'existing draft')
  assert.equal(calls.includes('submit'), false)

  calls.length = 0
  editable = false
  assert.equal(sendCandidate(actions, '检查深色模式', focus, {
    expectedDraftRev: 4, canInsert: () => editable,
  }), false)
  assert.deepEqual(calls, [])
  assert.equal(draft, 'existing draft')
  assert.equal(calls.includes('submit'), false)

  calls.length = 0
  editable = true
  revision = 5
  assert.equal(sendCandidate(actions, '检查深色模式', focus, {
    expectedDraftRev: 4, canInsert: () => editable,
  }), false)
  assert.deepEqual(calls, ['capture'])
  assert.equal(draft, 'existing draft')
  assert.equal(calls.includes('submit'), false)
})
