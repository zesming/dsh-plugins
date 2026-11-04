/**
 * Place the hover readout inside the viewport.
 *
 * The readout is `position: fixed`, so it is positioned in viewport coordinates
 * and nothing else in the layout constrains it: a cell near the right or bottom
 * edge pushed it outside the app, over whatever sits beyond. It is flipped to
 * the other side of the cursor when there is no room, and then clamped, so it
 * never leaves the window and never jumps across the cursor more than needed.
 *
 * @param input - cursor position, box size, viewport size, and margin.
 * @returns the left and top to place the box at.
 */
export function tooltipPosition(input) {
  const { x, y, width, height, viewportWidth, viewportHeight, gap = 12, margin = 8 } = input
  const offsets = { up: 34 }
  // Prefer above-right of the cursor, flip each axis independently when the box
  // would cross an edge, then clamp so a box larger than the space still stays
  // on screen rather than being pushed out by the flip.
  const fitsRight = x + gap + width <= viewportWidth - margin
  const fitsAbove = y - offsets.up >= margin
  let left = fitsRight ? x + gap : x - gap - width
  let top = fitsAbove ? y - offsets.up : y + gap
  left = Math.max(margin, Math.min(left, viewportWidth - margin - width))
  top = Math.max(margin, Math.min(top, viewportHeight - margin - height))
  return { left, top }
}

