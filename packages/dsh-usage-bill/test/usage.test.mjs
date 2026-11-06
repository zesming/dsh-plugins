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

/**
 * Beijing wall-clock instant. Tier is decided on the Beijing clock, so the
 * peak/off-peak tests build their instants explicitly instead of in machine
 * local time (which is what made them red outside UTC+8).
 */
function beijing(year, month, day, hour, minute = 0) {
  return Date.UTC(year, month - 1, day, hour - 8, minute, 0)
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

test('events without a timestamp are skipped, never dated to fold time (F-16)', () => {
  // A missing instant must not be invented: placing it at "now" would lie about
  // both the calendar day and the peak/off-peak tier. The helper fills a
  // default time with ??, so strip/override the field to build real untimed
  // events.
  const untimed = () => message()
  for (const time of [undefined, null, NaN, '2026-10-21']) {
    const event = untimed()
    if (time === undefined) delete event.time
    else event.time = time
    const records = foldSession([event], new Map())
    assert.equal(records.size, 0, `time ${String(time)} must be dropped, not folded`)
  }
  // A finite-time event still folds alongside the dropped ones.
  const timed = message({ time: Date.UTC(2026, 9, 21, 4, 0, 0) })
  const records = foldSession([untimed(), timed].map((event, index) => {
    if (index === 0) delete event.time
    return event
  }), new Map())
  const record = records.get('deepseek-account::deepseek-v4')
  assert.equal(record.totals.calls, 1)
  assert.equal([...record.days.keys()].length, 1)
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
    '2026-10-21': { total: 60, calls: 1, input: 3, output: 2, cacheRead: 55, peak: { input: 0, output: 0, cacheRead: 0 } },
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

test('a call is billed at the tier of its own instant', () => {
  // 2026-10-21 is a Wednesday. 10:00 Beijing falls in the morning peak block;
  // 22:00 Beijing is off-peak. Instants are expressed on the Beijing clock so
  // the tier assertion holds in any machine timezone.
  const peakInstant = beijing(2026, 10, 21, 10)
  const offPeakInstant = beijing(2026, 10, 21, 22)
  const id = 'deepseek-account::deepseek-v4'

  const peakRecord = foldSession([message({ time: peakInstant })], new Map()).get(id)
  const offPeakRecord = foldSession([message({ time: offPeakInstant })], new Map()).get(id)
  assert.equal(peakRecord.totals.peak.input, 10)
  assert.equal(offPeakRecord.totals.peak.input, 0, 'the 22:00 call contributes nothing to peak')

  const together = foldSession(
    [message({ time: peakInstant }), message({ time: offPeakInstant })],
    new Map(),
  ).get(id)
  assert.equal(together.totals.total, 200)
  // Only the morning call contributes to the peak subset.
  assert.equal(together.totals.peak.input, 10)
  assert.equal(together.totals.peak.output, 5)
  assert.equal(together.totals.peak.cacheRead, 85)
  // Attribute through the viewer-local day key derived from the instant, not a
  // hardcoded date that shifts when the machine timezone changes.
  assert.equal(together.days.get(dayKey(peakInstant)).peak.input, 10)
})

test('a weekend call is never billed at the peak rate', () => {
  // 2026-10-24 10:00 Beijing is a Saturday.
  const record = foldSession(
    [message({ time: beijing(2026, 10, 24, 10) })],
    new Map(),
  ).get('deepseek-account::deepseek-v4')
  assert.equal(record.totals.peak.input, 0)
  assert.equal(record.totals.total, 100)
})

test('merging sessions keeps the peak subset consistent with the total', () => {
  const peakOnly = foldSession([message({ time: beijing(2026, 10, 21, 10) })], new Map())
  const offPeakOnly = foldSession([message({ time: beijing(2026, 10, 21, 22) })], new Map())
  assert.equal(offPeakOnly.get('deepseek-account::deepseek-v4').totals.peak.input, 0)
  const merged = mergeInto(peakOnly, offPeakOnly)
  const record = merged.get('deepseek-account::deepseek-v4')
  assert.equal(record.totals.calls, 2)
  assert.equal(record.totals.total, 200)
  assert.equal(record.totals.peak.input, 10, 'the off-peak session adds nothing to the peak subset')
})

test('excluding subagents removes their peak usage too', () => {
  const days = { '2026-10-21': { input: 10, output: 5, cacheRead: 85, total: 100, calls: 2, peak: { input: 6, output: 3, cacheRead: 51 } } }
  const subagentDays = { '2026-10-21': { input: 4, output: 2, cacheRead: 34, total: 40, calls: 1, peak: { input: 2, output: 1, cacheRead: 17 } } }
  const remaining = withoutSubagents(days, subagentDays)
  assert.equal(remaining['2026-10-21'].total, 60)
  assert.equal(remaining['2026-10-21'].peak.input, 4, 'the expensive calls leave with the subagent share')
})

test('serialization deep-copies the peak sub-tally', () => {
  const records = foldSession([message({ time: beijing(2026, 10, 21, 10) })], new Map())
  const { models } = serialize(records, { includeSubagents: false })
  const row = models[0]
  const live = records.get(row.id)
  row.totals.peak.input = 999
  assert.equal(live.totals.peak.input, 10, 'the payload must not alias the live accumulator')
})
