/** The composer dock suggestion row and its view registration. */

import React from 'react'

import { canRequest } from '../shared/prediction.mjs'
import { HintIcon } from './icons.js'

const h = React.createElement

/** Delay before asking, so the Host has committed `turn/end` and the snapshot settled. */
const ASK_DELAY_MS = 400

/**
 * Return focus to the composer seat that owns this row, before the row unmounts.
 * A bare DOM focus only works after the row's own card; scoping avoids the wrong
 * composer when several are mounted.
 * @param row - the suggestion row, or null.
 */
function focusComposer(row) {
  if (typeof document === 'undefined') return
  const scope = row?.parentElement ?? document
  const input = scope.querySelector('[data-composer-input]')
  if (input instanceof HTMLElement) input.focus()
}

/**
 * Render the next-suggestion row inside `conversation.input.dock`.
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
  const lastTurn = React.useRef(null)
  const previousModelKey = React.useRef(null)
  const wasRunning = React.useRef(false)
  const latest = React.useRef(null)
  const rowRef = React.useRef(null)
  latest.current = { candidate, inputActions, sessionId, runtime }

  const canAsk = canRequest({ prediction: settings.prediction, sessionId, input, session })

  React.useEffect(() => {
    // The dock is normally remounted on a Session switch; keep a defensive
    // reset for a retained entry so an old Turn cannot leak into the new one.
    setCandidate(null)
    lastTurn.current = null
    previousModelKey.current = null
    wasRunning.current = false
  }, [sessionId])

  React.useEffect(() => {
    if (!canAsk) return undefined
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

  const insert = React.useCallback(() => {
    const current = latest.current
    if (current === null || current.candidate === null) return false
    const span = current.inputActions.captureInsertion()
    // Focus first: Lexical only commits the post-insert caret to the DOM while
    // the editor is focused; a bare focus afterwards lands at offset 0.
    focusComposer(rowRef.current)
    if (!current.inputActions.insertText(current.candidate.text, span)) return false
    current.runtime.hidden.hide(current.sessionId, current.candidate.turn)
    setCandidate(null)
    return true
  }, [])

  const send = React.useCallback(() => {
    const current = latest.current
    if (current === null || current.candidate === null) return false
    current.inputActions.setDraft(current.candidate.text)
    current.inputActions.submit()
    current.runtime.hidden.hide(current.sessionId, current.candidate.turn)
    focusComposer(rowRef.current)
    setCandidate(null)
    return true
  }, [])

  const dismiss = React.useCallback(() => {
    const current = latest.current
    if (current !== null && current.candidate !== null) {
      current.runtime.hidden.hide(current.sessionId, current.candidate.turn)
    }
    focusComposer(rowRef.current)
    setCandidate(null)
  }, [])

  React.useEffect(() => {
    // Turning prediction off consumes the pending candidate; re-enabling starts
    // with the next Turn rather than resurrecting the old one.
    if (settings.prediction === true) return
    if (lastTurn.current !== null) runtime.hidden.hide(sessionId, lastTurn.current)
    setCandidate(null)
  }, [settings.prediction, sessionId, runtime])

  if (candidate === null || !canAsk) return null
  return h('div', {
    ref: rowRef,
    className: 'dca-suggest',
    role: 'group',
    'aria-label': t('suggestion.label'),
  },
  h(HintIcon, { className: 'dca-mark' }),
  h('span', { className: 'dca-text', title: candidate.text }, candidate.text),
  h('button', {
    type: 'button',
    className: 'dca-insert',
    title: t('suggestion.insert'),
    'aria-label': t('suggestion.insert'),
    onMouseDown: event => { event.preventDefault() },
    onClick: () => { insert() },
  },
  h('svg', {
    viewBox: '0 0 16 16',
    width: 16,
    height: 16,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  },
  h('path', { d: 'M13 3 3 13M3 13h7M3 13V6' }))),
  h('button', {
    type: 'button',
    className: 'dca-send',
    title: t('suggestion.hint'),
    onMouseDown: event => { event.preventDefault() },
    onClick: () => { send() },
  }, t('suggestion.send')),
  h('button', {
    type: 'button',
    className: 'dca-dismiss',
    'aria-label': t('suggestion.dismiss'),
    onMouseDown: event => { event.preventDefault() },
    onClick: dismiss,
  }, '×'))
}
