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
  return { dir, settings: join(dir, 'settings.json'), audit: join(dir, 'audit.jsonl'), assistance: join(dir, 'assistance.json') }
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
  let auditQueue = Promise.resolve()
  let assistanceQueue = Promise.resolve()
  const summaries = new Map()
  const persistedSummaries = new Set()
  const attempts = new Map()
  let ledgerReady = true
  const markSummariesPersisted = () => {
    persistedSummaries.clear()
    for (const key of summaries.keys()) persistedSummaries.add(key)
  }
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
    /** Load preferences, persistent recap outcomes, and the current-day ledger. */
    async load() {
      ledgerReady = true
      summaries.clear()
      persistedSummaries.clear()
      attempts.clear()
      try {
        settings = normalizeSettings(JSON.parse(await fs.readFile(paths.settings, 'utf8')))
      } catch (error) {
        if (error?.code !== 'ENOENT') warn('dsh-conversation-assist: settings read failed', error)
      }
      try {
        const saved = JSON.parse(await fs.readFile(paths.assistance, 'utf8'))
        if (saved?.version === 1 && Array.isArray(saved.summaries)) {
          for (const row of saved.summaries.slice(-LIMITS.maxSummaryCache)) {
            if (!validSummary(row)) continue
            const key = summaryKey(row)
            summaries.set(key, row)
            persistedSummaries.add(key)
          }
        }
        if (saved?.version === 1 && Array.isArray(saved.attempts)) {
          const loadedAttempts = new Map()
          for (const row of saved.attempts) {
            if (typeof row?.sessionId !== 'string' || row.sessionId === '' || typeof row.day !== 'string'
              || !/^\d{4}-\d{2}-\d{2}$/u.test(row.day) || !Number.isSafeInteger(row.count)
              || row.count < 0 || row.count > LIMITS.dailyPerSession) {
              ledgerReady = false
              break
            }
            const key = attemptKey(row.sessionId, row.day)
            if (loadedAttempts.has(key)) {
              ledgerReady = false
              break
            }
            loadedAttempts.set(key, { sessionId: row.sessionId, day: row.day, count: row.count })
          }
          if (ledgerReady) for (const [key, row] of loadedAttempts) attempts.set(key, row)
        } else {
          ledgerReady = false
        }
      } catch (error) {
        if (error?.code === 'ENOENT') ledgerReady = true
        else {
          ledgerReady = false
          warn('dsh-conversation-assist: assistance state read failed', error)
        }
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
        await fs.mkdir(paths.dir, { recursive: true, mode: 0o700 })
        const temporary = `${paths.settings}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
        await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
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
    appendAudit(record) {
      // Serialize stat → rotate → append: two Sessions writing across the cap
      // must not delete or rename each other's just-rotated file.
      const run = auditQueue.then(async () => {
        try {
          await fs.mkdir(paths.dir, { recursive: true, mode: 0o700 })
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
          await fs.appendFile(paths.audit, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 })
        } catch (error) {
          warn('dsh-conversation-assist: audit write failed', error)
        }
      })
      auditQueue = run.catch(() => {})
      return run
    },
    /**
     * Reserve a local-day attempt durably before an auxiliary model call.
     * A failed write returns false, so callers must not dispatch the model.
     */
    reserveAttempt(sessionId, day) {
      const run = assistanceQueue.then(async () => {
        if (typeof sessionId !== 'string' || sessionId === '' || typeof day !== 'string' || day === '') return { reserved: false, reason: 'invalid' }
        if (!ledgerReady) return { reserved: false, reason: 'persistence' }
        const key = attemptKey(sessionId, day)
        const previous = attempts.get(key)
        if ((previous?.count ?? 0) >= LIMITS.dailyPerSession) return { reserved: false, reason: 'budget' }
        const nextAttempts = new Map([...attempts].filter(([, row]) => row.day === day))
        nextAttempts.set(key, { sessionId, day, count: (previous?.count ?? 0) + 1 })
        await writeAssistance({ summaries, attempts: nextAttempts })
        markSummariesPersisted()
        attempts.clear()
        for (const [entryKey, row] of nextAttempts) attempts.set(entryKey, row)
        return { reserved: true }
      })
      assistanceQueue = run.catch(() => {})
      return run.catch(() => ({ reserved: false, reason: 'persistence' }))
    },
    /** Save a generated recap or source-bound intentional omission, without transcript content. */
    saveSummary(value) {
      const run = assistanceQueue.then(async () => {
        if (!validSummary(value)) return false
        const row = {
          sessionId: value.sessionId,
          turn: value.turn,
          endSeq: value.endSeq,
          replyHash: value.replyHash,
          promptVersion: value.promptVersion,
          generation: value.generation,
          ...(value.omitted === true ? { omitted: true } : { recap: value.recap }),
        }
        const key = summaryKey(row)
        summaries.set(key, row)
        persistedSummaries.delete(key)
        while (summaries.size > LIMITS.maxSummaryCache) {
          const oldest = summaries.keys().next().value
          summaries.delete(oldest)
          persistedSummaries.delete(oldest)
        }
        if (!ledgerReady) return false
        await writeAssistance({ summaries, attempts })
        markSummariesPersisted()
        return true
      })
      assistanceQueue = run.catch(() => {})
      return run.catch(() => false)
    },
    /** Read a persisted recap outcome only when its full visible reply identity matches. */
    getSummary({ sessionId, turn, endSeq, replyHash, promptVersion }) {
      const rows = [...summaries.values()]
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index]
        if (row.sessionId === sessionId && row.turn === turn && row.endSeq === endSeq
          && row.replyHash === replyHash && row.promptVersion === promptVersion) {
          return { ...row, persisted: persistedSummaries.has(summaryKey(row)) }
        }
      }
      return undefined
    },
    /** Read one ledger count, primarily for diagnostics and focused tests. */
    attemptCount(sessionId, day) {
      return attempts.get(attemptKey(sessionId, day))?.count ?? 0
    },
  }

  async function writeAssistance({ summaries: summaryMap, attempts: attemptMap }) {
    await fs.mkdir(paths.dir, { recursive: true, mode: 0o700 })
    const document = {
      version: 1,
      summaries: [...summaryMap.values()].slice(-LIMITS.maxSummaryCache),
      attempts: [...attemptMap.values()],
    }
    const temporary = `${paths.assistance}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
    try {
      await fs.writeFile(temporary, `${JSON.stringify(document)}\n`, { encoding: 'utf8', mode: 0o600 })
      await fs.rename(temporary, paths.assistance)
    } catch (error) {
      try { await fs.rm(temporary, { force: true }) } catch { /* preserve the original persistence error */ }
      throw error
    }
  }
}

function attemptKey(sessionId, day) {
  return JSON.stringify([sessionId, day])
}

function summaryKey(row) {
  return JSON.stringify([row.sessionId, row.turn, row.endSeq, row.replyHash, row.promptVersion, row.generation])
}

function validSummary(row) {
  return typeof row?.sessionId === 'string' && row.sessionId !== ''
    && Number.isSafeInteger(row.turn) && row.turn >= 0
    && Number.isSafeInteger(row.endSeq) && row.endSeq >= 0
    && typeof row.replyHash === 'string' && /^[a-f0-9]{16}$/iu.test(row.replyHash)
    && Number.isSafeInteger(row.promptVersion) && Number.isSafeInteger(row.generation)
    && (row.omitted === true
      ? row.recap === undefined
      : typeof row.recap === 'string' && [...row.recap].length > 0 && [...row.recap].length <= LIMITS.maxRecapChars)
}
