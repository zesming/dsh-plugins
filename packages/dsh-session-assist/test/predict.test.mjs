import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAssistanceContext } from '../src/shared/context.mjs'
import { LIMITS } from '../src/shared/limits.mjs'
import { PROMPT_VERSION, createPredictor, routeFromHeader, routeFromProjection } from '../src/host/predict.mjs'

const captured = {
  turn: 3,
  endSeq: 9,
  reason: { kind: 'completed' },
  surfaceGeneration: 4,
  userMessages: [{ seq: 3, text: '按钮已修复，下一步检查键盘焦点。', partial: false }],
  finalText: '结果：按钮已修复。验证：本地检查通过；发布仍待确认。',
  replyPartial: false,
  evidence: [],
  evidencePartial: false,
}
const session = { id: 's1' }
const turn = { ...captured, sourceSelection: { provider: 'p', model: 'm', reasoningEffort: 'high' } }
const context = buildAssistanceContext(turn, [], LIMITS.maxContextBytes, session.id)

function fakeLlm({ output = JSON.stringify({ recap: '按钮已修复，本地检查通过；发布仍待确认。', suggestion: '继续检查键盘焦点顺序。' }), wait = null, finish = { kind: 'stop' } } = {}) {
  const calls = { prepare: 0, stream: 0, config: null, options: null, configure: null }
  return {
    calls,
    async prepareCall(config, signal, configure) {
      calls.prepare += 1
      calls.configure = configure
      const modelInfo = { reasoning: { efforts: [{ id: 'low' }, { id: 'high' }] } }
      const controls = configure({ maxTokens: config.maxTokens }, modelInfo)
      calls.config = { ...config, ...controls }
      return {
        config: calls.config,
        stream: async function* (options) {
          calls.stream += 1
          calls.options = options
          if (wait !== null) {
            await new Promise((resolve, reject) => {
              signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
              wait(resolve)
            })
          }
          yield { type: 'text-delta', text: output }
          yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 15, totalTokens: 25 } }
          yield { type: 'finish', reason: finish }
        },
      }
    },
  }
}

test('predictor sends one tool-free, bounded JSON call and independently validates outputs', async () => {
  const llm = fakeLlm({ output: JSON.stringify({ recap: '完成了焦点修复并通过本地检查，深色模式仍未验证。', suggestion: '继续检查键盘焦点顺序。' }) })
  const audit = []
  const predictor = createPredictor({ getLlm: () => llm, audit: row => audit.push(row) })
  const result = await predictor.generate({ session, turn, context, sourceSelection: turn.sourceSelection, features: { recap: true, prediction: true } })
  assert.deepEqual(result, {
    state: 'ready',
    recap: '完成了焦点修复并通过本地检查，深色模式仍未验证。',
    suggestion: '继续检查键盘焦点顺序。',
    recapReason: null,
    suggestionReason: null,
    route: turn.sourceSelection,
    auxiliaryRoute: { provider: 'p', model: 'm', reasoningEffort: 'low' },
  })
  assert.equal(llm.calls.config.maxTokens, LIMITS.maxOutputTokens)
  assert.equal(llm.calls.config.reasoningEffort, 'low')
  assert.deepEqual(llm.calls.options.tools, [])
  assert.equal(llm.calls.options.sessionId, undefined)
  assert.equal(llm.calls.options.messages[0].role, 'user')
  assert.equal(Array.isArray(llm.calls.options.messages[0].content), true)
  assert.equal(typeof llm.calls.options.messages[0].id, 'string')
  assert.deepEqual(llm.calls.options.messages[0].source, { kind: 'user' })
  assert.match(llm.calls.options.system, /Enabled outputs: recap=true; suggestion=true/u)
  assert.equal(audit.length, 1)
  assert.equal(audit[0].feature, 'recap+prediction')
  assert.deepEqual(audit[0].sourceSelection, turn.sourceSelection)
  assert.deepEqual(audit[0].auxiliaryRoute, { provider: 'p', model: 'm', reasoningEffort: 'low' })
  assert.equal(audit[0].outputChars, [...JSON.stringify({ recap: '完成了焦点修复并通过本地检查，深色模式仍未验证。', suggestion: '继续检查键盘焦点顺序。' })].length)
  assert.equal(audit[0].promptVersion, PROMPT_VERSION)
  assert.equal('text' in audit[0], false)
})

test('valid output fields survive an invalid sibling field', async () => {
  const llm = fakeLlm({ output: JSON.stringify({ recap: '保留有效摘要。', suggestion: 'one line\nsecond line' }) })
  const predictor = createPredictor({ getLlm: () => llm })
  const result = await predictor.generate({ session, turn, context, sourceSelection: turn.sourceSelection, features: { recap: true, prediction: true } })
  assert.equal(result.state, 'ready')
  assert.equal(result.recap, '保留有效摘要。')
  assert.equal(result.suggestion, null)
})

test('disabled outputs are declared in the prompt and ignored from returned JSON', async () => {
  const llm = fakeLlm()
  const predictor = createPredictor({ getLlm: () => llm })
  const result = await predictor.generate({ session, turn, context, sourceSelection: turn.sourceSelection, features: { recap: true, prediction: false } })
  assert.equal(result.recap, '按钮已修复，本地检查通过；发布仍待确认。')
  assert.equal(result.suggestion, null)
  assert.match(llm.calls.options.system, /Enabled outputs: recap=true; suggestion=false/u)
})

