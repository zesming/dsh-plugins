import assert from 'node:assert/strict'
import test from 'node:test'

import { PromptRecall, canRecall, promptHistoryOf } from '../src/ui/recall.mjs'

const idleSession = { removed: false, running: false }
const emptyInput = { phase: 'plain', draft: '', attachmentIds: [] }

function user(text, source = { kind: 'user' }, content) {
  return {
    type: 'event',
    event: {
      type: 'user/message',
      data: { source, content: content ?? [{ type: 'text', text }] },
    },
  }
}

const turnStart = { type: 'event', event: { type: 'turn/start', data: { turn: 1 } } }

test('history keeps only prompts the user typed, oldest first', () => {
  const entries = [
    turnStart,
    user('first'),
    user('tool catalog', { kind: 'tool-registry' }),
    user('second'),
    { type: 'transient', event: { type: 'assistant/live-chunk', data: {} } },
  ]
  assert.deepEqual(promptHistoryOf(entries), ['first', 'second'])
})

test('history keeps a prompt sent mid-turn, which logs as an ordinary user message', () => {
  const entries = [turnStart, user('start'), turnStart, user('先别改配置')]
  assert.deepEqual(promptHistoryOf(entries), ['start', '先别改配置'])
})

test('history collapses consecutive identical prompts', () => {
  assert.deepEqual(promptHistoryOf([user('build'), user('build'), user('test'), user('build')]),
    ['build', 'test', 'build'])
})

test('history joins text blocks and skips prompts with no text of their own', () => {
  const imageOnly = user('', { kind: 'user' }, [{ type: 'image', attachment: {} }])
  const multiBlock = user('', { kind: 'user' }, [
    { type: 'text', text: 'line one' },
    { type: 'image', attachment: {} },
    { type: 'text', text: 'line two' },
  ])
  assert.deepEqual(promptHistoryOf([imageOnly, multiBlock, user('   '), user('real')]),
    ['line one\nline two', 'real'])
})

test('history of an empty or unrelated window is empty', () => {
  assert.deepEqual(promptHistoryOf([]), [])
  assert.deepEqual(promptHistoryOf(undefined), [])
  assert.deepEqual(promptHistoryOf([turnStart]), [])
})

test('recall enters only an empty, attachment-free, plain composer of a live Session', () => {
  assert.equal(canRecall(emptyInput, idleSession), true)
  assert.equal(canRecall({ ...emptyInput, draft: 'draft' }, idleSession), false)
  assert.equal(canRecall({ ...emptyInput, attachmentIds: ['a'] }, idleSession), false)
  assert.equal(canRecall({ ...emptyInput, phase: 'claimed' }, idleSession), false)
  // Recalling while the agent works is ordinary: only removal disqualifies.
  assert.equal(canRecall(emptyInput, { ...idleSession, running: true }), true)
  assert.equal(canRecall(emptyInput, { ...idleSession, removed: true }), false)
  assert.equal(canRecall(undefined, idleSession), false)
})

test('recall walks back from the newest prompt and yields the key at the oldest', () => {
  const recall = new PromptRecall()
  const options = { sessionId: 's1', history: ['P1', 'P2'], draft: '', canEnter: true }
  assert.deepEqual(recall.older(options), { kind: 'recall', text: 'P2' })
  assert.deepEqual(recall.older(options), { kind: 'recall', text: 'P1' })
  // The oldest prompt hands the key back so the caret can move inside the text.
  assert.equal(recall.older(options), null)
  assert.equal(recall.browsing, true)
})

test('recall does not enter a Session with no prompt', () => {
  const recall = new PromptRecall()
  assert.equal(recall.older({ sessionId: 's1', history: [], draft: '', canEnter: true }), null)
  assert.equal(recall.browsing, false)
})

test('recall does not enter while entry is refused', () => {
  const recall = new PromptRecall()
  assert.equal(recall.older({ sessionId: 's1', history: ['P1'], draft: 'mine', canEnter: false }), null)
  assert.equal(recall.browsing, false)
})

test('recall walks forward and restores the stashed draft past the newest prompt', () => {
  const recall = new PromptRecall()
  const history = ['P1', 'P2']
  const options = { sessionId: 's1', history, draft: 'my draft', canEnter: true }
  recall.older(options)
  recall.older(options)
  assert.deepEqual(recall.newer(history), { kind: 'recall', text: 'P2' })
  assert.deepEqual(recall.newer(history), { kind: 'restore', text: 'my draft' })
  assert.equal(recall.browsing, false)
})

test('recall leaves history and hands the stashed draft back', () => {
  const recall = new PromptRecall()
  recall.older({ sessionId: 's1', history: ['P1'], draft: 'my draft', canEnter: true })
  assert.deepEqual(recall.leave(), { kind: 'restore', text: 'my draft' })
  assert.equal(recall.browsing, false)
  assert.equal(recall.newer(['P1']), null)
  assert.equal(recall.leave(), null)
})

test('recall abandons history without restoring, keeping the user edit', () => {
  const recall = new PromptRecall()
  recall.older({ sessionId: 's1', history: ['P1', 'P2'], draft: 'my draft', canEnter: true })
  recall.abandon()
  assert.equal(recall.browsing, false)
  assert.equal(recall.newer(['P1', 'P2']), null)
  assert.deepEqual(recall.older({ sessionId: 's1', history: ['P1', 'P2'], draft: 'edited', canEnter: true }),
    { kind: 'recall', text: 'P2' })
})

test('recall keeps each Session own cursor and stash', () => {
  const recall = new PromptRecall()
  recall.older({ sessionId: 'a', history: ['A1', 'A2'], draft: '', canEnter: true })
  assert.equal(recall.sessionId, 'a')
  // A different Session starts at its own newest prompt instead of resuming A.
  assert.deepEqual(recall.older({ sessionId: 'b', history: ['B1'], draft: '', canEnter: true }),
    { kind: 'recall', text: 'B1' })
  assert.equal(recall.sessionId, 'b')
  assert.equal(recall.newer(['B1']).kind, 'restore')
})

test('an older page loaded mid-browse keeps pointing at the same prompt', () => {
  const recall = new PromptRecall()
  recall.older({ sessionId: 's1', history: ['P2', 'P3'], draft: '', canEnter: true })
  // Prepending an older page shifts indices but not distance from newest.
  assert.deepEqual(recall.older({ sessionId: 's1', history: ['P1', 'P2', 'P3'], draft: '', canEnter: true }),
    { kind: 'recall', text: 'P2' })
  assert.deepEqual(recall.older({ sessionId: 's1', history: ['P1', 'P2', 'P3'], draft: '', canEnter: true }),
    { kind: 'recall', text: 'P1' })
})
