/**
 * Inline glyphs owned by this plugin.
 *
 * They are drawn here rather than imported from the host's icon set because a
 * bundle may be installed against a host whose primitives export a different
 * subset; these only need the current color.
 */

/** Wrap path children in one 20px box that inherits `currentColor`. */
function glyph(children, size) {
  return {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    children,
  }
}

/** Wallet glyph for the balance row. */
export const WALLET = glyph([
  { d: 'M3 8.5A2.5 2.5 0 0 1 5.5 6H18a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5z' },
  { d: 'M3 8.5V7a2 2 0 0 1 2-2h11' },
  { cx: 16.5, cy: 12.5, r: 1.1, fill: 'currentColor', stroke: 'none' },
], 16)

/** Clock glyph for the expiry line. */
export const CLOCK = glyph([
  { cx: 12, cy: 12, r: 9 },
  { d: 'M12 7v5l3 2' },
], 11)

/** Bar-chart glyph for the usage entry; denser than a grid at 15px. */
export const GRID = glyph([
  { d: 'M5 19V10M11 19V5M17 19v-6' },
  { d: 'M3 21h18' },
], 15)

/** Plus glyph for the top-up entry. */
export const PLUS = glyph([{ d: 'M12 5v14M5 12h14' }], 15)

/** Refresh glyph for the manual refresh entry. */
export const REFRESH = glyph([
  { d: 'M20 12a8 8 0 1 1-2.3-5.6' },
  { d: 'M20 4v4h-4' },
], 15)

/** Bar-chart glyph for the global panel navigation seat. */
export const BARS = glyph([
  { d: 'M4 19V9M10 19V5M16 19v-7M22 19H2' },
], 18)
