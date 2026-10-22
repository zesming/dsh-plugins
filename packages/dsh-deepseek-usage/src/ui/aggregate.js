/**
 * Small folds over the serialized usage payload that the page renders from.
 *
 * They live apart from the components so a test can call them without React,
 * and so the page can memoize on data identity rather than on render count.
 */

import { keyOf, shiftDays } from './format.js'

/**
 * Sum every model's day map into the four KPI figures.
 *
 * @param series - `{ row, days }` rows.
 * @returns token and call totals, including the peak subset.
 */
export function sumSeries(series) {
  const totals = { total: 0, input: 0, output: 0, cacheRead: 0, calls: 0, peak: { input: 0, output: 0, cacheRead: 0 } }
  for (const entry of series) {
    for (const tally of Object.values(entry.days ?? {})) {
      totals.total += tally.total
      totals.input += tally.input
      totals.output += tally.output
      totals.cacheRead += tally.cacheRead
      totals.calls += tally.calls
      // The peak subset travels with the sum: cost is computed from this folded
      // bucket, so dropping it would price every call at the off-peak rate.
      const peak = tally.peak
      if (peak !== undefined && peak !== null) {
        totals.peak.input += peak.input ?? 0
        totals.peak.output += peak.output ?? 0
        totals.peak.cacheRead += peak.cacheRead ?? 0
      }
    }
  }
  return totals
}

/**
 * Sum the trailing N calendar days, including today.
 *
 * @param series - `{ row, days }` rows.
 * @param today - the reference day.
 * @param days - window length.
 * @returns summed tokens.
 */
export function sumWindow(series, today, days) {
  const keys = new Set()
  for (let offset = 0; offset < days; offset += 1) keys.add(keyOf(shiftDays(today, -offset)))
  let total = 0
  for (const entry of series) {
    for (const [key, tally] of Object.entries(entry.days ?? {})) {
      if (keys.has(key)) total += tally.total
    }
  }
  return total
}

/**
 * Per-day stacked totals for the weekly column view.
 *
 * @param series - `{ row, days }` rows.
 * @param weeks - `{ key, days }[]` from the heatmap helpers.
 * @returns one stack per week, in model order.
 */
export function weekStacks(series, weeks) {
  return weeks.map(week => {
    const parts = series.map(entry => ({
      id: entry.row.id,
      label: entry.row.model.split('/').pop(),
      value: week.days.reduce((sum, key) => sum + (entry.days[key]?.total ?? 0), 0),
    }))
    return { key: week.key, parts, total: parts.reduce((sum, part) => sum + part.value, 0) }
  })
}

/**
 * Convert a six-decimal cost string into integer micro-units.
 *
 * Costs are carried as integers because the page adds them up and then formats
 * once; accumulating floats would let a cent drift in on a large total, the
 * same failure `formatMoney` already avoids for wallet balances.
 *
 * @param text - decimal string produced by the cost estimator.
 * @returns integer micro-units, or 0 when the text is not a cost.
 */
export function microOf(text) {
  const match = /^(-?)(\d+)\.(\d{6})$/.exec(String(text))
  if (match === null) return 0
  const magnitude = Number(match[2]) * 1_000_000 + Number(match[3])
  return match[1] === '-' ? -magnitude : magnitude
}

/**
 * Render integer micro-units as the six-decimal string `formatMoney` expects.
 *
 * @param micro - integer micro-units.
 * @returns six-decimal string.
 */
export function decimalOfMicro(micro) {
  const negative = micro < 0
  const magnitude = Math.abs(Math.trunc(micro))
  const whole = Math.trunc(magnitude / 1_000_000)
  const fraction = String(magnitude % 1_000_000).padStart(6, '0')
  return `${negative ? '-' : ''}${String(whole)}.${fraction}`
}

/**
 * Sum cost across the visible series.
 *
 * Every row is priced from its own model's publication, so a total is the sum
 * of per-model estimates rather than a blended rate: two models with different
 * prices must not average into a rate that applies to neither.
 *
 * @param series - `{ row, days }` rows.
 * @param pricing - price list payload from the Host, or undefined.
 * @param estimate - `(bucket, plan) => { total, peak, offPeak } | null`.
 * @param familyOf - `(model) => string | null`.
 * @returns summed micro-units plus how many rows were priced, or null when no
 *   price list is loaded at all.
 */
export function sumCost(series, pricing, estimate, familyOf) {
  if (pricing === undefined || pricing === null) return null
  const sum = { total: 0, peak: 0, offPeak: 0, priced: 0, unpriced: 0 }
  for (const entry of series) {
    const family = familyOf(entry.row.model)
    const plan = family === null ? undefined : pricing.models?.[family]
    if (plan === undefined) {
      // A model with no published price is counted, not guessed at: the page
      // says how many rows were left out instead of quietly billing them at zero.
      sum.unpriced += 1
      continue
    }
    const cost = estimate(sumSeries([entry]), plan)
    if (cost === null) { sum.unpriced += 1; continue }
    sum.total += microOf(cost.total)
    sum.peak += microOf(cost.peak)
    sum.offPeak += microOf(cost.offPeak)
    sum.priced += 1
  }
  return sum
}

/**
 * Restrict every row's day map to a set of day keys.
 *
 * The cost view follows the range switch: "daily" prices the 12 months the
 * heatmap draws, "weekly" the 26 weeks it draws, and "cumulative" everything on
 * record. Filtering the day maps rather than recomputing totals keeps one rule
 * for what the page is currently showing.
 *
 * @param series - `{ row, days }` rows.
 * @param keys - day keys to keep, or null to keep everything.
 * @returns rows carrying only the kept days.
 */
export function restrictSeries(series, keys) {
  if (keys === null) return series
  return series.map(entry => {
    const days = {}
    for (const [key, tally] of Object.entries(entry.days ?? {})) {
      if (keys.has(key)) days[key] = tally
    }
    return { row: entry.row, days }
  })
}
