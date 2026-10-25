/** Client-side recap request and visibility decisions. */

import { isBriefReply } from '../shared/recap-policy.mjs'

/**
 * Whether a normal completed reply is short enough to omit its recap entirely.
 * Truncated excerpts are never used to decide this; their full source may be
 * much longer than the retained client-side text.
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
 * Whether recap UI should disappear instead of showing a reply excerpt.
 * @param facts - folded facts for one Turn.
 * @param requestView - state of this Turn's Host request.
 * @returns true for an intentionally omitted brief reply or model no-op.
 */
export function shouldOmitRecap(facts, requestView) {
  return isBriefCompletedReply(facts)
    || (requestView?.state === 'none' && requestView.reason === 'not-needed')
}
