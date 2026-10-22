/**
 * The usage page: KPI row, heatmap (day / week) or cumulative chart, and the
 * per-model table.
 *
 * One component serves both mounts — the global panel and the Settings
 * section — so the two entries can never drift apart.
 */

import { fetchPricing, fetchSeries } from './api.js'
import { compactTokens, formatMoney, groupCount, keyOf, shiftDays } from './format.js'
import { withoutSubagents } from '../usage.js'
import { decimalOfMicro, restrictSeries, sumCost, sumSeries } from './aggregate.js'
import { MAX_BLOCKS, blockColumns, runningTotal } from './blocks.js'
import { estimateCost, holidayCoverageCovers, pricingFamilyOf } from '../cost.js'
import { COVERED_YEARS } from '../holidays.js'
import {
  CELL, DAY_COLUMNS, GAP, WEEK_COLUMNS, dayGrid, monthLabels, quantileLevels, sumDays, weekGrid, weekSums,
} from './heatmap.js'
import { stylesheet } from './styles.js'

const h = React.createElement

/** Weekly cell geometry: square-ish so a week reads as a block, not a bar. */
const WEEK_CELL = 20
const WEEK_GAP = 4

/**
 * The subagent toggle, using the host's own `Switch` so its geometry, motion,
 * and focus ring match every other switch in the product.
 *
 * @param props.primitives - the host's primitives module.
 * @param props.checked - current state.
 * @param props.onChange - receives the next state.
 * @param props.t - locale lookup.
 * @returns the labelled switch, or a plain checkbox on a host without one.
 */
function SubagentSwitch({ primitives, checked, onChange, t }) {
  const Switch = typeof primitives?.Switch === 'function' ? primitives.Switch : undefined
  if (Switch === undefined) {
    return h('label', { className: 'dsu-fallback-switch' },
      h('input', { type: 'checkbox', checked, onChange: event => { onChange(event.target.checked) } }),
      t('excludeSubagents'),
    )
  }
  return h('label', { className: 'dsu-switch-row' },
    h(Switch, { checked, onChange, 'aria-label': t('excludeSubagents') }),
    h('span', null, t('excludeSubagents')),
  )
}

/**
 * The range switch, using the host's `SegmentedControl` so its indicator,
 * geometry, and keyboard handling match every other segmented control.
 *
 * @param props.primitives - the host's primitives module.
 * @param props.value - current view id.
 * @param props.onChange - receives the next view id.
 * @param props.t - locale lookup.
 * @returns the control, or plain buttons on a host without one.
 */
function RangeSwitch({ primitives, value, onChange, t }) {
  const options = [
    { value: 'day', label: t('viewDay') },
    { value: 'week', label: t('viewWeek') },
    { value: 'total', label: t('viewTotal') },
  ]
  const SegmentedControl = typeof primitives?.SegmentedControl === 'function' ? primitives.SegmentedControl : undefined
  if (SegmentedControl === undefined) {
    return h('div', { className: 'dsu-fallback-seg', role: 'group' },
      options.map(option => h('button', {
        key: option.value,
        type: 'button',
        'aria-pressed': value === option.value,
        onClick: () => { onChange(option.value) },
      }, option.label)),
    )
  }
  return h(SegmentedControl, {
    id: 'deepseek-usage-range',
    value,
    options,
    onChange,
    label: t('title'),
  })
}

/**
 * One channel filter, using the host's `Tag` for its surface and proportions.
 *
 * @param props.primitives - the host's primitives module.
 * @param props.label - channel name.
 * @param props.selected - whether the channel is included.
 * @param props.onClick - toggles it.
 * @returns the filter control.
 */
function ChannelChip({ primitives, label, selected, onClick }) {
  const className = `dsu-chip${selected ? ' dsu-chip-on' : ''}`
  return h('button', {
    type: 'button',
    className,
    'aria-pressed': selected,
    onClick,
  }, label)
}

/** Channel display order, so chips never reorder as data arrives. */
const CHANNELS = ['official', 'apikey', 'relay', 'unknown']

/** Chevron/decision: the five heat levels in paint order. */
const LEVELS = [1, 2, 3, 4, 5]

/**
 * Human label for a channel.
 *
 * @param channel - channel id from the Host.
 * @param t - locale lookup.
 * @returns localized label.
 */
function channelLabel(channel, t) {
  if (channel === 'official') return t('channelOfficial')
  if (channel === 'apikey') return t('channelApiKey')
  if (channel === 'relay') return t('channelRelay')
  return t('channelUnknown')
}

