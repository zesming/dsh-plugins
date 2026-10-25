/** Build metadata-only audit for one shared recap/suggestion attempt. */

function routeSummary(value) {
  if (typeof value?.provider !== 'string' || typeof value?.model !== 'string') return null
  return {
    provider: value.provider,
    model: value.model,
    ...(typeof value.reasoningEffort === 'string' ? { reasoningEffort: value.reasoningEffort } : {}),
  }
}

/**
 * One audit row. It deliberately carries no message text, draft, prompt, or
 * model output: the record exists to attribute cost and routes, not to duplicate
 * a conversation.
 * @param fields - one attempt's summary.
 * @returns a JSON-serializable record.
 */
export function createAuditRecord(fields) {
  const record = {
    at: typeof fields.at === 'number' ? fields.at : Date.now(),
    sessionId: String(fields.sessionId ?? ''),
    turn: Number.isFinite(fields.turn) ? fields.turn : null,
    endSeq: Number.isFinite(fields.endSeq) ? fields.endSeq : null,
    sourceSelection: routeSummary(fields.sourceSelection),
    auxiliaryRoute: routeSummary(fields.auxiliaryRoute),
    feature: typeof fields.feature === 'string' ? fields.feature : null,
    messageCount: Number.isFinite(fields.messageCount) ? fields.messageCount : 0,
    inputBytes: Number.isFinite(fields.inputBytes) ? fields.inputBytes : 0,
    maxTokens: Number.isFinite(fields.maxTokens) ? fields.maxTokens : null,
    finish: typeof fields.finish === 'string' ? fields.finish : null,
    outputChars: Number.isFinite(fields.outputChars) ? fields.outputChars : 0,
    durationMs: Number.isFinite(fields.durationMs) ? fields.durationMs : null,
    promptVersion: Number.isFinite(fields.promptVersion) ? fields.promptVersion : null,
    error: typeof fields.error === 'string' ? fields.error.slice(0, 96) : null,
  }
  if (fields.usage !== undefined && typeof fields.usage === 'object' && fields.usage !== null) {
    const usage = {}
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens']) {
      if (Number.isFinite(fields.usage[key])) usage[key] = fields.usage[key]
    }
    if (Object.keys(usage).length > 0) record.usage = usage
  }
  return record
}
