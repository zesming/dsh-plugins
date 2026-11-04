/** Client-side recap request and visibility decisions. */

import { isBriefReply } from '../shared/recap-policy.mjs'

/**
 * Whether a normal completed reply is short enough to omit its recap entirely.
 * Truncated sources are never used to decide this; their full text may be much
 * longer than the retained client-side copy.
 * @param facts - folded facts for one Turn.
 * @returns true for an untruncated brief final reply from a completed Turn.
 */
export function isBriefCompletedReply(facts) {
  return facts?.reasonKind === 'completed' && facts.finalReply === true
    && facts.excerptTruncated === false
    && typeof facts.lastText === 'string'
    && isBriefReply(facts.lastText)
}

/**
 * Decide whether this Turn needs a model recap request.
 * @param options - settings and folded Turn facts.
 * @returns true when the exact final reply can be requested.
 */
export function shouldRequestRecap({ settingsLoaded, enabled, subagent, identity, facts }) {
  return settingsLoaded === true && enabled === true && subagent == null
    && identity !== null && facts?.reasonKind === 'completed'
    && facts.finalReply === true && typeof facts.replyHash === 'string'
    && !isBriefCompletedReply(facts)
}

/**
 * Decide whether the turn tail renders anything at all.
 *
 * A recap is an extra, never a requirement: the tail appears only when a model
 * recap is ready. Pending, unavailable, historical, budget-exhausted, and
 * abnormal endings all render nothing, because the transcript above already
 * states the reply and a status line would only add height.
 * @param options - the recap switch, Turn origin, and Host request state.
 * @returns `{kind: 'recap'}` or null.
 */
export function recapPresentation({ enabled, subagent, closed, requestView }) {
  if (enabled !== true || subagent != null || closed !== true) return null
  if (requestView?.state !== 'ready') return null
  return { kind: 'recap' }
}