/**
 * Render a token count with its unit in a lighter weight.
 *
 * @param value - token count.
 * @returns span elements.
 */
function Tokens({ value }) {
  const compact = compactTokens(value)
  return h('span', null, compact.value, compact.unit === '' ? null : h('span', { className: 'u' }, compact.unit))
}

/**
 * Install the plugin stylesheet for the plugin's whole lifetime.
 *
 * It cannot ride on the component tree: the settings nav row that carries the
 * plugin's mark renders whether or not the usage section is the selected one,
 * so a stylesheet mounted only with the section would leave that row with two
 * glyphs until the section is opened once. The element is owned here and
 * removed by the returned disposer, so unload leaves no trace.
 *
 * @returns a disposer removing the style element.
 */
export function installStyles() {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-deepseek-usage'
  tag.textContent = stylesheet()
  document.head.appendChild(tag)
  return () => { tag.remove() }
}

/**
 * The estimated-cost block.
 *
 * `null` cost means nothing could be priced at all, and is rendered as an
 * explicit "unavailable" line rather than a zero, because a page that says
 * ¥0.00 for a month of real traffic is worse than one that admits it does not
 * know. The peak and off-peak split is shown because the same tokens cost twice
 * as much inside the peak windows, which is the actionable part of the number.
 *
 * @param props.cost - summed micro-units from `sumCost`, or null.
 * @param props.pricing - pricing state `{ phase, payload }`.
 * @param props.currency - currency of the price list.
 * @param props.scope - which range the figure covers, for the caption.
 * @param props.holidaysCovered - false when the window predates the bundled
 *   holiday schedule, which would price holidays as peak days.
 * @param props.t - locale lookup.
 * @returns the cost block.
 */
export function CostCard({ cost, pricing, currency, scope, holidaysCovered, t }) {
  if (pricing.phase === 'loading') {
    return h('div', { className: 'dsu-cost dsu-cost-loading' },
      h('span', { className: 'dsu-kpi-label' }, t('cost')),
      h('span', { className: 'dsu-cost-value' }, '—'),
    )
  }
  // Nothing in scope is a gap, not a zero: the token KPI already says "—" in
  // that case, and a ¥0.00 next to it would claim a month cost nothing. The two
  // gaps are worded apart, because one is a problem to fix and the other is not.
  if (pricing.phase === 'failed' || cost === null || cost.calls === 0 || cost.priced === 0) {
    // Three different gaps, worded apart because only two of them are worth
    // acting on. "Nothing was spent" and "spent, but none of it has a published
    // price" both have to avoid ¥0.00: one number cannot mean both "you owe
    // nothing" and "I cannot tell you what you owe".
    const note = pricing.phase === 'failed' || cost === null
      ? t('costUnavailable')
      : cost.calls === 0 ? t('costNoData') : t('costUnpricedAll')
    return h('div', { className: 'dsu-cost' },
      h('span', { className: 'dsu-kpi-label' }, t('cost')),
      h('span', { className: 'dsu-cost-value' }, '—'),
      h('span', { className: 'dsu-cost-note' }, note),
    )
  }
  const money = micro => formatMoney(decimalOfMicro(micro), currency)
  const origin = pricing.payload?.origin === 'bundled'
    ? t('costBundled', { date: pricing.payload?.readAt ?? '—' })
    : t('costLive', { date: pricing.payload?.readAt ?? '—' })
  return h('div', { className: 'dsu-cost' },
    h('div', { className: 'dsu-cost-head' },
      h('span', { className: 'dsu-kpi-label' }, t('cost')),
      h('span', { className: 'dsu-cost-scope' }, scope),
    ),
    h('div', { className: 'dsu-cost-value' }, money(cost.total)),
    h('div', { className: 'dsu-cost-split' },
      h('span', null, t('costPeak'), ' ', h('b', null, money(cost.peak))),
      h('span', null, t('costOffPeak'), ' ', h('b', null, money(cost.offPeak))),
    ),
    h('div', { className: 'dsu-cost-note' }, t('costPeakNote')),
    // Separate lines, not one run-on sentence: the peak-window rule explains
    // the split above, while the exclusion notice qualifies the total.
    cost.unpriced > 0
      ? h('div', { className: 'dsu-cost-note dsu-cost-warn' }, t('costUnpriced', { count: groupCount(cost.unpriced) }))
      : null,
    holidaysCovered === false
      ? h('div', { className: 'dsu-cost-note dsu-cost-warn' }, t('costHolidayGap'))
      : null,
    h('div', { className: 'dsu-cost-note dsu-cost-origin' }, origin),
  )
}

