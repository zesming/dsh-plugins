import { appendFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'

import { createStateStore, resolveHome, statePaths } from '../src/host/state.mjs'

test('home resolution prefers an explicit DSH_HOME', () => {
  assert.equal(resolveHome({ DSH_HOME: '/tmp/harness' }, '/home/u'), '/tmp/harness')
  assert.equal(resolveHome({}, '/home/u'), '/home/u/.dsh')
})

test('state paths live under the package directory', () => {
  const paths = statePaths('/tmp/harness')
  assert.equal(paths.dir, '/tmp/harness/dsh-conversation-assist')
  assert.match(paths.settings, /settings\.json$/u)
  assert.match(paths.audit, /audit\.jsonl$/u)
  assert.match(paths.assistance, /assistance\.json$/u)
})

test('concurrent saves serialize instead of overwriting each other', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-state-'))
  try {
    const store = createStateStore({ home })
    await store.load()
    await Promise.all([
      store.saveSettings({ recap: false }),
      store.saveSettings({ prediction: true }),
    ])
    assert.deepEqual(JSON.parse(await readFile(statePaths(home).settings, 'utf8')), { recap: false, semanticRecap: true, prediction: true })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('settings round-trip through the document and fall back on a bad file', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-state-'))
  try {
    const store = createStateStore({ home })
    assert.deepEqual(await store.load(), { recap: true, semanticRecap: true, prediction: false })
    const saved = await store.saveSettings({ prediction: true })
    assert.deepEqual(saved, { recap: true, semanticRecap: true, prediction: true })
    assert.deepEqual(JSON.parse(await readFile(statePaths(home).settings, 'utf8')), { recap: true, semanticRecap: true, prediction: true })
    const reloaded = createStateStore({ home })
    assert.deepEqual(await reloaded.load(), { recap: true, semanticRecap: true, prediction: true })
    await store.appendAudit({ v: 1, session: 's1' })
    const lines = (await readFile(statePaths(home).audit, 'utf8')).trim().split('\n')
    assert.equal(lines.length, 1)
    assert.equal(JSON.parse(lines[0]).session, 's1')
    await writeFile(statePaths(home).settings, '{not json', 'utf8')
    const broken = createStateStore({ home })
    assert.deepEqual(await broken.load(), { recap: true, semanticRecap: true, prediction: false })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('attempt reservations and summary-only cache survive a Host restart and bind the full reply hash', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-ledger-'))
  const day = '2026-10-25'
  const recap = { sessionId: 's1', turn: 3, endSeq: 9, replyHash: '1234567890abcdef', promptVersion: 6, generation: 4, recap: '完成按钮修复；深色模式尚未验证。' }
  try {
    const store = createStateStore({ home })
    await store.load()
    for (let count = 0; count < 50; count += 1) {
      assert.deepEqual(await store.reserveAttempt('s1', day), { reserved: true })
    }
    assert.deepEqual(await store.reserveAttempt('s1', day), { reserved: false, reason: 'budget' })
    assert.equal(await store.saveSummary(recap), true)
    const persisted = JSON.parse(await readFile(statePaths(home).assistance, 'utf8'))
    assert.equal(persisted.summaries.length, 1)
    assert.equal('suggestion' in persisted.summaries[0], false)
    assert.equal('userMessages' in persisted.summaries[0], false)

    const restarted = createStateStore({ home })
    await restarted.load()
    assert.equal(restarted.attemptCount('s1', day), 50)
    assert.deepEqual(await restarted.reserveAttempt('s1', day), { reserved: false, reason: 'budget' })
    assert.equal(restarted.getSummary({ ...recap, replyHash: 'ffffffffffffffff' }), undefined)
    assert.equal(restarted.getSummary(recap).recap, recap.recap)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('an unreadable assistance ledger fails closed and is not overwritten by recap persistence', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-ledger-bad-'))
  try {
    const paths = statePaths(home)
    await mkdir(paths.dir, { recursive: true })
    await writeFile(paths.assistance, '{truncated', 'utf8')
    const store = createStateStore({ home })
    await store.load()
    assert.deepEqual(await store.reserveAttempt('s1', '2026-10-25'), { reserved: false, reason: 'persistence' })
    assert.equal(await store.saveSummary({
      sessionId: 's1', turn: 1, endSeq: 2, replyHash: '1234567890abcdef', promptVersion: 6, generation: 1, recap: 'summary',
    }), false)
    assert.equal(await readFile(paths.assistance, 'utf8'), '{truncated')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('persistent recap cache loads only its newest 200 summary identities', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-cache-cap-'))
  try {
    const paths = statePaths(home)
    await mkdir(paths.dir, { recursive: true })
    const summaries = Array.from({ length: 205 }, (_, index) => ({
      sessionId: `s${index}`,
      turn: 1,
      endSeq: 2,
      replyHash: index.toString(16).padStart(16, '0'),
      promptVersion: 6,
      generation: 1,
      recap: `summary ${index}`,
    }))
    await writeFile(paths.assistance, JSON.stringify({ version: 1, summaries, attempts: [] }), 'utf8')
    const store = createStateStore({ home })
    await store.load()
    assert.equal(store.getSummary(summaries[0]), undefined)
    assert.equal(store.getSummary(summaries.at(-1)).recap, 'summary 204')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('writing the 201st summary evicts the oldest entry from memory and disk', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-cache-write-cap-'))
  try {
    const store = createStateStore({ home })
    await store.load()
    const summaries = Array.from({ length: 201 }, (_, index) => ({
      sessionId: 's1',
      turn: index,
      endSeq: index + 1,
      replyHash: index.toString(16).padStart(16, '0'),
      promptVersion: 6,
      generation: 1,
      recap: `summary ${index}`,
    }))
    for (const summary of summaries) assert.equal(await store.saveSummary(summary), true)

    assert.equal(store.getSummary(summaries[0]), undefined)
    assert.equal(store.getSummary(summaries.at(-1)).recap, 'summary 200')
    const persisted = JSON.parse(await readFile(statePaths(home).assistance, 'utf8'))
    assert.equal(persisted.summaries.length, 200)
    assert.equal(persisted.summaries[0].turn, 1)
    assert.equal(persisted.summaries.at(-1).turn, 200)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a failed summary save stays memory-only and a later durable write persists it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-cache-recover-'))
  const paths = statePaths(home)
  let failAssistanceWrites = false
  const fs = {
    appendFile,
    mkdir,
    readFile,
    rename,
    rm,
    stat,
    writeFile(path, ...args) {
      if (failAssistanceWrites && path.startsWith(paths.assistance)) return Promise.reject(new Error('disk unavailable'))
      return writeFile(path, ...args)
    },
  }
  const summary = {
    sessionId: 's1', turn: 1, endSeq: 2, replyHash: '1234567890abcdef',
    promptVersion: 6, generation: 1, recap: 'memory-only summary',
  }
  try {
    const store = createStateStore({ home, fs })
    await store.load()
    assert.deepEqual(await store.reserveAttempt('s1', '2026-10-25'), { reserved: true })
    assert.equal(store.attemptCount('s1', '2026-10-25'), 1)
    failAssistanceWrites = true
    assert.equal(await store.saveSummary(summary), false)
    assert.deepEqual(store.getSummary(summary), { ...summary, persisted: false })

    failAssistanceWrites = false
    assert.deepEqual(await store.reserveAttempt('s1', '2026-10-25'), { reserved: true })
    assert.deepEqual(store.getSummary(summary), { ...summary, persisted: true })
    const persisted = JSON.parse(await readFile(paths.assistance, 'utf8'))
    assert.deepEqual(persisted.summaries, [summary])
    assert.equal(persisted.attempts[0].count, 2)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
