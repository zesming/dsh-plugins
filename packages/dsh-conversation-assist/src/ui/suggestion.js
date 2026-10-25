/** The suggestion row above the composer and its view registration. */

import React from 'react'

import { candidateMatches, canShowSuggestion, identityKey, insertCandidate, routeValue,
  editableComposerFor, sameRoute, sendCandidate, shortcutAction, submissionStarted, turnIdentity } from './behavior.mjs'
import { HintIcon } from './icons.js'

const h = React.createElement

/** Delay the read briefly so the Host has committed and indexed `turn/end`. */
const ASK_DELAY_MS = 400

/**
 * Find and focus the composer belonging to this suggestion row.
 * @param row - the suggestion row, or null.
 * @param sessionId - expected Conversation Session.
 * @returns whether its contenteditable was found and focused.
 */
function focusComposer(row, sessionId) {
  const composer = editableComposerFor(row, sessionId)
  if (composer === null || typeof composer.input.focus !== 'function') return false
  try {
    composer.input.focus()
    return true
  } catch {
    return false
  }
}

/**
 * Locate the owning composer input for this row or the current Session slot.
 * @param row - mounted suggestion row, or null while a candidate is pending.
 * @param sessionId - current Conversation Session.
 * @returns the matching contenteditable, or null.
 */
function composerInput(row, sessionId) {
  const rowSeat = row?.closest('[data-composer-seat]')
  if (rowSeat !== null && rowSeat !== undefined) return rowSeat.querySelector('[data-composer-input]')
  if (typeof document === 'undefined') return null
  const occurrence = [...document.querySelectorAll('[data-conversation-session]')]
    .find(element => element.dataset?.conversationSession === sessionId)
  return occurrence?.querySelector('[data-composer-seat] [data-composer-input]') ?? null
}

/**
 * Render the next-suggestion row in the full-width `conversation.input.dock`.
 * @param props - Session id, standard hooks, input actions, translator, runtime.
 * @returns the row, or null when there is no current candidate.
 */
