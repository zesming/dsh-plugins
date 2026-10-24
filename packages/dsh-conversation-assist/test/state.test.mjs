import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  assert.match(paths.debug, /debug\.jsonl$/u)
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
    assert.deepEqual(JSON.parse(await readFile(statePaths(home).settings, 'utf8')), { recap: false, prediction: true })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('settings round-trip through the document and fall back on a bad file', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-state-'))
  try {
    const store = createStateStore({ home })
    assert.deepEqual(await store.load(), { recap: true, prediction: false })
    const saved = await store.saveSettings({ prediction: true })
    assert.deepEqual(saved, { recap: true, prediction: true })
    assert.deepEqual(JSON.parse(await readFile(statePaths(home).settings, 'utf8')), { recap: true, prediction: true })
    const reloaded = createStateStore({ home })
    assert.deepEqual(await reloaded.load(), { recap: true, prediction: true })
    await store.appendAudit({ v: 1, session: 's1' })
    const lines = (await readFile(statePaths(home).audit, 'utf8')).trim().split('\n')
    assert.equal(lines.length, 1)
    assert.equal(JSON.parse(lines[0]).session, 's1')
    await store.appendDebug({ probe: true })
    assert.deepEqual(JSON.parse((await readFile(statePaths(home).debug, 'utf8')).trim()), { probe: true })
    await writeFile(statePaths(home).settings, '{not json', 'utf8')
    const broken = createStateStore({ home })
    assert.deepEqual(await broken.load(), { recap: true, prediction: false })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
