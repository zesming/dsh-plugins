import assert from 'node:assert/strict'
import test from 'node:test'

import { createSuggestionGate, localDayKey } from '../src/host/gate.mjs'

test('a Turn is remembered with its outcome and forgotten on the next Turn', () => {
  const gate = createSuggestionGate()
  assert.deepEqual(gate.check('s1', 1), { hit: false })
  gate.remember('s1', 1, 'next message')
  assert.deepEqual(gate.check('s1', 1), { hit: true, text: 'next message' })
  assert.deepEqual(gate.check('s1', 2), { hit: false })
  gate.remember('s1', 2, undefined)
  assert.deepEqual(gate.check('s1', 2), { hit: true, none: true })
  gate.forgetCandidate('s1')
  assert.deepEqual(gate.check('s1', 2), { hit: false })
})

test('a late old attempt cannot overwrite a newer Turn', () => {
  const gate = createSuggestionGate()
  gate.remember('s1', 2, 'newer')
  gate.remember('s1', 1, 'older')
  assert.deepEqual(gate.check('s1', 2), { hit: true, text: 'newer' })
})

test('the daily budget counts attempts per Session and survives a candidate reset', () => {
  const gate = createSuggestionGate({ limits: { dailyPerSession: 1, maxConcurrent: 2 } })
  assert.equal(gate.take('s1'), true)
  gate.remember('s1', 1, 'x')
  gate.forgetCandidate('s1')
  assert.equal(gate.take('s1'), false)
  gate.release()
  assert.equal(gate.take('s2'), true)
  gate.release()
  gate.clear('s1')
  assert.equal(gate.take('s1'), true)
})

test('concurrency is a global cap released explicitly', () => {
  const gate = createSuggestionGate({ limits: { dailyPerSession: 10, maxConcurrent: 1 } })
  assert.equal(gate.take('s1'), true)
  assert.equal(gate.active(), 1)
  assert.equal(gate.take('s2'), false)
  gate.release()
  assert.equal(gate.active(), 0)
  assert.equal(gate.take('s2'), true)
})

test('the daily key is the local calendar day', () => {
  const local = new Date(2026, 0, 2, 0, 30)
  assert.equal(localDayKey(local.getTime()), '2026-01-02')
})