/**
 * The full usage view.
 *
 * @param props.t - locale lookup.
 * @param props.container - `panel` or `settings`, which only changes padding.
 * @param props.language - active UI language, for relative dates.
 * @param props.primitives - the host's primitives module, for `Switch`.
 * @returns the view.
 */
export function UsageView({ t, container, language, initialRefreshToken, primitives }) {
  const [status, setStatus] = React.useState({ phase: 'loading' })
  const [view, setView] = React.useState('day')
  const [excludeSubagents, setExcludeSubagents] = React.useState(false)
  const [channels, setChannels] = React.useState(() => new Set(CHANNELS))
  const [touched, setTouched] = React.useState(false)
  const [refreshToken, setRefreshToken] = React.useState(0)
  const [hover, setHover] = React.useState(undefined)
  // Prices load beside the usage, not before it: the figures on this page are
  // local and must not wait on a network read that may never answer.
  const [pricing, setPricing] = React.useState({ phase: 'loading' })
  /** Accept either the next readout or an updater, so a map can move one. */
  const reportHover = React.useCallback(next => {
    setHover(current => (typeof next === 'function' ? next(current) : next))
  }, [])

  // Only the explicit refresh bypasses the Host cache; a later mount or a
  // re-render must still be able to reuse a recent scan.
  const forceNext = React.useRef(false)

  React.useEffect(() => {
    if (initialRefreshToken === undefined || initialRefreshToken === 0) return
    forceNext.current = true
    setRefreshToken(value => value + 1)
  }, [initialRefreshToken])

  React.useEffect(() => {
    const controller = new AbortController()
    const force = forceNext.current
    forceNext.current = false
    setStatus(current => (current.phase === 'ready' ? { ...current, refreshing: true } : { phase: 'loading' }))
    fetchSeries({ windowDays: 365, includeSubagents: true, force, signal: controller.signal })
      .then(payload => {
        setStatus({ phase: 'ready', payload, refreshing: false })
      })
      .catch(error => {
        if (error?.name === 'AbortError') return
        setStatus({ phase: 'failed', error: String(error?.message ?? error) })
      })
    return () => { controller.abort() }
  }, [refreshToken])

  React.useEffect(() => {
    const controller = new AbortController()
    fetchPricing({ signal: controller.signal })
      .then(payload => { setPricing({ phase: 'ready', payload }) })
      .catch(error => {
        if (error?.name === 'AbortError') return
        // A failed price read degrades to "no cost shown", never to zero: an
        // estimated bill of ¥0.00 for real usage would be a lie, not a gap.
        setPricing({ phase: 'failed' })
      })
    return () => { controller.abort() }
  }, [refreshToken])

  /** Models that pass the channel filter and carry at least one call. */
  const models = React.useMemo(() => {
    if (status.phase !== 'ready') return []
    return status.payload.models.filter(row => channels.has(row.channel) && row.totals.calls > 0)
  }, [status, channels])

  /** Per-model day maps with the subagent toggle applied. */
  const series = React.useMemo(() => models.map(row => ({
    row,
    days: excludeSubagents ? withoutSubagents(row.days, row.subagent?.days) : row.days,
  })), [models, excludeSubagents])

  const totals = React.useMemo(() => sumSeries(series), [series])
  // Recomputed each render from the last fetch time, so a page left open across
  // midnight still measures "last 7 days" against today rather than yesterday.
  const today = React.useMemo(() => new Date(), [status])
  /**
   * The day keys that make up "the period in view".
   *
   * One definition drives the headline figures, the cost, and the chart
   * caption, because they must never describe different windows: a page whose
   * KPI says "today" while its cost says "last 12 months" is worse than either
   * number alone. Daily is today, weekly is this Monday to Sunday, and
   * cumulative is every day on record.
   */
  const period = React.useMemo(() => {
    if (view === 'total') {
      const days = new Set()
      for (const entry of series) for (const key of Object.keys(entry.days ?? {})) days.add(key)
      return days
    }
    if (view === 'week') {
      // The whole week, including the days after today, so the figure answers
      // "this week" as a calendar week rather than "the last seven days".
      const monday = shiftDays(today, -((today.getDay() + 6) % 7))
      const days = new Set()
      for (let offset = 0; offset < 7; offset += 1) days.add(keyOf(shiftDays(monday, offset)))
      return days
    }
    return new Set([keyOf(today)])
  }, [view, series, today])

  const inPeriod = React.useMemo(() => restrictSeries(series, period), [series, period])
  const periodTotals = React.useMemo(() => sumSeries(inPeriod), [inPeriod])

  const cost = React.useMemo(() => {
    if (pricing.phase !== 'ready') return null
    const sum = sumCost(inPeriod, pricing.payload, estimateCost, pricingFamilyOf)
    if (sum === null) return null
    // Whether anything was actually spent inside the period, which is a
    // different question from whether any model was priced: a model can be
    // priced and still have no calls in the window the page is showing.
    return { ...sum, calls: periodTotals.calls }
  }, [pricing, inPeriod, periodTotals])

  /**
   * Whether every day being priced has a bundled holiday schedule.
   *
   * Outside that range a statutory holiday would be read as an ordinary weekday
   * and priced at the peak rate, which overstates the bill. The page says so
   * instead of presenting the number as exact.
   */
  const holidaysCovered = React.useMemo(() => {
    if (period.size === 0) return true
    const sorted = [...period].sort()
    return holidayCoverageCovers(sorted[0], sorted[sorted.length - 1], COVERED_YEARS)
  }, [period])

  // Once the payload arrives, narrow the default selection to the channels it
  // actually reports — but only until the person touches a chip, so a filter
  // they set is never silently undone by a refresh.
  React.useEffect(() => {
    if (status.phase !== 'ready' || touched) return
    setChannels(new Set(status.payload.channels.length === 0 ? [] : status.payload.channels))
  }, [status, touched])

  const toggleChannel = channel => {
    setTouched(true)
    setChannels(current => {
      const next = new Set(current)
      if (next.has(channel)) {
        if (next.size === 1) return current
        next.delete(channel)
      } else next.add(channel)
      return next
    })
  }

  // With nothing recorded in the period, zeroes read as "you spent nothing"
  // rather than "nothing was measured", so the figures stay blank instead.
  const empty = periodTotals.calls === 0
  const figure = value => (empty ? h('span', null, '—') : h(Tokens, { value }))
  const periodLabel = view === 'day' ? t('periodToday') : view === 'week' ? t('periodThisWeek') : t('periodAll')
  const header = h('div', { className: 'dsu-kpis' },
    h('div', { className: 'dsu-kpi' },
      h('span', { className: 'dsu-kpi-label' }, periodLabel),
      h('span', { className: 'dsu-kpi-value' }, figure(periodTotals.total)),
      h('span', { className: 'dsu-kpi-meta' }, empty ? t('noData') : t('calls', { count: groupCount(periodTotals.calls) })),
    ),
    h('div', { className: 'dsu-kpi' },
      h('span', { className: 'dsu-kpi-label' }, t('cacheRead')),
      h('span', { className: 'dsu-kpi-value' }, figure(periodTotals.cacheRead)),
      h('span', { className: 'dsu-kpi-meta' }, empty ? t('noData') : t('cacheShare', { percent: (periodTotals.cacheRead / periodTotals.total * 100).toFixed(1) })),
    ),
    h('div', { className: 'dsu-kpi' },
      h('span', { className: 'dsu-kpi-label' }, t('output')),
      h('span', { className: 'dsu-kpi-value' }, figure(periodTotals.output)),
      h('span', { className: 'dsu-kpi-meta' }, empty ? t('noData') : t('input', { value: h26(periodTotals.input) })),
    ),
    h('div', { className: 'dsu-kpi' },
      h('span', { className: 'dsu-kpi-label' }, t('recordedTotal')),
      h('span', { className: 'dsu-kpi-value' }, figure(totals.total)),
      h('span', { className: 'dsu-kpi-meta' }, empty ? t('noData') : t('calls', { count: groupCount(totals.calls) })),
    ),
  )

  const controls = h('div', { className: 'dsu-controls' },
    h(RangeSwitch, { primitives, value: view, t, onChange: setView }),
    h('div', { className: 'dsu-spacer' }),
    ...CHANNELS
      .filter(channel => status.phase !== 'ready' || status.payload.channels.includes(channel))
      .map(channel => h(ChannelChip, {
        key: channel,
        primitives,
        label: channelLabel(channel, t),
        selected: channels.has(channel),
        onClick: () => { toggleChannel(channel) },
      })),
    h(SubagentSwitch, { primitives, checked: excludeSubagents, t, onChange: setExcludeSubagents }),
  )

  if (status.phase === 'loading') {
    return h('div', { className: `dsu dsu-view`, 'data-container': container },
      h('div', { className: 'dsu-skeleton' }, h('i'), h('i'), h('i')),
    )
  }
  if (status.phase === 'failed') {
    return h('div', { className: `dsu dsu-view`, 'data-container': container },
      h('div', { className: 'dsu-empty' },
        h('strong', null, t('loadFailedTitle')),
        h('div', null, t('loadFailedBody')),
        // The reason is shown rather than swallowed: a failed read is usually a
        // wiring or configuration problem the reader can act on, and a generic
        // sentence leaves them with nothing to report.
        h('code', { className: 'dsu-error-code' }, status.error),
        h('button', { type: 'button', onClick: () => { setRefreshToken(value => value + 1) } }, t('retry')),
      ),
    )
  }

  const body = models.length === 0
    ? h('div', { className: 'dsu-empty' },
        h('strong', null, t('noUsageTitle')),
        h('div', null, t('noUsageBody')),
      )
    : view === 'day'
      ? h(DayHeatmap, { series, today, t, onHover: reportHover })
      : view === 'week'
        ? h(WeekBlocks, { series, today, t, onHover: reportHover })
        : h(CumulativeBlocks, { series, today, t, onHover: reportHover })

  const notices = []
  if (status.payload.truncated) notices.push(t('truncated', { count: groupCount(status.payload.scannedSessions) }))
  if (status.payload.failedSessions > 0) notices.push(t('failedSessions', { count: groupCount(status.payload.failedSessions) }))

  return h('div', {
    className: 'dsu dsu-view',
    'data-container': container,
  },
    header,
    h(CostCard, {
      cost,
      pricing,
      currency: pricing.payload?.currency ?? 'CNY',
      // The same window the KPI row above is describing.
      scope: periodLabel,
      holidaysCovered,
      t,
    }),
    controls,
    body,
    h(ModelTable, { series: inPeriod, totals: periodTotals, t, pricing }),
    h('p', { className: 'dsu-foot' },
      t('footnote'),
      ' ',
      t('channelNote'),
      notices.length > 0 ? ` ${notices.join(' ')}` : null,
    ),
    hover !== undefined && h(Tooltip, { hover, language, t }),
  )
}

