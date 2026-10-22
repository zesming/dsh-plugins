/**
 * The block-column charts used by the weekly and cumulative views.
 *
 * Both views answer "how does the shape of my spend look over time", which a
 * colour-graded heat cell cannot answer: a single 12px cell has one shade and no
 * height, so a week that doubled looks the same as one that grew tenfold. These
 * charts instead stack discrete blocks, one per unit of usage, so magnitude is
 * read as the same thing everyone already reads a bar chart for.
 *
 * The unit adapts to the data rather than being fixed. A fixed 2B block would
 * draw nothing at all for a month of light use, and an empty chart is
 * indistinguishable from "no usage"; picking the unit from the largest column
 * guarantees the tallest column always fills the chart.
 */

/** Blocks a column may show; beyond this the column is clipped. */
export const MAX_BLOCKS = 7

/** Unit ladder, in tokens: powers of ten crossed with 1, 2 and 5. */
const LADDER = [
  1e6, 2e6, 5e6,
  1e7, 2e7, 5e7,
  1e8, 2e8, 5e8,
  1e9, 2e9, 5e9,
  1e10, 2e10, 5e10,
  1e11, 2e11, 5e11,
  1e12, 2e12, 5e12,
]

/**
 * Choose the block size for a chart.
 *
 * The unit is the smallest ladder step that lets the largest column fit in
 * `MAX_BLOCKS`, so the tallest column fills the chart and every other column
 * keeps its true proportion. A chart with no usage still needs a unit, and the
 * smallest one keeps its empty state honest.
 *
 * @param maxValue - the largest column total in the chart.
 * @returns the block size in tokens.
 */
export function blockUnit(maxValue) {
  const largest = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 0
  const needed = largest / MAX_BLOCKS
  for (const step of LADDER) {
    if (step >= needed) return step
  }
  return LADDER[LADDER.length - 1]
}

/**
 * Convert a column total into a block count.
 *
 * Any usage at all shows at least one block, and the count rounds up: a column
 * that spent a tenth of a block is not nothing, and drawing it as zero would
 * make a quiet week look like an idle one. The count is capped so one outlier
 * cannot shrink every other column to a single block.
 *
 * @param value - column total in tokens.
 * @param unit - block size from {@link blockUnit}.
 * @param max - highest block count to draw.
 * @returns the number of blocks, 0 when the column spent nothing.
 */
export function blockCount(value, unit, max = MAX_BLOCKS) {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (!Number.isFinite(unit) || unit <= 0) return 0
  return Math.min(max, Math.max(1, Math.ceil(value / unit)))
}

/**
 * Build one chart's columns.
 *
 * @param values - one total per column, oldest first.
 * @param options.max - highest block count to draw.
 * @returns the unit, the columns with their block counts, and whether any
 *   column was clipped.
 */
export function blockColumns(values, options = {}) {
  const max = options.max ?? MAX_BLOCKS
  const unit = blockUnit(Math.max(0, ...values))
  const columns = values.map(value => ({ value, blocks: blockCount(value, unit, max) }))
  return {
    unit,
    columns,
    clipped: columns.some(column => column.value > unit * max),
  }
}

/**
 * Running total of one series, for the cumulative chart.
 *
 * Cumulative is drawn per week rather than per day: a year of daily points is
 * a smooth line whose shape the weekly view already conveys, while weekly totals
 * keep the columns countable in blocks.
 *
 * @param values - one total per column, oldest first.
 * @returns the running total after each column.
 */
export function runningTotal(values) {
  let sum = 0
  return values.map(value => (sum += Number.isFinite(value) && value > 0 ? value : 0))
}
