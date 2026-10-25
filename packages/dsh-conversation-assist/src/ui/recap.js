/** The turn-tail recap: a state-only Conversation Definition plus its view. */

import React from 'react'

import { emptyFacts, factsValue, foldFacts, MAX_EXCERPT_CHARS } from '../shared/facts.mjs'
import { composeRecap, excerptPreview } from '../shared/recap-text.mjs'
import { identityKey, recapRequestView, recapResultMatches, turnIdentity } from './behavior.mjs'
import { shouldOmitRecap, shouldRequestRecap } from './recap-policy.mjs'

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
 * Localized reason for a failed or skipped model recap.
 * @param reason - Host reason code.
 * @param t - translator.
 * @returns concise localized message.
 */
function reasonText(reason, t) {
  const known = new Set(['historical', 'unavailable', 'budget', 'disabled', 'no-context'])
  return t(`recap.reason.${known.has(reason) ? reason : 'unknown'}`)
}

/**
 * Render a disclosure containing every retained visible text block.
 * @param value - folded facts.
 * @param t - translator.
 * @returns a disclosure, or the no-reply state.
 */
function excerpt(value, t) {
  if (typeof value.lastText !== 'string' || value.lastText === '') {
    return h('p', { className: 'dca-recap-copy' }, t('recap.noReply'))
  }
  return h(React.Fragment, null,
    h('details', { className: 'dca-recap-details' },
      h('summary', null,
        h('span', null, excerptPreview(value.lastText)),
        h('span', { className: 'dca-recap-expand' }, t('recap.expand'))),
      h('div', { className: 'dca-recap-source' }, value.lastText)),
    value.excerptTruncated === true
      ? h('p', { className: 'dca-recap-note' }, t('recap.longExcerpt', { count: MAX_EXCERPT_CHARS }))
      : null)
}

/**
 * Render one Turn's recap inside `conversation.chat.turnTail`.
 * @param props - Turn owner, translator, settings hook, and session hooks.
 * @returns a model recap, labeled excerpt, status, or null.
 */
export function RecapTail({ turn, sessionId, t, useSession, useSettings, runtime }) {
  // Keep every hook above the return conditions: turn-tail entries can switch
  // between closed and unavailable states as history is reconciled.
  const subagent = useSession(state => state.subagent)
  const enabled = useSettings(state => state.recap === true)
  const semanticEnabled = useSettings(state => state.semanticRecap === true)
  const settingsLoaded = useSettings(state => state.loaded === true)
  const [request, setRequest] = React.useState(null)

  const end = turn?.end
  const endSeq = Number.isSafeInteger(end?.seq) ? end.seq : null
  const identity = turnIdentity(sessionId, turn?.turn, endSeq)
  const value = turn?.data?.get(RECAP_KIND)
  const facts = value ?? {
    turn: turn?.turn,
    hasReply: false,
    finalReply: false,
    reasonKind: end?.data?.reason?.kind ?? 'unknown',
    lastText: undefined,
  }
  const recapKey = identity === null
    ? ''
    : `${identityKey(identity)}:${facts.replyHash ?? ''}:${semanticEnabled ? 'on' : 'off'}`
  const shouldRequest = shouldRequestRecap({
    settingsLoaded, enabled, semanticEnabled, subagent, identity, facts,
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
  if (subagent != null || !enabled || end === undefined || identity === null
    || shouldOmitRecap(facts, requestView)) return null

  const currentRequest = requestView.current
  const ready = requestView.state === 'ready'
  const reason = requestView.state === 'none' ? requestView.reason
    : requestView.state === 'loading' ? 'loading' : undefined
  const isHistorical = reason === 'historical'
  const label = ready
    ? t('recap.ariaLabel')
    : isHistorical ? t('recap.historicalLabel') : t('recap.excerptLabel')
  const status = composeRecap(facts, t)
  const loading = reason === 'loading'
  const noContext = semanticEnabled && facts.reasonKind === 'completed' && facts.hasReply === true
    && facts.finalReply !== true && currentRequest === null

  return h('section', { className: 'dca-recap', 'aria-label': label },
    ready ? null : h('div', { className: 'dca-recap-heading' },
      isHistorical ? h('strong', null, label) : null,
      loading ? h('span', { className: 'dca-recap-state' }, t('recap.loading')) : null,
      !loading && !isHistorical ? h('strong', null, label) : null),
    ready
      ? h('p', { className: 'dca-recap-copy' }, t('recap.prefix'), currentRequest.recap)
      : excerpt(facts, t),
    ready && currentRequest.persisted === false
      ? h('p', { className: 'dca-recap-status' }, t('recap.notPersisted'))
      : null,
    status !== '' ? h('p', { className: 'dca-recap-status' }, status) : null,
    reason !== undefined && !loading ? h('p', { className: 'dca-recap-status' }, reasonText(reason, t)) : null,
    noContext ? h('p', { className: 'dca-recap-status' }, reasonText('no-context', t)) : null)
}
