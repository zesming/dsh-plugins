import assert from 'node:assert/strict'
import test from 'node:test'

import { en, zh } from '../src/shared/locales.mjs'
import { composeRecap } from '../src/shared/recap-text.mjs'

const tFor = rows => key => rows[key]
const value = (overrides = {}) => ({
  turn: 1, calls: 3, failures: 1, unknown: 0, pending: 0, hasReply: true,
  reasonKind: 'completed', cancelKind: undefined, errorCode: undefined, ...overrides,
})

test('a completed recap carries the reply lead and no tool counts', () => {
  const text = composeRecap(value({ lastText: '修复了 finish 契约。补了测试。' }), tFor(zh))
  assert.match(text, /^回顾：/u)
  assert.match(text, /修复了 finish 契约。/u)
  assert.doesNotMatch(text, /工具调用|个失败|未确认|下一步由你决定/u)
  assert.doesNotMatch(text, /任务完成|全部完成|已上线|已发布成功/u)
  assert.ok(text.length <= 400)
})

test('a completed turn without reply text says so plainly', () => {
  assert.equal(composeRecap(value({ lastText: undefined }), tFor(zh)), '本轮没有文字回复。')
  assert.equal(composeRecap(value({ lastText: undefined }), tFor(en)), 'No reply text this turn.')
})

test('the reply lead is the first sentence, bounded', () => {
  const text = composeRecap(value({ lastText: '第一句话在这里。第二句话不应该出现。' }), tFor(zh))
  assert.match(text, /第一句话在这里。/u)
  assert.doesNotMatch(text, /第二句话/u)
  const long = composeRecap(value({ lastText: '甲'.repeat(200) }), tFor(zh))
  assert.ok([...long].length <= 400)
  assert.match(long, /…$/u)
})

test('every terminal reason composes a sentence in both languages', () => {
  const cases = [
    [{ reasonKind: 'aborted', cancelKind: 'user', lastText: '已改完两处。' }, /已停止（用户取消）。已改完两处。/u, /Stopped \(cancelled by the user\)\. 已改完两处。/u],
    [{ reasonKind: 'blocked', lastText: '等待权限。' }, /被阻塞：需要你处理后才能继续。等待权限。/u, /Blocked: your action is needed before continuing\. 等待权限。/u],
    [{ reasonKind: 'error', errorCode: 'RATE_LIMIT', lastText: '重试了一次。' }, /本轮失败（RATE_LIMIT）。重试了一次。/u, /Turn failed \(RATE_LIMIT\)\. 重试了一次。/u],
    [{ reasonKind: 'max-tokens', lastText: '输出到一半。' }, /输出达到上限被截断。输出到一半。/u, /Output hit the token limit and was truncated\. 输出到一半。/u],
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

test('an aborted turn without reply text still names the cause', () => {
  assert.equal(composeRecap(value({ reasonKind: 'aborted', cancelKind: 'parent', lastText: undefined }), tFor(zh)), '已停止（父会话取消）。')
})

test('recap copy never uses the forbidden cost words', () => {
  const all = [...Object.values(zh), ...Object.values(en)].join('\n')
  assert.doesNotMatch(all, /免费|零成本|不产生费用|free|no cost/iu)
})
