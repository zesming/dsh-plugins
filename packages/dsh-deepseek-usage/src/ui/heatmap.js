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

/** Number of columns in the daily view: 53 weeks covers a full year plus edges. */
export const DAY_COLUMNS = 53

/** Number of columns in the weekly view. */
export const WEEK_COLUMNS = 26

/**
 * Cell geometry in the shared viewBox; the SVG scales to its container.
 *
 * 53 columns of a year share one panel width, so a square cell is capped by
 * that width and ends up small. The cell is therefore taller than it is wide:
 * the extra height costs nothing horizontally and gives each day a target that
 * is easier to hit and easier to read at a glance.
 */
export const CELL = 13

/** Cell height, deliberately larger than its width. */
export const CELL_HEIGHT = 20

/** Gap between cells in the shared viewBox. */
export const GAP = 3

/**
 * Chart height, in the shared viewBox.
 *
 * Every view draws its chart at this height so switching between them does not
 * move the page under the cursor: the block charts use it directly, and the
 * daily grid is sized to match.
 */
export const CHART_HEIGHT = 168

/**
 * Build the day grid for a rolling year, Monday-first.
 *
 * Monday-first rather than Sunday-first because the gutter labels the rows and
 * the page is read in Chinese, where a week starts on Monday. A Sunday-first
 * grid under Monday-first labels shifts every row by a day, which is a wrong
 * chart rather than a cosmetic difference.
 *
 * @param today - the last day the grid should include.
 * @returns 53 columns of 7 local dates, oldest first.
 */
export function dayGrid(today) {
  const start = new Date(today.getTime())
  start.setDate(start.getDate() - 364)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
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
