import assert from 'node:assert/strict'
import test from 'node:test'

import { createSuggestionGate, localDayKey } from '../src/host/gate.mjs'

test('the shared gate enforces the global concurrency cap', () => {
  const gate = createSuggestionGate({ limits: { maxConcurrent: 1 } })
  assert.equal(gate.take('s1'), true)
  assert.equal(gate.active(), 1)
  assert.equal(gate.take('s2'), false)
  gate.release()
  assert.equal(gate.active(), 0)
  assert.equal(gate.take('s2'), true)
  gate.release()
})

test('the persistent attempt ledger uses the local calendar day', () => {
  const local = new Date(2026, 0, 2, 0, 30)
  assert.equal(localDayKey(local.getTime()), '2026-01-02')
})
