import assert from 'node:assert/strict'
import test from 'node:test'

import {
  channelOf, dayKey, foldSession, isSubagentSession, mergeInto, serialize, windowModels, withoutSubagents,
} from '../src/usage.js'

/** Build one `assistant/message` event with provider-reported usage. */
function message(options = {}) {
  return {
    type: 'assistant/message',
    seq: options.seq ?? 0,
    time: options.time ?? Date.UTC(2026, 9, 21, 4, 0, 0),
    data: {
      turn: 1,
      step: 1,
      message: { role: 'assistant', content: [], source: { kind: 'model', provider: options.provider ?? 'deepseek-account', model: options.model ?? 'deepseek-v4' } },
      ...options.usage === null ? {} : {
        usage: options.usage ?? { inputTokens: 10, outputTokens: 5, totalTokens: 100, cacheReadTokens: 85 },
      },
    },
  }
}

test('channels classify providers and never invent an account', () => {
  assert.equal(channelOf('deepseek-account'), 'official')
  assert.equal(channelOf('deepseek'), 'apikey')
  assert.equal(channelOf('super-relay'), 'relay')
  assert.equal(channelOf(undefined), 'unknown')
})

test('day keys follow the local calendar', () => {
  const local = new Date(2026, 9, 21, 23, 30, 0)
  assert.equal(dayKey(local.getTime()), '2026-10-21')
})

test('subagent detection reads both signals', () => {
  assert.equal(isSubagentSession({ origin: 'subagent' }), true)
  assert.equal(isSubagentSession({ origin: 'root', parentSession: 'session-x' }), true)
  assert.equal(isSubagentSession({ origin: 'root', parentSession: null }), false)
  assert.equal(isSubagentSession(undefined), false)
})

test('one session folds into per-model and per-day buckets', () => {
  const records = foldSession([
    message({ time: new Date(2026, 9, 20, 10, 0, 0).getTime() }),
    message({ time: new Date(2026, 9, 21, 10, 0, 0).getTime() }),
    { type: 'tool/call', seq: 2, time: Date.now(), data: {} },
  ], new Map())

  const record = records.get('deepseek-account::deepseek-v4')
  assert.ok(record)
  assert.equal(record.channel, 'official')
  assert.equal(record.totals.total, 200)
  assert.equal(record.totals.calls, 2)
  assert.deepEqual([...record.days.keys()].sort(), ['2026-10-20', '2026-10-21'])
  assert.equal(record.days.get('2026-10-21').total, 100)
})

test('events without usage are skipped instead of estimated', () => {
  const records = foldSession([
    message({ usage: null }),
    { type: 'assistant/message', seq: 1, time: Date.now(), data: { message: { source: { provider: 'deepseek', model: 'x' } } } },
  ], new Map())
  assert.equal(records.size, 0)
})

test('negative and non-finite counts never reach the totals', () => {
  const records = foldSession([
    message({ usage: { inputTokens: -5, outputTokens: Number.NaN, totalTokens: -1, cacheReadTokens: 'x' } }),
  ], new Map())
  const record = records.get('deepseek-account::deepseek-v4')
  assert.equal(record.totals.total, 0)
  assert.equal(record.totals.calls, 1)
})

test('two sessions for one model merge instead of overwriting', () => {
  const left = foldSession([message()], new Map())
  const right = foldSession([message()], new Map())
  const merged = mergeInto(left, right)
  assert.equal(merged.get('deepseek-account::deepseek-v4').totals.total, 200)
  assert.equal(merged.get('deepseek-account::deepseek-v4').days.get('2026-10-21').calls, 2)
})

test('subagent usage is recorded separately while staying in the total', () => {
  const records = foldSession([message()], new Map(), { subagent: true })
  const record = records.get('deepseek-account::deepseek-v4')
  assert.equal(record.totals.total, 100)
  assert.equal(record.subagentTotals.total, 100)
  assert.equal(record.subagentDays.get('2026-10-21').total, 100)
})

