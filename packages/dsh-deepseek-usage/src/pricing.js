/**
 * The price list the cost estimate is computed from.
 *
 * DeepSeek publishes its prices on a documentation page and reserves the right
 * to change them, so the numbers cannot be compiled in and forgotten: the page
 * is read once a day and its figures replace the bundled snapshot. The snapshot
 * is still shipped, because the alternative — no prices when the network is
 * down — would turn a transient outage into a blank column on a page whose
 * other numbers are all local and always available.
 *
 * The reader is deliberately strict about what it accepts: a total is only ever
 * computed from a fully parsed table. A half-read table would silently under-
 * or over-state a bill, which is worse than saying "prices unavailable".
 */

import { pricingFamilyOf } from './cost.js'

/** Where the Chinese price list lives; the yuan table matches platform billing. */
export const PRICING_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'

/** Currency the bundled snapshot is expressed in. */
const DEFAULT_CURRENCY = 'CNY'

/**
 * Bundled snapshot of the published table.
 *
 * Prices are per million tokens, exactly as printed on the page. `readAt` is
 * the date the snapshot was taken so the UI can say how old a fallback is.
 */
export const BUNDLED_PRICING = Object.freeze({
  currency: DEFAULT_CURRENCY,
  source: PRICING_URL,
  readAt: '2026-10-22',
  models: {
    flash: {
      name: 'deepseek-flash',
      prices: {
        peak: { cacheHit: '0.04', cacheMiss: '2', output: '8' },
        offPeak: { cacheHit: '0.02', cacheMiss: '1', output: '4' },
      },
    },
    pro: {
      name: 'deepseek-v4-pro',
      prices: {
        peak: { cacheHit: '0.30', cacheMiss: '9.0', output: '27.0' },
        offPeak: { cacheHit: '0.15', cacheMiss: '4.5', output: '13.5' },
      },
    },
  },
})

