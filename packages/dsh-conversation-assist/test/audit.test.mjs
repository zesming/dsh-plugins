import assert from 'node:assert/strict'
import test from 'node:test'

import { createAuditRecord } from '../src/shared/audit.mjs'

test('audit distinguishes the captured source selection from auxiliary execution route', () => {
  const record = createAuditRecord({
    at: 1_700_000_000_000,
    sessionId: 's1',
    turn: 3,
    endSeq: 9,
    sourceSelection: { provider: 'primary', model: 'large', reasoningEffort: 'high' },
    auxiliaryRoute: { provider: 'primary', model: 'large', reasoningEffort: 'low' },
    feature: 'recap+prediction',
    messageCount: 1,
    inputBytes: 1234,
    maxTokens: 1024,
    finish: 'stop',
    outputChars: 120,
    durationMs: 800,
    promptVersion: 5,
    usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13, providerText: 'not allowed' },
    text: 'must never be written',
    suggestion: 'must never be written',
  })
  assert.deepEqual(record.sourceSelection, { provider: 'primary', model: 'large', reasoningEffort: 'high' })
  assert.deepEqual(record.auxiliaryRoute, { provider: 'primary', model: 'large', reasoningEffort: 'low' })
  assert.equal(record.feature, 'recap+prediction')
  assert.equal(record.outputChars, 120)
  assert.equal(record.promptVersion, 5)
  assert.deepEqual(record.usage, { inputTokens: 10, outputTokens: 3, totalTokens: 13 })
  assert.equal('text' in record, false)
  assert.equal('suggestion' in record, false)
  assert.equal('messages' in record, false)
})

test('audit omits unknown route details and tolerates absent metadata', () => {
  const record = createAuditRecord({ sessionId: 's1', turn: 1, sourceSelection: { provider: 'p' }, error: 'x'.repeat(120) })
  assert.equal(record.endSeq, null)
  assert.equal(record.sourceSelection, null)
  assert.equal(record.auxiliaryRoute, null)
  assert.equal(record.error.length, 96)
  assert.equal(record.usage, undefined)
})
