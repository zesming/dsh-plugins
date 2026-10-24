/** Pure keyboard decision for the suggestion row's fixed-input observer. */

/**
 * Decide what a fixed-input event means for the suggestion row.
 *
 * The caller resolves the DOM and the visible entry; this function only applies
 * the arbitration rules, so every guard is unit-testable.
 * @param input - gesture and context flags.
 * @returns `accept`, `dismiss`, or `ignore`.
 */
export function decideFixedInput({ gesture, context, visible }) {
  if (!visible) return 'ignore'
  if (gesture.repeat || gesture.composing || gesture.defaultPrevented) return 'ignore'
  if (gesture.control || gesture.alt || gesture.meta || gesture.shift) return 'ignore'
  if (context.modal !== null) return 'ignore'
  if (context.region !== 'editable' || context.targetIsInput !== true) return 'ignore'
  if (gesture.code === 'Escape') return 'dismiss'
  if (gesture.code === 'Tab' || gesture.code === 'ArrowRight') return 'accept'
  return 'ignore'
}
