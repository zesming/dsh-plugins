/** One auxiliary model call that proposes the user's next message. */

import { createAuditRecord } from '../shared/audit.mjs'
import { LIMITS } from '../shared/limits.mjs'
import { languageName, sanitizeSuggestion, trimHistory } from '../shared/prediction.mjs'

/** Template version recorded in the audit; bump when the wording changes. */
export const PROMPT_VERSION = 4

const SYSTEM = 'You suggest the next prompt a user might type in a coding conversation. '
  + 'Read the recent conversation and propose one concrete next prompt that continues the user\'s work, in the user\'s language. '
  + 'Do not summarize or repeat the assistant\'s reply, do not mention its recap or UI, and do not answer optional offers. '
  + 'If the recent exchange is a meta-discussion about the assistant\'s own suggestion or UI controls, or there is no clear next step, output nothing. '
  + 'Output one line, at most 80 characters, with no quotes, labels, or explanation.'

/**
 * Read the route from a logged request header.
 * @param header - `LlmCallConfig` of the last request, or anything else.
 * @returns provider/model/effort, or undefined.
 */
export function routeFromHeader(header) {
  if (typeof header !== 'object' || header === null) return undefined
  if (typeof header.provider !== 'string' || header.provider === '') return undefined
  if (typeof header.model !== 'string' || header.model === '') return undefined
  return {
    provider: header.provider,
    model: header.model,
    ...(typeof header.reasoningEffort === 'string' ? { reasoningEffort: header.reasoningEffort } : {}),
  }
}

/**
 * Fall back to the Session's recorded model selection.
 * @param values - projection snapshot values.
 * @returns provider/model/effort, or undefined.
 */
export function routeFromProjection(values) {
  const selection = values?.modelSelection
  const chosen = selection?.next ?? selection?.lastUsed
  return routeFromHeader(chosen)
}

/**
 * Count the UTF-8 bytes of the prepared history.
 * @param messages - trimmed messages.
 * @returns byte length.
 */
function byteLength(messages) {
  const encoder = new TextEncoder()
  let total = 0
  for (const message of messages) {
    try {
      total += encoder.encode(JSON.stringify(message)).length
    } catch {
      // A non-serializable message is skipped by trimHistory too.
    }
  }
  return total
}

/**
 * Build the one-call predictor.
 * @param options - LLM access, route resolution, audit sink, clock, limits.
 * @returns `{ generate }`.
 */
export function createPredictor({ getLlm, resolveRoute, audit, now = Date.now, limits = LIMITS } = {}) {
  return {
    /**
     * Generate one suggestion for a completed Turn.
     * @param request - Session, tracked Turn, language, and caller signal.
     * @returns a ready/none result.
     */
    async generate({ session, turn, language, signal }) {
      const startedAt = now()
      const record = (fields) => {
        const row = createAuditRecord({
          at: now(),
          sessionId: session?.id,
          turn: turn?.turn,
          endSeq: turn?.endSeq,
          durationMs: now() - startedAt,
          ...fields,
        })
        void audit?.(row)
      }
      const llm = getLlm?.()
      if (llm === undefined || llm === null) return { state: 'none' }
      const route = resolveRoute?.(session, turn)
      if (route === undefined) return { state: 'none' }
      let messages
      try {
        messages = trimHistory(session.deriveMessages(), limits.maxContextBytes, limits.maxMessages)
      } catch {
        return { state: 'none' }
      }
      if (messages.length === 0) return { state: 'none' }
      const inputBytes = byteLength(messages)
      const timeout = AbortSignal.timeout(limits.timeoutMs)
      const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
      const base = {
        provider: route.provider,
        model: route.model,
        messageCount: messages.length,
        inputBytes,
        maxTokens: limits.maxOutputTokens,
      }
      let text = ''
      let usage
      let finish
      try {
        const call = await llm.prepareCall({
          provider: route.provider,
          model: route.model,
          maxTokens: limits.maxOutputTokens,
          ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
        }, combined)
        const options = {
          ...call.config,
          messages,
          system: `${SYSTEM}\nWrite the suggestion in ${languageName(language)}.`,
          sessionId: session.id,
          signal: combined,
        }
        for await (const chunk of call.stream(options)) {
          if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
          else if (chunk?.type === 'usage') usage = chunk.usage
          else if (chunk?.type === 'finish') finish = chunk.reason
        }
      } catch (error) {
        const errorCode = timeout.aborted ? 'timeout' : (signal?.aborted === true ? 'aborted' : String(error?.code ?? 'failed'))
        record({ ...base, finish: finish ?? null, outputChars: text.length, usage, error: errorCode })
        return { state: 'none' }
      }
      const suggestion = finish?.kind === 'stop' ? sanitizeSuggestion(text) : null
      record({ ...base, finish: finish?.kind ?? null, outputChars: text.length, usage, error: suggestion === null ? 'invalid-output' : null })
      if (suggestion === null) return { state: 'none' }
      return { state: 'ready', text: suggestion, turn: turn.turn, endSeq: turn.endSeq }
    },
  }
}