test('predictor rejects invalid JSON, non-stop finishes, and timeouts without retry', async () => {
  const invalid = fakeLlm({ output: 'not json' })
  const audit = []
  const predictor = createPredictor({ getLlm: () => invalid, audit: row => audit.push(row) })
  assert.deepEqual((await predictor.generate({ session, turn, context, sourceSelection: turn.sourceSelection, features: { recap: true, prediction: false } })).state, 'none')
  assert.equal(invalid.calls.prepare, 1)
  assert.equal(audit[0].error, 'invalid-json')

  const waiting = fakeLlm({ wait: () => {} })
  const timed = createPredictor({
    getLlm: () => waiting,
    audit: row => audit.push(row),
    limits: { ...LIMITS, timeoutMs: 10 },
  })
  assert.equal((await timed.generate({ session, turn, context, sourceSelection: turn.sourceSelection, features: { recap: true, prediction: false } })).reason, 'timeout')
  assert.equal(waiting.calls.prepare, 1)
  assert.equal(audit.at(-1).error, 'timeout')
})

test('a valid null/null response is audited as an abstention', async () => {
  const llm = fakeLlm({ output: JSON.stringify({ recap: null, suggestion: null }) })
  const audit = []
  const predictor = createPredictor({ getLlm: () => llm, audit: row => audit.push(row) })
  const result = await predictor.generate({ session, turn, context, sourceSelection: turn.sourceSelection, features: { recap: true, prediction: true } })
  assert.deepEqual(result, {
    state: 'none', reason: 'not-needed', recapReason: 'not-needed', suggestionReason: 'not-needed',
    route: turn.sourceSelection, auxiliaryRoute: { provider: 'p', model: 'm', reasoningEffort: 'low' },
  })
  assert.equal(audit[0].error, 'abstained')
})

test('a complete null/null payload with a non-stop finish is unavailable, not an abstention', async () => {
  const llm = fakeLlm({
    output: JSON.stringify({ recap: null, suggestion: null }),
    finish: { kind: 'max-tokens' },
  })
  const audit = []
  const predictor = createPredictor({ getLlm: () => llm, audit: row => audit.push(row) })
  const result = await predictor.generate({ session, turn, context, sourceSelection: turn.sourceSelection, features: { recap: true, prediction: true } })

  assert.equal(result.state, 'none')
  assert.equal(result.reason, 'unavailable')
  assert.equal(result.recapReason, 'unavailable')
  assert.equal(result.recapReason === 'not-needed', false)
  assert.equal(result.suggestionReason, 'unavailable')
  assert.equal(audit.length, 1)
  assert.equal(audit[0].finish, 'max-tokens')
  assert.equal(audit[0].error, 'invalid-output')
})

test('an intentional null recap leaves a valid suggestion available', async () => {
  const llm = fakeLlm({ output: JSON.stringify({ recap: null, suggestion: '继续检查键盘焦点顺序。' }) })
  const predictor = createPredictor({ getLlm: () => llm })
  const result = await predictor.generate({ session, turn, context, sourceSelection: turn.sourceSelection, features: { recap: true, prediction: true } })
  assert.equal(result.state, 'ready')
  assert.equal(result.recap, null)
  assert.equal(result.recapReason, 'not-needed')
  assert.equal(result.suggestion, '继续检查键盘焦点顺序。')
  assert.equal(result.suggestionReason, null)
})

test('an invalid recap value stays distinguishable from an intentional null', async () => {
  const llm = fakeLlm({ output: JSON.stringify({ recap: 42, suggestion: '继续检查键盘焦点顺序。' }) })
  const predictor = createPredictor({ getLlm: () => llm })
  const result = await predictor.generate({ session, turn, context, sourceSelection: turn.sourceSelection, features: { recap: true, prediction: true } })
  assert.equal(result.recap, null)
  assert.equal(result.recapReason, 'unavailable')
  assert.equal(result.suggestion, '继续检查键盘焦点顺序。')
})

test('predictor declines missing route/context and never reads durable Session history', async () => {
  let calls = 0
  const predictor = createPredictor({ getLlm: () => ({ prepareCall: async () => { calls += 1 } }) })
  assert.equal((await predictor.generate({ session, turn, context, features: { recap: true } })).reason, 'no-context')
  assert.equal((await predictor.generate({ session, turn, context: { messages: [] }, sourceSelection: turn.sourceSelection, features: { recap: true } })).reason, 'no-context')
  assert.equal(calls, 0)
  assert.equal(typeof session.deriveMessages, 'undefined')
})

test('route helpers omit adapter-default effort and fall back to the current projection', () => {
  assert.deepEqual(routeFromHeader({
    config: { provider: 'p', model: 'm', reasoningEffort: 'high' },
    adapterDefaults: { reasoningEffort: true },
  }), { provider: 'p', model: 'm' })
  assert.deepEqual(routeFromHeader({ config: { provider: 'p', model: 'm', reasoningEffort: 'high' } }), {
    provider: 'p', model: 'm', reasoningEffort: 'high',
  })
  assert.deepEqual(routeFromProjection({ modelSelection: { next: { provider: 'p2', model: 'm2' } } }), { provider: 'p2', model: 'm2' })
  assert.deepEqual(routeFromProjection({ modelSelection: { lastUsed: { provider: 'p3', model: 'm3', reasoningEffort: 'low' } } }), {
    provider: 'p3', model: 'm3', reasoningEffort: 'low',
  })
})
