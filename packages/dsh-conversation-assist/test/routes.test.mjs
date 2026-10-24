import assert from 'node:assert/strict'
import test from 'node:test'

import { createDebugHandler, createSettingsHandler, createSuggestHandler, createSuggestValueHandler } from '../src/host/routes.mjs'

const settings = { recap: true, prediction: true }
const post = (body) => new Request('http://host/api/x', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
})

test('settings route reads and writes the shared document', async () => {
  let current = { ...settings }
  const handler = createSettingsHandler({
    getSettings: () => current,
    saveSettings: async (patch) => { current = { ...current, ...patch }; return current },
  })
  const read = await handler(new Request('http://host/api/x'))
  assert.equal(read.status, 200)
  assert.deepEqual(await read.json(), settings)
  const write = await handler(post({ prediction: false }))
  assert.deepEqual(await write.json(), { recap: true, prediction: false })
  assert.equal(current.prediction, false)
})

test('the value handler serves a suggestion without a Request', async () => {
  const reports = []
  const handler = createSuggestValueHandler({
    getSettings: () => ({ prediction: true }),
    getSession: () => ({ id: 's1', header: {} }),
    getTurn: () => ({ turn: 2, endSeq: 8, endTime: 100, reason: { kind: 'completed' } }),
    generate: async () => ({ state: 'ready', text: 'next', turn: 2, endSeq: 8 }),
    onRequest: info => reports.push(info),
  })
  const response = await handler({ action: 'suggest', sessionId: 's1', language: 'zh-CN' })
  assert.deepEqual(await response.json(), { state: 'ready', text: 'next', turn: 2, endSeq: 8 })
  assert.equal(reports[0].tracked.turn, 2)
})

test('debug route dispatches a suggestion action and keeps plain reports', async () => {
  const reports = []
  const handler = createDebugHandler({
    onReport: report => reports.push(report),
    onSuggest: async value => new Response(JSON.stringify({ state: 'none', action: value.action }), { status: 200 }),
  })
  const suggest = await handler(post({ action: 'suggest', sessionId: 's1', language: 'zh-CN' }))
  assert.deepEqual(await suggest.json(), { state: 'none', action: 'suggest' })
  const report = await handler(post({ canAsk: true }))
  assert.deepEqual(await report.json(), { ok: true })
  assert.equal(reports.length, 1)
})

test('settings route dispatches a suggestion action to the suggest handler', async () => {
  const handler = createSettingsHandler({
    getSettings: () => settings,
    saveSettings: async () => settings,
    onSuggest: async (value) => new Response(JSON.stringify({ state: 'none', action: value.action }), { status: 200 }),
  })
  const response = await handler(post({ action: 'suggest', sessionId: 's1', language: 'zh-CN' }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { state: 'none', action: 'suggest' })
})

test('settings route rejects malformed writes and reports storage failures', async () => {
  const handler = createSettingsHandler({
    getSettings: () => settings,
    saveSettings: async () => { throw new Error('disk') },
  })
  assert.equal((await handler(post('{'))).status, 400)
  assert.equal((await handler(post({ prediction: 'yes' }))).status, 400)
  assert.equal((await handler(post({}))).status, 400)
  assert.equal((await handler(post({ prediction: true }))).status, 500)
})

test('both routes reject an oversized body before parsing', async () => {
  const handler = createSettingsHandler({ getSettings: () => settings, saveSettings: async () => settings })
  const response = await handler(new Request('http://host/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '5000' },
    body: '{}',
  }))
  assert.equal(response.status, 413)
})

test('suggest route is disabled when prediction is off', async () => {
  const handler = createSuggestHandler({
    getSettings: () => ({ recap: true, prediction: false }),
    getSession: () => ({}),
    getTurn: () => ({ turn: 1, endSeq: 3, reason: { kind: 'completed' } }),
    generate: async () => { throw new Error('must not run') },
  })
  const response = await handler(post({ sessionId: 's1' }))
  assert.deepEqual(await response.json(), { state: 'disabled' })
})

test('suggest route validates the body and the tracked turn', async () => {
  const handler = createSuggestHandler({
    getSettings: () => settings,
    getSession: () => ({}),
    getTurn: () => undefined,
    generate: async () => ({ state: 'ready', text: 'x', turn: 1, endSeq: 3 }),
  })
  assert.equal((await handler(post({}))).status, 400)
  assert.equal((await handler(post('{'))).status, 400)
  assert.deepEqual(await (await handler(post({ sessionId: 's1' }))).json(), { state: 'none' })
})

test('suggest route refuses a subagent Session', async () => {
  const handler = createSuggestHandler({
    getSettings: () => settings,
    getSession: () => ({ id: 's1', header: { origin: 'subagent' } }),
    getTurn: () => ({ turn: 2, endSeq: 8, endTime: 100, reason: { kind: 'completed' } }),
    generate: async () => { throw new Error('must not run') },
  })
  assert.deepEqual(await (await handler(post({ sessionId: 's1' }))).json(), { state: 'none' })
})

test('suggest route ignores a turn that ended before the client armed prediction', async () => {
  const handler = createSuggestHandler({
    getSettings: () => settings,
    getSession: () => ({ id: 's1' }),
    getTurn: () => ({ turn: 2, endSeq: 8, endTime: 100, reason: { kind: 'completed' } }),
    generate: async () => ({ state: 'ready', text: 'x', turn: 2, endSeq: 8 }),
  })
  const response = await handler(post({ sessionId: 's1', notBefore: 200 }))
  assert.deepEqual(await response.json(), { state: 'none' })
})

test('suggest route returns the generated candidate and tolerates failures', async () => {
  const turn = { turn: 2, endSeq: 8, reason: { kind: 'completed' } }
  const ready = createSuggestHandler({
    getSettings: () => settings,
    getSession: () => ({ id: 's1' }),
    getTurn: () => turn,
    generate: async ({ language }) => ({ state: 'ready', text: language, turn: turn.turn, endSeq: turn.endSeq }),
  })
  const body = await (await ready(post({ sessionId: 's1', language: 'zh-CN' }))).json()
  assert.deepEqual(body, { state: 'ready', text: 'zh-CN', turn: 2, endSeq: 8 })
  const failing = createSuggestHandler({
    getSettings: () => settings,
    getSession: () => ({ id: 's1' }),
    getTurn: () => turn,
    generate: async () => { throw new Error('model') },
  })
  assert.deepEqual(await (await failing(post({ sessionId: 's1' }))).json(), { state: 'none' })
})
