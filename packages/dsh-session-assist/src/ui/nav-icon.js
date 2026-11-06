/** The settings nav icon for the session-assist section. */

import React from 'react'

import { HintIcon } from './icons.js'

const h = React.createElement

/**
 * Render the lightbulb the shell shows in the settings nav for this section.
 *
 * The shell renders the occupant of the `settings.section.icon` slot (matched
 * by the section's id) inside its own leading-glyph seat and falls back to the
 * gear when no icon is registered. The component only owns the glyph; the
 * shell owns the button, label, size, and active state.
 *
 * @param props.size - edge length in pixels supplied by the shell.
 * @returns an inline lightbulb glyph.
 */
export function NavIcon({ size = 16 }) {
  return h(HintIcon, { size })
}
