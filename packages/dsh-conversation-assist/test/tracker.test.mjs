import assert from 'node:assert/strict'
import test from 'node:test'

import { createTracker } from '../src/host/tracker.mjs'

const session = { id: 's1' }
const event = (type, data, seq = 0, time = 1) => ({ type, seq, time, data })

test('tracker records the latest completed turn and its route', () => {
  const tracker = createTracker()
  tracker.observe(session, event('turn/start', { turn: 1 }, 1))
  tracker.observe(session, event('request/header', { header: { config: { provider: 'p', model: 'm' } }, reason: 'initial' }, 2))
  tracker.observe(session, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 3, 5))
  const entry = tracker.get('s1')
  assert.equal(entry.turn, 1)
  assert.equal(entry.endSeq, 3)
  assert.equal(entry.endTime, 5)
  assert.equal(entry.reason.kind, 'completed')
  assert.deepEqual(entry.header, { provider: 'p', model: 'm' })
})

test('tracker starts a new entry on the next turn and forgets sessions', () => {
  const tracker = createTracker()
  tracker.observe(session, event('turn/start', { turn: 1 }, 1))
  tracker.observe(session, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 2))
  tracker.observe(session, event('turn/start', { turn: 2 }, 3))
  assert.equal(tracker.get('s1').endSeq, undefined)
  tracker.forget('s1')
  assert.equal(tracker.get('s1'), undefined)
})

test('tracker ignores events for an unknown session or a different turn', () => {
  const tracker = createTracker()
  tracker.observe(null, event('turn/start', { turn: 1 }))
  tracker.observe(session, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 2))
  assert.equal(tracker.get('s1'), undefined)
  tracker.observe(session, event('turn/start', { turn: 2 }, 3))
  tracker.observe(session, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 4))
  assert.equal(tracker.get('s1').endSeq, undefined)
})
