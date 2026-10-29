/** Prompt recall: the composer's ArrowUp history, wired to fixed input and public actions. */

import React from 'react'

import { createRecallController, historyFor } from './recall.mjs'

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
    const controller = createRecallController({
      latest: () => latest.current,
      observeFixedInput: runtime?.shortcuts?.observeFixedInput,
      historyFor: sessionId => historyFor(runtime?.sessions, sessionId),
    })
    return controller.dispose
  }, [runtime])

  return null
}