/** Small helper so a compact number can sit inside interpolated copy. */
function h26(value) {
  const compact = compactTokens(value)
  return `${compact.value}${compact.unit}`
}

/** Fill for one heat level, referencing the stylesheet's variables. */
function fillOf(level) {
  return level === 0 ? 'var(--dsu-empty)' : `var(--dsu-heat-${String(level)})`
}

/**
 * The per-model daily heatmap.
 *
 * @param props.series - `{ row, days }` rows.
 * @param props.today - the last included day.
 * @param props.t - locale lookup.
 * @param props.onHover - receives `{ x, y, label, value }` for the tooltip.
 * @returns the heatmap block.
 */
export function DayHeatmap({ series, today, t, onHover }) {
  const columns = React.useMemo(() => dayGrid(today), [today])
  const labels = React.useMemo(() => monthLabels(columns), [columns])
  const width = DAY_COLUMNS * (CELL + GAP)
  const height = 7 * (CELL + GAP)
  const todayKey = keyOf(today)

  return h('div', null,
    h('div', { className: 'dsu-hm-head' },
      h('span', { className: 'dsu-hm-title' }, t('dayHint')),
    ),
    h('div', { className: 'dsu-lanes' },
      series.map(({ row, days }, laneIndex) => {
        const level = quantileLevels(Object.values(days).map(tally => tally.total))
        return h('div', { className: 'dsu-lane', key: row.id },
          h('div', { className: 'dsu-lane-head' },
            h('span', { className: 'dsu-lane-name', title: row.model }, row.model.split('/').pop()),
            h('span', { className: 'dsu-tag' }, channelLabel(row.channel, t)),
            h('span', { className: 'dsu-lane-total' }, h(Tokens, { value: sumDays(days) })),
          ),
          h('div', { className: 'dsu-hm-body' },
            h('div', { className: 'dsu-dow' },
              ['mon', 'wed', 'fri', 'sun'].map((_, index) => h('span', { key: index }, WEEKDAY_GLYPHS[index])),
            ),
            h('div', { className: 'dsu-hm-canvas' },
              laneIndex === 0
                ? h('div', { className: 'dsu-months' },
                    labels.map(label => h('span', {
                      key: label.column,
                      style: { left: `${String(label.column / DAY_COLUMNS * 100)}%` },
                    }, String(label.month))))
                : null,
              h('svg', {
                className: 'dsu-svg',
                viewBox: `0 0 ${String(width)} ${String(height)}`,
                preserveAspectRatio: 'xMidYMid meet',
                role: 'img',
                'aria-label': `${row.model} daily token usage`,
                onMouseLeave: () => { onHover(undefined) },
                onMouseMove: event => { onHover(current => (current === undefined ? current : { ...current, x: event.clientX, y: event.clientY })) },
              },
                columns.flatMap((column, weekIndex) => column.map((date, dayIndex) => {
                  const key = keyOf(date)
                  if (key > todayKey) return null
                  const tally = days[key]
                  const levelValue = level(tally?.total ?? 0)
                  return h('rect', {
                    key,
                    x: weekIndex * (CELL + GAP),
                    y: dayIndex * (CELL + GAP),
                    width: CELL,
                    height: CELL,
                    rx: 2.5,
                    fill: fillOf(levelValue),
                    stroke: key === todayKey ? 'var(--dsw-alias-state-business-primary)' : 'none',
                    strokeWidth: key === todayKey ? 1.6 : 0,
                    onMouseEnter: event => {
                      onHover({
                        x: event.clientX,
                        y: event.clientY,
                        label: `${key} · ${row.model.split('/').pop()}`,
                        value: tally?.total ?? 0,
                      })
                    },
                  })
                })),
              ),
            ),
          ),
        )
      }),
    ),
    h(Legend, { t }),
  )
}

