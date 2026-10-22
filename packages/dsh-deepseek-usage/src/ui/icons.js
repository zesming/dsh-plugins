/**
 * Inline glyphs owned by this plugin.
 *
 * They follow the product's icon conventions rather than a private set: a
 * 16-unit box, `fill: none`, and a stroke that inherits `currentColor`, so a
 * glyph sits at the same optical weight as the shipped icons next to it. Two
 * weights exist for the same reason the product has two: `Medium` for an icon
 * that must hold its own in a menu, `Regular` for a quieter inline mark.
 *
 * Attribute names use the camelCase spelling React expects for SVG
 * presentation attributes; a hyphenated one renders but warns on every paint.
 */

/** Stroke width of the product's `Medium` icon variant. */
const MEDIUM = 1.45

/** Stroke width of the product's `Regular` icon variant. */
const REGULAR = 1

/**
 * Wrap shape children in the product's 16-unit icon box.
 *
 * @param children - SVG child descriptors.
 * @param size - rendered edge length in pixels.
 * @param weight - stroke width; defaults to the `Medium` variant.
 * @returns a descriptor `Glyph` can render.
 */
function glyph(children, size, weight = MEDIUM) {
  return {
    viewBox: '0 0 16 16',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: weight,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    children,
  }
}

/**
 * The usage mark: four activity cells at rising intensity.
 *
 * A 3×3 lattice disappears into a grey block at 14px, and a bar chart already
 * means two other things in this product's navigation. Four larger cells carry
 * the same idea the page draws — an intensity scale — and stay legible small:
 * one outline, one light fill, one mid, one solid, reading top-left to
 * bottom-right as the scale the heatmap uses.
 */
export const USAGE = glyph([
  { d: 'M2 2h4.6v4.6H2z' },
  { d: 'M9.4 2h4.6v4.6H9.4z', fill: 'currentColor', fillOpacity: 0.32 },
  { d: 'M2 9.4h4.6v4.6H2z', fill: 'currentColor', fillOpacity: 0.62 },
  { d: 'M9.4 9.4h4.6v4.6H9.4z', fill: 'currentColor', stroke: 'none' },
], 16)

/** Wallet glyph for the balance row. */
export const WALLET = glyph([
  { d: 'M1.9 5.4a1.7 1.7 0 0 1 1.7-1.7h8.5a2 2 0 0 1 2 2v5.4a1.7 1.7 0 0 1-1.7 1.7H3.6a1.7 1.7 0 0 1-1.7-1.7z' },
  { d: 'M1.9 5.4V4.6a1.4 1.4 0 0 1 1.4-1.4h7.4' },
  { cx: 11.1, cy: 8.6, r: 0.85, fill: 'currentColor', stroke: 'none' },
], 16)

/** Clock glyph for the expiry line. */
export const CLOCK = glyph([
  { cx: 8, cy: 8, r: 5.8 },
  { d: 'M8 4.7v3.5l2.2 1.4' },
], 11, REGULAR)

/** Plus glyph for the top-up entry. */
export const PLUS = glyph([{ d: 'M8 3.2v9.6M3.2 8h9.6' }], 15)
