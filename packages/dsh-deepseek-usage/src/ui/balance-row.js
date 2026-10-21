/**
 * The sidebar balance row: one line that answers "can I keep working".
 *
 * It renders nothing at all unless a DeepSeek account credential is stored, and
 * nothing when the balance cannot be read either: a failed transport proves no
 * account, so an unauthenticated sidebar never grows a row. The row uses the
 * host's own `Menu` so it inherits the product's menu surface, item rhythm,
 * icon color, focus ring, and dismissal behavior instead of imitating them.
 */

import { fetchBalance } from './api.js'
import { formatMoney, relativeDays } from './format.js'
import { CLOCK, PLUS, USAGE, WALLET } from './icons.js'

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
 * The `Menu` component from the host's shared primitives, or undefined in a
 * host that does not expose it.
 *
 * Read lazily rather than imported, so a missing primitive degrades to "no
 * menu" instead of preventing the row from mounting at all.
 *
 * @param primitives - the `@deepseek-ai/dsh-client-ui-primitives` module.
 * @returns the Menu component, or undefined.
 */
function menuOf(primitives) {
  return typeof primitives?.Menu === 'function' ? primitives.Menu : undefined
}

/**
 * The balance row and its menu.
 *
 * @param props.wide - whether the sidebar shows labels.
 * @param props.openUsage - opens the usage panel.
 * @param props.openTopUp - opens the Platform billing page.
 * @param props.t - the plugin's locale lookup.
 * @param props.language - active UI language, so relative text matches `t`.
 * @param props.primitives - the host's primitives module, for `Menu`.
 * @returns the row, or null when there is nothing to show.
 */
export function BalanceRow({ wide, openUsage, openTopUp, t, language, primitives }) {
  const [state, setState] = React.useState({ status: 'loading' })
  const [open, setOpen] = React.useState(false)
  const anchor = React.useRef(null)
  const trigger = React.useRef(null)
  const inflight = React.useRef(undefined)
  const mounted = React.useRef(true)

  // One in-flight read at a time: an opening menu that fires while a poll is
  // still running must not leave an un-aborted request behind.
  const load = React.useCallback(async force => {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller
    try {
      const payload = await fetchBalance({ force, signal: controller.signal })
      if (mounted.current && inflight.current === controller) setState({ status: 'ready', payload })
    } catch (error) {
      if (error?.name !== 'AbortError' && mounted.current && inflight.current === controller) {
        setState({ status: 'ready', payload: { signedIn: false, available: false, error: 'network' } })
      }
    } finally {
      if (inflight.current === controller) inflight.current = undefined
    }
  }, [])

  React.useEffect(() => {
    mounted.current = true
    void load(false)
    const tick = () => {
      if (document.visibilityState !== 'visible' || open) return
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
  }, [load, open])

  const openMenu = () => {
    setOpen(value => {
      const next = !value
      // Opening the menu is the refresh gesture: the number the person is about
      // to read should be the one the platform holds right now.
      if (next) void load(true)
      return next
    })
  }

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

  const Menu = menuOf(primitives)
  const label = h('button', {
    ref: trigger,
    type: 'button',
    className: 'dsu-row',
    'data-collapsed': !wide,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-label': `${t('balance')}: ${amount}`,
    onClick: openMenu,
  },
  h('span', { className: 'dsu-row-glyph', 'data-tone': ready ? 'accent' : 'muted' }, h(Glyph, { description: WALLET })),
  wide && h('span', { className: 'dsu-row-main' },
    h('span', { className: 'dsu-row-amount' }, amount, ready && payload.currency !== undefined
      ? h('span', { className: 'dsu-row-unit' }, payload.currency)
      : null),
    subline !== null && h('span', { className: 'dsu-row-sub', 'data-tone': expiring === undefined ? 'muted' : 'warn' },
      expiring !== undefined && h(Glyph, { description: CLOCK }),
      subline),
  ))

  if (Menu === undefined) {
    return h('div', { className: 'dsu dsu-anchor', ref: anchor }, label)
  }

  return h('div', { className: 'dsu dsu-anchor', ref: anchor },
    h(Menu, {
      open,
      side: 'top',
      portal: true,
      className: 'dsu-menu-anchor',
      align: 'start',
      anchor: label,
      items: [
        {
          id: 'usage',
          label: t('usage'),
          icon: h(Glyph, { description: USAGE }),
        },
        {
          id: 'topup',
          label: t('topUp'),
          icon: h(Glyph, { description: PLUS }),
        },
      ],
      onClose: () => { setOpen(false) },
      onSelect: id => {
        setOpen(false)
        if (id === 'usage') openUsage()
        else if (id === 'topup') openTopUp()
      },
    }),
  )
}