/** Monday-first weekday glyphs for the row label column. */
const WEEKDAY_GLYPHS = ['一', '三', '五', '日']

/** Vertical distance between two stacked blocks in the chart viewBox. */
const BLOCK_STEP = 20

/**
 * Gap between two stacked blocks.
 *
 * A stack has to stay countable: with a tight gap the blocks fuse into one
 * solid bar and the only thing the chart communicates is its height, which is
 * exactly what the block form was meant to improve on.
 */
const BLOCK_GAP = 7

/**
 * The block-column chart shared by the weekly and cumulative views.
 *
 * One column per week, each column a stack of identical blocks. A fixed 2B or
 * 100B block would draw nothing at all for a light month, and an empty chart is
 * indistinguishable from "no usage", so the unit is derived from the data and
 * stated in the legend beneath.
 *
 * @param props.columns - `{ key, label, parts, total }` per column, oldest first.
 * @param props.unit - block size in tokens.
 * @param props.clipped - whether any column overflowed the block ceiling.
 * @param props.caption - what the chart shows, above the grid.
 * @param props.ariaLabel - accessible name for the grid.
 * @param props.t - locale lookup.
 * @param props.onHover - receives tooltip coordinates and text.
 * @returns the chart block.
 */
export function BlockChart({ columns, unit, clipped, caption, ariaLabel, t, onHover }) {
  const width = columns.length * (WEEK_CELL + WEEK_GAP)
  const height = MAX_BLOCKS * (BLOCK_STEP)
  const compact = compactTokens(unit)

  return h('div', null,
    h('div', { className: 'dsu-hm-head' },
      h('span', { className: 'dsu-hm-title' }, caption),
      clipped ? h('span', { className: 'dsu-hm-hint' }, t('blockClipped')) : null,
    ),
    h('div', { className: 'dsu-hm-body' },
      h('div', { className: 'dsu-block-axis' },
        // One label per block level, top down, so a reader can count a column
        // and read its value without hovering.
        Array.from({ length: MAX_BLOCKS }, (_, index) => {
          const level = MAX_BLOCKS - index
          const amount = compactTokens(unit * level)
          return h('span', { key: level, className: 'dsu-block-axis-tick' },
            `${amount.value}${amount.unit}`)
        }),
      ),
      h('svg', {
        className: 'dsu-wk-svg',
        viewBox: `0 0 ${String(width)} ${String(height)}`,
        preserveAspectRatio: 'none',
        role: 'img',
        'aria-label': ariaLabel,
        onMouseLeave: () => { onHover(undefined) },
        onMouseMove: event => { onHover(current => (current === undefined ? current : { ...current, x: event.clientX, y: event.clientY })) },
      },
        columns.map((column, index) => h('g', {
          key: column.key,
          onMouseEnter: event => {
            onHover({
              x: event.clientX,
              y: event.clientY,
              label: `${column.label} · ${t('blocksCount', { count: String(column.blocks) })}`,
              value: column.total,
            })
          },
        },
          // One rect per block, drawn bottom-up, so the stack reads as a bar
          // built from countable units rather than as a single height.
          Array.from({ length: column.blocks }, (_, level) => h('rect', {
            key: level,
            x: index * (WEEK_CELL + WEEK_GAP),
            y: height - (level + 1) * BLOCK_STEP + BLOCK_GAP,
            width: WEEK_CELL,
            height: BLOCK_STEP - BLOCK_GAP,
            rx: 2,
            fill: 'var(--dsu-heat-4)',
          })),
        )),
      ),
    ),
    h('div', { className: 'dsu-wk-months' },
      columns.map((column, index) => index % 4 === 0
        ? h('span', { key: column.key, style: { left: `${String(index / columns.length * 100)}%` } }, column.axis)
        : null),
    ),
    h(BlockLegend, { unit, t }),
  )
}

