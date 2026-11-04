/** Decide whether a normal reply is clearly too short to benefit from a recap. */

const URL = /\b(?:https?:\/\/|www\.)[^\s<>]+/giu
const LIST_PREFIX = /^\s*(?:[-*+]\s+|\d+[.)]\s+|[•‣]\s+)/u
const TERMINATOR = /[.!?。！？]/u

function hasComplexStructure(text) {
  if (/(?:^|\n)\s*(?:```|~~~)/u.test(text)) return true
  const lines = text.split(/\r?\n/u)
  if (lines.some(line => /^\s*\|.*\|\s*$/u.test(line))) return true
  const listItems = lines.filter(line => LIST_PREFIX.test(line))
  return listItems.length >= 2
}

function substantiveSentenceCount(text) {
  const normalized = text
    .replace(URL, match => ` ${match.match(/[.!?]+$/u)?.[0] ?? ''}`)
    .replace(/\b\d+\.\d+\b/gu, ' ')
    .split(/\r?\n/u)
    .map(line => line.replace(LIST_PREFIX, '').trim())
    .join('\n')
  const chars = [...normalized]
  let sentences = 0
  let hasSubstance = false
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]
    if (/[\p{L}\p{N}]/u.test(char)) hasSubstance = true
    if (!TERMINATOR.test(char)) continue
    if (char === '.') {
      const previous = chars[index - 1] ?? ''
      const next = chars[index + 1] ?? ''
      if ((/\p{L}/u.test(previous) && /\p{L}/u.test(next))
        || (/\p{N}/u.test(previous) && /\p{N}/u.test(next))) continue
    }
    let end = index + 1
    while (end < chars.length && TERMINATOR.test(chars[end])) end += 1
    if (hasSubstance) sentences += 1
    hasSubstance = false
    index = end - 1
  }
  if (hasSubstance) sentences += 1
  return sentences
}

/**
 * Return true only for a short, simple reply with fewer than three sentences.
 * Complex lists, code blocks, and tables are left for the model to judge.
 * @param text - visible assistant reply.
 */
export function isBriefReply(text) {
  if (typeof text !== 'string') return true
  const value = text.trim()
  if (value === '') return true
  if ([...value].length > 160 || hasComplexStructure(value)) return false
  return substantiveSentenceCount(value) < 3
}
