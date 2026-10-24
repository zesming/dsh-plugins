/** Build the audit record written for one auxiliary suggestion attempt. */

/**
 * One audit row. It deliberately carries no message text, draft, prompt, or
 * model output: the record exists to attribute cost and route, not to duplicate
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
    provider: typeof fields.provider === 'string' ? fields.provider : null,
    model: typeof fields.model === 'string' ? fields.model : null,
    messageCount: Number.isFinite(fields.messageCount) ? fields.messageCount : 0,
    inputBytes: Number.isFinite(fields.inputBytes) ? fields.inputBytes : 0,
    maxTokens: Number.isFinite(fields.maxTokens) ? fields.maxTokens : null,
    finish: typeof fields.finish === 'string' ? fields.finish : null,
    outputChars: Number.isFinite(fields.outputChars) ? fields.outputChars : 0,
    durationMs: Number.isFinite(fields.durationMs) ? fields.durationMs : null,
    error: typeof fields.error === 'string' ? fields.error : null,
  }
  if (fields.usage !== undefined && typeof fields.usage === 'object' && fields.usage !== null) {
    try {
      JSON.stringify(fields.usage)
      record.usage = fields.usage
    } catch {
      // A non-serializable usage payload is dropped rather than failing the write.
    }
  }
  return record
}