/**
 * The block chart's legend.
 *
 * It states the unit, because the columns are meaningless without it: "seven
 * blocks" says nothing until the reader knows what one block is worth.
 *
 * @param props.unit - block size in tokens.
 * @param props.t - locale lookup.
 * @returns the legend row.
 */
export function BlockLegend({ unit, t }) {
  const compact = compactTokens(unit)
  return h('div', { className: 'dsu-legend dsu-block-legend' },
    h('span', { className: 'dsu-block-sample' }, h('i')),
    h('span', { className: 'dsu-block-legend-text' }, t('blockUnit', { value: `${compact.value}${compact.unit}` })),
    h('span', { className: 'dsu-block-legend-cap' }, t('blockCap', { count: String(MAX_BLOCKS) })),
  )
}

/**
 * The weekly view: one block column per week.
 *
 * @param props.series - `{ row, days }` rows.
 * @param props.today - the last included day.
 * @param props.t - locale lookup.
 * @param props.onHover - receives tooltip coordinates.
 * @returns the weekly chart.
 */
export function WeekBlocks({ series, today, t, onHover }) {
  const weeks = React.useMemo(() => {
    const grid = weekGrid(today)
    return grid.map(column => ({ key: keyOf(column[0]), days: column.map(keyOf) }))
  }, [today])
  // Every model's week summed, because the columns answer "how much did I spend
  // each week", not "which model spent it" — the table below breaks that down.
  const values = React.useMemo(() => weeks.map(week => week.days.reduce((sum, key) => {
    let total = 0
    for (const entry of series) total += entry.days[key]?.total ?? 0
    return sum + total
  }, 0)), [weeks, series])
  const { unit, columns, clipped } = React.useMemo(() => blockColumns(values), [values])

  const rows = weeks.map((week, index) => ({
    key: week.key,
    label: `${week.key} ${t('weekRange')}`,
    axis: week.key.slice(5),
    weekIndex: index,
  }))
  return h(BlockChart, {
    columns: rows.map(row => ({ ...row, total: values[row.weekIndex], blocks: columns[row.weekIndex].blocks })),
    unit,
    clipped,
    caption: t('weekHint'),
    ariaLabel: t('weekAria'),
    t,
    onHover,
  })
}

