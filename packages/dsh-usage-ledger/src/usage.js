/**
 * Pure token-usage aggregation over DeepSeek Harness session logs.
 *
 * The Session log is the only durable record of what the harness actually
 * spent: every `assistant/message` carries the provider-reported `usage`
 * (`totalTokens` already includes `cacheReadTokens`) and the request's
 * `message.source`, which names the provider and model. Nothing here touches
 * disk or the network, so the whole aggregation is unit-testable.
 */

import { tierOfInstant } from './cost.js'

/** Provider names that mean "the signed-in DeepSeek account" or "a DeepSeek API key". */
const OFFICIAL_PROVIDERS = new Set(['deepseek-account'])
const API_KEY_PROVIDERS = new Set(['deepseek'])

/**
 * Classify a provider into the channel shown in the UI.
 *
 * Session logs do not record the DeepSeek account id, so the harness cannot
 * distinguish two accounts on the same channel. The UI labels this axis as a
 * channel rather than an account for that reason.
 *
 * @param provider - provider id from `message.source.provider`, or undefined.
 * @returns channel id; unknown providers fall back to `relay`.
 */
export function channelOf(provider) {
  if (provider === undefined || provider === null || provider === '') return 'unknown'
  if (OFFICIAL_PROVIDERS.has(provider)) return 'official'
  if (API_KEY_PROVIDERS.has(provider)) return 'apikey'
  return 'relay'
}

/** Read a finite non-negative count from an untrusted usage field. */
function count(value) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

/**
 * An empty per-bucket usage tally.
 *
 * `peak` carries the subset of the same bucket that was billed at the peak
 * rate. It is a strict subset rather than a sibling field, so the off-peak
 * portion is always `total - peak` and the two can never drift apart.
 */
function emptyTally() {
  return { input: 0, output: 0, cacheRead: 0, total: 0, calls: 0, peak: { input: 0, output: 0, cacheRead: 0 } }
}

/**
 * Add one event's usage into a tally, in place.
 *
 * @param tally - bucket to grow.
 * @param usage - provider-reported usage of one call.
 * @param tier - price tier the call was billed at.
 */
function addInto(tally, usage, tier) {
  const input = count(usage.inputTokens)
  const output = count(usage.outputTokens)
  const cacheRead = count(usage.cacheReadTokens)
  tally.input += input
  tally.output += output
  tally.cacheRead += cacheRead
  tally.total += count(usage.totalTokens)
  tally.calls += 1
  if (tier === 'peak') {
    tally.peak.input += input
    tally.peak.output += output
    tally.peak.cacheRead += cacheRead
  }
}

/**
 * Format an instant as a local-timezone `YYYY-MM-DD` day key.
 *
 * Days are bucketed in the reader's own zone, so "which day did I spend this"
 * matches what the person saw on their clock, not UTC.
 *
 * @param millis - epoch milliseconds.
 * @returns the local calendar day.
 */
