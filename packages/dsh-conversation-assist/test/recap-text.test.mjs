import assert from 'node:assert/strict'
import test from 'node:test'

import { en, zh } from '../src/shared/locales.mjs'
import { composeRecap, excerptPreview } from '../src/shared/recap-text.mjs'

const tFor = rows => key => rows[key] ?? key
const value = (overrides = {}) => ({
  turn: 1, calls: 3, failures: 1, unknown: 0, pending: 0, hasReply: true,
  reasonKind: 'completed', cancelKind: undefined, errorCode: undefined, ...overrides,
})

test('normal completed turns use the model recap separately from the reply excerpt', () => {
  assert.equal(composeRecap(value({ lastText: '已完成本轮。' }), tFor(zh)), '')
  assert.equal(composeRecap(value({ hasReply: false, finalReply: false }), tFor(zh)), '本轮没有文字回复。')
  assert.equal(composeRecap(value({ hasReply: false, finalReply: false }), tFor(en)), 'No reply text this turn.')
})

test('abnormal endings name the logged state without claiming the task completed', () => {
  const cases = [
    [{ reasonKind: 'aborted', cancelKind: 'user' }, /已停止（用户取消）。/u, /stopped \(cancelled by the user\)/iu],
    [{ reasonKind: 'blocked' }, /被阻塞/u, /blocked and needs attention/iu],
    [{ reasonKind: 'error', errorCode: 'RATE_LIMIT' }, /本轮失败（RATE_LIMIT）。/u, /failed \(RATE_LIMIT\)/iu],
    [{ reasonKind: 'max-tokens' }, /达到上限并被截断/u, /hit the output limit and was truncated/iu],
    [{ reasonKind: 'interrupted' }, /恢复时闭合/u, /closed during recovery/iu],
    [{ reasonKind: 'forked' }, /截断的分叉/u, /truncated fork/iu],
    [{ reasonKind: 'unknown' }, /未知原因/u, /unknown reason/iu],
  ]
  for (const [patch, zhPattern, enPattern] of cases) {
    assert.match(composeRecap(value(patch), tFor(zh)), zhPattern)
    assert.match(composeRecap(value(patch), tFor(en)), enPattern)
  }
})

test('excerpt preview is the only collapsed shortening and leaves expanded text intact', () => {
  const full = '甲'.repeat(240) + '\n\n乙段仍完整。'
  const preview = excerptPreview(full, 180)
  assert.equal([...preview].length, 181)
  assert.ok(full.startsWith(preview.slice(0, 180)))
  assert.match(full, /乙段仍完整/u)
  assert.equal(excerptPreview('多块文本\n\n后段。'), '多块文本\n\n后段。')
})

test('recap copy prefixes generated text and keeps history and excerpt labels explicit', () => {
  for (const rows of [zh, en]) {
    const all = Object.values(rows).join('\n')
    assert.ok(rows['recap.ariaLabel'])
    assert.match(rows['recap.prefix'], /^(回顾：|Recap: )$/u)
    assert.match(all, /历史轮次|Historical turn/u)
    assert.match(all, /完整内容见上方|full text is above/u)
  }
  assert.doesNotMatch([...Object.values(zh), ...Object.values(en)].join('\n'), /免费|零成本|不产生费用|free|no cost/iu)
})
