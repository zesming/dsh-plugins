import assert from 'node:assert/strict'
import test from 'node:test'

import { createAuditRecord } from '../src/shared/audit.mjs'

test('an audit row carries attribution and counts, never content', () => {
  const record = createAuditRecord({
    at: 1_700_000_000_000,
    sessionId: 's1',
    turn: 3,
    endSeq: 9,
    provider: 'p',
    model: 'm',
    messageCount: 4,
    inputBytes: 1234,
    maxTokens: 64,
    finish: 'stop',
    outputChars: 12,
    durationMs: 800,
    promptVersion: 4,
    usage: { inputTokens: 10, outputTokens: 3 },
  })
  assert.equal(record.sessionId, 's1')
  assert.equal(record.outputChars, 12)
  assert.equal(record.promptVersion, 4)
  assert.deepEqual(record.usage, { inputTokens: 10, outputTokens: 3 })
  assert.equal('text' in record, false)
  assert.equal('messages' in record, false)
})

test('an audit row tolerates missing optional fields', () => {
  const record = createAuditRecord({ sessionId: 's1', turn: 1 })
  assert.equal(record.endSeq, null)
  assert.equal(record.provider, null)
  assert.equal(record.error, null)
})
