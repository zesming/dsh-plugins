/**
 * Persisted preferences for recap display and next-prompt suggestions.
 *
 * The Host owns one settings document per DSH home, so the choice is shared by
 * every browser that talks to that Host. Unknown and malformed fields fall back
 * to the defaults instead of failing the whole document.
 */

/** Recap display is enabled; suggestions remain opt-in. */
export const DEFAULT_SETTINGS = Object.freeze({ recap: true, prediction: false })

/** Accepted preference keys, in display order. */
export const SETTINGS_KEYS = Object.freeze(['recap', 'prediction'])

/**
 * Coerce a stored document into a complete settings value.
 * @param value - parsed JSON or anything else.
 * @returns a fresh settings object with booleans for every key.
 */
export function normalizeSettings(value) {
  const settings = { ...DEFAULT_SETTINGS }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return settings
  for (const key of SETTINGS_KEYS) {
    if (typeof value[key] === 'boolean') settings[key] = value[key]
  }
  return settings
}

/**
 * Validate one settings write from the browser.
 * @param value - parsed request body.
 * @returns a partial settings object, or null for a malformed write.
 */
export function parseSettingsPatch(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const patch = {}
  for (const key of SETTINGS_KEYS) {
    if (!Object.hasOwn(value, key)) continue
    if (typeof value[key] !== 'boolean') return null
    patch[key] = value[key]
  }
  return Object.keys(patch).length === 0 ? null : patch
}

/**
 * Apply a validated patch.
 * @param settings - current complete settings.
 * @param patch - validated partial settings.
 * @returns the next complete settings.
 */
export function applySettingsPatch(settings, patch) {
  return normalizeSettings({ ...settings, ...patch })
}