export function SuggestionRow({ sessionId, useSession, useInput, useChat, useProjection, useSettings, inputActions, t, runtime }) {
  const settings = useSettings(state => state)
  const session = useSession(state => state)
  const input = useInput(state => state)
  const latestTurnNumber = useChat(state => state.timeline.turnOrder.at(-1) ?? null)
  const latestTurn = useChat(state => latestTurnNumber === null
    ? null
    : state.timeline.turns.get(latestTurnNumber) ?? null)
  const projection = useProjection('modelSelection')
  const selectedModel = projection?.next ?? projection?.lastUsed
  const modelRoute = routeValue(selectedModel)
  const modelKey = modelRoute === null ? '' : JSON.stringify(modelRoute)
  const completed = latestTurn?.end?.data?.reason?.kind === 'completed'
  const identity = completed
    ? turnIdentity(sessionId, latestTurn?.turn, latestTurn?.end?.seq)
    : null
  const currentKey = identityKey(identity)
  const [candidate, setCandidate] = React.useState(null)
  const [composing, setComposing] = React.useState(false)
  const composingRef = React.useRef(false)
  const predictionOffEpoch = Number.isSafeInteger(settings.predictionOffEpoch) ? settings.predictionOffEpoch : 0
  const previousPredictionOffEpoch = React.useRef(predictionOffEpoch)
  const previousIdentity = React.useRef(null)
  const previousModelKey = React.useRef(modelKey)
  const latest = React.useRef(null)
  const rowRef = React.useRef(null)

  React.useEffect(() => {
    composingRef.current = false
    setComposing(false)
  }, [sessionId])

  const consumed = identity !== null && runtime.hidden.isHidden(sessionId, identity.turn, identity.endSeq)
  const composingNow = composing || composingRef.current
  const eligible = settings.loaded === true && canShowSuggestion({
    prediction: settings.prediction,
    sessionId,
    input,
    session,
    identity,
    route: modelRoute,
    composing: composingNow,
  }) && !consumed
  const candidateCurrent = candidateMatches(candidate, identity, modelRoute, predictionOffEpoch)
  const visible = candidateCurrent && eligible
  latest.current = {
    candidate,
    identity,
    modelRoute,
    session,
    input,
    prediction: settings.prediction,
    predictionOffEpoch,
    composing: composingNow,
    eligible: visible,
    sessionId,
    inputActions,
    runtime,
  }

  // A new or replayed latest Turn consumes the prior Turn's unused candidate.
  // This is driven from Chat's timeline, so a short running transition cannot
  // let an old response reappear if React never observed `running: true`.
  React.useEffect(() => {
    const previous = previousIdentity.current
    if (previous !== null && previous.key !== currentKey) {
      runtime.hidden.hide(previous.sessionId, previous.turn, previous.endSeq)
      setCandidate(null)
    }
    previousIdentity.current = identity === null ? null : { ...identity, key: currentKey }
  }, [currentKey, sessionId, runtime])

  // A route change, explicit disable, or actual submission permanently
  // consumes this exact candidate identity. Plain typing and attachments only
  // hide it and may restore it after the composer is empty again.
  React.useEffect(() => {
    const previous = previousModelKey.current
    previousModelKey.current = modelKey
    if (previous !== '' && previous !== modelKey && identity !== null) {
      runtime.hidden.hide(sessionId, identity.turn, identity.endSeq)
      setCandidate(null)
    }
  }, [modelKey, currentKey, sessionId, runtime])

  React.useEffect(() => {
    const previousEpoch = previousPredictionOffEpoch.current
    previousPredictionOffEpoch.current = predictionOffEpoch
    if (settings.loaded !== true) return
    const disabledSinceLastRender = predictionOffEpoch > previousEpoch
    if (settings.prediction === true && !disabledSinceLastRender) return
    if (identity !== null) runtime.hidden.hide(sessionId, identity.turn, identity.endSeq)
    if (candidate !== null && Number.isSafeInteger(candidate.turn) && Number.isSafeInteger(candidate.endSeq)) {
      runtime.hidden.hide(candidate.sessionId, candidate.turn, candidate.endSeq)
    }
    setCandidate(null)
  }, [settings.loaded, settings.prediction, predictionOffEpoch, currentKey, sessionId, runtime])

  const busySubmission = submissionStarted(session, input)
  React.useEffect(() => {
    if (!busySubmission || identity === null) return
    runtime.hidden.hide(sessionId, identity.turn, identity.endSeq)
    setCandidate(null)
  }, [busySubmission, currentKey, sessionId, runtime])

  const hasCurrentCandidate = candidateCurrent && !consumed
  const canAsk = eligible && !hasCurrentCandidate
  React.useEffect(() => {
    if (!canAsk || identity === null || modelRoute === null) return undefined
    const controller = new AbortController()
    const requestIdentity = identity
    const requestRoute = modelRoute
    const requestKey = currentKey
    const requestPredictionOffEpoch = predictionOffEpoch
    const timer = window.setTimeout(() => {
      const beforeRequest = latest.current
      if (beforeRequest === null || identityKey(beforeRequest.identity) !== requestKey
        || beforeRequest.predictionOffEpoch !== requestPredictionOffEpoch
        || !sameRoute(beforeRequest.modelRoute, requestRoute)
        || beforeRequest.runtime.hidden.isHidden(requestIdentity.sessionId, requestIdentity.turn, requestIdentity.endSeq)) return
      void runtime.requestSuggestion(
        requestIdentity.sessionId,
        requestIdentity.turn,
        requestIdentity.endSeq,
        controller.signal,
      ).then((result) => {
        if (controller.signal.aborted) return
        const current = latest.current
        if (current === null || current.prediction !== true || current.composing
          || current.predictionOffEpoch !== requestPredictionOffEpoch
          || identityKey(current.identity) !== requestKey || !sameRoute(current.modelRoute, requestRoute)
          || !canShowSuggestion({
            prediction: current.prediction,
            sessionId: current.sessionId,
            input: current.input,
            session: current.session,
            identity: current.identity,
            route: current.modelRoute,
            composing: current.composing,
          })
          || current.runtime.hidden.isHidden(requestIdentity.sessionId, requestIdentity.turn, requestIdentity.endSeq)
          || !candidateMatches(result, requestIdentity, requestRoute)) return
        setCandidate({ ...result, predictionOffEpoch: requestPredictionOffEpoch })
      }).catch(() => {})
    }, ASK_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [canAsk, currentKey, modelKey, settings.prediction, predictionOffEpoch, runtime])

  // Composition is observed only on this occurrence's composer. The row stays
  // mounted but hidden during IME input so its local listeners can see the end.
  React.useEffect(() => {
    if (!candidateCurrent && !canAsk && !composingNow) return undefined
    const inputElement = composerInput(rowRef.current, sessionId)
    if (inputElement === null || inputElement === undefined) return undefined
    const start = () => {
      composingRef.current = true
      setComposing(true)
    }
    const end = () => {
      composingRef.current = false
      setComposing(false)
    }
    inputElement.addEventListener('compositionstart', start)
    inputElement.addEventListener('compositionend', end)
    return () => {
      inputElement.removeEventListener('compositionstart', start)
      inputElement.removeEventListener('compositionend', end)
    }
  }, [candidateCurrent, canAsk, composingNow, currentKey, sessionId])

  const sameCandidateSnapshot = (snapshot, active) => snapshot !== null && active !== null
    && snapshot.candidate === active.candidate
    && identityKey(snapshot.identity) === identityKey(active.identity)
    && snapshot.predictionOffEpoch === active.predictionOffEpoch
    && snapshot.input?.draftRev === active.input?.draftRev
    && sameRoute(snapshot.modelRoute, active.modelRoute)

  const canInteract = (snapshot) => {
    const current = latest.current
    if (!sameCandidateSnapshot(snapshot, current)
      || current?.identity === null || current?.candidate === null
      || current.composing || composingRef.current
      || !current.eligible
      || !candidateMatches(current.candidate, current.identity, current.modelRoute, current.predictionOffEpoch)
      || !canShowSuggestion({
        prediction: current.prediction,
        sessionId: current.sessionId,
        input: current.input,
        session: current.session,
        identity: current.identity,
        route: current.modelRoute,
        composing: current.composing || composingRef.current,
      })
      || current.runtime.hidden.isHidden(current.sessionId, current.identity.turn, current.identity.endSeq)
      || editableComposerFor(rowRef.current, current.sessionId) === null) return false
    return true
  }

  const consume = (current) => {
    if (!canInteract(current)) return false
    const active = latest.current
    active.runtime.hidden.hide(active.sessionId, active.identity.turn, active.identity.endSeq)
    setCandidate(null)
    return true
  }

  const applyCandidate = (submit) => {
    const current = latest.current
    if (!canInteract(current)) return false
    const apply = submit ? sendCandidate : insertCandidate
    const applied = apply(
      current.inputActions,
      current.candidate.text,
      () => sameCandidateSnapshot(current, latest.current)
        && focusComposer(rowRef.current, current.sessionId),
      {
        expectedDraftRev: current.input?.draftRev,
        canInsert: () => canInteract(current),
      },
    )
    if (!applied) return false
    // The standard DSH submit action owns commit, delivery, and failure
    // recovery. The send path only inserts after the same revision/IME/editor
    // checks as Fill into chat; it never replaces the composer with setDraft().
    current.runtime.hidden.hide(current.sessionId, current.identity.turn, current.identity.endSeq)
    setCandidate(null)
    return true
  }

  const insert = () => applyCandidate(false)
  const send = () => applyCandidate(true)

  const dismiss = () => {
    const current = latest.current
    if (!canInteract(current) || !focusComposer(rowRef.current, current.sessionId)) return false
    return consume(current)
  }

  React.useEffect(() => {
    if (!visible || typeof runtime.shortcuts?.observeFixedInput !== 'function') return undefined
    return runtime.shortcuts.observeFixedInput((event) => {
      const current = latest.current
      const action = shortcutAction(event, {
        sessionId,
        row: rowRef.current,
        eligible: current?.eligible === true,
        composing: current?.composing === true || composingRef.current,
      })
      if (action === 'dismiss' && dismiss()) event.consume()
    })
  }, [visible, currentKey, modelKey, sessionId, runtime])

  if (!candidateCurrent || consumed) return null
  return h('div', {
    ref: rowRef,
    className: 'dca-suggest',
    role: 'group',
    'aria-label': t('suggestion.label'),
    hidden: !visible,
  },
  h(HintIcon, { className: 'dca-mark' }),
  h('span', { className: 'dca-text' }, candidate.text),
  h('button', {
    type: 'button',
    className: 'dca-insert',
    title: t('suggestion.insert'),
    'aria-label': t('suggestion.insert'),
    onMouseDown: event => { event.preventDefault() },
    onClick: insert,
  }, h('svg', {
    viewBox: '0 0 16 16',
    width: 16,
    height: 16,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }, h('path', { d: 'M13 3 3 13M3 13h7M3 13V6' }))),
  h('button', {
    type: 'button',
    className: 'dca-send',
    title: t('suggestion.send'),
    'aria-label': t('suggestion.send'),
    onMouseDown: event => { event.preventDefault() },
    onClick: send,
  }, t('suggestion.send')),
  h('button', {
    type: 'button',
    className: 'dca-dismiss',
    'aria-label': t('suggestion.dismiss'),
    onMouseDown: event => { event.preventDefault() },
    onClick: dismiss,
  }, '×'))
}
