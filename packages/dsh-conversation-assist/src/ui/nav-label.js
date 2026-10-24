/** The settings nav label with the same lightbulb the row uses. */

import React from 'react'

import { HintIcon } from './icons.js'

const h = React.createElement

/**
 * Render the nav label as marker + text. The marker is the hook the plugin's
 * stylesheet uses to hide the shell's gear fallback in this row only; every
 * other settings row keeps the shipped glyph.
 * @param text - localized section name.
 * @returns a React fragment for the shell to render as the label children.
 */
export function navLabel(text) {
  return h(React.Fragment, null,
    h('span', { 'data-dca-navmark': '', 'aria-hidden': 'true' }, h(HintIcon, { size: 16 })),
    h('span', { 'data-dca-navtext': '' }, text))
}
