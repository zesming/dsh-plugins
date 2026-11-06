/** Pure resolution of the turnTail shell contract into identity + facts. */

import { identityKey, turnIdentity } from './behavior.mjs'

/**
 * Resolve the request identity and folded facts the recap tail renders from
 * the current turnTail contract: the shell passes a Turn **number**, the rich
 * Turn lives in the chat timeline, and the folded Definition value comes from
 * a per-turn data source.
 *
 * Kept React-free so the numeric-prop contract (DSH 0.2.1-rc.3 changed the slot
 * from Turn object to Turn number) is covered by a plain node test.
 * @param options.turnNumber - shell-supplied Turn number.
 * @param options.sessionId - current Session id.
 * @param options.turnRecord - rich Turn from `timeline.turns.get(n)` (null).
 * @param options.definedFacts - folded recap Definition value (or undefined).
 * @returns the closing end event, identity (null when open), and facts.
 */
export function resolveRecapTurn({ turnNumber, sessionId, turnRecord, definedFacts }) {
  const end = turnRecord?.end
  const endSeq = Number.isSafeInteger(end?.seq) ? end.seq : null
  const identity = turnIdentity(sessionId, turnNumber, endSeq)
  const facts = definedFacts ?? {
    turn: turnNumber,
    hasReply: false,
    finalReply: false,
    reasonKind: end?.data?.reason?.kind ?? 'unknown',
    lastText: undefined,
  }
  return { end, identity, facts }
}

/** Stable request cache key for one closed-turn recap identity. */
export function recapCacheKey(identity, replyHash) {
  return identity === null ? '' : `${identityKey(identity)}:${replyHash ?? ''}`
}
