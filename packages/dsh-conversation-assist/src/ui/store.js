/** Browser-side settings, per-Turn hidden state, and route reads. */

import { NS, dictionaryFor, formatRow } from '../shared/locales.mjs'

/** Settings route, addressed document-relative. */
const SETTINGS_ROUTE = 'api/dsh-conversation-assist.settings'
/** Suggestion route, addressed document-relative. */
const SUGGEST_ROUTE = 'api/dsh-conversation-assist.suggest'

/**
 * Resolve a document-relative route against the current page.
 * @param route - relative route.
 * @returns absolute URL.
 */
function urlOf(route) {
  return new URL(route, document.baseURI)
}

/**
 * Translate one key with the active language.
 * @param language - active UI language.
 * @param key - dictionary key.
 * @param values - placeholder values.
 * @returns localized text.
 */
export function translate(language, key, values) {
  return formatRow(dictionaryFor(language)[key] ?? key, values)
}

/**
 * Create the shared settings snapshot store.
 * @param options.language - current language getter.
 * @returns a store consumed by the three components.
 */
export function createSettingsStore({ language }) {
  let state = {
    recap: true,
    prediction: false,
    loaded: false,
    error: false,
    pending: { recap: false, prediction: false },
    failed: null,
  }
  const listeners = new Set()
  const emit = () => {
    for (const listener of [...listeners]) listener()
  }
  const set = (next) => {
    state = { ...state, ...next }
    emit()
  }
  const pendingFor = (keys, value) => {
    const pending = { ...state.pending }
    for (const key of keys) pending[key] = value
    return pending
  }
  return {
    /** @returns the current settings value. */
    getSnapshot: () => state,
    /**
     * Subscribe to changes.
     * @param listener - change callback.
     * @returns unsubscribe.
     */
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    /** Load the Host document once. */
    async start() {
      try {
        const response = await fetch(urlOf(SETTINGS_ROUTE), { headers: { accept: 'application/json' } })
        if (!response.ok) throw new Error(`settings ${response.status}`)
        const value = await response.json()
        set({
          recap: typeof value?.recap === 'boolean' ? value.recap : true,
          prediction: typeof value?.prediction === 'boolean' ? value.prediction : false,
          loaded: true,
          error: false,
          failed: null,
        })
      } catch {
        set({ loaded: true, error: true })
      }
    },
    /**
     * Write one preference optimistically, reverting on failure.
     * @param patch - partial settings.
     * @returns whether the Host accepted the write.
     */
    async update(patch) {
      const previous = state
      const keys = Object.keys(patch).filter(key => typeof patch[key] === 'boolean')
      set({ ...patch, failed: null, pending: pendingFor(keys, true) })
      try {
        const response = await fetch(urlOf(SETTINGS_ROUTE), {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(patch),
        })
        if (!response.ok) throw new Error(`settings ${response.status}`)
        const value = await response.json()
        const applied = {}
        for (const key of keys) {
          if (typeof value?.[key] === 'boolean') applied[key] = value[key]
          else applied[key] = previous[key]
        }
        set({
          ...applied,
          loaded: true,
          error: false,
          failed: null,
          pending: pendingFor(keys, false),
        })
        return true
      } catch {
        const reverted = {}
        for (const key of keys) reverted[key] = previous[key]
        set({
          ...reverted,
          error: previous.error,
          failed: keys[0] ?? null,
          pending: pendingFor(keys, false),
        })
        return false
      }
    },
    /** @returns the active language of this store. */
    language,
    /** @returns a bound translator for the components. */
    t() {
      const active = language()
      return (key, values) => translate(active, key, values)
    },
    /** @returns the locale namespace. */
    namespace: NS,
  }
}

/**
 * Per-Session hidden markers: a Turn is consumed by Esc, close, accept, undo,
 * send, or a model switch; switching Session only hides temporarily.
 * @returns hide/check/clear operations.
 */
export function createHiddenTurns() {
  const hidden = new Map()
  return {
    /** @param sessionId - Session. @param turn - Turn. */
    hide(sessionId, turn) {
      hidden.set(sessionId, turn)
    },
    /**
     * @param sessionId - Session.
     * @param turn - candidate Turn.
     * @returns whether this Turn is consumed.
     */
    isHidden(sessionId, turn) {
      return hidden.get(sessionId) === turn
    },
    /** @param sessionId - Session to clear. */
    clear(sessionId) {
      hidden.delete(sessionId)
    },
  }
}

/**
 * Ask the Host for the latest completed Turn's suggestion.
 * @param sessionId - Session identity.
 * @param language - active language.
 * @param signal - caller cancellation.
 * @returns `{state, text, turn}` or a none result.
 */
export async function requestSuggestion(sessionId, language, notBefore, signal) {
  try {
    const response = await fetch(urlOf(SUGGEST_ROUTE), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sessionId, language, ...(typeof notBefore === 'number' ? { notBefore } : {}) }),
      signal,
    })
    if (!response.ok) return { state: 'none' }
    const value = await response.json()
    return typeof value === 'object' && value !== null ? value : { state: 'none' }
  } catch {
    return { state: 'none' }
  }
}
