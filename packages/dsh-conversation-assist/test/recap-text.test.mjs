import assert from 'node:assert/strict'
import test from 'node:test'

import { en, zh } from '../src/shared/locales.mjs'
import { composeRecap } from '../src/shared/recap-text.mjs'

const tFor = rows => key => rows[key]
const value = (overrides = {}) => ({
  turn: 1, calls: 3, failures: 1, unknown: 0, pending: 0, hasReply: true,
  reasonKind: 'completed', cancelKind: undefined, errorCode: undefined, ...overrides,
})

test('completed recaps keep the failure and never claim the task is done', () => {
  const text = composeRecap(value(), tFor(zh))
  assert.match(text, /^本轮已结束/u)
  assert.match(text, /3 个工具调用/u)
  assert.match(text, /1 个失败/u)
  assert.doesNotMatch(text, /任务完成|全部完成|已上线|已发布成功/u)
  assert.ok(text.length <= 400)
})

test('every terminal reason composes a sentence in both languages', () => {
  const cases = [
    [{ reasonKind: 'aborted', cancelKind: 'user' }, /已停止（用户取消）/u, /Stopped \(cancelled by the user\)/u],
    [{ reasonKind: 'blocked' }, /被阻塞/u, /Blocked/u],
    [{ reasonKind: 'error', errorCode: 'RATE_LIMIT' }, /本轮失败（RATE_LIMIT）/u, /Turn failed \(RATE_LIMIT\)/u],
    [{ reasonKind: 'max-tokens', hasReply: false }, /输出达到上限被截断/u, /Output hit the token limit/u],
    [{ reasonKind: 'interrupted' }, /恢复闭合/u, /closed during recovery/u],
    [{ reasonKind: 'forked' }, /分叉时继承截断/u, /inherited from a truncated fork/u],
    [{ reasonKind: 'unknown' }, /未知原因/u, /unknown reason/u],
  ]
  for (const [patch, zhPattern, enPattern] of cases) {
    const zhText = composeRecap(value(patch), tFor(zh))
    const enText = composeRecap(value(patch), tFor(en))
    assert.match(zhText, zhPattern)
    assert.match(enText, enPattern)
    assert.ok(zhText.length <= 400)
    assert.ok(enText.length <= 400)
  }
})

test('a turn with no confirmable progress gets a neutral sentence', () => {
  assert.match(composeRecap(value({ calls: 0, failures: 0, pending: 0, hasReply: false }), tFor(zh)), /没有可确认的新进展/u)
  assert.match(composeRecap(value({ calls: 0, failures: 0, pending: 0, hasReply: false }), tFor(en)), /No confirmable progress/u)
})

test('pending and unconfirmed results are stated explicitly', () => {
  const text = composeRecap(value({ pending: 2, unknown: 1, hasReply: false }), tFor(zh))
  assert.match(text, /2 个结果未返回/u)
  assert.match(text, /1 个结果未确认/u)
  assert.match(text, /没有正文/u)
})

test('recap copy never uses the forbidden cost words', () => {
  const all = [...Object.values(zh), ...Object.values(en)].join('\n')
  assert.doesNotMatch(all, /免费|零成本|不产生费用|free|no cost/iu)
})
