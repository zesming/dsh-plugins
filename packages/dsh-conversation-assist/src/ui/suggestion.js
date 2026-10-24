/** The composer dock suggestion row and its view registration. */

import React from 'react'

import { canRequest } from '../shared/prediction.mjs'

const h = React.createElement

/** Delay before asking, so the Host has committed `turn/end` and the snapshot settled. */
const ASK_DELAY_MS = 400

/**
 * Render the next-suggestion row inside `conversation.composer.dock`.
 * @param props - Session id, standard hooks, input actions, translator, runtime.
 * @returns the row, or null when no candidate should show.
 */
export function SuggestionRow({ sessionId, useSession, useInput, useProjection, useSettings, inputActions, t, runtime }) {
  const settings = useSettings(state => state)
  const session = useSession(state => state)
  const input = useInput(state => state)
  const projection = useProjection('modelSelection')
  const modelKey = `${projection?.next?.provider ?? ''}/${projection?.next?.model ?? ''}`
  const [candidate, setCandidate] = React.useState(null)
  const rowRef = React.useRef(null)
  const lastTurn = React.useRef(null)
  const previousModelKey = React.useRef(null)
  const wasRunning = React.useRef(false)
  const latest = React.useRef(null)
  latest.current = { candidate, inputActions, sessionId, runtime }

  const canAsk = canRequest({ prediction: settings.prediction, sessionId, input, session })

  React.useEffect(() => {
    if (!canAsk) {
      setCandidate(null)
      return undefined
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void runtime.requestSuggestion(sessionId, runtime.language(), runtime.armedAt(), controller.signal).then((result) => {
        if (controller.signal.aborted) return
        if (result?.state !== 'ready' || typeof result.text !== 'string' || typeof result.turn !== 'number') return
        if (runtime.hidden.isHidden(sessionId, result.turn)) return
        const current = projection?.next
        const route = result.route
        // The candidate was generated for the Turn's logged route. If the user
        // has switched models since, it belongs to the old route and must not
        // come back, even after this component re-mounts.
        if (current !== null && current !== undefined && route !== null && typeof route === 'object'
          && typeof route.provider === 'string' && typeof route.model === 'string'
          && (route.provider !== current.provider || route.model !== current.model)) {
          runtime.hidden.hide(sessionId, result.turn)
          return
        }
        lastTurn.current = result.turn
        setCandidate({ text: result.text, turn: result.turn })
      }).catch(() => {})
    }, ASK_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [canAsk, sessionId, settings.prediction, modelKey, runtime])

  React.useEffect(() => {
    if (previousModelKey.current === null) {
      previousModelKey.current = modelKey
      return
    }
    if (previousModelKey.current === modelKey) return
    previousModelKey.current = modelKey
    if (lastTurn.current !== null) runtime.hidden.hide(sessionId, lastTurn.current)
    setCandidate(null)
  }, [modelKey, sessionId, runtime])

  React.useEffect(() => {
    const running = session.running === true
    if (running && !wasRunning.current && lastTurn.current !== null) {
      runtime.hidden.hide(sessionId, lastTurn.current)
      setCandidate(null)
    }
    wasRunning.current = running
  }, [session.running, sessionId, runtime])

  React.useEffect(() => {
    // Entering a submission or command claim consumes this Turn even if the
    // send fails and the composer returns to plain with an empty draft.
    if (input.phase === 'plain') return
    if (lastTurn.current !== null) runtime.hidden.hide(sessionId, lastTurn.current)
    setCandidate(null)
  }, [input.phase, sessionId, runtime])

  const accept = React.useCallback((source = 'click') => {
    const current = latest.current
    if (current === null || current.candidate === null) return false
    // A page selection only matters for the keyboard gestures; clicking Accept
    // while text is selected elsewhere in the transcript must still work.
    if (source === 'key') {
      const selection = document.getSelection()
      if (selection !== null && !selection.isCollapsed) return false
    }
    const span = current.inputActions.captureInsertion()
    if (!current.inputActions.insertText(current.candidate.text, span)) return false
    current.runtime.hidden.hide(current.sessionId, current.candidate.turn)
    setCandidate(null)
    return true
  }, [])

  const dismiss = React.useCallback(() => {
    const current = latest.current
    if (current !== null && current.candidate !== null) {
      current.runtime.hidden.hide(current.sessionId, current.candidate.turn)
    }
    setCandidate(null)
  }, [])

  React.useEffect(() => {
    if (candidate === null) {
      runtime.accepts.delete(sessionId)
      return () => {}
    }
    runtime.accepts.set(sessionId, { accept, dismiss, turn: candidate.turn })
    return () => {
      if (runtime.accepts.get(sessionId)?.turn === candidate.turn) runtime.accepts.delete(sessionId)
    }
  }, [accept, candidate, dismiss, runtime, sessionId])

  if (candidate === null) return null
  return h('div', {
    ref: rowRef,
    className: 'dca-suggest',
    role: 'group',
    'aria-label': t('suggestion.label'),
  },
  h('span', { className: 'dca-mark', 'aria-hidden': 'true' }, '↳'),
  h('span', { className: 'dca-text', title: candidate.text }, candidate.text),
  h('span', { className: 'dca-gap' }),
  h('span', { className: 'dca-keys', 'aria-hidden': 'true' }, h('kbd', null, 'Tab'), h('kbd', null, '→')),
  h('button', {
    type: 'button',
    className: 'dca-accept',
    'aria-keyshortcuts': 'Tab ArrowRight',
    title: t('suggestion.hint'),
    onMouseDown: event => { event.preventDefault() },
    onClick: () => { accept('click') },
  }, t('suggestion.accept')),
  h('button', {
    type: 'button',
    className: 'dca-dismiss',
    'aria-label': t('suggestion.dismiss'),
    onMouseDown: event => { event.preventDefault() },
    onClick: dismiss,
  }, '×'))
}
