import assert from 'node:assert/strict'
import test from 'node:test'

import { LIMITS } from '../src/shared/limits.mjs'
import { zh } from '../src/shared/locales.mjs'
import { composeRecap } from '../src/shared/recap-text.mjs'
import { createPredictor, routeFromHeader, routeFromProjection } from '../src/host/predict.mjs'

const session = {
  id: 's1',
  deriveMessages: () => [
    { role: 'user', content: [{ type: 'text', text: '把按钮改成圆角' }] },
    { role: 'assistant', content: [{ type: 'text', text: '已修改。' }] },
  ],
}
const turn = { turn: 3, endSeq: 9, reason: { kind: 'completed' }, header: { provider: 'p', model: 'm' } }
const chunks = [
  { type: 'text-delta', index: 0, text: '补一个 ' },
  { type: 'text-delta', index: 0, text: 'hover 测试' },
  { type: 'usage', usage: { inputTokens: 10, outputTokens: 3 } },
  { type: 'finish', reason: { kind: 'stop' } },
]

function fakeLlm({ result = chunks, wait = null } = {}) {
  const calls = { prepare: 0, stream: 0, config: null, options: null }
  return {
    calls,
    async prepareCall(config, signal) {
      calls.prepare += 1
      calls.config = config
      return {
        config,
        stream: async function* (options) {
          calls.stream += 1
          calls.options = options
          if (wait !== null) {
            await new Promise((resolve, reject) => {
              signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
              wait(resolve)
            })
          }
          for (const chunk of result) yield chunk
        },
      }
    },
  }
}

test('predictor prepares one bounded call and sanitizes the stream', async () => {
  const llm = fakeLlm()
  const audit = []
  const predictor = createPredictor({
    getLlm: () => llm,
    resolveRoute: () => ({ provider: 'p', model: 'm' }),
    audit: record => audit.push(record),
  })
  const result = await predictor.generate({ session, turn, language: 'zh-CN' })
  assert.deepEqual(result, { state: 'ready', text: '补一个 hover 测试', turn: 3, endSeq: 9 })
  assert.equal(llm.calls.config.maxTokens, LIMITS.maxOutputTokens)
  assert.equal(llm.calls.options.messages.length, 2)
  assert.match(llm.calls.options.system, /Chinese/u)
  assert.equal(llm.calls.options.tools, undefined)
  assert.equal(audit.length, 1)
  assert.equal(audit[0].outputChars, 12)
  assert.equal(audit[0].error, null)
  assert.equal('text' in audit[0], false)
})

test('predictor rejects a stream that did not finish with stop', async () => {
  const llm = fakeLlm({ result: [{ type: 'text-delta', index: 0, text: 'x' }, { type: 'finish', reason: { kind: 'max-tokens' } }] })
  const audit = []
  const predictor = createPredictor({ getLlm: () => llm, resolveRoute: () => ({ provider: 'p', model: 'm' }), audit: r => audit.push(r) })
  assert.deepEqual(await predictor.generate({ session, turn, language: 'en' }), { state: 'none' })
  assert.equal(audit[0].error, 'invalid-output')
})

test('recap composition stays under the hard bound even for a long code', () => {
  const text = composeRecap({
    calls: 0, failures: 0, unknown: 0, pending: 0, hasReply: true,
    reasonKind: 'error', errorCode: 'X'.repeat(400),
  }, key => zh[key])
  assert.ok(text.length <= 400)
})

test('predictor returns none without a model or a route', async () => {
  const predictor = createPredictor({ getLlm: () => undefined, resolveRoute: () => undefined })
  assert.deepEqual(await predictor.generate({ session, turn, language: 'en' }), { state: 'none' })
  const routed = createPredictor({ getLlm: () => fakeLlm(), resolveRoute: () => undefined })
  assert.deepEqual(await routed.generate({ session, turn, language: 'en' }), { state: 'none' })
})

test('predictor reports a timeout through the audit and returns none', async () => {
  const llm = fakeLlm({ wait: () => { /* never resolves before abort */ } })
  const audit = []
  const predictor = createPredictor({
    getLlm: () => llm,
    resolveRoute: () => ({ provider: 'p', model: 'm' }),
    audit: r => audit.push(r),
    limits: { ...LIMITS, timeoutMs: 10 },
  })
  assert.deepEqual(await predictor.generate({ session, turn, language: 'en' }), { state: 'none' })
  assert.equal(audit.at(-1).error, 'timeout')
})

test('route helpers read the header first and the projection as a fallback', () => {
  assert.deepEqual(routeFromHeader({ provider: 'p', model: 'm', reasoningEffort: 'low' }), { provider: 'p', model: 'm', reasoningEffort: 'low' })
  assert.equal(routeFromHeader({ provider: '', model: 'm' }), undefined)
  assert.deepEqual(routeFromProjection({ modelSelection: { next: { provider: 'p', model: 'm' } } }), { provider: 'p', model: 'm' })
  assert.deepEqual(routeFromProjection({ modelSelection: { lastUsed: { provider: 'p2', model: 'm2' } } }), { provider: 'p2', model: 'm2' })
})
