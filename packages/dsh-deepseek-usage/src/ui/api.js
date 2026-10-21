/**
 * Browser-side reads of the plugin's two authenticated routes.
 *
 * Routes are addressed document-relative so the same code works under the
 * Web mount, a reverse proxy, or the Desktop shell.
 */

/** Browser-relative form of the balance route. */
export const BALANCE_ROUTE = 'api/deepseek-usage.balance'

/** Browser-relative form of the usage series route. */
export const SERIES_ROUTE = 'api/deepseek-usage.series'

/** Stamp the calling page's identity onto a request the Host forwards to Platform. */
function identity(url) {
  const locale = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh-CN'
  const tz = -new Date().getTimezoneOffset() * 60
  url.searchParams.set('locale', locale)
  url.searchParams.set('tz', String(tz))
  return url
}

/** The payload shape used when the read itself failed. */
function unreachable(error) {
  // `signedIn: false` on purpose: a failed transport cannot prove an account is
  // stored, and showing a balance row carrying "--" to someone who never signed
  // in is worse than showing nothing. The row hides; the usage page still works.
  return { signedIn: false, available: false, error }
}

/**
 * Read the sidebar balance payload.
 *
 * @param options.signal - aborts the request when the caller unmounts.
 * @param options.force - bypass the Host cache.
 * @returns the parsed payload; a transport failure reads as "no account".
 */
export async function fetchBalance(options = {}) {
  const url = identity(new URL(BALANCE_ROUTE, document.baseURI))
  if (options.force === true) url.searchParams.set('force', '1')
  let response
  try {
    response = await fetch(url, { signal: options.signal, headers: { accept: 'application/json' } })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return unreachable('network')
  }
  if (!response.ok) return unreachable(`http-${String(response.status)}`)
  let payload
  try {
    payload = await response.json()
  } catch {
    return unreachable('malformed')
  }
  return typeof payload === 'object' && payload !== null ? payload : unreachable('malformed')
}

/**
 * Read the usage series.
 *
 * @param options.windowDays - calendar days to include.
 * @param options.includeSubagents - keep delegated sessions in the totals.
 * @param options.force - bypass the Host cache.
 * @param options.signal - aborts the request when the caller unmounts.
 * @returns the parsed payload.
 */
export async function fetchSeries(options = {}) {
  const url = new URL(SERIES_ROUTE, document.baseURI)
  url.searchParams.set('windowDays', String(options.windowDays ?? 365))
  url.searchParams.set('includeSubagents', options.includeSubagents === false ? '0' : '1')
  if (options.force === true) url.searchParams.set('force', '1')
  const response = await fetch(url, { signal: options.signal, headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`usage request failed: HTTP ${String(response.status)}`)
  const payload = await response.json()
  if (typeof payload !== 'object' || payload === null) throw new Error('usage response was not an object')
  if (payload.available === false) throw new Error(String(payload.error ?? 'usage-unavailable'))
  return payload
}
