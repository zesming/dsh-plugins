/** Localized deterministic turn status and readable fallback excerpt helpers. */

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
 * Compose the exact ending state of one closed Turn.
 * This line describes the logged ending only; it does not claim that work was
 * completed or independently verified.
 * @param value - folded facts.
 * @param t - dictionary lookup returning localized rows.
 * @returns one localized status line.
 */
export function composeRecap(value, t) {
  if (typeof value !== 'object' || value === null) return ''
  const kind = typeof value.reasonKind === 'string' ? value.reasonKind : 'unknown'
  switch (kind) {
    case 'completed':
      return value.hasReply === true ? '' : t('recap.noReply')
    case 'aborted':
      return formatRow(t('recap.aborted'), { cause: cause(t, value.cancelKind ?? 'unknown') })
    case 'blocked':
      return t('recap.blocked')
    case 'error':
      return formatRow(t('recap.error'), {
        code: typeof value.errorCode === 'string' && value.errorCode !== ''
          ? formatRow(t('recap.code'), { code: value.errorCode })
          : '',
      })
    case 'max-tokens':
      return t('recap.maxTokens')
    case 'interrupted':
      return t('recap.interrupted')
    case 'forked':
      return t('recap.forked')
    default:
      return t('recap.unknown')
  }
}

/**
 * Create a compact disclosure summary without modifying the expanded source.
 * @param text - bounded excerpt.
 * @param max - maximum displayed code points.
 * @returns the text as-is or its collapsed preview.
 */
export function excerptPreview(text, max = 180) {
  if (typeof text !== 'string') return ''
  const characters = [...text]
  return characters.length <= max ? text : `${characters.slice(0, max).join('')}…`
}
