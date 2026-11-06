import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveRecapTurn } from '../src/ui/recap-turn.mjs'

/**
 * Regression coverage for the DSH 0.2.1-rc.3 turnTail contract change: the
 * shell now supplies the Turn NUMBER, not a Turn object. The tail reads the
 * rich location from useChat and the folded Definition value from a keyed
 * hook; the pure resolution lives in resolveRecapTurn.
 */

test('resolves identity from a numeric turn and the timeline turn/end seq', () => {
  const turnRecord = {
    turn: 7,
    end: { seq: 123, data: { reason: { kind: 'completed' } } },
  }
  const { identity, facts, end } = resolveRecapTurn({
    turnNumber: 7,
    sessionId: 's1',
    turnRecord,
    definedFacts: undefined,
  })
  assert.deepEqual(identity, { sessionId: 's1', turn: 7, endSeq: 123 })
  assert.equal(end, turnRecord.end)
  assert.equal(facts.turn, 7)
  assert.equal(facts.reasonKind, 'completed')
})

test('the folded Definition value wins over the end-event fallback', () => {
  const folded = {
    turn: 3, hasReply: true, finalReply: true, reasonKind: 'completed',
    replyHash: 'abc123', lastText: 'done',
  }
  const { facts } = resolveRecapTurn({
    turnNumber: 3,
    sessionId: 's',
    turnRecord: { turn: 3, end: { seq: 9, data: { reason: { kind: 'completed' } } } },
    definedFacts: folded,
  })
  assert.equal(facts, folded)
  assert.equal(facts.replyHash, 'abc123')
})

test('an open turn (no end) yields a null identity so nothing renders or requests', () => {
  const { identity, facts } = resolveRecapTurn({
    turnNumber: 2,
    sessionId: 's',
    turnRecord: { turn: 2 },
    definedFacts: undefined,
  })
  assert.equal(identity, null)
  assert.equal(facts.turn, 2)
  assert.equal(facts.reasonKind, 'unknown')
})

test('a missing timeline turn yields a null identity without throwing', () => {
  const { identity } = resolveRecapTurn({
    turnNumber: 11,
    sessionId: 's',
    turnRecord: null,
    definedFacts: undefined,
  })
  assert.equal(identity, null)
})

test('non-integer turn number yields a null identity', () => {
  const { identity } = resolveRecapTurn({
    turnNumber: undefined,
    sessionId: 's',
    turnRecord: null,
    definedFacts: undefined,
  })
  assert.equal(identity, null)
})

