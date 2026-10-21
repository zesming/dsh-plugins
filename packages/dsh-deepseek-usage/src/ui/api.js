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

/**
 * Read the sidebar balance payload.
 *
 * @param options.signal - aborts the request when the caller unmounts.
 * @param options.force - bypass the Host cache.
 * @returns the parsed payload; a transport failure becomes an unavailable payload.
 */
export async function fetchBalance(options = {}) {
  const url = identity(new URL(BALANCE_ROUTE, document.baseURI))
  if (options.force === true) url.searchParams.set('force', '1')
  try {
    const response = await fetch(url, { signal: options.signal, headers: { accept: 'application/json' } })
    if (!response.ok) return { signedIn: true, available: false, error: `http-${String(response.status)}` }
    const payload = await response.json()
    return typeof payload === 'object' && payload !== null ? payload : { signedIn: true, available: false, error: 'malformed' }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return { signedIn: true, available: false, error: 'network' }
  }
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
