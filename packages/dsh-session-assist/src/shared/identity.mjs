/** Stable message identity helpers shared by the Host and browser client. */

/**
 * Join every visible text block in a Harness message.
 * Tool-call blocks, images, reasoning, and other non-text blocks are excluded.
 * @param message - a Harness message value.
 * @returns all text blocks in source order, separated by blank lines.
 */
export function textOfMessage(message) {
  if (typeof message === 'string') return message
  if (typeof message?.content === 'string') return message.content
  if (!Array.isArray(message?.content)) return ''
  return message.content
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n\n')
}

/**
 * Deterministic, non-cryptographic fingerprint for comparing reply content.
 * The two independent 32-bit lanes make accidental collisions less likely;
 * this is an identity hint, never an authorization or integrity primitive.
 * @param text - full reply text.
 * @returns two 32-bit hexadecimal lanes.
 */
export function replyFingerprint(text) {
  const bytes = new TextEncoder().encode(typeof text === 'string' ? text : '')
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 0x01000193) >>> 0
    second = Math.imul(second ^ byte, 0x85ebca6b) >>> 0
    second = (second ^ (second >>> 13)) >>> 0
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`
}
