/**
 * The usage page: KPI row, heatmap (day / week) or cumulative chart, and the
 * per-model table.
 *
 * One component serves both mounts — the global panel and the Settings
 * section — so the two entries can never drift apart.
 */

import { fetchSeries } from './api.js'
import { compactTokens, groupCount, keyOf, shiftDays } from './format.js'
import { withoutSubagents } from '../usage.js'
import { sumSeries, sumWindow, weekStacks } from './aggregate.js'
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
 * The plugin stylesheet, mounted with the component tree.
 *
 * @returns a style element.
 */
export function Styles() {
  return h('style', null, stylesheet())
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
  const last7 = React.useMemo(() => sumWindow(series, today, 7), [series, today])

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

  // With nothing recorded, zeroes read as "you spent nothing" rather than
  // "nothing was measured", so the figures stay blank instead.
  const empty = totals.calls === 0
  const figure = value => (empty ? h('span', null, '—') : h(Tokens, { value }))
  const header = h('div', { className: 'dsu-kpis' },
    h('div', { className: 'dsu-kpi' },
      h('span', { className: 'dsu-kpi-label' }, t('cumulativeTokens')),
      h('span', { className: 'dsu-kpi-value' }, figure(totals.total)),
      h('span', { className: 'dsu-kpi-meta' }, empty ? t('noData') : t('calls', { count: groupCount(totals.calls) })),
    ),
    h('div', { className: 'dsu-kpi' },
      h('span', { className: 'dsu-kpi-label' }, t('last7')),
      h('span', { className: 'dsu-kpi-value' }, figure(last7)),
      h('span', { className: 'dsu-kpi-meta' }, empty ? t('noData') : t('dailyAverage', { value: h26(Math.round(last7 / 7)) })),
    ),
    h('div', { className: 'dsu-kpi' },
      h('span', { className: 'dsu-kpi-label' }, t('cacheRead')),
      h('span', { className: 'dsu-kpi-value' }, figure(totals.cacheRead)),
      h('span', { className: 'dsu-kpi-meta' }, empty ? t('noData') : t('cacheShare', { percent: (totals.cacheRead / totals.total * 100).toFixed(1) })),
    ),
    h('div', { className: 'dsu-kpi' },
      h('span', { className: 'dsu-kpi-label' }, t('output')),
      h('span', { className: 'dsu-kpi-value' }, figure(totals.output)),
      h('span', { className: 'dsu-kpi-meta' }, empty ? t('noData') : t('input', { value: h26(totals.input) })),
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
        ? h(WeekHeatmap, { series, today, t, onHover: reportHover })
        : h(CumulativeChart, { series, today, t, onHover: reportHover })

  const notices = []
  if (status.payload.truncated) notices.push(t('truncated', { count: groupCount(status.payload.scannedSessions) }))
  if (status.payload.failedSessions > 0) notices.push(t('failedSessions', { count: groupCount(status.payload.failedSessions) }))

  return h('div', {
    className: 'dsu dsu-view',
    'data-container': container,
  },
    header,
    controls,
    body,
    h(ModelTable, { series, totals, t }),
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
      h('span', { className: 'dsu-hm-hint' }, t('colorHint')),
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

/**
 * The per-model weekly heatmap.
 *
 * @param props.series - `{ row, days }` rows.
 * @param props.today - the last included day.
 * @param props.t - locale lookup.
 * @param props.onHover - receives tooltip coordinates.
 * @returns the weekly block.
 */
export function WeekHeatmap({ series, today, t, onHover }) {
  const columns = React.useMemo(() => weekGrid(today), [today])
  const width = WEEK_COLUMNS * (WEEK_CELL + WEEK_GAP)
  const height = WEEK_CELL

  return h('div', null,
    h('div', { className: 'dsu-hm-head' },
      h('span', { className: 'dsu-hm-title' }, t('weekHint')),
      h('span', { className: 'dsu-hm-hint' }, t('colorHint')),
    ),
    h('div', { className: 'dsu-lanes' },
      series.map(({ row, days }) => {
        const sums = weekSums(days, columns)
        const level = quantileLevels(sums)
        return h('div', { className: 'dsu-lane', key: row.id },
          h('div', { className: 'dsu-lane-head' },
            h('span', { className: 'dsu-lane-name', title: row.model }, row.model.split('/').pop()),
            h('span', { className: 'dsu-tag' }, channelLabel(row.channel, t)),
            h('span', { className: 'dsu-lane-total' }, h(Tokens, { value: sums.reduce((a, b) => a + b, 0) })),
          ),
          h('svg', {
            className: 'dsu-wk-svg',
            viewBox: `0 0 ${String(width)} ${String(height)}`,
            preserveAspectRatio: 'none',
            role: 'img',
            'aria-label': `${row.model} weekly token usage`,
            onMouseLeave: () => { onHover(undefined) },
            onMouseMove: event => { onHover(current => (current === undefined ? current : { ...current, x: event.clientX, y: event.clientY })) },
          },
            sums.map((value, index) => h('rect', {
              key: index,
              x: index * (WEEK_CELL + WEEK_GAP),
              y: 0,
              width: WEEK_CELL,
              height,
              rx: 3,
              fill: fillOf(level(value)),
              onMouseEnter: event => {
                const start = keyOf(columns[index][0])
                onHover({
                  x: event.clientX,
                  y: event.clientY,
                  label: `${start} · ${row.model.split('/').pop()}`,
                  value,
                })
              },
            })),
          ),
        )
      }),
    ),
    h('div', { className: 'dsu-wk-months' },
      columns.map((column, index) => index % 4 === 0
        ? h('span', { key: index, style: { left: `${String(index / WEEK_COLUMNS * 100)}%` } }, keyOf(column[0]).slice(5))
        : null),
    ),
    h(Legend, { t }),
  )
}

/**
 * The "cumulative" view.
 *
 * Three models that grew at similar rates produce three lines on top of each
 * other: a cumulative line chart answers "how did the total grow", which the
 * KPI row already states. What this view adds is *when* the spend happened, so
 * it stacks each day's total by model as bars — the shape of the period is
 * readable, and the hover readout still names the exact number.
 *
 * @param props.series - `{ row, days }` rows.
 * @param props.today - the last included day.
 * @param props.t - locale lookup.
 * @param props.onHover - receives tooltip coordinates.
 * @returns the chart block.
 */
export function CumulativeChart({ series, today, t, onHover }) {
  // One bar per week: a year of daily bars is 365 hairlines that hide the trend
  // they are supposed to show.
  const weeks = React.useMemo(() => {
    const grid = weekGrid(today)
    return grid.map(column => ({ key: keyOf(column[0]), days: column.map(keyOf) }))
  }, [today])
  const stacks = React.useMemo(() => weekStacks(series, weeks), [series, weeks])
  const max = Math.max(1, ...stacks.map(day => day.total))
  const W = 720
  const HGT = 148
  const PAD_L = 46
  const PAD_B = 18
  const barWidth = (W - PAD_L - 4) / stacks.length
  const y = value => HGT - PAD_B - (value / max) * (HGT - PAD_B - 6)
  const colors = ['var(--dsu-heat-4)', 'var(--dsu-heat-3)', 'var(--dsu-heat-5)']

  return h('div', null,
    h('div', { className: 'dsu-hm-head' },
      h('span', { className: 'dsu-hm-title' }, t('totalHint')),
      h('span', { className: 'dsu-hm-hint' }, t('totalHintWeekly')),
    ),
    h('div', { className: 'dsu-cum-legend' },
      series.map(({ row }, index) => h('span', { key: row.id },
        h('i', { style: { background: colors[index % colors.length] } }),
        row.model.split('/').pop(),
      )),
    ),
    h('svg', {
      className: 'dsu-chart',
      viewBox: `0 0 ${String(W)} ${String(HGT)}`,
      preserveAspectRatio: 'none',
      role: 'img',
      'aria-label': t('viewTotal'),
      onMouseLeave: () => { onHover(undefined) },
    },
      [0, 0.5, 1].map(fraction => {
        const value = max * fraction
        const compact = compactTokens(value)
        return h('g', { key: fraction },
          h('line', { className: 'gridline', x1: PAD_L, x2: W - 4, y1: y(value), y2: y(value) }),
          h('text', { className: 'axis', x: PAD_L - 6, y: y(value) + 3, textAnchor: 'end' }, `${compact.value}${compact.unit}`),
        )
      }),
      stacks.map((day, index) => {
        let cursor = 0
        return h('g', {
          key: day.key,
          onMouseEnter: event => {
            onHover({
              x: event.clientX,
              y: event.clientY,
              label: `${day.key} 起一周 · ${String(series.length)} models`,
              value: day.total,
            })
          },
        }, day.parts.map((part, partIndex) => {
          if (part.value === 0) return null
          const bottom = cursor
          cursor += part.value
          return h('rect', {
            key: part.id,
            x: PAD_L + index * barWidth,
            y: y(cursor),
            width: Math.max(0.8, barWidth - 0.6),
            height: Math.max(0, y(bottom) - y(cursor)),
            fill: colors[partIndex % colors.length],
          })
        }))
      }),
      weeks.map((week, index) => index % 4 === 0
        ? h('text', {
            key: week.key,
            className: 'axis',
            x: PAD_L + index * barWidth,
            y: HGT - 4,
            textAnchor: 'middle',
          }, week.key.slice(5))
        : null),
    ),
  )
}

/**
 * The legend under each heatmap.
 *
 * @param props.t - locale lookup.
 * @returns the legend row.
 */
export function Legend({ t }) {
  return h('div', { className: 'dsu-legend' },
    h('span', null, t('less')),
    h('span', { className: 'dsu-swatch', style: { background: 'var(--dsu-empty)' } }),
    LEVELS.map(level => h('span', {
      key: level,
      className: 'dsu-swatch',
      style: { background: fillOf(level) },
    })),
    h('span', null, t('more')),
  )
}

/**
 * The per-model table.
 *
 * @param props.series - `{ row, days }` rows.
 * @param props.totals - summed figures for the share column.
 * @param props.t - locale lookup.
 * @returns the table block.
 */
export function ModelTable({ series, totals, t }) {
  const rows = series
    .map(({ row, days }) => {
      const sum = sumSeries([{ row, days }])
      return { row, sum }
    })
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
        h('th', null, t('modelShare')),
      )),
      h('tbody', null,
        rows.length === 0
          ? h('tr', null, h('td', { colSpan: 7, style: { textAlign: 'center', padding: '20px 0' } }, t('noData')))
          : rows.map(({ row, sum }) => {
              const share = totals.total === 0 ? 0 : sum.total / totals.total
              return h('tr', { key: row.id },
                h('td', { className: 'model' }, row.model.split('/').pop(), h('span', { className: 'sub' }, row.provider)),
                h('td', null, groupCount(sum.calls)),
                h('td', null, h26(sum.input)),
                h('td', null, h26(sum.output)),
                h('td', null, h26(sum.cacheRead)),
                h('td', { className: 'total' }, h26(sum.total)),
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
