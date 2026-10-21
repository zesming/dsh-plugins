/**
 * Host half of the DeepSeek balance and usage plugin.
 *
 * It exposes two read-only, browser-authenticated routes over the existing
 * `/api` carrier rather than adding a Typert Remote namespace: typed Remote
 * methods need artifacts generated inside the harness source tree, while an
 * exact Fetch route is the public extension point a third-party bundle can
 * register (`ctx.connection.fetch.register`).
 */

import { balanceView } from './balance.js'
import { collectUsage } from './collect.js'

/** Route the sidebar reads the balance from. */
export const BALANCE_PATH = '/api/deepseek-usage.balance'

/** Route the usage page reads the series from. */
export const SERIES_PATH = '/api/deepseek-usage.series'

/** Balance answers are reused for this long; the Platform call is not free. */
const BALANCE_TTL_MS = 60_000

/** Usage answers are reused for this long; a scan reads every Session log. */
const SERIES_TTL_MS = 30_000

/** Largest window the page may request, in calendar days. */
const MAX_WINDOW_DAYS = 800

/**
 * Small time-bounded cache with per-key in-flight de-duplication.
 *
 * Two panels opening at once must not run two full scans, so a caller joins
 * the pending promise instead of starting its own.
 */
class TtlCache {
  #entries = new Map()
  #pending = new Map()
  #ttl
  #clock

  constructor(ttl, clock = () => Date.now()) {
    this.#ttl = ttl
    this.#clock = clock
  }

  /**
   * Read through the cache.
   *
   * @param key - cache key.
   * @param load - producer run on a miss.
   * @param force - ignore a fresh entry but still join an in-flight load.
   * @returns the produced value.
   */
  async read(key, load, force = false) {
    const now = this.#clock()
    const hit = this.#entries.get(key)
    if (!force && hit !== undefined && hit.expiresAt > now) return hit.value
    const inflight = this.#pending.get(key)
    if (inflight !== undefined) return inflight
    const started = (async () => {
      try {
        const value = await load()
        this.#entries.set(key, { value, expiresAt: this.#clock() + this.#ttl })
        return value
      } finally {
        this.#pending.delete(key)
      }
    })()
    this.#pending.set(key, started)
    return started
  }

  /** Drop every cached answer; used when a reload must observe new data. */
  clear() {
    this.#entries.clear()
  }
}

/** Answer with a JSON body and no caching by intermediaries. */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/** Render one failure as a JSON error the Client can branch on. */
function failure(code, status = 200) {
  return json({ available: false, error: code }, status)
}

/**
 * Parse a positive integer query parameter.
 *
 * @param url - request URL.
 * @param name - parameter name.
 * @param fallback - value used when the parameter is absent.
 * @param max - inclusive upper bound.
 * @returns the parsed value, or undefined when the parameter is malformed.
 */
function intParam(url, name, fallback, max) {
  const raw = url.searchParams.get(name)
  if (raw === null) return fallback
  if (!/^\d+$/.test(raw)) return undefined
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1 || value > max) return undefined
  return value
}

/**
 * Build the balance payload from the account services.
 *
 * The bonus read is best-effort: a failed bonus query must not hide a balance
 * that was read successfully, and vice versa.
 *
 * @param deps.deepseekAccount - mounted account provider, or undefined.
 * @param deps.client - UI identity the Platform request reports.
 * @param deps.now - current epoch milliseconds.
 * @returns the Client payload.
 */
async function readBalance(deps) {
  const { deepseekAccount, client, now } = deps
  if (deepseekAccount === undefined) return { signedIn: false, available: false, error: 'account-unavailable' }
  let state
  try {
    state = await deepseekAccount.getState()
  } catch {
    return { signedIn: false, available: false, error: 'account-unavailable' }
  }
  if (state?.status !== 'credential-stored') return { signedIn: false, available: false, error: null }
  const [balance, bonuses] = await Promise.all([
    Promise.resolve()
      .then(() => deepseekAccount.getBalance(client))
      .catch(() => undefined),
    Promise.resolve()
      .then(() => deepseekAccount.getUnnotifiedBonuses(client))
      .catch(() => undefined),
  ])
  return balanceView({ signedIn: true, balance, bonuses, now })
}

