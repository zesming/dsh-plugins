/** Pure turn, route, composer, and shortcut checks used by the UI. */

import { canRequest } from '../shared/prediction.mjs'

/**
 * Build the identity used for reads, candidate freshness, and consumption.
 * @param sessionId - current Session id.
 * @param turn - current Turn number.
 * @param endSeq - authoritative `turn/end` sequence.
 * @returns identity or null when the turn is not closed.
 */
export function turnIdentity(sessionId, turn, endSeq) {
  if (typeof sessionId !== 'string' || sessionId === ''
    || !Number.isSafeInteger(turn) || turn < 0
    || !Number.isSafeInteger(endSeq) || endSeq < 0) return null
  return { sessionId, turn, endSeq }
}

/** @param identity - exact turn identity. @returns a stable serialized key. */
export function identityKey(identity) {
  return identity === null || identity === undefined
    ? ''
    : JSON.stringify([identity.sessionId, identity.turn, identity.endSeq])
}

/**
 * Project a model route into the fields the Host captures for freshness.
 * @param selection - sourceSelection or modelSelection.
 * @returns a detached provider/model/effort route, or null.
 */
export function routeValue(selection) {
  if (typeof selection?.provider !== 'string' || selection.provider === ''
    || typeof selection?.model !== 'string' || selection.model === '') return null
  return {
    provider: selection.provider,
    model: selection.model,
    reasoningEffort: typeof selection.reasoningEffort === 'string' ? selection.reasoningEffort : undefined,
  }
}

/** @param left - route. @param right - route. @returns whether all source-selection fields match. */
export function sameRoute(left, right) {
  const a = routeValue(left)
  const b = routeValue(right)
  return a !== null && b !== null
    && a.provider === b.provider
    && a.model === b.model
    && a.reasoningEffort === b.reasoningEffort
}

/**
 * Whether a ready Host result still belongs to the current turn and route.
 * @param candidate - Host response plus text.
 * @param identity - latest closed Turn identity.
 * @param route - current source model route.
 * @returns true only for the exact result identity and route.
 */
export function candidateMatches(candidate, identity, route, predictionOffEpoch) {
  return candidate?.state === 'ready'
    && candidate.sessionId === identity?.sessionId
    && candidate.turn === identity?.turn
    && candidate.endSeq === identity?.endSeq
    && typeof candidate.text === 'string'
    && candidate.text.trim() !== ''
    && (predictionOffEpoch === undefined || candidate.predictionOffEpoch === predictionOffEpoch)
    && sameRoute(candidate.route, route)
}

/**
 * Validate a recap response against the exact final reply it summarizes.
 * @param recap - Host response.
 * @param identity - Turn identity sent with the read.
 * @param replyHash - fingerprint sent with the read.
 * @returns true only when the response can be shown for this source.
 */
export function recapResultMatches(recap, identity, replyHash) {
  return recap?.state === 'ready'
    && recap.sessionId === identity?.sessionId
    && recap.turn === identity?.turn
    && recap.endSeq === identity?.endSeq
    && recap.replyHash === replyHash
    && typeof recap.recap === 'string'
    && recap.recap.trim() !== ''
}

/**
 * Resolve the request state for one recap identity.
 * A pending request must keep its loading state until that same key resolves.
 * @param request - current local request state.
 * @param key - identity currently rendered by the turn-tail.
 * @param shouldRequest - whether this identity should have a Host request.
 * @returns the current request view, with `loading` covering pending requests.
 */
export function recapRequestView(request, key, shouldRequest) {
  const current = request?.key === key ? request : null
  if (current?.state === 'ready') return { current, state: 'ready' }
  if (current?.state === 'none') return { current, state: 'none', reason: current.reason }
  if (current?.state === 'loading' || shouldRequest) return { current, state: 'loading' }
  return { current, state: 'idle' }
}

/**
 * Permanently consume a candidate when a turn is no longer safely idle.
 * Draft text, attachments, references, and queue entries are transient hides.
 * @param session - current Session snapshot.
 * @param input - current composer snapshot.
 * @returns whether a new/active submission has started.
 */
export function submissionStarted(session, input) {
  return session?.running === true
    || session?.removed === true
    || (session?.pendingSubmissions?.length ?? 0) > 0
    || session?.awaitingFirstTurn === true
    || (input?.phase !== undefined && input.phase !== 'plain')
    || (input?.claim !== undefined && input.claim !== null)
}

/**
 * Check the current composer and latest Turn before requesting or showing text.
 * @param options - current settings, snapshots, identity, route, and IME state.
 * @returns true when a suggestion may be requested or shown.
 */
export function canShowSuggestion({ prediction, sessionId, input, session, identity, route, composing = false }) {
  if (composing || identity === null || identity === undefined || routeValue(route) === null) return false
  if (identity.sessionId !== sessionId) return false
  if (submissionStarted(session, input)) return false
  return canRequest({ prediction, sessionId, input, session })
}

/**
 * Find the visible, editable composer input for the exact owning Session seat.
 * This is shared by click acceptance and fixed-input keyboard shortcuts.
 * @param row - the mounted suggestion row, if any.
 * @param sessionId - expected Conversation Session.
 * @param target - fixed-input keyboard target, if any.
 * @returns the owned input, seat, and occurrence, or null when blocked.
 */
