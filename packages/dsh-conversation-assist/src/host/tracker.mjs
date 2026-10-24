/** Live Turn tracker: only Turns completed while the plugin is running count. */

/**
 * Create a tracker that records the latest Turn per Session.
 * @returns an observer plus read/forget operations.
 */
export function createTracker() {
  const entries = new Map()
  return {
    /**
     * Observe one committed Session event.
     * @param session - owning Session.
     * @param event - committed event.
     */
    observe(session, event) {
      const sessionId = typeof session?.id === 'string' ? session.id : undefined
      if (sessionId === undefined) return
      if (event.type === 'turn/start') {
        entries.set(sessionId, {
          turn: event.data.turn,
          startSeq: event.seq,
          endSeq: undefined,
          endTime: undefined,
          reason: undefined,
          header: undefined,
        })
        return
      }
      const entry = entries.get(sessionId)
      if (entry === undefined) return
      if (event.type === 'request/header') {
        entry.header = event.data.header?.config
        return
      }
      if (event.type === 'turn/end' && event.data.turn === entry.turn) {
        entry.endSeq = event.seq
        entry.endTime = event.time
        entry.reason = event.data.reason
      }
    },
    /**
     * Read the latest Turn entry.
     * @param sessionId - Session identity.
     * @returns a shallow copy, or undefined when the plugin has seen no Turn.
     */
    get(sessionId) {
      const entry = entries.get(sessionId)
      return entry === undefined ? undefined : { ...entry }
    },
    /**
     * Drop one Session.
     * @param sessionId - Session identity.
     */
    forget(sessionId) {
      entries.delete(sessionId)
    },
    /** Drop every Session; used by tests and plugin disposal. */
    reset() {
      entries.clear()
    },
  }
}
