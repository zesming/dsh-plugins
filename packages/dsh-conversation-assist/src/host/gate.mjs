/** Per-Session suggestion gate: one attempt per Turn, plus a small daily budget. */

import { LIMITS } from '../shared/limits.mjs'

/**
 * Local calendar day for the daily budget (not the UTC date).
 * @param now - epoch milliseconds.
 * @returns `YYYY-MM-DD` in the Host's local time.
 */
export function localDayKey(now = Date.now()) {
  const date = new Date(now)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Create the cache/budget/concurrency gate.
 *
 * A Turn is remembered after its one attempt, including an empty or failed
 * attempt, so a client that clears and re-asks does not trigger a second model
 * call. The next Turn forgets only the candidate, not the daily count.
 * @param options - limits and clock.
 * @returns gate operations.
 */
export function createSuggestionGate({ limits = LIMITS, now = Date.now } = {}) {
  const cache = new Map()
  const budget = new Map()
  let active = 0
  return {
    /**
     * Read the remembered outcome for one Turn.
     * @param sessionId - Session.
     * @param turn - Turn number.
     * @returns `{hit, text?, none?}`.
     */
    check(sessionId, turn) {
      const entry = cache.get(sessionId)
      if (entry === undefined || entry.turn !== turn) return { hit: false }
      return entry.text === undefined ? { hit: true, none: true } : { hit: true, text: entry.text }
    },
    /**
     * Reserve one attempt if the daily and concurrency limits allow it.
     * @param sessionId - Session.
     * @returns whether the attempt may start.
     */
    take(sessionId) {
      const day = localDayKey(now())
      const spent = budget.get(sessionId)
      if (spent === undefined || spent.day !== day) budget.set(sessionId, { day, count: 0 })
      const slot = budget.get(sessionId)
      if (slot.count >= limits.dailyPerSession) return false
      if (active >= limits.maxConcurrent) return false
      slot.count += 1
      active += 1
      return true
    },
    /** Release one concurrency slot. */
    release() {
      active = Math.max(0, active - 1)
    },
    /**
     * Remember one Turn's outcome.
     * @param sessionId - Session.
     * @param turn - Turn number.
     * @param text - suggestion text, or undefined for an empty/failed attempt.
     */
    remember(sessionId, turn, text) {
      const previous = cache.get(sessionId)
      // A slow old Turn must not overwrite a newer Turn's cached outcome.
      if (previous !== undefined && previous.turn > turn) return
      cache.set(sessionId, text === undefined ? { turn, none: true } : { turn, text })
    },
    /** @param sessionId - Session to forget the candidate for. */
    forgetCandidate(sessionId) {
      cache.delete(sessionId)
    },
    /** @param sessionId - Session to forget entirely. */
    clear(sessionId) {
      cache.delete(sessionId)
      budget.delete(sessionId)
    },
    /** @returns the number of active attempts (tests). */
    active() {
      return active
    },
  }
}
