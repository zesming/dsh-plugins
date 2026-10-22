/**
 * The heatmap primitives shared by the three usage views.
 *
 * Rendering is plain math over plain objects: the caller supplies the cells and
 * this module decides colors, layout, and the semantic labels. Keeping it
 * React-free makes the quantile bucketing testable and lets the same code drive
 * an SVG on the client.
 */

/**
 * Bucket thresholds for one lane.
 *
 * Usage is heavy-tailed: a handful of sessions carry most of the tokens, so a
 * linear scale paints 90% of the grid at the palest shade and the map stops
 * communicating. Quantiles put each of the five shades on real data, which is
 * what "darker means more" has to mean to be useful.
 *
 * @param values - non-negative token counts for one lane.
 * @returns a classifier from a count to a level 0-5; 0 is "no usage".
 */
export function quantileLevels(values) {
  const present = values.filter(value => value > 0).sort((a, b) => a - b)
  if (present.length === 0) return () => 0
  const at = q => present[Math.min(present.length - 1, Math.floor(q * present.length))]
  const thresholds = [at(0.2), at(0.4), at(0.6), at(0.8)]
  const distinct = new Set(present).size
  return value => {
    if (!(value > 0)) return 0
    // A lane whose nonzero days all tie has no distribution to spread: paint it
    // at the darkest shade so "active" still reads as active.
    if (distinct === 1) return 5
    if (value <= thresholds[0]) return 1
    if (value <= thresholds[1]) return 2
    if (value <= thresholds[2]) return 3
    if (value <= thresholds[3]) return 4
    return 5
  }
}

/**
 * Number of columns in the daily view: half a year of weeks.
 *
 * A year is 53 columns, which in a panel-width chart squeezes each day into a
 * sliver — the cells stop looking like cells and the map stops being readable at
 * a glance. Half a year keeps the same history the weekly view covers, and lets
 * each day stay square.
 */
export const DAY_COLUMNS = 26

/** Number of columns in the weekly view. */
export const WEEK_COLUMNS = 26

/**
 * Cell geometry in the shared viewBox.
 *
 * Square, and the SVG scales uniformly rather than per axis: a stretched cell
 * is the first thing a reader notices, and it makes the grid look broken. With
 * half a year of columns a square cell is still large enough to hit.
 */
export const CELL = 13

/** Gap between cells in the shared viewBox. */
export const GAP = 3

/**
 * The daily grid's height as a fraction of its width.
 *
 * The grid scales uniformly, so its rendered height follows the panel width:
 * 26 columns by 7 rows of `CELL + GAP`. The block charts use the same ratio so
 * that every view occupies the same vertical space and switching ranges never
 * moves the page — which a fixed pixel height cannot do, because the grid's
 * height is already a function of the available width.
 */
export const GRID_ASPECT = (7 * (CELL + GAP)) / (DAY_COLUMNS * (CELL + GAP))

/**
 * Chart height for a given rendered width.
 *
 * @param width - available width in CSS pixels.
 * @returns the matching chart height.
 */
export function chartHeightFor(width) {
  return Math.round(Math.max(120, width) * GRID_ASPECT)
}

/**
 * Build the day grid for a rolling year, Monday-first.
 *
 * Monday-first rather than Sunday-first because the gutter labels the rows and
 * the page is read in Chinese, where a week starts on Monday. A Sunday-first
 * grid under Monday-first labels shifts every row by a day, which is a wrong
 * chart rather than a cosmetic difference.
 *
 * @param today - the last day the grid should include.
 * @returns DAY_COLUMNS columns of 7 local dates, oldest first.
 */
export function dayGrid(today) {
  // End on the week containing today, so the current week is always drawn.
  const start = new Date(today.getTime())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  start.setDate(start.getDate() - (DAY_COLUMNS - 1) * 7)
  const columns = []
  for (let week = 0; week < DAY_COLUMNS; week += 1) {
    const column = []
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(start.getTime())
      date.setDate(start.getDate() + week * 7 + day)
      column.push(date)
    }
    columns.push(column)
  }
  return columns
}

/**
 * Build the week grid for the trailing half year.
 *
 * @param today - the last day the grid should include.
 * @returns 26 columns of 7 day keys each, oldest first.
 */
export function weekGrid(today) {
  const start = new Date(today.getTime())
  start.setDate(start.getDate() - 7 * (WEEK_COLUMNS - 1))
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const columns = []
  for (let week = 0; week < WEEK_COLUMNS; week += 1) {
    const days = []
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(start.getTime())
      date.setDate(start.getDate() + week * 7 + day)
      days.push(date)
    }
    columns.push(days)
  }
  return columns
}

/**
 * Month labels positioned over the day grid.
 *
 * A label appears only when a month's first week starts that month, so labels
 * never collide and the axis reads left to right.
 *
 * @param columns - output of {@link dayGrid}.
 * @returns `{ column, label }` pairs using 1-based month numbers.
 */
export function monthLabels(columns) {
  const labels = []
  let last = -1
  columns.forEach((column, index) => {
    const date = column[0]
    const month = date.getMonth()
    if (month !== last && date.getDate() <= 7) {
      labels.push({ column: index, month: month + 1 })
      last = month
    }
  })
  return labels
}

/**
 * Total one lane's day map.
 *
 * @param days - `{ 'YYYY-MM-DD': { total } }`.
 * @returns summed tokens.
 */
export function sumDays(days) {
  let total = 0
  for (const tally of Object.values(days ?? {})) total += tally?.total ?? 0
  return total
}

/**
 * Aggregate a day map into week buckets keyed by the Monday that starts each week.
 *
 * @param days - `{ 'YYYY-MM-DD': tally }`.
 * @param columns - output of {@link weekGrid}.
 * @returns one summed token count per column.
 */
export function weekSums(days, columns) {
  return columns.map(column => {
    let total = 0
    for (const date of column) {
      const key = `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      total += days?.[key]?.total ?? 0
    }
    return total
  })
}
