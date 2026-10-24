/**
 * Hard bounds shared by the Host predictor, the client view, and the tests.
 *
 * The first four keep one auxiliary request small; the daily and concurrency
 * limits keep a popup of long sessions from turning into a burst of model
 * calls; the last two bound what the review UI can render.
 */
export const LIMITS = Object.freeze({
  /** Output-token cap for one suggestion. */
  maxOutputTokens: 1024,
  /** End-to-end deadline for one suggestion, including stream assembly. */
  timeoutMs: 8_000,
  /** UTF-8 byte cap for the trimmed conversation tail. */
  maxContextBytes: 24_576,
  /** Message-count cap for the trimmed conversation tail. */
  maxMessages: 24,
  /** Suggestions per session per local day. */
  dailyPerSession: 50,
  /** Suggestions running at once across every session. */
  maxConcurrent: 2,
  /** Audit file size that triggers one rotation. */
  auditMaxBytes: 1_048_576,
  /** Longest accepted suggestion text; longer output is rejected. */
  maxSuggestionChars: 160,
  /** Longest rendered recap; longer text is ellipsized. */
  maxRecapChars: 400,
})
