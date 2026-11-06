import assert from 'node:assert/strict'
import test from 'node:test'

import {
  askStillCurrent,
  decideAsk,
  identityKey,
} from '../src/ui/behavior.mjs'

/**
 * Table coverage for the suggestion ask decision chain (F-03).
 *
 * These gates used to live across inline component booleans and a setTimeout
 * guard, so a typo in the effect wiring left all 300+ pure-function tests green
 * while the row silently stopped appearing. The decisions are React-free here.
 */

const settings = { loaded: true, prediction: true }
const session = { subagent: null }
const input = { draft: '', phase: 'plain' }
const sessionId = 's1'
const identity = { sessionId, turn: 3, endSeq: 42 }
const route = { provider: 'relay', model: 'm1' }

/** A baseline from which one field is changed per case. */
const base = {
  settings,
  session,
  input,
  sessionId,
  identity,
  route,
  composing: false,
  consumed: false,
  candidate: null,
  predictionOffEpoch: 0,
}

test('a completed turn with a ready route and empty composer asks', () => {
  assert.deepEqual(decideAsk(base), { ask: true, reason: 'ask' })
})

test('settings not loaded and prediction disabled do not ask', () => {
  assert.equal(decideAsk({ ...base, settings: { loaded: false, prediction: true } }).reason, 'settings-unloaded')
  assert.equal(decideAsk({ ...base, settings: { loaded: true, prediction: false } }).reason, 'disabled')
})

test('no completed identity means not-completed, even mid-turn', () => {
  assert.equal(decideAsk({ ...base, identity: null }).reason, 'not-completed')
})

test('an unresolved model route suppresses the ask until the route is ready', () => {
  const noRoute = decideAsk({ ...base, route: null })
  assert.equal(noRoute.ask, false)
  assert.equal(noRoute.reason, 'no-route')
  // The same state asks once the projection resolves to a route.
  assert.equal(decideAsk({ ...base, route }).reason, 'ask')
})

test('a consumed identity and an existing current candidate do not re-ask', () => {
  assert.equal(decideAsk({ ...base, consumed: true }).reason, 'consumed')
  const candidate = {
    state: 'ready', sessionId, turn: identity.turn, endSeq: identity.endSeq,
    text: 'continue', route, predictionOffEpoch: 0,
  }
  assert.equal(decideAsk({ ...base, candidate }).reason, 'has-candidate')
})

test('busy composer/session states are refused with reasons', () => {
  assert.equal(decideAsk({ ...base, session: { ...session, running: true } }).reason, 'busy')
  assert.equal(decideAsk({ ...base, session: { ...session, subagent: { id: 'child' } } }).reason, 'ineligible')
  assert.equal(decideAsk({ ...base, input: { draft: '', phase: 'claimed', claim: {} } }).reason, 'busy')
})

test('a non-empty draft and IME composition make the turn ineligible', () => {
  assert.equal(decideAsk({ ...base, input: { draft: 'typed', phase: 'plain' } }).ask, false)
  assert.equal(decideAsk({ ...base, composing: true }).ask, false)
})

test('askStillCurrent fires only while identity, epoch, and route are unchanged', () => {
  const latest = { identity, predictionOffEpoch: 0, modelRoute: route }
  const key = identityKey(identity)
  assert.equal(askStillCurrent({ latest, requestKey: key, route, predictionOffEpoch: 0, hidden: false }), true)

  // The turn advanced in the 400 ms window.
  const nextTurn = { identity: { sessionId, turn: 4, endSeq: 55 }, predictionOffEpoch: 0, modelRoute: route }
  assert.equal(askStillCurrent({
    latest: nextTurn, requestKey: key, route, predictionOffEpoch: 0,
  }), false)

  // Prediction was switched off (epoch bumped) in the window.
  assert.equal(askStillCurrent({
    latest: { ...latest, predictionOffEpoch: 1 }, requestKey: key, route, predictionOffEpoch: 0,
  }), false)

  // The model route changed in the window.
  assert.equal(askStillCurrent({
    latest: { ...latest, modelRoute: { provider: 'relay', model: 'm2' } }, requestKey: key, route, predictionOffEpoch: 0,
  }), false)

  // The candidate was dismissed/used in the window.
  assert.equal(askStillCurrent({ latest, requestKey: key, route, predictionOffEpoch: 0, hidden: true }), false)

  // No captured state yet.
  assert.equal(askStillCurrent({ latest: null, requestKey: key, route, predictionOffEpoch: 0 }), false)
})
