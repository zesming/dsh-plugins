/** The turn-tail recap: a state-only Conversation Definition plus its view. */

import React from 'react'

import { emptyFacts, factsValue, foldFacts } from '../shared/facts.mjs'
import { composeRecap } from '../shared/recap-text.mjs'

const h = React.createElement

/** Definition kind and per-turn data key. */
export const RECAP_KIND = 'conversation-assist.recap'

/**
 * Create the state-only Definition that folds one Turn's facts.
 * Only Turns closed after the plugin started publish data, so a restart never
 * backfills a screen of recaps.
 * @param options.startedAt - client plugin start time.
 * @param options.isRecapEnabled - current recap preference.
 * @returns the Definition registration value.
 */
export function createRecapDefinition({ startedAt, isRecapEnabled }) {
  return {
    kind: RECAP_KIND,
    match(event) {
      if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
      if (event.type === 'turn/end' || event.type === 'tool/call' || event.type === 'tool/result'
        || event.type === 'assistant/message') {
        return typeof event.data?.turn === 'number' ? { id: String(event.data.turn), role: 'update' } : null
      }
      return null
    },
    start(_context, match) {
      return { ...emptyFacts(match.event.data.turn), recapEnabledAtEnd: false }
    },
    update(context, match) {
      const next = foldFacts(context.state, match.event)
      if (match.event.type !== 'turn/end') return next
      return { ...next, recapEnabledAtEnd: isRecapEnabled() === true }
    },
    buildLocationData(context, scope, previous) {
      if (scope !== 'turn') return null
      const state = context.state
      if (state === undefined || typeof state.endTime !== 'number' || state.endTime < startedAt) return null
      const value = { ...factsValue(state), recapEnabledAtEnd: state.recapEnabledAtEnd === true }
      if (previous !== null && previous !== undefined && previous.kind === 'turn'
        && previous.turn === value.turn && previous.key === RECAP_KIND
        && JSON.stringify(previous.value) === JSON.stringify(value)) return previous
      return { kind: 'turn', turn: value.turn, key: RECAP_KIND, value }
    },
  }
}

/**
 * Render one Turn's recap inside `conversation.chat.turnTail`.
 * @param props - Turn owner, translator, and standard session hooks.
 * @returns a plain paragraph, or null.
 */
export function RecapTail({ turn, t, useSession }) {
  const subagent = useSession(state => state.subagent)
  if (subagent !== null && subagent !== undefined) return null
  const end = turn.end
  if (end === undefined || typeof end.time !== 'number') return null
  const data = turn.data.get(RECAP_KIND)
  // No data means the window did not include this Turn's start, or the Turn
  // ended before this client started. Do not fabricate a recap in either case.
  if (data === undefined) return null
  const value = data
  if (value.recapEnabledAtEnd !== true) return null
  const text = composeRecap(value, t)
  if (text === '') return null
  return h('p', { className: 'dca-recap' }, text)
}