export function dayKey(millis) {
  const date = new Date(millis)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Whether a session header describes delegated work.
 *
 * Both signals matter: `origin: subagent` marks a spawned child, while a
 * non-null `parentSession` catches sessions that were resumed or forked from
 * another one.
 *
 * @param header - session header from the query service.
 * @returns whether the session is delegated.
 */
export function isSubagentSession(header) {
  if (header === undefined || header === null) return false
  return header.origin === 'subagent' || header.parentSession != null
}

/**
 * Fold one session's events into per-model, per-day usage buckets.
 *
 * Events without provider-reported usage are ignored rather than estimated:
 * a fabricated number in a spend dashboard is worse than a gap, and the
 * harness never bills from this fold.
 *
 * @param events - durable session events, in log order.
 * @param into - accumulators keyed by model id, mutated in place.
 * @param options.subagent - record into each model's subagent-only series.
 * @param options.from - discard events earlier than this day key.
 * @param options.until - discard events after this day key (inclusive).
 * @returns the same accumulator map.
 */
export function foldSession(events, into, options = {}) {
  const subagent = options.subagent === true
  const { from, until } = options
  for (const event of events ?? []) {
    if (event?.type !== 'assistant/message') continue
    const usage = event.data?.usage
    if (usage === undefined || usage === null) continue
    const source = event.data?.message?.source ?? {}
    const provider = typeof source.provider === 'string' && source.provider !== '' ? source.provider : 'unknown'
    const model = typeof source.model === 'string' && source.model !== '' ? source.model : 'unknown'
    const id = `${provider}::${model}`
    let record = into.get(id)
    if (record === undefined) {
      record = {
        id,
        provider,
        model,
        channel: channelOf(provider === 'unknown' ? undefined : provider),
        totals: emptyTally(),
        subagentTotals: emptyTally(),
        days: new Map(),
        subagentDays: new Map(),
      }
      into.set(id, record)
    }
    const time = Number.isFinite(event.time) ? event.time : Date.now()
    const day = dayKey(time)
    // `totals` describes the requested window, so an out-of-window event is
    // dropped before it is allocated into any bucket.
    if (from !== undefined && day < from) continue
    if (until !== undefined && day > until) continue
    // The billed tier is decided from the instant of the call, once, so every
    // later fold and every later total agree on which half it belonged to.
    const tier = tierOfInstant(time)
    addInto(record.totals, usage, tier)
    let bucket = record.days.get(day)
    if (bucket === undefined) {
      bucket = emptyTally()
      record.days.set(day, bucket)
    }
    addInto(bucket, usage, tier)
    if (subagent) {
      addInto(record.subagentTotals, usage, tier)
      let subBucket = record.subagentDays.get(day)
      if (subBucket === undefined) {
        subBucket = emptyTally()
        record.subagentDays.set(day, subBucket)
      }
      addInto(subBucket, usage, tier)
    }
  }
  return into
}

/**
 * Merge tallies for the same model id across sessions.
 *
 * @param into - target accumulator map.
 * @param from - accumulator map produced by {@link foldSession}.
 * @returns the target map.
 */
export function mergeInto(into, from) {
  for (const [id, source] of from) {
    let target = into.get(id)
    if (target === undefined) {
      target = {
        id,
        provider: source.provider,
        model: source.model,
        channel: source.channel,
        totals: emptyTally(),
        subagentTotals: emptyTally(),
        days: new Map(),
        subagentDays: new Map(),
      }
      into.set(id, target)
    }
    mergeTally(target.totals, source.totals)
    mergeTally(target.subagentTotals, source.subagentTotals)
    for (const [day, tally] of source.days) {
      let bucket = target.days.get(day)
      if (bucket === undefined) {
        bucket = emptyTally()
        target.days.set(day, bucket)
      }
      mergeTally(bucket, tally)
    }
    for (const [day, tally] of source.subagentDays) {
      let bucket = target.subagentDays.get(day)
      if (bucket === undefined) {
        bucket = emptyTally()
        target.subagentDays.set(day, bucket)
      }
      mergeTally(bucket, tally)
    }
  }
  return into
}

/** Add one tally into another, in place. */
function mergeTally(target, source) {
  target.input += source.input
  target.output += source.output
  target.cacheRead += source.cacheRead
  target.total += source.total
  target.calls += source.calls
  const peak = source.peak ?? { input: 0, output: 0, cacheRead: 0 }
  target.peak.input += peak.input ?? 0
  target.peak.output += peak.output ?? 0
  target.peak.cacheRead += peak.cacheRead ?? 0
}

/**
 * Copy a tally, including its nested peak sub-tally.
 *
 * A shallow spread would leave the serialized payload sharing the `peak`
 * object with the live accumulator, so a later fold could mutate a value the
 * Client already holds.
 *
 * @param tally - bucket to copy.
 * @returns an independent copy.
 */
function copyTally(tally) {
  return { ...tally, peak: { ...(tally.peak ?? { input: 0, output: 0, cacheRead: 0 }) } }
}

/**
 * Serialize accumulators into the JSON the Client consumes.
 *
 * A model keeps the days it was active in only, and every map becomes a plain
 * object so the value survives JSON transport unchanged.
 *
 * @param records - accumulator map from {@link foldSession} / {@link mergeInto}.
 * @param options.includeSubagents - emit subagent series for the UI toggle.
 * @returns sorted, JSON-safe model rows plus the per-channel totals.
 */
export function serialize(records, options = {}) {
  const models = [...records.values()]
    .map(record => ({
      id: record.id,
      provider: record.provider,
      model: record.model,
      channel: record.channel,
      totals: copyTally(record.totals),
      days: Object.fromEntries([...record.days].sort(([a], [b]) => a.localeCompare(b)).map(([day, tally]) => [day, copyTally(tally)])),
      ...options.includeSubagents === false
        ? {}
        : { subagent: { totals: copyTally(record.subagentTotals), days: Object.fromEntries([...record.subagentDays].sort(([a], [b]) => a.localeCompare(b)).map(([day, tally]) => [day, copyTally(tally)])) } },
    }))
    .sort((a, b) => b.totals.total - a.totals.total)

  const channels = {}
  for (const row of models) {
    const channel = (channels[row.channel] ??= emptyTally())
    mergeTally(channel, row.totals)
  }
  return { models, channels }
}

/** Subtract one tally from another, never going negative. */
function subtractTally(bucket, remove) {
  const peakOf = tally => tally.peak ?? { input: 0, output: 0, cacheRead: 0 }
  const mine = peakOf(bucket)
  const theirs = peakOf(remove)
  return {
    input: Math.max(0, bucket.input - remove.input),
    output: Math.max(0, bucket.output - remove.output),
    cacheRead: Math.max(0, bucket.cacheRead - remove.cacheRead),
    total: Math.max(0, bucket.total - remove.total),
    calls: Math.max(0, bucket.calls - remove.calls),
    // The peak subset is subtracted too, so "exclude subagents" removes the same
    // proportion of expensive calls as it removes of the total.
    peak: {
      input: Math.max(0, mine.input - theirs.input),
      output: Math.max(0, mine.output - theirs.output),
      cacheRead: Math.max(0, mine.cacheRead - theirs.cacheRead),
    },
  }
}

/**
 * Remove delegated usage from a day map.
 *
 * The Client and the Host have to agree on this number, so the rule lives here
 * once: a day whose non-delegated work is zero disappears entirely, because a
 * zero-usage cell and an absent cell mean the same thing to the heatmap and
 * keeping it would leave a model with no calls and no visible reason to exist.
 *
 * @param days - day map including delegated Sessions.
 * @param subagentDays - the delegated subset of the same days.
 * @returns a day map without delegated usage.
 */
export function withoutSubagents(days, subagentDays) {
  if (subagentDays === undefined || subagentDays === null) return days
  const result = {}
  for (const [day, tally] of Object.entries(days ?? {})) {
    const delegated = subagentDays[day]
    const remaining = delegated === undefined ? tally : subtractTally(tally, delegated)
    if (remaining.calls === 0 || remaining.total === 0) continue
    result[day] = remaining
  }
  return result
}

/**
 * Restrict model rows to a rolling window and recompute their totals.
 *
 * @param models - serialized model rows.
 * @param options.from - inclusive first day key, or undefined for no lower bound.
 * @param options.until - inclusive last day key, or undefined for no upper bound.
 * @param options.excludeSubagents - drop delegated usage from every day.
 * @returns model rows restricted to the window, largest first.
 */
export function windowModels(models, options = {}) {
  const { from, until, excludeSubagents = false } = options
  const inWindow = key => (from === undefined || key >= from) && (until === undefined || key <= until)
  const rows = []
  for (const row of models) {
    const scoped = {}
    for (const [day, tally] of Object.entries(row.days)) {
      if (inWindow(day)) scoped[day] = tally
    }
    const days = excludeSubagents ? withoutSubagents(scoped, row.subagent?.days) : scoped
    const totals = emptyTally()
    for (const tally of Object.values(days)) mergeTally(totals, tally)
    if (totals.calls === 0) continue
    rows.push({ ...row, days, totals })
  }
  return rows.sort((a, b) => b.totals.total - a.totals.total)
}