export function editableComposerFor(row, sessionId, target) {
  if (typeof sessionId !== 'string' || sessionId === '') return null
  const rowSeat = row?.closest?.('[data-composer-seat]') ?? null
  const targetSeat = target?.closest?.('[data-composer-seat]') ?? null
  const rowOccurrence = row?.closest?.('[data-conversation-session]') ?? null
  const targetOccurrence = target?.closest?.('[data-conversation-session]') ?? null
  const seat = rowSeat ?? targetSeat
  const occurrence = rowOccurrence ?? targetOccurrence ?? seat?.closest?.('[data-conversation-session]') ?? null
  const input = seat?.querySelector?.('[data-composer-input]') ?? null
  if (seat === null || occurrence === null || input === null
    || (rowSeat !== null && targetSeat !== null && rowSeat !== targetSeat)
    || (target !== undefined && target !== null
      && target.closest?.('[data-composer-input]') !== input)
    || occurrence.dataset?.conversationSession !== sessionId
    || occurrence.contains?.(seat) !== true
    || seat.closest?.('[data-conversation-session]') !== occurrence
    || input.closest?.('[data-composer-seat]') !== seat
    || (row !== undefined && row !== null && row.closest?.('[data-composer-seat]') !== seat)) return null

  const visible = node => {
    if (node === null || node === undefined || node.isConnected === false || node.hidden === true
      || node.closest?.('[hidden]') != null || node.closest?.('[inert]') != null) return false
    if (typeof node.getAttribute === 'function' && node.getAttribute('hidden') !== null) return false
    if (typeof node.getClientRects === 'function' && node.getClientRects().length === 0) return false
    const view = node.ownerDocument?.defaultView
    const style = typeof view?.getComputedStyle === 'function' ? view.getComputedStyle(node) : null
    return style?.display !== 'none' && style?.visibility !== 'hidden' && style?.visibility !== 'collapse'
      && style?.opacity !== '0'
  }
  const getInputAttribute = name => typeof input.getAttribute === 'function' ? input.getAttribute(name) : null
  const contentEditable = getInputAttribute('contenteditable')
  if (![row, occurrence, seat, input].filter(Boolean).every(visible)
    || input.disabled === true || input.readOnly === true
    || getInputAttribute('disabled') !== null
    || getInputAttribute('readonly') !== null
    || getInputAttribute('aria-disabled') === 'true'
    || getInputAttribute('aria-readonly') === 'true'
    || contentEditable === 'false'
    || (input.isContentEditable !== true && contentEditable !== 'true' && contentEditable !== 'plaintext-only')) return null
  return { input, seat, occurrence }
}

/**
 * Check whether a fixed-input keyboard event belongs to this composer's input.
 * @param event - locally arbitrated fixed-input event.
 * @param options - the Session and mounted suggestion row.
 * @returns `dismiss` for Escape, or null when native focus/input behavior should continue.
 */
export function shortcutAction(event, { sessionId, row, eligible, composing = false }) {
  if (eligible !== true || composing || event?.type !== 'keydown') return null
  const { gesture, context } = event
  if (gesture === undefined || context === undefined
    || gesture.repeat || gesture.composing || gesture.defaultPrevented
    || gesture.control || gesture.alt || gesture.shift || gesture.meta
    || context.modal !== null || context.target === null || context.target === undefined) return null
  const target = context.target
  if (editableComposerFor(row, sessionId, target) === null) return null
  if (gesture.code === 'Escape') return 'dismiss'
  return null
}

/**
 * Insert a suggestion as one revision-guarded draft edit.
 * @param inputActions - public composer insertion actions.
 * @param text - candidate text.
 * @param focus - focus callback for the owning composer.
 * @returns true only when the editor accepted the insertion.
 */
export function insertCandidate(inputActions, text, focus, { expectedDraftRev, canInsert = () => true } = {}) {
  if (inputActions === undefined || typeof inputActions?.captureInsertion !== 'function'
    || typeof inputActions?.insertText !== 'function' || typeof text !== 'string' || text === '') return false
  try {
    if (canInsert() !== true) return false
    const span = inputActions.captureInsertion()
    if (!Number.isSafeInteger(span?.draftRev)
      || (expectedDraftRev !== undefined && span.draftRev !== expectedDraftRev)) return false
    if (focus !== undefined && focus() !== true) return false
    if (canInsert() !== true) return false
    const current = inputActions.captureInsertion()
    if (!Number.isSafeInteger(current?.draftRev) || current.draftRev !== span.draftRev
      || (expectedDraftRev !== undefined && current.draftRev !== expectedDraftRev)
      || canInsert() !== true) return false
    return inputActions.insertText(text, span) === true
  } catch {
    return false
  }
}

/**
 * Insert a candidate through the guarded editor path, then invoke standard submit.
 * @param inputActions - public composer insertion and submit actions.
 * @param text - candidate text.
 * @param focus - focus callback for the owning composer.
 * @param options - insertion revision and live eligibility checks.
 * @returns true only when insertion succeeded and submit was invoked.
 */
export function sendCandidate(inputActions, text, focus, options) {
  if (typeof inputActions?.submit !== 'function') return false
  if (!insertCandidate(inputActions, text, focus, options)) return false
  inputActions.submit()
  return true
}
