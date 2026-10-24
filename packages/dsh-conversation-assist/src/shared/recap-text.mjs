/** Compose the reply lead of one Turn, with its ending when it did not complete. */

import { LIMITS } from './limits.mjs'
import { formatRow } from './locales.mjs'

/**
 * Resolve a cancellation cause, including unknown and future causes.
 * @param t - dictionary lookup.
 * @param kind - durable cancel cause kind.
 * @returns a localized cause phrase.
 */
function cause(t, kind) {
  const key = `recap.cause.${kind}`
  const row = t(key)
  return row === key ? t('recap.cause.unknown') : row
}

/**
 * Opening paragraph of the final reply, stripped of markdown and bounded.
 * @param value - folded facts.
 * @returns a snippet, or "".
 */
function snippet(value) {
  if (typeof value.lastText !== 'string' || value.lastText === '') return ''
  const withoutFences = value.lastText.replace(/```[\s\S]*?```/gu, ' ')
  const paragraphs = withoutFences
    .split(/\n\s*\n/u)
    .map(paragraph => paragraph.replace(/^\s*[#>*-]+\s*/gmu, '').trim())
    .filter(paragraph => paragraph !== '')
  let text = paragraphs[0] ?? withoutFences
  text = text
    .replace(/!?\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/[*_`~]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
  return text
}

/**
 * Ellipsize text at the hard recap bound.
 * @param text - composed sentence.
 * @param max - code-point-safe maximum.
 * @returns the text, or its prefix plus an ellipsis.
 */
export function truncateRecap(text, max = LIMITS.maxRecapChars) {
  const chars = [...text]
  return chars.length <= max ? text : `${chars.slice(0, Math.max(0, max - 1)).join('')}…`
}

/**
 * Compose the recap for one closed Turn.
 * @param value - facts published by the definition.
 * @param t - dictionary lookup returning localized rows.
 * @returns one sentence, or "" when no recap should render.
 */
export function composeRecap(value, t) {
  if (typeof value !== 'object' || value === null) return ''
  const kind = typeof value.reasonKind === 'string' ? value.reasonKind : 'unknown'
  const lead = snippet(value)
  let text
  switch (kind) {
    case 'completed':
      text = lead === ''
        ? t('recap.noReply')
        : formatRow(t('recap.completed'), { snippet: lead })
      break
    case 'aborted':
      text = formatRow(t('recap.aborted'), { cause: cause(t, value.cancelKind ?? 'unknown'), snippet: lead })
      break
    case 'blocked':
      text = formatRow(t('recap.blocked'), { snippet: lead })
      break
    case 'error':
      text = formatRow(t('recap.error'), {
        code: typeof value.errorCode === 'string' && value.errorCode !== ''
          ? formatRow(t('recap.code'), { code: value.errorCode })
          : '',
        snippet: lead,
      })
      break
    case 'max-tokens':
      text = formatRow(t('recap.maxTokens'), { snippet: lead })
      break
    case 'interrupted':
      text = t('recap.interrupted')
      break
    case 'forked':
      text = t('recap.forked')
      break
    default:
      text = t('recap.unknown')
  }
  return truncateRecap(String(text).trim())
}