/**
 * Register the two routes and keep their caches alive with the plugin.
 *
 * @param ctx - Host context.
 * @param config - resolved plugin configuration.
 */
export function apply(ctx, config = {}) {
  const balanceCache = new TtlCache(config.balanceTtlMs ?? BALANCE_TTL_MS)
  const seriesCache = new TtlCache(config.seriesTtlMs ?? SERIES_TTL_MS)
  const now = () => Date.now()

  // `ctx.inject` hands the callback a child Context, so the service is reached
  // as `scope.connection` — the same shape the shipped Host plugins use for
  // `scope.webServer`.
  ctx.inject(['connection'], scope => {
    const disposers = []
    const register = route => disposers.push(scope.connection.fetch.register(route))

    register({
      path: BALANCE_PATH,
      methods: ['GET'],
      requestBody: 'none',
      fetch: async request => {
        const url = new URL(request.url)
        const force = url.searchParams.get('force') === '1'
        const account = ctx.get('deepseekAccount')
        try {
          const payload = await balanceCache.read('balance', () => readBalance({
            deepseekAccount: account,
            client: clientIdentity(request),
            now: now(),
          }), force)
          return json({ ...payload, readAt: now() })
        } catch (error) {
          ctx.logger?.warn?.('deepseek-usage: balance read failed', error)
          return failure('balance-failed')
        }
      },
    })

    register({
      path: SERIES_PATH,
      methods: ['GET'],
      requestBody: 'none',
      fetch: async request => {
        const url = new URL(request.url)
        const windowDays = intParam(url, 'windowDays', 365, MAX_WINDOW_DAYS)
        if (windowDays === undefined) return failure('invalid-window', 400)
        const includeSubagents = url.searchParams.get('includeSubagents') !== '0'
        const force = url.searchParams.get('force') === '1'
        const sessionQuery = ctx.get('sessionQuery')
        const key = `${String(windowDays)}:${String(includeSubagents)}`
        try {
          const payload = await seriesCache.read(key, () => collectUsage(
            { sessionQuery, now: now() },
            { windowDays, includeSubagents },
          ), force)
          return json(payload)
        } catch (error) {
          ctx.logger?.warn?.('deepseek-usage: usage scan failed', error)
          return failure('usage-failed')
        }
      },
    })

    ctx.effect(() => () => {
      for (const dispose of disposers) dispose()
      balanceCache.clear()
      seriesCache.clear()
    }, 'deepseek-usage: routes')
  })
}

/**
 * Compose the `AccountClientMetadata` a Platform request reports.
 *
 * Platform records which UI asked, so the calling page's own language and UTC
 * offset travel with the request as query parameters. A missing parameter
 * falls back to the request headers and the Host clock, which keeps a plain
 * `curl` probe working.
 *
 * @param request - the authenticated browser request.
 * @returns metadata the account service accepts.
 */
function clientIdentity(request) {
  const url = new URL(request.url)
  const locale = url.searchParams.get('locale')
    ?? (request.headers.get('accept-language') ?? '').split(',')[0]?.trim()
    ?? 'zh-CN'
  const rawOffset = url.searchParams.get('tz')
  const offset = rawOffset !== null && /^-?\d+$/.test(rawOffset) ? Number(rawOffset) : -new Date().getTimezoneOffset() * 60
  return {
    version: url.searchParams.get('version') ?? '0.1.0',
    locale: locale === '' ? 'zh-CN' : locale,
    timezoneOffsetSeconds: Number.isSafeInteger(offset) ? offset : 0,
  }
}

/** Plugin name used by the loader. */
export const name = 'deepseek-usage'
