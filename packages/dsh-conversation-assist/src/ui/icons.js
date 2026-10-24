/** One line-art hint glyph shared by the suggestion strip and its settings page. */

import React from 'react'

const h = React.createElement

/**
 * Render the lightbulb used for "hint" in both places.
 * @param props.className - size/color class.
 * @param props.size - square edge in pixels.
 * @returns an inline SVG.
 */
export function HintIcon({ className, size = 16 }) {
  return h('svg', {
    className,
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  },
  h('path', { d: 'M9 18h6' }),
  h('path', { d: 'M10 21h4' }),
  h('path', { d: 'M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V17h5v-1.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z' }))
}
