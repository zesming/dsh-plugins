/** Pure decisions for the next-suggestion request: eligibility, trimming, parsing. */

import { LIMITS } from './limits.mjs'

/**
 * Whether the current composer state allows asking for a suggestion.
 *
 * This is only the request gate: whether an already-received candidate should
 * be shown is decided by the per-Turn hidden marker in the client store.
 * @param options - current settings and snapshots.
 * @returns true when a request may start.
 */
export function canRequest({ prediction, sessionId, input, session }) {
  if (prediction !== true) return false
  if (typeof sessionId !== 'string' || sessionId === '') return false
  if (session === undefined || session === null) return false
  if (session.running === true || session.removed === true) return false
  if (session.subagent !== null && session.subagent !== undefined) return false
  if (input === undefined || input === null) return false
  if (input.draft !== '') return false
  if ((input.attachmentIds?.length ?? 0) > 0) return false
  if ((input.occurrences?.length ?? 0) > 0) return false
  if ((input.queue?.length ?? 0) > 0) return false
  if (input.phase !== undefined && input.phase !== 'plain') return false
  if (input.claim !== undefined && input.claim !== null) return false
  return true
}

/**
 * Keep the newest messages that fit the byte and count caps.
 * @param messages - durable derived history.
 * @param maxBytes - UTF-8 byte ceiling.
 * @param maxMessages - message-count ceiling.
 * @returns a new tail array; at least the last message when the history is non-empty.
 */
export function trimHistory(messages, maxBytes = LIMITS.maxContextBytes, maxMessages = LIMITS.maxMessages) {
  if (!Array.isArray(messages) || messages.length === 0) return []
  const encoder = new TextEncoder()
  // Group by user Turn. A Turn's tool calls and results must be kept or dropped
  // together: a partial group is an invalid conversation for the adapter.
  const groups = []
  let current = null
  for (const message of messages) {
    if (message?.role === 'system' || message?.role === 'developer') continue
    if (message?.role === 'user') {
      current = [message]
      groups.push(current)
    } else if (current !== null) {
      current.push(message)
    }
    // A tool/assistant message before the first user Turn is an orphan; drop it.
  }
  const out = []
  let bytes = 0
  let count = 0
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index]
    let size = 0
    try {
      size = encoder.encode(JSON.stringify(group)).length
    } catch {
      continue
    }
    // Keep whole Turns only; an oversized Turn is skipped rather than split.
    if (size > maxBytes) continue
    if (count + group.length > maxMessages) break
    if (out.length > 0 && bytes + size > maxBytes) break
    out.unshift(...group)
    bytes += size
    count += group.length
  }
  return out
}

/**
 * Accept only a single short line that can be inserted as a draft.
 * @param raw - model output.
 * @returns cleaned text, or null when the output is unusable.
 */
export function sanitizeSuggestion(raw) {
  if (typeof raw !== 'string') return null
  const firstLine = raw.split(/\r?\n/u).map(line => line.trim()).find(line => line !== '')
  if (firstLine === undefined) return null
  let text = firstLine
  if (text.startsWith('```')) return null
  text = text.replace(/^[“”"'‘’]+|[“”"'‘’]+$/gu, '')
  text = text.replace(/^(?:suggestion|建议|用户|user)\s*[:：]\s*/iu, '')
  text = text.replace(/\s+/gu, ' ').trim()
  if (text === '' || text.length > LIMITS.maxSuggestionChars) return null
  return text
}

/**
 * Validate the suggestion route body.
 * @param value - parsed JSON.
 * @returns `{ sessionId, language }`, or null for a malformed body.
 */
export function parseSuggestBody(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const sessionId = value.sessionId
  if (typeof sessionId !== 'string' || sessionId === '' || sessionId.length > 128) return null
  const language = typeof value.language === 'string' && /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/u.test(value.language)
    ? value.language
    : 'en'
  const notBefore = typeof value.notBefore === 'number' && Number.isFinite(value.notBefore)
    ? value.notBefore
    : undefined
  return { sessionId, language, ...(notBefore === undefined ? {} : { notBefore }) }
}

/**
 * Language name for the prediction instruction.
 * @param language - BCP-47-ish tag from the browser.
 * @returns `Chinese` for Chinese tags, otherwise `English`.
 */
export function languageName(language) {
  return typeof language === 'string' && language.toLowerCase().startsWith('zh') ? 'Chinese' : 'English'
}

/**
 * Stable identity for one suggestion.
 * @param sessionId - Session identity.
 * @param turn - Turn number.
 * @returns the cache key.
 */
export function candidateKey(sessionId, turn) {
  return `${sessionId}:${turn}`
}

/** Text blocks of one derived message. */
function messageText(message) {
  return Array.isArray(message?.content)
    ? message.content.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n')
    : ''
}

/** Short acknowledgement after a finished exchange. */
const ACK = /^(?:都)?(?:好|好的|好滴|行|可以|正常|没问题|收到|谢谢|ok|okay|yes|yep|通过|合入|合并|merge|ship|all good|works|done)[\s。.!！?？,，]*$/iu

/** Terms this plugin itself adds to the conversation. */
const PLUGIN_TERMS = /(?:下一条建议|建议条|建议行|回顾|灯泡|发送按钮|插入按钮|设置导航|对话辅助|strip|↙|ghost text|suggestion|composer)/iu

/** Terms of acceptance, review, merge or a meta complaint. */
const META_TERMS = /(?:建议|验收|合入|合并|清理|上次|还是|质量|不准|有问题|不对|正常|测试|回顾|灯泡|插件|补丁|PR|pull request|issue)/iu

/** Completion language for a finished task or merge. */
const COMPLETION = /(?:已合入|已合并|已清理|已完成|已推送|已更新|已修复|merged|cleaned|done|shipped|fixed)/iu

/**
 * Decide whether the latest exchange is a meta/acceptance exchange rather than
 * a coding task. Such a Turn has no next prompt worth suggesting, and the model
 * otherwise restates the previous message (the issue this guard tracks).
 * @param messages - `session.deriveMessages()`.
 * @returns whether the Host should return none without calling the model.
 */
export function isMetaExchange(messages) {
  if (!Array.isArray(messages)) return false
  let user = null
  let assistant = null
  for (const message of messages) {
    if (message?.role === 'user') {
      user = messageText(message)
      assistant = null
    } else if (message?.role === 'assistant') {
      const text = messageText(message).trim()
      if (text !== '') assistant = text
    }
  }
  if (user === null) return false
  const said = user.trim()
  const reply = (assistant ?? '').trim()
  // "All good" after a completion/merge, or after this plugin's own UI.
  if (ACK.test(said) && (COMPLETION.test(reply) || PLUGIN_TERMS.test(reply))) return true
  // A message about this plugin's own UI/acceptance.
  if (PLUGIN_TERMS.test(said) && META_TERMS.test(said)) return true
  // The assistant's last reply is about this plugin or a completed merge.
  if (PLUGIN_TERMS.test(reply) && (META_TERMS.test(reply) || COMPLETION.test(reply))) return true
  return false
}
