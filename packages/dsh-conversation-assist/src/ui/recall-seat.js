/** Prompt recall: the composer's ArrowUp history, wired to fixed input and public actions. */

import React from 'react'

import { PromptRecall, historyFor, isOwnDraft, recallAction } from './recall.mjs'

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
    // The draft this seat last wrote. `useInput` re-renders on the next tick, so
    // during two presses in one frame the snapshot still holds the text before
    // the first write; tracking the value locally keeps both presses "ours".
    let written = null
    let published = null

    /**
     * Write one browse step through the public whole-draft action.
     * @param step - the controller's decision.
     * @returns whether the draft was written.
     */
    const apply = (step) => {
      const current = latest.current
      if (step === null || current.inputActions === undefined) return false
      written = step.text
      current.inputActions.setDraft(step.text)
      return true
    }

    /** Leave history as soon as the user edits the recalled text. */
    const watchEdit = () => {
      const current = latest.current
      if (!recall.browsing) return
      const draft = current.input?.draft
      if (isOwnDraft(draft, written, published)) {
        if (typeof draft === 'string') published = draft
        return
      }
      recall.abandon()
      written = null
      published = null
    }

    // The composer's snapshot store is not public, so an edit is noticed at the
    // next gesture by comparing the live draft with the text this seat wrote.
    const off = typeof runtime?.shortcuts?.observeFixedInput !== 'function'
      ? () => {}
      : runtime.shortcuts.observeFixedInput((event) => {
        const current = latest.current
        if (published === null && written === null) published = current.input?.draft ?? null
        watchEdit()
        const step = recallAction(event, {
          sessionId: current.sessionId,
          input: current.input,
          session: current.session,
          recall,
          history: historyFor(runtime.sessions, current.sessionId),
        })
        if (!apply(step)) return
        event.consume()
      })

    return () => { off(); recall.reset() }
  }, [runtime])

  return null
}
