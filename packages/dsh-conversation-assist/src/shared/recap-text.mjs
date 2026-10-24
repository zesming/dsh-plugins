/** Compose one recap sentence from folded Turn facts. */

import { LIMITS } from './limits.mjs'
import { formatRow } from './locales.mjs'

/**
 * One counted phrase, choosing the singular row when needed.
 * @param t - dictionary lookup.
 * @param base - row prefix, e.g. `recap.parts.tools`.
 * @param count - non-zero count.
 * @returns the rendered phrase.
 */
function counted(t, base, count) {
  const key = count === 1 ? `${base}.one` : base
  return formatRow(t(key), { n: count })
}

/**
 * The confirmed-parts clause of a recap.
 * @param value - folded facts.
 * @param t - dictionary lookup.
 * @returns a clause such as "已确认 3 个工具调用，1 个失败。", or "".
 */
function detail(value, t) {
  const parts = []
  if (value.calls > 0) {
    const tools = counted(t, 'recap.parts.tools', value.calls)
    const names = Array.isArray(value.toolNames) && value.toolNames.length > 0
      ? formatRow(t('recap.parts.toolNames'), { names: value.toolNames.join(t('recap.parts.toolJoin')) })
      : ''
    parts.push(`${tools}${names}`)
  }
  if (value.failures > 0) parts.push(counted(t, 'recap.parts.failures', value.failures))
  if (value.unknown > 0) parts.push(counted(t, 'recap.parts.unknown', value.unknown))
  if (value.pending > 0) parts.push(counted(t, 'recap.parts.pending', value.pending))
  if (value.calls > 0 && !value.hasReply) parts.push(t('recap.parts.noReply'))
  if (parts.length === 0) return ''
  return formatRow(t('recap.detail'), { parts: parts.join(t('recap.parts.join')) })
}

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
 * First sentence of the final reply, bounded for a recap.
 * @param value - folded facts.
 * @returns a snippet, or "".
 */
function reply(value, t) {
  if (typeof value.lastText !== 'string' || value.lastText === '') return ''
  let text = value.lastText
    .replace(/^[#>*\-\s]+/u, '')
    .replace(/^```[\s\S]*?```/u, '')
    .trim()
  if (text === '') return ''
  const sentence = text.match(/^.*?[。！？.!?]/u)
  if (sentence !== null) text = sentence[0]
  const chars = [...text]
  if (chars.length > 80) text = `${chars.slice(0, 80).join('')}…`
  return formatRow(t('recap.reply'), { snippet: text })
}

/**
 * A factual closing clause instead of "next step is up to you".
 * @param value - folded facts.
 * @param t - dictionary lookup.
 * @returns the ending sentence.
 */
function ending(value, t) {
  if (value.failures > 0) return t('recap.ending.failures')
  if (value.pending > 0 || value.unknown > 0) return t('recap.ending.pending')
  return t('recap.ending.none')
}

/**
 * Compose the recap for one closed Turn.
 * @param value - facts published by the definition.
 * @param t - dictionary lookup returning localized rows.
 * @returns one or two sentences, or "" when no recap should render.
 */
export function composeRecap(value, t) {
  if (typeof value !== 'object' || value === null) return ''
  const kind = typeof value.reasonKind === 'string' ? value.reasonKind : 'unknown'
  let text
  switch (kind) {
    case 'completed': {
      const confirmed = detail(value, t)
      if (confirmed === '' && value.hasReply !== true && value.calls === 0) {
        text = t('recap.noProgress')
        break
      }
      text = formatRow(t('recap.completed'), {
        detail: confirmed,
        reply: reply(value, t),
        ending: ending(value, t),
      })
      break
    }
    case 'aborted':
      text = formatRow(t('recap.aborted'), { cause: cause(t, value.cancelKind ?? 'unknown'), detail: detail(value, t) })
      break
    case 'blocked':
      text = formatRow(t('recap.blocked'), { detail: detail(value, t) })
      break
    case 'error':
      text = formatRow(t('recap.error'), {
        code: typeof value.errorCode === 'string' && value.errorCode !== ''
          ? formatRow(t('recap.code'), { code: value.errorCode })
          : '',
        detail: detail(value, t),
      })
      break
    case 'max-tokens':
      text = formatRow(t('recap.maxTokens'), { detail: detail(value, t) })
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
