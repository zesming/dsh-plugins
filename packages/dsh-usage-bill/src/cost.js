/**
 * Cost estimation for recorded token usage.
 *
 * DeepSeek bills by the wall-clock instant of each call: peak hours cost twice
 * the off-peak rate, and the tier depends on the Beijing calendar (weekday plus
 * statutory holidays), not on the reader's own timezone. The tier of a call is
 * therefore decided once, while folding the Session log, and carried in the
 * payload; this module turns a token bucket into money and decides which
 * published price row applies to a model name.
 *
 * Money is computed with integer arithmetic. Prices are per million tokens and
 * arrive as decimal strings, so a two-decimal display computed through floats
 * could drift by a cent on a large total — the same class of bug `formatMoney`
 * already avoids for wallet balances.
 */

import { HOLIDAY_SET } from './holidays.js'

/** Beijing is UTC+8 year-round; China observes no daylight saving. */
export const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/** Peak windows, in minutes from Beijing midnight: 09:00–12:00 and 14:00–18:00. */
export const PEAK_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]]

/** Tokens per price unit: the published prices are per million tokens. */
const PER_MILLION = 1_000_000n

/**
 * Break an instant into Beijing calendar fields.
 *
 * @param millis - epoch milliseconds.
 * @returns year, month, day, weekday (0 = Sunday) and minutes past midnight.
 */
export function beijingClock(millis) {
  const shifted = new Date(millis + BEIJING_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  }
}

/** Format Beijing calendar fields as a `YYYY-MM-DD` key. */
function beijingDateKey(clock) {
  return `${String(clock.year)}-${String(clock.month).padStart(2, '0')}-${String(clock.day).padStart(2, '0')}`
}

/**
 * Decide which price tier a call falls into.
 *
 * A call outside Monday–Friday is off-peak, and so is every call on a Chinese
 * statutory holiday. Note that make-up working weekends stay off-peak: the
 * published rule says all weekend hours are off-peak, so a Saturday shifted
 * into the working week is still charged at the cheap rate.
 *
 * @param millis - instant of the call, epoch milliseconds.
 * @param holidays - holiday date keys; defaults to the bundled schedule.
 * @returns `peak` or `offPeak`.
 */
export function tierOfInstant(millis, holidays = HOLIDAY_SET) {
  const clock = beijingClock(millis)
  if (clock.weekday === 0 || clock.weekday === 6) return 'offPeak'
  if (holidays.has(beijingDateKey(clock))) return 'offPeak'
  for (const [start, end] of PEAK_WINDOWS) {
    if (clock.minutes >= start && clock.minutes < end) return 'peak'
  }
  return 'offPeak'
}

/**
 * Reduce a model name to the letters and digits that identify it.
 *
 * Publishers and relays spell the same model differently — `deepseek-v4-pro`,
 * `DeepSeek-V4.1-Flash-1017`, `opensource/deepseek_v4_1_flash` — so separators,
 * case and any routing prefix are dropped before matching.
 *
 * @param model - model id from a Session log.
 * @returns the normalized name, or an empty string.
 */
export function normalizeModelName(model) {
  if (typeof model !== 'string') return ''
  const tail = model.includes('/') ? model.slice(model.lastIndexOf('/') + 1) : model
  return tail.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Map a model name onto a published price family.
 *
 * The published table names two families, and the site is explicit that retired
 * names such as `deepseek-v4-flash` are still billed at the Flash price. A
 * relay that hosts an official model under its own spelling is matched for the
 * same reason: the same weights, the same price. Anything that is not a
 * DeepSeek model returns null, so a third-party model is never assigned a price
 * it does not have.
 *
 * @param model - model id from a Session log.
 * @returns `flash`, `pro`, or null when the model has no published price.
 */
export function pricingFamilyOf(model) {
  const name = normalizeModelName(model)
  if (!name.startsWith('deepseek')) return null
  if (name.includes('flash')) return 'flash'
  // `pro` alone is too weak a signal; require it to follow a version marker.
  if (/v\d+pro/.test(name) || /pro\d*$/.test(name)) return 'pro'
  return null
}

/**
 * Parse a decimal price into integer micro-units (1 unit = 0.000001 of the
 * currency), which keeps every later multiplication exact.
 *
 * @param text - decimal string such as `4.5` or `0.02`.
 * @returns micro-units, or null when the text is not a price.
 */
export function priceToMicro(text) {
  if (typeof text !== 'string') return null
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text.trim())
  if (match === null) return null
  const whole = match[1]
  const fraction = (match[2] ?? '').padEnd(6, '0').slice(0, 6)
  return BigInt(whole) * 1_000_000n + BigInt(fraction === '' ? '0' : fraction)
}

