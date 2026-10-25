/** Shared in-process concurrency gate for all auxiliary features. */

import { LIMITS } from '../shared/limits.mjs'

/** Local calendar day for the persistent per-session attempt ledger. */
export function localDayKey(now = Date.now()) {
  const date = new Date(now)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Create the Host-wide parallel-call gate. */
export function createSuggestionGate({ limits = LIMITS } = {}) {
  let active = 0
  return {
    /** Reserve a parallel slot synchronously. */
    take() {
      if (active >= limits.maxConcurrent) return false
      active += 1
      return true
    },
    /** Release one parallel slot. */
    release() {
      active = Math.max(0, active - 1)
    },
    /** Current active attempts; useful to focused tests. */
    active() {
      return active
    },
  }
}
