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
 * @returns token and call totals.
 */
export function sumSeries(series) {
  const totals = { total: 0, input: 0, output: 0, cacheRead: 0, calls: 0 }
  for (const entry of series) {
    for (const tally of Object.values(entry.days ?? {})) {
      totals.total += tally.total
      totals.input += tally.input
      totals.output += tally.output
      totals.cacheRead += tally.cacheRead
      totals.calls += tally.calls
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