/** Strip tags from one HTML fragment and collapse whitespace. */
function plain(fragment) {
  return fragment
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Split an HTML table into rows of plain-text cells. */
function rowsOf(html) {
  const rows = []
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let row
  while ((row = rowPattern.exec(html)) !== null) {
    const cells = []
    const cellPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
    let cell
    while ((cell = cellPattern.exec(row[1])) !== null) cells.push(plain(cell[1]))
    if (cells.length > 0) rows.push(cells)
  }
  return rows
}

/**
 * Read one price cell.
 *
 * The yuan sign may trail the number on the Chinese page while the English page
 * writes a dollar sign first, so both positions and both symbols are accepted.
 *
 * @param text - cell text such as `0.02元` or `$0.15`.
 * @returns the decimal string and the currency it named, or null.
 */
function priceCell(text) {
  const match = /^([$¥])?\s*([0-9]+(?:\.[0-9]+)?)\s*(元)?$/.exec(text)
  if (match === null) return null
  const symbol = match[1] ?? (match[3] === undefined ? '' : '¥')
  const currency = symbol === '$' ? 'USD' : symbol === '' ? null : 'CNY'
  return { value: match[2], currency }
}

/** Which part of a call a price row describes. */
function slotOf(text) {
  const lower = text.toLowerCase()
  if (/缓存命中|cache hit/.test(lower)) return 'cacheHit'
  if (/缓存未命中|cache miss/.test(lower)) return 'cacheMiss'
  if (/输出|output/.test(lower)) return 'output'
  return null
}

/** Which tier a price row describes. */
function tierOf(text) {
  const lower = text.toLowerCase()
  if (/空闲|off-peak|off peak/.test(lower)) return 'offPeak'
  if (/高峰|peak/.test(lower)) return 'peak'
  return null
}

/**
 * Parse the published pricing page.
 *
 * The table lists one column per model and, for each of the three billable
 * quantities, a pair of rows (off-peak, then peak). The quantity label spans
 * both rows, so only the first row of a pair carries it; the scan therefore
 * remembers the last label it saw.
 *
 * @param html - the fetched page.
 * @returns `{ currency, models }`, or null when the table is not fully readable.
 */
export function parsePricingPage(html) {
  if (typeof html !== 'string' || html === '') return null
  const cleaned = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  const rows = rowsOf(cleaned)

  // The model header is the first row naming a model this plugin can price;
  // anything else that mentions a DeepSeek model is prose, not the price table.
  let names = []
  let headerIndex = -1
  for (let index = 0; index < rows.length; index += 1) {
    const found = rows[index]
      .map(cell => /^(deepseek[\w.-]*)/i.exec(cell)?.[1])
      .filter(name => name !== undefined)
    if (found.some(name => pricingFamilyOf(name) !== null)) {
      names = found
      headerIndex = index
      break
    }
  }
  if (headerIndex < 0 || names.length === 0) return null

  const columns = names.map(() => ({ peak: {}, offPeak: {} }))
  let currency = null
  let slot = null
  for (const cells of rows.slice(headerIndex + 1)) {
    const label = cells.map(slotOf).find(value => value !== null)
    if (label !== undefined) slot = label
    if (slot === null) continue
    const tier = cells.map(tierOf).find(value => value !== null)
    if (tier === undefined) continue
    const prices = cells.map(priceCell).filter(cell => cell !== null)
    if (prices.length !== columns.length) continue
    for (let index = 0; index < prices.length; index += 1) {
      const cell = prices[index]
      // Only trust a table that states one currency throughout: mixing a yuan
      // and a dollar cell would produce a total in no currency at all.
      if (cell.currency !== null) {
        if (currency === null) currency = cell.currency
        else if (currency !== cell.currency) return null
      }
      columns[index][tier][slot] = cell.value
    }
  }

  const models = {}
  for (let index = 0; index < names.length; index += 1) {
    const family = pricingFamilyOf(names[index])
    if (family === null) continue
    const { peak, offPeak } = columns[index]
    const complete = pair => pair.cacheHit !== undefined && pair.cacheMiss !== undefined && pair.output !== undefined
    if (!complete(peak) || !complete(offPeak)) continue
    models[family] = { name: names[index], prices: { peak, offPeak } }
  }
  if (Object.keys(models).length === 0) return null
  return { currency: currency ?? DEFAULT_CURRENCY, models }
}

/**
 * A day key in the reader's own timezone, used to decide "once a day".
 *
 * @param millis - epoch milliseconds.
 * @returns `YYYY-MM-DD`.
 */
export function localDayKey(millis) {
  const date = new Date(millis)
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Build the payload shape the Client consumes. */
function payloadOf(table, meta) {
  return {
    currency: table.currency,
    source: PRICING_URL,
    readAt: meta.readAt,
    models: table.models,
    // `live` means the figures came off the page today; `bundled` means the page
    // could not be read and a shipped snapshot answered instead.
    origin: meta.origin,
  }
}

/**
 * Build the price source used by the route.
 *
 * The page is read at most once per local day, and only when the usage page
 * asks for it, so an idle harness makes no network call at all. A failed read is
 * retried on the next ask rather than remembered for the day, and the bundled
 * snapshot answers in the meantime.
 *
 * @param deps.fetchImpl - `fetch`-compatible function.
 * @param deps.now - current epoch milliseconds.
 * @param options.timeoutMs - how long the page read may take.
 * @returns a `read()` function resolving the pricing payload.
 */
export function createPricingSource(deps, options = {}) {
  const { fetchImpl, now } = deps
  const timeoutMs = options.timeoutMs ?? 8_000
  let cached
  let pending

  return async function read() {
    const day = localDayKey(now())
    if (cached !== undefined && cached.day === day) return cached.value
    if (pending !== undefined) return pending
    pending = (async () => {
      try {
        if (typeof fetchImpl !== 'function') throw new Error('fetch-unavailable')
        const controller = new AbortController()
        const timer = setTimeout(() => { controller.abort() }, timeoutMs)
        let response
        try {
          response = await fetchImpl(PRICING_URL, {
            signal: controller.signal,
            headers: { accept: 'text/html', 'user-agent': 'dsh-deepseek-usage' },
          })
        } finally {
          clearTimeout(timer)
        }
        if (response?.ok !== true) throw new Error('http')
        const table = parsePricingPage(await response.text())
        if (table === null) throw new Error('unparsable')
        const value = payloadOf(table, { readAt: day, origin: 'live' })
        cached = { day, value }
        return value
      } catch {
        // Do not cache the fallback for the day: the failure is usually
        // transient, and the next ask should try the network again.
        return payloadOf(BUNDLED_PRICING, { readAt: BUNDLED_PRICING.readAt, origin: 'bundled' })
      } finally {
        pending = undefined
      }
    })()
    return pending
  }
}
