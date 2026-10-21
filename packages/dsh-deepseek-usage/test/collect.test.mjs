import assert from 'node:assert/strict'
import test from 'node:test'

import { SESSION_LIMIT, collectUsage, daysAgo } from '../src/collect.js'

/** Epoch milliseconds for a local calendar day, `offset` days from today. */
function dayOffset(offset) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.getTime()
}

/** One message event contributing `total` tokens. */
function message(total, provider = 'deepseek-account', model = 'deepseek-v4') {
  return {
    type: 'assistant/message',
    time: Date.now(),
    data: {
      message: { source: { provider, model } },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: total, cacheReadTokens: 0 },
    },
  }
}

/** A query service over in-memory sessions. */
function query(sessions) {
  return {
    listSessions: async () => sessions.map(session => ({ header: session.header })),
    readSession: async id => {
      const found = sessions.find(session => session.header.id === id)
      if (found === undefined) throw new Error('missing')
      return { events: found.events }
    },
  }
}

test('daysAgo walks local calendar days', () => {
  const today = new Date(2026, 9, 21, 0, 30)
  assert.equal(daysAgo(today, 0), '2026-10-21')
  assert.equal(daysAgo(today, 1), '2026-10-20')
  assert.equal(daysAgo(today, 30), '2026-09-21')
})

test('a missing query service reports unavailability', async () => {
  const result = await collectUsage({ sessionQuery: undefined, now: Date.now() })
  assert.equal(result.available, false)
  assert.equal(result.error, 'session-query-unavailable')
})

test('events outside the window are excluded even from an old Session', async () => {
  // A Session created 400 days ago may have been resumed yesterday, so the
  // window is applied to events, never to the header's creation date.
  const oldEvent = { ...message(900), time: dayOffset(-400) }
  const recentEvent = { ...message(100), time: dayOffset(-1) }
  const service = query([
    { header: { id: 'old', createdAt: dayOffset(-400), origin: 'root', parentSession: null }, events: [oldEvent, recentEvent] },
  ])
  const result = await collectUsage({ sessionQuery: service, now: Date.now() }, { windowDays: 30 })
  assert.equal(result.models.length, 1)
  assert.equal(result.models[0].totals.total, 100, 'the 400-day-old event is outside the window')
})

test('a resumed old Session still contributes its new usage', async () => {
  const service = query([
    { header: { id: 'resumed', createdAt: dayOffset(-200), origin: 'root', parentSession: null }, events: [{ ...message(42), time: dayOffset(-1) }] },
  ])
  const result = await collectUsage({ sessionQuery: service, now: Date.now() }, { windowDays: 30 })
  assert.equal(result.models.length, 1)
  assert.equal(result.models[0].totals.total, 42)
})

test('subagent sessions are skipped when excluded', async () => {
  const service = query([
    { header: { id: 'root', createdAt: dayOffset(-1), origin: 'root', parentSession: null }, events: [message(10)] },
    { header: { id: 'child', createdAt: dayOffset(-1), origin: 'subagent', parentSession: 'root' }, events: [message(90)] },
  ])
  const all = await collectUsage({ sessionQuery: service, now: Date.now() }, { windowDays: 30 })
  assert.equal(all.models[0].totals.total, 100)
  const excluded = await collectUsage({ sessionQuery: service, now: Date.now() }, { windowDays: 30, includeSubagents: false })
  assert.equal(excluded.models[0].totals.total, 10)
})

test('the session cap marks the result truncated', async () => {
  const sessions = Array.from({ length: SESSION_LIMIT + 5 }, (_, index) => ({
    header: { id: `s${String(index)}`, createdAt: dayOffset(-1), origin: 'root', parentSession: null },
    events: [message(1)],
  }))
  const result = await collectUsage({ sessionQuery: query(sessions), now: Date.now() }, { windowDays: 30 })
  assert.equal(result.truncated, true)
  assert.equal(result.scannedSessions, SESSION_LIMIT)
})

test('a read failure is reported without failing the scan', async () => {
  const service = {
    listSessions: async () => [
      { header: { id: 'ok', createdAt: dayOffset(-1), origin: 'root', parentSession: null } },
      { header: { id: 'bad', createdAt: dayOffset(-1), origin: 'root', parentSession: null } },
    ],
    readSession: async id => {
      if (id === 'bad') throw new Error('corrupt')
      return { events: [message(5)] }
    },
  }
  const result = await collectUsage({ sessionQuery: service, now: Date.now() }, { windowDays: 30 })
  assert.equal(result.failedSessions, 1)
  assert.equal(result.models[0].totals.total, 5)
})

test('channels list only what the window actually used', async () => {
  const service = query([
    { header: { id: 'a', createdAt: dayOffset(-1), origin: 'root', parentSession: null }, events: [message(1, 'deepseek-account', 'm1')] },
    { header: { id: 'b', createdAt: dayOffset(-1), origin: 'root', parentSession: null }, events: [message(1, 'super-relay', 'm2')] },
  ])
  const result = await collectUsage({ sessionQuery: service, now: Date.now() }, { windowDays: 30 })
  assert.deepEqual(result.channels, ['official', 'relay'])
})

test('repeated runs over the same input agree', async () => {
  const service = query([
    { header: { id: 'a', createdAt: dayOffset(-1), origin: 'root', parentSession: null }, events: [message(7), message(11)] },
  ])
  const first = await collectUsage({ sessionQuery: service, now: Date.now() }, { windowDays: 30 })
  const second = await collectUsage({ sessionQuery: service, now: Date.now() }, { windowDays: 30 })
  assert.equal(first.models[0].totals.total, second.models[0].totals.total)
  assert.equal(first.models[0].totals.total, 18)
})