/**
 * The cumulative view: one block column per week, each column the running total.
 *
 * The running total is what makes this view different from the weekly one: the
 * same weeks, read as an accumulation rather than as a comparison.
 *
 * @param props.series - `{ row, days }` rows.
 * @param props.today - the last included day.
 * @param props.t - locale lookup.
 * @param props.onHover - receives tooltip coordinates.
 * @returns the cumulative chart.
 */
export function CumulativeBlocks({ series, today, t, onHover }) {
  const weeks = React.useMemo(() => {
    const grid = weekGrid(today)
    return grid.map(column => ({ key: keyOf(column[0]), days: column.map(keyOf) }))
  }, [today])
  const weekly = React.useMemo(() => weeks.map(week => week.days.reduce((sum, key) => {
    let total = 0
    for (const entry of series) total += entry.days[key]?.total ?? 0
    return sum + total
  }, 0)), [weeks, series])
  const running = React.useMemo(() => runningTotal(weekly), [weekly])
  const { unit, columns, clipped } = React.useMemo(() => blockColumns(running), [running])

  return h(BlockChart, {
    columns: weeks.map((week, index) => ({
      key: week.key,
      label: `${week.key} ${t('weekRange')} · ${t('cumulativeSince')}`,
      axis: week.key.slice(5),
      total: running[index],
      blocks: columns[index].blocks,
    })),
    unit,
    clipped,
    caption: t('totalHint'),
    ariaLabel: t('totalAria'),
    t,
    onHover,
  })
}

/**
 * The legend under each heatmap.
 *
 * It carries the scale as swatches only: the order of the shades states the
 * direction, and a caption saying so would repeat the idea a second time.
 * The row is labelled for assistive technology, which cannot see the ramp.
 *
 * @param props.t - locale lookup.
 * @returns the legend row.
 */
