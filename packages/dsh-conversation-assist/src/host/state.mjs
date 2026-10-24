/** Plugin-owned settings and audit files, with explicit degradation. */

import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { LIMITS } from '../shared/limits.mjs'
import { applySettingsPatch, DEFAULT_SETTINGS, normalizeSettings } from '../shared/settings.mjs'

/**
 * Resolve the Harness home the same way the application does.
 * @param env - process environment.
 * @param home - user home fallback.
 * @returns the absolute Harness home.
 */
export function resolveHome(env = process.env, home = homedir()) {
  const configured = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  return configured === '' ? join(home, '.dsh') : configured
}

/**
 * Resolve this plugin's private paths.
 * @param home - Harness home.
 * @returns settings and audit paths plus their directory.
 */
export function statePaths(home) {
  const dir = join(home, 'dsh-conversation-assist')
  return { dir, settings: join(dir, 'settings.json'), audit: join(dir, 'audit.jsonl') }
}

/**
 * Create the settings/audit store. The in-memory settings remain authoritative
 * until a write succeeds; an unreadable or unwritable document never breaks the
 * plugin, it only loses persistence.
 * @param options - home, logger, clock, and injectable fs for tests.
 * @returns load/save/audit operations.
 */
export function createStateStore({ home = resolveHome(), logger, fs = { appendFile, mkdir, readFile, rename, rm, stat, writeFile } } = {}) {
  const paths = statePaths(home)
  let settings = { ...DEFAULT_SETTINGS }
  let warned = false
  let saveQueue = Promise.resolve()
  const warn = (message, error) => {
    if (warned) return
    warned = true
    try {
      logger?.warn?.(message, error)
    } catch {
      // A logger failure must not affect the plugin.
    }
  }

  return {
    /** Paths owned by the plugin, documented in the README. */
    paths,
    /**
     * Read the settings document once.
     * @returns the accepted settings.
     */
    async load() {
      try {
        settings = normalizeSettings(JSON.parse(await fs.readFile(paths.settings, 'utf8')))
      } catch (error) {
        if (error?.code !== 'ENOENT') warn('dsh-conversation-assist: settings read failed', error)
      }
      return { ...settings }
    },
    /** @returns the current settings snapshot. */
    getSettings() {
      return { ...settings }
    },
    /**
     * Persist one validated patch atomically.
     * @param patch - validated partial settings.
     * @returns the next settings.
     */
    saveSettings(patch) {
      const run = saveQueue.then(async () => {
        const next = applySettingsPatch(settings, patch)
        await fs.mkdir(paths.dir, { recursive: true })
        const temporary = `${paths.settings}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
        await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
        await fs.rename(temporary, paths.settings)
        settings = next
        return { ...settings }
      })
      saveQueue = run.catch(() => {})
      return run
    },
    /**
     * Append one audit row, rotating the file once it reaches the cap.
     * @param record - JSON-serializable summary without message content.
     */
    async appendAudit(record) {
      try {
        await fs.mkdir(paths.dir, { recursive: true })
        let size = 0
        try {
          size = (await fs.stat(paths.audit)).size
        } catch {
          // A missing audit file is the normal first-write case.
        }
        if (size >= LIMITS.auditMaxBytes) {
          await fs.rm(`${paths.audit}.1`, { force: true })
          await fs.rename(paths.audit, `${paths.audit}.1`)
        }
        await fs.appendFile(paths.audit, `${JSON.stringify(record)}\n`, 'utf8')
      } catch (error) {
        warn('dsh-conversation-assist: audit write failed', error)
      }
    },
  }
}
