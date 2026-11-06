/**
 * Pure view-period and cost-card decisions for the usage panel.
 *
 * Kept out of the React component so the Monday-anchored window and the
 * "which gap copy applies" branches are covered by plain node tests instead
 * of being reachable only through the rendered panel.
 */

import { keyOf, shiftDays } from './format.js'

/**
 * The set of day keys one view describes.
 *
 * Daily is today only; weekly is the whole Monday–Sunday calendar week of
 * today (including days after today, so it reads as "this week" rather than
 * "the last seven days"); cumulative is every day present on record.
 * @param view - 'day' | 'week' | 'total'.
 * @param series - per-model rows carrying a `days` record.
 * @param today - the current local Date.
 * @returns a Set of 'YYYY-MM-DD' keys.
 */
export function periodKeys(view, series, today) {
  if (view === 'total') {
    const days = new Set()
    for (const entry of series ?? []) {
      for (const key of Object.keys(entry.days ?? {})) days.add(key)
    }
    return days
  }
  if (view === 'week') {
    const monday = shiftDays(today, -((today.getDay() + 6) % 7))
    const days = new Set()
    for (let offset = 0; offset < 7; offset += 1) days.add(keyOf(shiftDays(monday, offset)))
    return days
  }
  return new Set([keyOf(today)])
}

/**
 * Decide what the cost card presents for one pricing/result combination.
 *
 * Three no-figure gaps are worded apart because only two are worth acting on,
 * and a figure must never read as ¥0.00 when the total is unknown.
 * @param options.pricingPhase - pricing source phase.
 * @param options.cost - summed cost for the period, or null when pricing is
 *   unavailable / no priced calls.
 * @returns whether a figure resolves and, when it does not, which gap applies.
 */
export function costCardState({ pricingPhase, cost }) {
  const loading = pricingPhase === 'loading'
  const failed = pricingPhase === 'failed' || cost === null
  const resolved = !loading && pricingPhase !== 'failed' && cost !== null
    && cost.calls > 0 && cost.priced > 0
  const gap = failed ? 'costUnavailable' : cost.calls === 0 ? 'costNoData' : 'costUnpricedAll'
  return { loading, resolved, gap }
}
