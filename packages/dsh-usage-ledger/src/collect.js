/**
 * Host-side collection: read every stored Session's usage through the public
 * query service, then fold it with the pure aggregators.
 *
 * Everything here is dependency-injected so the route handler stays testable
 * without a running harness.
 */

import { channelOf, dayKey, foldSession, isSubagentSession, mergeInto, serialize, windowModels } from './usage.js'

/** Sessions scanned per request; bounds worst-case latency on large homes. */
export const SESSION_LIMIT = 2000



/** Sessions read concurrently; keeps a big scan from starving live work. */
export const READ_CONCURRENCY = 4

/**
 * Yield the day key `days` before `from`, shifted in local calendar days.
 *
 * A plain millisecond subtraction drifts across DST changes, while the heatmap
 * is a calendar grid.
 *
 * @param date - reference instant.
 * @param days - how many calendar days to move backwards.
 * @returns the local `YYYY-MM-DD` key.
 */
export function daysAgo(date, days) {
  const shifted = new Date(date.getTime())
  shifted.setDate(shifted.getDate() - days)
  return dayKey(shifted.getTime())
}

/**
 * Read and fold usage for one window.
 *
 * @param deps.sessionQuery - the mounted query service.
 * @param deps.now - current epoch milliseconds.
 * @param options.windowDays - calendar days to include, ending today.
 * @param options.includeSubagents - keep delegated Sessions in the totals.
 * @returns the Client payload.
 */
export async function collectUsage(deps, options = {}) {
  const { sessionQuery, now } = deps
  const windowDays = options.windowDays ?? 365
  const includeSubagents = options.includeSubagents !== false
  if (sessionQuery === undefined) {
    return { available: false, error: 'session-query-unavailable', generatedAt: now }
  }
  const from = daysAgo(new Date(now), windowDays - 1)

  const sessions = await sessionQuery.listSessions()
  // Do not filter by the Session's creation time: a Session can be resumed long
  // after it was created, and its new events belong to today's usage. Only the
  // events are windowed, below.
  const candidates = sessions
    .filter(record => record?.header !== undefined)
    .sort((a, b) => (b.header.createdAt ?? 0) - (a.header.createdAt ?? 0))
  const scanned = candidates.slice(0, SESSION_LIMIT)

  const merged = new Map()
  let readFailed = 0
  let readCount = 0
  for (let index = 0; index < scanned.length; index += READ_CONCURRENCY) {
    const batch = scanned.slice(index, index + READ_CONCURRENCY)
    const results = await Promise.all(batch.map(async record => {
      const subagent = isSubagentSession(record.header)
      if (subagent && !includeSubagents) return undefined
      try {
        readCount += 1
        const snapshot = await sessionQuery.readSession(record.header.id)
        const own = new Map()
        foldSession(snapshot.events, own, { subagent, from, until: dayKey(now) })
        return own
      } catch {
        readFailed += 1
        return undefined
      }
    }))
    for (const own of results) if (own !== undefined) mergeInto(merged, own)
  }

  // The fold already dropped out-of-window events, so serialization carries only
  // what the page will draw; the extra pass keeps the window rule in one place.
  const { models } = serialize(merged, { includeSubagents: true })
  const windowed = windowModels(models, { from, until: dayKey(now) })
  return {
    available: true,
    generatedAt: now,
    windowDays,
    includeSubagents,
    from,
    until: dayKey(now),
    truncated: candidates.length > SESSION_LIMIT,
    scannedSessions: readCount,
    failedSessions: readFailed,
    channels: [...new Set(windowed.map(row => row.channel))].sort(),
    models: windowed,
  }
}

export { channelOf }