test('serialization sorts models by size and maps days to plain objects', () => {
  const records = foldSession([message({ model: 'small', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 5, cacheReadTokens: 0 } })], new Map())
  foldSession([message({ model: 'big', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 500, cacheReadTokens: 0 } })], records, { subagent: true })
  const { models, channels } = serialize(records, { includeSubagents: true })
  assert.deepEqual(models.map(row => row.model), ['big', 'small'])
  assert.equal(channels.official.total, 505)
  assert.equal(models[0].subagent.totals.total, 500)
})

test('the window drops days outside it and models left with nothing', () => {
  const records = foldSession([
    message({ time: new Date(2026, 9, 1, 10).getTime(), model: 'old' }),
    message({ time: new Date(2026, 9, 21, 10).getTime(), model: 'new' }),
  ], new Map())
  const { models } = serialize(records, { includeSubagents: true })
  const windowed = windowModels(models, { from: '2026-10-20' })
  assert.deepEqual(windowed.map(row => row.model), ['new'])
  assert.equal(windowed[0].totals.total, 100)
})

test('excluding subagents subtracts them from the window', () => {
  const records = foldSession([message()], new Map(), { subagent: true })
  const { models } = serialize(records, { includeSubagents: true })
  const filtered = windowModels(models, { from: '2026-10-01', excludeSubagents: true })
  assert.equal(filtered.length, 0)
})

test('unknown providers and models stay attributed rather than guessed', () => {
  const records = foldSession([message({ provider: '', model: '' })], new Map())
  const record = records.get('unknown::unknown')
  assert.ok(record)
  assert.equal(record.channel, 'unknown')
})

test('a fully delegated day disappears rather than showing zero', () => {
  const days = { '2026-10-21': { total: 50, calls: 1, input: 1, output: 1, cacheRead: 48 } }
  const subagent = { '2026-10-21': { total: 50, calls: 1, input: 1, output: 1, cacheRead: 48 } }
  assert.deepEqual(withoutSubagents(days, subagent), {})
})

test('a partially delegated day keeps its remaining work', () => {
  const days = { '2026-10-21': { total: 100, calls: 2, input: 4, output: 2, cacheRead: 94 } }
  const subagent = { '2026-10-21': { total: 40, calls: 1, input: 1, output: 0, cacheRead: 39 } }
  assert.deepEqual(withoutSubagents(days, subagent), {
    '2026-10-21': { total: 60, calls: 1, input: 3, output: 2, cacheRead: 55 },
  })
})

test('subtraction never produces a negative counter', () => {
  const days = { '2026-10-21': { total: 10, calls: 1, input: 1, output: 1, cacheRead: 8 } }
  const subagent = { '2026-10-21': { total: 99, calls: 5, input: 9, output: 9, cacheRead: 81 } }
  assert.deepEqual(withoutSubagents(days, subagent), {})
})

test('a day with no delegated usage is untouched', () => {
  const days = { '2026-10-21': { total: 10, calls: 1, input: 1, output: 1, cacheRead: 8 } }
  assert.deepEqual(withoutSubagents(days, {}), days)
  assert.deepEqual(withoutSubagents(days, undefined), days)
})

test('the host and the client agree on the exclusion', () => {
  const records = foldSession([message(), message()], new Map(), { subagent: true })
  const { models } = serialize(records, { includeSubagents: true })
  const viaHost = windowModels(models, { from: '2026-10-01', excludeSubagents: true })
  const viaClient = withoutSubagents(models[0].days, models[0].subagent.days)
  assert.deepEqual(viaHost, [])
  assert.deepEqual(viaClient, {})
})

test('the fold drops events outside the window before bucketing them', () => {
  const inWindow = { ...message(), time: new Date(2026, 9, 21, 10).getTime() }
  const tooOld = { ...message(), time: new Date(2026, 8, 1, 10).getTime() }
  const tooNew = { ...message(), time: new Date(2026, 9, 25, 10).getTime() }
  const records = foldSession([tooOld, inWindow, tooNew], new Map(), { from: '2026-10-19', until: '2026-10-21' })
  const record = records.get('deepseek-account::deepseek-v4')
  assert.equal(record.totals.total, 100)
  assert.deepEqual([...record.days.keys()], ['2026-10-21'])
})

test('the window upper bound includes its own day', () => {
  const records = foldSession([message()], new Map(), { until: '2026-10-21' })
  assert.equal(records.get('deepseek-account::deepseek-v4').totals.total, 100)
})
