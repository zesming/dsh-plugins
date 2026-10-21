/**
 * Display formatting shared by the sidebar and the usage page.
 *
 * Numbers in this plugin are large and change while the page is open, so every
 * formatter is deterministic and never re-rounds a value it already showed.
 */

/**
 * Format a token count the way the page reads it: exact below a million,
 * abbreviated above it, with the unit split out for a lighter type weight.
 *
 * @param value - token count.
 * @returns the numeric text and its unit suffix.
 */
export function compactTokens(value) {
  const n = Number.isFinite(value) && value > 0 ? value : 0
  if (n >= 1e12) return { value: (n / 1e12).toFixed(2), unit: 'T' }
  if (n >= 1e9) return { value: (n / 1e9).toFixed(2), unit: 'B' }
  if (n >= 1e6) return { value: (n / 1e6).toFixed(1), unit: 'M' }
  if (n >= 1e3) return { value: (n / 1e3).toFixed(1), unit: 'K' }
  return { value: String(Math.trunc(n)), unit: '' }
}

/**
 * Group a count with the active locale's separators.
 *
 * @param value - integer count.
 * @returns grouped digits.
 */
export function groupCount(value) {
  return new Intl.NumberFormat().format(Math.trunc(value))
}

/**
 * Format money without inventing precision the wallet did not have.
 *
 * Platform sends exact decimal strings, so the display truncates them with
 * string arithmetic instead of floating point: `1.005` floors to `1.00`, and
 * `128.42` can never drift to `128.41`. Positive amounts truncate to cents and
 * sub-cent amounts read `<0.01`, matching DeepSeek's own Web client; negative
 * amounts round away from zero with a minimum magnitude of `0.01`.
 *
 * @param text - decimal string from the Host.
 * @param currency - wallet currency, used for its symbol.
 * @returns display text such as `¥128.42`.
 */
export function formatMoney(text, currency) {
  const symbol = currency === 'USD' ? '$' : '¥'
  if (typeof text !== 'string') return `${symbol}--`
  const match = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.exec(text.trim())
  if (match === null) return `${symbol}--`
  const negative = text.trim().startsWith('-')
  const unsigned = text.trim().replace(/^-/, '')
  const [mantissa, exponentText] = unsigned.toLowerCase().split('e')
  const exponent = exponentText === undefined ? 0 : Number(exponentText)
  const [whole = '0', fraction = ''] = mantissa.split('.')
  const digits = `${whole}${fraction}`
  const pointAt = whole.length + exponent
  const padded = pointAt <= 0
    ? `${'0'.repeat(-pointAt)}${digits}`
    : digits.padEnd(pointAt, '0')
  const integerPart = pointAt <= 0 ? '0' : padded.slice(0, pointAt)
  const fractionPart = pointAt <= 0 ? padded : padded.slice(pointAt)
  const allZero = Number(integerPart) === 0 && Number(`0.${fractionPart || '0'}`) === 0
  if (allZero) return `${symbol}0.00`
  const subCent = Number(integerPart) === 0 && Number(`0.${fractionPart.padEnd(2, '0').slice(0, 2)}`) === 0
  const cents = `${integerPart}${fractionPart.padEnd(2, '0').slice(0, 2)}`.replace(/^0+(?=\d)/, '')
  if (subCent && Number(cents) === 0) {
    return negative ? `-${symbol}0.01` : `${symbol}<0.01`
  }
  const centsNumber = Number(cents)
  const shown = negative ? centsNumber + 1 : centsNumber
  const text2 = String(shown).padStart(3, '0')
  const grouped = text2.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + text2.slice(-2)
  return `${negative ? '-' : ''}${symbol}${grouped}`
}

/**
 * Express a future instant as "6 天后" / "6 days".
 *
 * @param days - whole days remaining.
 * @param language - active UI language.
 * @returns localized relative text.
 */
export function relativeDays(days, language) {
  const zh = String(language ?? '').toLowerCase().startsWith('zh')
  if (days <= 0) return zh ? '今天' : 'today'
  return zh ? `${String(days)} 天后` : `in ${String(days)} ${days === 1 ? 'day' : 'days'}`
}

/**
 * Day key for a local date, matching the Host's bucketing.
 *
 * @param date - local date.
 * @returns `YYYY-MM-DD`.
 */
export function keyOf(date) {
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Shift a local date by whole days, tolerant of DST boundaries.
 *
 * @param date - reference date.
 * @param days - signed day offset.
 * @returns the shifted date.
 */
export function shiftDays(date, days) {
  const shifted = new Date(date.getTime())
  shifted.setDate(shifted.getDate() + days)
  return shifted
}
