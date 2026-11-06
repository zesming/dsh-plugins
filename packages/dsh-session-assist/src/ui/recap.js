/** The turn-tail recap: a state-only Conversation Definition plus its view. */

import React from 'react'

import { emptyFacts, factsValue, foldFacts } from '../shared/facts.mjs'
import { recapRequestView, recapResultMatches } from './behavior.mjs'
import { recapPresentation, shouldRequestRecap } from './recap-policy.mjs'
import { recapCacheKey, resolveRecapTurn } from './recap-turn.mjs'

const h = React.createElement

/** Definition kind and per-turn data key. */
export const RECAP_KIND = 'session-assist.recap'

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
 *
 * Only real content is drawn. A turn with no model recap — still generating,
 * unavailable, historical, out of budget, or ended abnormally — renders nothing,
 * so the tail never reserves space it cannot fill.
 *
 * Slot contract (DSH 0.2.1-rc.3+): the shell passes the Turn **number** in
 * `turn` and a closing-node `seq`, not the Turn object. The rich Turn and the
 * Definition value are read through session hooks: `useChat` for the Turn
 * location and the registered `useRecapFacts` keyed hook for this plugin's
 * folded facts (`nodes.turnDataSource(turn, RECAP_KIND)`).
 * @param props.turn - Turn number supplied by the shell.
 * @param props.useChat - Chat snapshot hook (timeline locations).
 * @param props.useRecapFacts - keyed hook: turn number -> recap facts source.
 * @param props.sessionId - Session id, translator, settings hook, and runtime.
 * @returns a model recap, or null.
 */
export function RecapTail({ turn: turnNumber, useChat, useRecapFacts, sessionId, t, useSession, useSettings, runtime }) {
  // Keep every hook above the return conditions: turn-tail entries can switch
  // between closed and unavailable states as history is reconciled.
  const subagent = useSession(state => state.subagent)
  const enabled = useSettings(state => state.recap === true)
  const settingsLoaded = useSettings(state => state.loaded === true)
  const turnRecord = useChat(snapshot => {
    if (!Number.isSafeInteger(turnNumber)) return null
    return snapshot.timeline.turns.get(turnNumber) ?? null
  })
  // The slot cell keys on the Session; the folded facts live on the Turn, so
  // the Turn number is passed explicitly as the keyed-hook key.
  const definedFacts = typeof useRecapFacts === 'function'
    ? useRecapFacts(String(turnNumber))
    : undefined
  const [request, setRequest] = React.useState(null)

  const { end, identity, facts } = resolveRecapTurn({ turnNumber, sessionId, turnRecord, definedFacts })
  const recapKey = recapCacheKey(identity, facts.replyHash)
  const shouldRequest = shouldRequestRecap({
    settingsLoaded, enabled, subagent, identity, facts,
  })

  React.useEffect(() => {
    if (!shouldRequest || typeof runtime?.requestRecap !== 'function') {
      setRequest(null)
      return undefined
    }
    const controller = new AbortController()
    let active = true
    setRequest({ key: recapKey, state: 'loading' })
    void runtime.requestRecap(identity.sessionId, identity.turn, identity.endSeq, facts.replyHash, controller.signal)
      .then((result) => {
        if (!active || controller.signal.aborted) return
        if (recapResultMatches(result, identity, facts.replyHash)) {
          setRequest({ key: recapKey, state: 'ready', recap: result.recap, persisted: result.persisted !== false })
          return
        }
        setRequest({ key: recapKey, state: 'none', reason: result?.reason ?? 'unavailable' })
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setRequest({ key: recapKey, state: 'none', reason: 'unavailable' })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [shouldRequest, recapKey, identity?.sessionId, identity?.turn, identity?.endSeq, facts.replyHash, runtime])

  const requestView = recapRequestView(request, recapKey, shouldRequest)
  const presentation = recapPresentation({
    enabled, subagent, closed: end !== undefined && identity !== null, requestView,
  })
  if (presentation === null) return null

  const current = requestView.current
  return h('section', { className: 'dca-recap', 'aria-label': t('recap.ariaLabel') },
    h('p', { className: 'dca-recap-copy' }, t('recap.prefix'), current.recap),
    current.persisted === false
      ? h('p', { className: 'dca-recap-status' }, t('recap.notPersisted'))
      : null)
}
