/** Prompt recall: the composer's ArrowUp history, wired to fixed input and public actions. */

import React from 'react'

import { PromptRecall, historyFor, recallAction } from './recall.mjs'
import { editableComposerFor } from './behavior.mjs'

const h = React.createElement

/**
 * Behaviour-only seat that adds prompt recall to the composer of its Session.
 *
 * It renders nothing: the gesture, the text it writes, and the draft it
 * restores all go through the host's own public actions. Registering a seat is
 * how the plugin receives `useInput`, `useSession`, and `inputActions` for the
 * Session it belongs to.
 * @param props - Session id, standard hooks, composer actions, and services.
 * @returns null; the component exists for its subscriptions.
 */
export function PromptRecallSeat({ sessionId, useSession, useInput, inputActions, runtime }) {
  const session = useSession(state => state)
  const input = useInput(state => state)
  const latest = React.useRef(null)
  latest.current = { session, input, inputActions, sessionId }

  React.useEffect(() => {
    const recall = new PromptRecall()
    let written = null

    /**
     * Write one browse step through the public whole-draft action.
     * @param step - the controller's decision.
     * @returns whether the draft was written.
     */
    const apply = (step) => {
      const current = latest.current
      if (step === null || current.inputActions === undefined) return false
      if (step.kind === 'stay') return true
      written = step.text
      current.inputActions.setDraft(step.text)
      return true
    }

    /** Leave history as soon as the user edits the recalled text. */
    const watchEdit = () => {
      const current = latest.current
      if (!recall.browsing) return
      if (current.input === undefined || current.input.draft === written) return
      recall.abandon()
      written = null
    }

    // The composer's snapshot store is not public, so an edit is noticed at the
    // next gesture by comparing the live draft with the text this seat wrote.
    const off = typeof runtime?.shortcuts?.observeFixedInput !== 'function'
      ? () => {}
      : runtime.shortcuts.observeFixedInput((event) => {
        const current = latest.current
        watchEdit()
        const step = recallAction(event, {
          sessionId: current.sessionId,
          input: current.input,
          session: current.session,
          recall,
          history: historyFor(runtime.sessions, current.sessionId),
        })
        if (!apply(step)) return
        // `stay` at the oldest prompt is ours too: the key must not move the caret.
        event.consume()
      })

    return () => { off(); recall.reset() }
  }, [runtime])

  return null
}
