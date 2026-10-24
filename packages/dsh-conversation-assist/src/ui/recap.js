/** The turn-tail recap: a state-only Conversation Definition plus its view. */

import React from 'react'

import { emptyFacts, factsValue, foldFacts } from '../shared/facts.mjs'
import { composeRecap } from '../shared/recap-text.mjs'

const h = React.createElement

/** Definition kind and per-turn data key. */
export const RECAP_KIND = 'conversation-assist.recap'

/**
 * Create the state-only Definition that folds one Turn's facts.
 *
 * The Definition replays the loaded Session history, so every loaded Turn gets a
 * value, not only Turns closed after this client started. The View decides
 * whether the current recap switch hides it.
 * @returns the Definition registration value.
 */
export function createRecapDefinition() {
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
      return emptyFacts(match.event.data.turn)
    },
    update(context, match) {
      return foldFacts(context.state, match.event)
    },
    buildLocationData(context, scope, previous) {
      if (scope !== 'turn') return null
      const state = context.state
      if (state === undefined || typeof state.endTime !== 'number') return null
      const value = factsValue(state)
      if (previous !== null && previous !== undefined && previous.kind === 'turn'
        && previous.turn === value.turn && previous.key === RECAP_KIND
        && JSON.stringify(previous.value) === JSON.stringify(value)) return previous
      return { kind: 'turn', turn: value.turn, key: RECAP_KIND, value }
    },
  }
}

/**
 * Render one Turn's recap inside `conversation.chat.turnTail`.
 * @param props - Turn owner, translator, settings hook, and session hooks.
 * @returns a plain paragraph, or null.
 */
export function RecapTail({ turn, t, useSession, useSettings }) {
  const subagent = useSession(state => state.subagent)
  const enabled = useSettings(state => state.recap === true)
  if (subagent !== null && subagent !== undefined) return null
  if (!enabled) return null
  const end = turn.end
  if (end === undefined || typeof end.time !== 'number') return null
  const data = turn.data.get(RECAP_KIND)
  if (data === undefined) return null
  const text = composeRecap(data, t)
  if (text === '') return null
  return h('p', { className: 'dca-recap' }, text)
}
