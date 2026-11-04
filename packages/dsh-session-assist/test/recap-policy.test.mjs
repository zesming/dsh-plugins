import assert from 'node:assert/strict'
import test from 'node:test'

import { isBriefReply } from '../src/shared/recap-policy.mjs'

test('brief reply policy skips empty, short one-sentence, and short two-sentence replies', () => {
  assert.equal(isBriefReply(''), true)
  assert.equal(isBriefReply('已完成。'), true)
  assert.equal(isBriefReply('已完成修复。测试通过。'), true)
  assert.equal(isBriefReply('😀'.repeat(160)), true)
})

test('brief reply policy sends three sentences, long text, and complex structures to the model', () => {
  assert.equal(isBriefReply('结果已完成。检查已通过。还有一项待确认。'), false)
  assert.equal(isBriefReply('word '.repeat(33)), false)
  assert.equal(isBriefReply('- first item\n- second item'), false)
  assert.equal(isBriefReply('```js\nconst ready = true\n```'), false)
  assert.equal(isBriefReply('| key | value |\n| --- | --- |\n| state | ready |'), false)
})

test('sentence counting ignores URL and decimal dots', () => {
  assert.equal(isBriefReply('See https://example.com/docs/v1.2 for details. The value is 3.14.'), true)
})