export function Legend({ t }) {
  return h('div', { className: 'dsu-legend', role: 'img', 'aria-label': t('colorHint') },
    h('span', { className: 'dsu-swatch', style: { background: 'var(--dsu-empty)' } }),
    LEVELS.map(level => h('span', {
      key: level,
      className: 'dsu-swatch',
      style: { background: fillOf(level) },
    })),
  )
}

/**
 * The per-model table.
 *
 * The rows are already scoped to the period in view, so the table, the KPI row
 * and the cost card all describe the same window; a table of year totals under
 * a "today" headline would silently contradict it.
 *
 * @param props.series - `{ row, days }` rows for the period in view.
 * @param props.totals - summed figures for the share column.
 * @param props.t - locale lookup.
 * @param props.pricing - pricing state `{ phase, payload }`.
 * @returns the table block.
 */
export function ModelTable({ series, totals, t, pricing }) {
  const priced = pricing?.phase === 'ready' ? pricing.payload : null
  const currency = priced?.currency ?? 'CNY'
  const rows = series
    .map(({ row, days }) => {
      const sum = sumSeries([{ row, days }])
      const family = pricingFamilyOf(row.model)
      const plan = family === null ? undefined : priced?.models?.[family]
      const cost = plan === undefined ? null : estimateCost(sum, plan)
      return { row, sum, cost }
    })
    // A model with no calls in this period is not a row: the page is answering
    // "what did this period cost me", and a row of zeroes is noise.
    .filter(entry => entry.sum.calls > 0)
    .sort((a, b) => b.sum.total - a.sum.total)

  return h('div', { className: 'dsu-table-wrap' },
    h('div', { className: 'dsu-table-title' }, h('span', null, t('byModel')), h('span', null, 'tokens')),
    h('table', { className: 'dsu-table' },
      h('thead', null, h('tr', null,
        h('th', null, t('model')),
        h('th', null, t('modelCalls')),
        h('th', null, t('modelInput')),
        h('th', null, t('modelOutput')),
        h('th', null, t('modelCache')),
        h('th', null, t('modelTotal')),
        priced !== null ? h('th', null, t('costColumn')) : null,
        h('th', null, t('modelShare')),
      )),
      h('tbody', null,
        rows.length === 0
          ? h('tr', null, h('td', { colSpan: priced !== null ? 8 : 7, style: { textAlign: 'center', padding: '20px 0' } }, t('noData')))
          : rows.map(({ row, sum, cost }) => {
              const share = totals.total === 0 ? 0 : sum.total / totals.total
              return h('tr', { key: row.id },
                h('td', { className: 'model' }, row.model.split('/').pop(), h('span', { className: 'sub' }, row.provider)),
                h('td', null, groupCount(sum.calls)),
                h('td', null, h26(sum.input)),
                h('td', null, h26(sum.output)),
                h('td', null, h26(sum.cacheRead)),
                h('td', { className: 'total' }, h26(sum.total)),
                priced !== null
                  ? h('td', { className: 'dsu-cost-cell' }, cost === null ? '—' : formatMoney(cost.total, currency))
                  : null,
                h('td', null, h('span', { className: 'dsu-share' },
                  h('span', { className: 'dsu-share-bar' }, h('i', { style: { width: `${(share * 100).toFixed(0)}%` } })),
                  `${(share * 100).toFixed(0)}%`,
                )),
              )
            }),
      ),
    ),
  )
}

/**
 * A hover readout positioned at the cursor.
 *
 * @param props.hover - `{ x, y, label, value }`.
 * @param props.language - active UI language.
 * @param props.t - locale lookup.
 * @returns the tooltip element.
 */
export function Tooltip({ hover, language, t }) {
  const compact = compactTokens(hover.value)
  return h('div', {
    style: {
      position: 'fixed',
      left: `${String(hover.x + 12)}px`,
      top: `${String(hover.y - 34)}px`,
      zIndex: 80,
      pointerEvents: 'none',
      padding: '6px 8px',
      borderRadius: 'var(--dsw-radius-sm)',
      background: 'var(--dsw-alias-tooltip-bg)',
      color: 'var(--dsw-alias-tooltip-label, var(--dsw-alias-label-primary-foreground))',
      fontSize: '11.5px',
      lineHeight: '16px',
      fontVariantNumeric: 'tabular-nums',
      boxShadow: '0 6px 18px -6px rgba(0,0,0,.3)',
    },
  }, hover.label, h('br'), `${compact.value}${compact.unit}\u00a0tokens`)
}
