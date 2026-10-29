/**
 * Prompt recall: fold a Session event window into the user's prompts, and
 * decide what one ArrowUp / ArrowDown / Escape writes.
 *
 * Pure and host-free. The composer is written through the public
 * `inputActions.setDraft`; this module never touches the editor, so it cannot
 * anchor an undo baseline — leaving history through `↓` or Escape is what
 * gives the previous draft back.
 */

/** Join one message's text blocks; images and files have no text form to recall. */
function messageText(content) {
  const parts = []
  for (const block of content ?? []) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

/**
 * Fold one Session event window into the user's prompt history, oldest first.
 *
 * Only `user/message` events whose source is the user count: a mid-turn steer
 * is such a message, while agent-injected context is not. Consecutive
 * identical prompts collapse to one entry.
 * @param entries - the Session window's entries, in log order.
 * @returns the recallable texts; empty when the Session has no user prompt.
 */
export function promptHistoryOf(entries) {
  const history = []
  let previous
  for (const entry of entries ?? []) {
    if (entry?.type !== 'event') continue
    const event = entry.event
    if (event?.type !== 'user/message' || event.data?.source?.kind !== 'user') continue
    const text = messageText(event.data.content)
    if (text.trim() === '' || text === previous) continue
    history.push(text)
    previous = text
  }
  return history
}

/**
 * Whether a composer may enter prompt history.
 *
 * A running turn does not block recall: recalling while the agent works is an
 * ordinary use, and the draft stays empty. Only the composer's own admission
 * state and a removed Session disqualify it.
 * @param input - composer snapshot.
 * @param session - Session snapshot.
 * @returns whether the gesture may recall.
 */
export function canRecall(input, session) {
  return input?.phase === 'plain'
    && typeof input.draft === 'string' && input.draft === ''
    && (input.attachmentIds?.length ?? 0) === 0
    && session?.removed !== true
}

/**
 * Controller for one composer's browse state.
 *
 * The cursor is an offset **from the newest prompt**, not an absolute index.
 * Loading an older history page prepends entries, which shifts absolute
 * indices but leaves every distance-from-newest unchanged, so a Session that
 * pages its window mid-browse keeps pointing at the same prompt. The caller
 * re-folds the history on every gesture for the same reason.
 *
 * State is keyed by the Session that entered history: a Session switch starts
 * clean rather than resuming the other Session's cursor.
 */
export class PromptRecall {
  constructor() {
    this.state = null
  }

  /** @returns whether a recalled prompt currently owns the draft. */
  get browsing() {
    return this.state !== null
  }

  /** @returns the Session that owns the current browse state, or '' when idle. */
  get sessionId() {
    return this.state?.sessionId ?? ''
  }

  /**
   * Step to an older prompt, entering history when the composer is empty.
   * @param options - Session id, prompt history, current draft, and entry permission.
   * @returns the step to take, or null when the gesture is not ours.
   */
  older({ sessionId, history, draft, canEnter }) {
    if (this.state !== null && this.state.sessionId !== sessionId) this.reset()
    const current = this.state
    if (current === null) {
      if (canEnter !== true || history.length === 0) return null
      this.state = { sessionId, stash: draft, offset: 0 }
      return { kind: 'recall', text: history[history.length - 1] }
    }
    // At the oldest prompt the key is not ours any more: leaving it unconsumed
    // lets the browser move the caret inside the recalled text, which is what
    // a multi-paragraph prompt needs.
    const next = current.offset + 1
    if (next >= history.length) return null
    current.offset = next
    return { kind: 'recall', text: history[history.length - 1 - next] }
  }

  /**
   * Step toward newer prompts, or leave history past the newest one.
   * @param history - the Session's current prompt history.
   * @returns the step to take, or null when the composer is not browsing.
   */
  newer(history) {
    const state = this.state
    if (state === null) return null
    if (state.offset === 0) {
      const stash = state.stash
      this.reset()
      return { kind: 'restore', text: stash }
    }
    // Resolve before mutating: a window that shrank mid-browse (compaction) can
    // leave the target gone, and a decremented cursor would then point one
    // prompt off on the following press.
    const text = history?.[history.length - 1 - (state.offset - 1)]
    if (typeof text !== 'string') return null
    state.offset -= 1
    return { kind: 'recall', text }
  }

  /**
   * Leave history and hand the stashed draft back.
   * @returns the restore step, or null when the composer is not browsing.
   */
  leave() {
    const state = this.state
    if (state === null) return null
    const stash = state.stash
    this.reset()
    return { kind: 'restore', text: stash }
  }

  /**
   * Abandon history without restoring; the user's edit stays.
   * Called after any draft write this controller did not perform.
   */
  abandon() {
    this.state = null
  }

  /** Drop the browse state. */
  reset() {
    this.state = null
  }
}

/**
 * Resolve the Session addressed by an arbitrated key event.
 *
 * Reads the host's own occurrence marker; no public contract names the Session
 * on a DOM target, so a host change to this attribute breaks recall alone.
 * @param event - fixed-input event.
 * @returns the owning Session id, or '' when the event belongs to another surface.
 */
export function sessionOfEvent(event) {
  const occurrence = event?.context?.target?.closest?.('[data-conversation-session]') ?? null
  const sessionId = occurrence?.dataset?.conversationSession
  return typeof sessionId === 'string' ? sessionId : ''
}

/**
 * Whether an arbitrated event is a candidate for prompt recall at all.
 *
 * The host composer consumes arrows only while its trigger menu is open, so a
 * `defaultPrevented` event belongs to that menu and is left alone; an IME
 * composition, a repeat, and any modifier also disqualify it.
 * @param event - fixed-input event.
 * @returns whether the arrow may be interpreted as history navigation.
 */
export function isRecallGesture(event) {
  if (event?.type !== 'keydown') return false
  const { gesture, context } = event
  if (gesture === undefined || context === undefined) return false
  if (gesture.code !== 'ArrowUp' && gesture.code !== 'ArrowDown') return false
  if (gesture.repeat || gesture.composing || gesture.defaultPrevented) return false
  if (gesture.control || gesture.alt || gesture.shift || gesture.meta) return false
  if (context.modal !== null || context.target === null || context.target === undefined) return false
  return true
}

/**
 * Whether Escape may leave history right now.
 *
 * The host owns Escape for its two-press Stop, so a running turn keeps the key:
 * recalling on a busy Session must not arm cancellation.
 * @param event - fixed-input event.
 * @param session - Session snapshot.
 * @returns whether Escape is available to prompt recall.
 */
export function isLeaveGesture(event, session) {
  if (event?.type !== 'keydown') return false
  const { gesture, context } = event
  if (gesture === undefined || context === undefined) return false
  if (gesture.code !== 'Escape') return false
  if (gesture.repeat || gesture.composing || gesture.defaultPrevented) return false
  if (gesture.control || gesture.alt || gesture.shift || gesture.meta) return false
  if (context.modal !== null || context.target === null || context.target === undefined) return false
  return session?.running !== true && session?.removed !== true
}

/**
 * Read the prompt history of one Session from its loaded event window.
 * @param sessions - Session Controller service.
 * @param sessionId - addressed Session.
 * @returns the recallable texts, oldest first.
 */
export function historyFor(sessions, sessionId) {
  try {
    const binding = sessions?.binding?.(sessionId)
    const window = binding?.eventSource?.getSnapshot?.()
    return promptHistoryOf(window?.entries)
  } catch {
    return []
  }
}

/**
 * Decide what one arbitrated key event means for prompt recall.
 *
 * This is the whole gesture rule, kept free of React so it can be tested
 * directly: which key, whose composer, whether the composer may enter history,
 * and how the browse cursor moves.
 * @param event - fixed-input event from the shortcut observer.
 * @param state - addressed Session, live snapshots, the browse controller, and its history.
 * @returns the step to write, or null when this event is not prompt recall.
 */
export function recallAction(event, { sessionId, input, session, recall, history }) {
  if (sessionId === '' || sessionOfEvent(event) !== sessionId) return null
  if (isLeaveGesture(event, session)) return recall.leave()
  if (!isRecallGesture(event)) return null
  if (event.gesture.code === 'ArrowDown') return recall.newer(history)
  return recall.older({
    sessionId,
    history,
    draft: input?.draft ?? '',
    canEnter: canRecall(input, session),
  })
}

/**
 * Whether a live draft is still the text this seat wrote, rather than an edit.
 *
 * The composer's snapshot store is not public, so an edit is only observable at
 * the next gesture. `useInput` also re-renders a tick later than the write, so
 * during two presses in one frame the snapshot still holds the text from before
 * the first write; accepting the last published value as well keeps the second
 * press inside history instead of silently abandoning it.
 * @param draft - the draft read from the current snapshot.
 * @param written - the text this seat last wrote.
 * @param published - the draft value this seat last accepted as its own.
 * @returns whether the draft is this seat's own text.
 */
export function isOwnDraft(draft, written, published) {
  if (typeof draft !== 'string') return true
  return draft === written || draft === published
}
