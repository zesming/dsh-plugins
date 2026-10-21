/**
 * The sidebar balance row: one line that answers "can I keep working".
 *
 * It renders nothing at all when no DeepSeek account credential is stored, so
 * the sidebar of an API-key or third-party user is unchanged.
 */

import { fetchBalance } from './api.js'
import { formatMoney, relativeDays } from './format.js'
import { CLOCK, GRID, PLUS, REFRESH, WALLET } from './icons.js'

const h = React.createElement

/** How often the balance is refreshed while the page is visible. */
const POLL_MS = 5 * 60_000

/**
 * Render one icon description as an SVG element.
 *
 * @param description - descriptor from `icons.js`.
 * @returns SVG element.
 */
export function Glyph({ description }) {
  const { children, ...attributes } = description
  return h('svg', attributes, children.map((child, index) => h(child.cx === undefined ? 'path' : 'circle', { key: index, ...child })))
}

/**
 * The balance row and its menu.
 *
 * @param props.wide - whether the sidebar shows labels.
 * @param props.openUsage - opens the usage panel.
 * @param props.openTopUp - opens the Platform billing page.
 * @param props.t - the plugin's locale lookup.
 * @param props.language - active UI language, so relative text matches `t`.
 * @returns the row, or null when signed out.
 */
export function BalanceRow({ wide, openUsage, openTopUp, t, language }) {
  const [state, setState] = React.useState({ status: 'loading' })
  const [open, setOpen] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const anchor = React.useRef(null)
  const trigger = React.useRef(null)

  // One in-flight read at a time: a poll that fires while the previous read is
  // still running must not leave an un-aborted request behind.
  const inflight = React.useRef(undefined)
  const mounted = React.useRef(true)

  const load = React.useCallback(async force => {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller
    try {
      const payload = await fetchBalance({ force, signal: controller.signal })
      if (mounted.current && inflight.current === controller) setState({ status: 'ready', payload })
    } catch (error) {
      if (error?.name !== 'AbortError' && mounted.current && inflight.current === controller) {
        setState({ status: 'ready', payload: { signedIn: true, available: false, error: 'network' } })
      }
    } finally {
      if (inflight.current === controller) inflight.current = undefined
    }
  }, [])

  React.useEffect(() => {
    mounted.current = true
    void load(false)
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      void load(false)
    }
    const timer = window.setInterval(tick, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      mounted.current = false
      inflight.current?.abort()
      inflight.current = undefined
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  React.useEffect(() => {
    if (!open) return undefined
    const onPointer = event => {
      if (anchor.current !== null && !anchor.current.contains(event.target)) setOpen(false)
    }
    const onKey = event => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (state.status === 'loading') return null
  const payload = state.payload
  if (payload?.signedIn !== true) return null

  const ready = payload.available === true
  const amount = ready ? formatMoney(payload.total, payload.currency) : '--'
  const expiring = ready && Array.isArray(payload.expiring) ? payload.expiring[0] : undefined
  const subline = expiring !== undefined
    ? t('expiresIn', {
        amount: formatMoney(expiring.amount, expiring.currency ?? payload.currency),
        when: relativeDays(expiring.daysLeft, language),
      })
    : ready
      ? null
      : t('balanceUnavailable')

  return h('div', { className: 'dsu dsu-anchor', ref: anchor },
    open && h('div', { className: 'dsu-pop', 'data-collapsed': !wide, role: 'menu', 'aria-label': t('balance') },
      h('div', { className: 'dsu-pop-head' },
        h('span', { className: 'dsu-pop-title' }, t('officialAccount')),
        h('span', { className: 'dsu-pop-note' }, ready ? t('balanceNote') : t('balanceNoteUnavailable')),
      ),
      h('button', {
        type: 'button',
        role: 'menuitem',
        className: 'dsu-pop-item',
        onClick: () => { setOpen(false); openUsage() },
      }, h(Glyph, { description: GRID }), t('usage')),
      h('button', {
        type: 'button',
        role: 'menuitem',
        className: 'dsu-pop-item',
        onClick: () => { setOpen(false); openTopUp() },
      }, h(Glyph, { description: PLUS }), t('topUp')),
      h('div', { className: 'dsu-pop-sep' }),
      h('button', {
        type: 'button',
        role: 'menuitem',
        className: 'dsu-pop-item',
        disabled: refreshing,
        onClick: async () => {
          setRefreshing(true)
          try {
            await load(true)
          } finally {
            if (mounted.current) setRefreshing(false)
          }
        },
      }, h(Glyph, { description: REFRESH }), refreshing ? t('refreshing') : t('refreshNow')),
    ),
    h('button', {
      ref: trigger,
      type: 'button',
      className: 'dsu-row',
      'data-collapsed': !wide,
      'aria-haspopup': 'menu',
      'aria-expanded': open,
      'aria-label': `${t('balance')}: ${amount}`,
      onClick: () => { setOpen(value => !value) },
    },
    h('span', { className: 'dsu-row-glyph', 'data-tone': ready ? 'accent' : 'muted' }, h(Glyph, { description: WALLET })),
    wide && h('span', { className: 'dsu-row-main' },
      h('span', { className: 'dsu-row-amount' }, amount, ready && payload.currency !== undefined
        ? h('span', { className: 'dsu-row-unit' }, payload.currency)
        : null),
      subline !== null && h('span', { className: 'dsu-row-sub', 'data-tone': expiring === undefined ? 'muted' : 'warn' },
        expiring !== undefined && h(Glyph, { description: CLOCK }),
        subline),
    )),
  )
}