/**
 * Render a micro-unit amount as a decimal string with six fraction digits.
 *
 * `formatMoney` consumes this and truncates to the currency's two decimals, so
 * the extra precision exists only to make that truncation correct.
 *
 * @param micro - amount in micro-units.
 * @returns decimal string, negative when the amount is negative.
 */
export function microToDecimal(micro) {
  const negative = micro < 0n
  const magnitude = negative ? -micro : micro
  const whole = magnitude / 1_000_000n
  const fraction = String(magnitude % 1_000_000n).padStart(6, '0')
  return `${negative ? '-' : ''}${String(whole)}.${fraction}`
}

/** A zero token tally. */
function zeroTier() {
  return { input: 0, output: 0, cacheRead: 0 }
}

/**
 * Split a bucket into peak and off-peak portions.
 *
 * Off-peak is derived by subtraction rather than stored: one nested field keeps
 * the payload small and makes it impossible for the two tiers to disagree with
 * the total they belong to.
 *
 * @param bucket - tally carrying an optional `peak` sub-tally.
 * @returns the two tiers.
 */
export function splitTiers(bucket) {
  const peak = bucket?.peak ?? zeroTier()
  const pick = key => Math.max(0, (bucket?.[key] ?? 0) - (peak[key] ?? 0))
  return {
    peak: { input: peak.input ?? 0, output: peak.output ?? 0, cacheRead: peak.cacheRead ?? 0 },
    offPeak: { input: pick('input'), output: pick('output'), cacheRead: pick('cacheRead') },
  }
}

/**
 * Price one tier's tokens.
 *
 * Cache hits are priced separately from cache misses, which is what makes the
 * `input` and `cacheRead` split of a Session log meaningful for billing.
 *
 * @param tokens - `{ input, output, cacheRead }` counts.
 * @param price - `{ cacheHit, cacheMiss, output }` decimal strings per million.
 * @returns the cost in micro-units.
 */
function priceTier(tokens, price) {
  const miss = priceToMicro(price.cacheMiss)
  const hit = priceToMicro(price.cacheHit)
  const out = priceToMicro(price.output)
  if (miss === null || hit === null || out === null) return 0n
  const numerator = BigInt(Math.max(0, Math.trunc(tokens.input))) * miss
    + BigInt(Math.max(0, Math.trunc(tokens.cacheRead))) * hit
    + BigInt(Math.max(0, Math.trunc(tokens.output))) * out
  // Round half up once, at the end, so per-term truncation cannot bias a total.
  return (numerator + PER_MILLION / 2n) / PER_MILLION
}

/**
 * Estimate the cost of one token bucket under one price plan.
 *
 * @param bucket - tally from the Session fold.
 * @param plan - a plan from the pricing table, or null when unpriced.
 * @returns decimal strings for the total and each tier, or null when unpriced.
 */
export function estimateCost(bucket, plan) {
  if (plan === undefined || plan === null) return null
  const { peak, offPeak } = splitTiers(bucket)
  const peakMicro = priceTier(peak, plan.prices.peak)
  const offPeakMicro = priceTier(offPeak, plan.prices.offPeak)
  return {
    total: microToDecimal(peakMicro + offPeakMicro),
    peak: microToDecimal(peakMicro),
    offPeak: microToDecimal(offPeakMicro),
  }
}

/**
 * Whether every year the window touches has a bundled holiday schedule.
 *
 * Outside the covered range a statutory holiday would be priced as a peak day.
 * The UI says so rather than silently overstating the bill.
 *
 * @param from - first local day key, inclusive.
 * @param until - last local day key, inclusive.
 * @param coveredYears - years with a known holiday schedule.
 * @returns whether the whole window is covered.
 */
export function holidayCoverageCovers(from, until, coveredYears) {
  if (typeof from !== 'string' || typeof until !== 'string') return true
  const first = Number(from.slice(0, 4))
  const last = Number(until.slice(0, 4))
  if (!Number.isFinite(first) || !Number.isFinite(last)) return true
  const years = new Set(coveredYears ?? [])
  for (let year = first; year <= last; year += 1) {
    if (!years.has(year)) return false
  }
  return true
}
