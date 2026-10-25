import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createRecapHandler, createRecapValueHandler, createSettingsHandler, createSuggestHandler } from '../src/host/routes.mjs'
import { PROMPT_VERSION } from '../src/host/predict.mjs'
import { apply, RECAP_PATH, SETTINGS_PATH, SUGGEST_PATH } from '../src/index.js'
import { replyFingerprint } from '../src/shared/identity.mjs'

const settingsOn = { recap: true, semanticRecap: true, prediction: true }
const identity = { sessionId: 's1', turn: 2, endSeq: 8 }
const route = { provider: 'p', model: 'm', reasoningEffort: 'high' }
const session = { id: 's1', header: {}, surface: { contentGeneration: 4 } }
const liveTurn = {
  ...identity,
  generation: 11,
  surfaceGeneration: 4,
  sourceSelection: route,
  finalText: 'Complete reply text.',
  reason: { kind: 'completed' },
}
const replyHash = replyFingerprint(liveTurn.finalText)
const post = body => new Request('http://host/api/x', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
})

test('settings route reads and persists the independent feature settings', async () => {
  let current = { ...settingsOn }
  const handler = createSettingsHandler({
    getSettings: () => current,
    saveSettings: async patch => { current = { ...current, ...patch }; return current },
  })
  assert.deepEqual(await (await handler(new Request('http://host/api/x'))).json(), settingsOn)
  const write = await handler(post({ semanticRecap: false, prediction: false }))
  assert.deepEqual(await write.json(), { recap: true, semanticRecap: false, prediction: false })
  assert.equal(current.prediction, false)
})

test('suggest route requires the exact completed latest Turn and returns the main source selection', async () => {
  const handler = createSuggestHandler({
    getSettings: () => settingsOn,
    getSession: () => session,
    getTurn: () => liveTurn,
    getResult: async value => {
      assert.deepEqual(value, { ...identity, generation: liveTurn.generation })
      return { state: 'ready', suggestion: '继续检查键盘焦点顺序。' }
    },
  })
  const response = await handler(post(identity))
  assert.deepEqual(await response.json(), {
    state: 'ready', ...identity, text: '继续检查键盘焦点顺序。', route,
  })
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('suggest route rechecks Turn, Session instance, and source route after getResult has started', async () => {
  const mutations = [
    ['Turn', state => { state.turn = { ...liveTurn, turn: 3, endSeq: 12, generation: 12 } }],
    ['Session instance', state => { state.session = { ...session } }],
    ['source route', state => { state.turn = { ...liveTurn, sourceSelection: { ...route, model: 'replacement' } } }],
  ]
  for (const [label, mutate] of mutations) {
    const state = { turn: liveTurn, session }
    let release
    let markEntered
    let getResultCalls = 0
    const entered = new Promise(resolve => { markEntered = resolve })
    const pending = new Promise(resolve => { release = resolve })
    const handler = createSuggestHandler({
      getSettings: () => settingsOn,
      getSession: () => state.session,
      getTurn: () => state.turn,
      getResult: () => { getResultCalls += 1; markEntered(); return pending },
    })
    const responsePromise = handler(post(identity))
    await entered
    assert.equal(getResultCalls, 1, `${label}: request reached the existing result barrier`)
    mutate(state)
    release({ state: 'ready', suggestion: 'obsolete suggestion' })
    assert.deepEqual(await (await responsePromise).json(), { state: 'none', reason: 'historical' }, label)
  }
})

test('suggest route never starts work and rejects invalid, disabled, stale, and subagent requests', async () => {
  let attempts = 0
  const make = ({ settings = settingsOn, currentSession = session, currentTurn = liveTurn } = {}) => createSuggestHandler({
    getSettings: () => settings,
    getSession: () => currentSession,
    getTurn: () => currentTurn,
    getResult: async () => { attempts += 1; return { state: 'none' } },
  })
  assert.deepEqual(await (await make({ settings: { ...settingsOn, prediction: false } })(post(identity))).json(), { state: 'disabled' })
  assert.deepEqual(await (await make({ currentTurn: { ...liveTurn, turn: 1 } })(post(identity))).json(), { state: 'none', reason: 'historical' })
  assert.deepEqual(await (await make({ currentSession: { id: 's1', header: { origin: 'subagent' } } })(post(identity))).json(), { state: 'none' })
  assert.equal((await make()(post({ ...identity, endSeq: -1 }))).status, 400)
  assert.equal(attempts, 0)
})

test('recap route reads a cached summary for a historical Turn without requiring a live Session', async () => {
  const handler = createRecapHandler({
    getSettings: () => settingsOn,
    getSession: () => undefined,
    getTurn: () => undefined,
    getResult: async () => { throw new Error('history must not generate') },
    getSummary: value => {
      assert.deepEqual(value, { ...identity, replyHash, promptVersion: PROMPT_VERSION })
      return { recap: '历史摘要。', generation: 4, persisted: true }
    },
    promptVersion: PROMPT_VERSION,
  })
  assert.deepEqual(await (await handler(post({ ...identity, replyHash }))).json(), {
    ...identity, replyHash, state: 'ready', recap: '历史摘要。', persisted: true,
  })
})

test('recap route only waits for the current shared attempt and checks the content hash', async () => {
  let modelCalls = 0
  let cached
  const handler = createRecapValueHandler({
    getSettings: () => settingsOn,
    getSession: () => session,
    getTurn: () => liveTurn,
    getResult: async value => {
      modelCalls += 1
      assert.deepEqual(value, { ...identity, replyHash, generation: liveTurn.generation })
      return { state: 'ready', replyHash, recap: '当前轮摘要。', persisted: false }
    },
    getSummary: () => cached,
    promptVersion: PROMPT_VERSION,
  })
  assert.deepEqual(await (await handler({ ...identity, replyHash })).json(), {
    ...identity, replyHash, state: 'ready', recap: '当前轮摘要。', persisted: false,
  })
  assert.equal(modelCalls, 1)
  cached = { recap: '当前轮摘要。', generation: 4, persisted: false }
  assert.deepEqual(await (await handler({ ...identity, replyHash })).json(), {
    ...identity, replyHash, state: 'ready', recap: '当前轮摘要。', persisted: false,
  })
  assert.equal(modelCalls, 1)
  const wrongHash = await handler({ ...identity, replyHash: 'ffffffffffffffff' })
  assert.deepEqual(await wrongHash.json(), { state: 'none', reason: 'historical' })
  assert.equal(modelCalls, 1)
})

test('recap route reports intentional null as not-needed and invalid recap as unavailable', async () => {
  const make = recapReason => createRecapValueHandler({
    getSettings: () => settingsOn,
    getSession: () => session,
    getTurn: () => liveTurn,
    getResult: async () => ({ state: 'ready', replyHash, recap: null, recapReason, suggestion: 'valid independent suggestion' }),
    getSummary: () => undefined,
    promptVersion: PROMPT_VERSION,
  })
  assert.deepEqual(await (await make('not-needed')({ ...identity, replyHash })).json(), { state: 'none', reason: 'not-needed' })
  assert.deepEqual(await (await make('unavailable')({ ...identity, replyHash })).json(), { state: 'none', reason: 'unavailable' })
})

test('a null recap does not suppress the independent suggestion route', async () => {
  const result = {
    state: 'ready', replyHash, recap: null, recapReason: 'not-needed',
    suggestion: 'Continue checking the remaining item.', suggestionReason: null,
  }
  const recap = createRecapValueHandler({
    getSettings: () => settingsOn, getSession: () => session, getTurn: () => liveTurn,
    getResult: async () => result, getSummary: () => undefined, promptVersion: PROMPT_VERSION,
  })
  const suggest = createSuggestHandler({
    getSettings: () => settingsOn, getSession: () => session, getTurn: () => liveTurn,
    getResult: async () => result,
  })
  assert.deepEqual(await (await recap({ ...identity, replyHash })).json(), { state: 'none', reason: 'not-needed' })
  assert.deepEqual(await (await suggest(post(identity))).json(), {
    state: 'ready', ...identity, text: 'Continue checking the remaining item.', route,
  })
})

test('recap route rejects cache after surface replacement and rechecks settings after await', async () => {
  const stale = createRecapValueHandler({
    getSettings: () => settingsOn,
    getSession: () => session,
    getTurn: () => ({ ...liveTurn, surfaceGeneration: 5 }),
    getResult: async () => { throw new Error('must not await') },
    getSummary: () => ({ recap: 'old generation', generation: 4 }),
    promptVersion: PROMPT_VERSION,
  })
  assert.deepEqual(await (await stale({ ...identity, replyHash })).json(), { state: 'none', reason: 'historical' })

  let current = { ...settingsOn }
  let release
  const pending = new Promise(resolve => { release = resolve })
  const handler = createRecapValueHandler({
    getSettings: () => current,
    getSession: () => session,
    getTurn: () => liveTurn,
    getResult: () => pending,
    getSummary: () => undefined,
    promptVersion: PROMPT_VERSION,
  })
  const response = handler({ ...identity, replyHash })
  current = { ...settingsOn, recap: false }
  release({ state: 'ready', replyHash, recap: 'late summary' })
  assert.deepEqual(await (await response).json(), { state: 'none', reason: 'disabled' })
})

test('settings and assistance routes validate methods and bounded request bodies', async () => {
  const settings = createSettingsHandler({ getSettings: () => settingsOn, saveSettings: async () => settingsOn })
  assert.equal((await settings(new Request('http://host/api/x', { method: 'DELETE' }))).status, 405)
  assert.equal((await settings(post('{'))).status, 400)
  assert.equal((await settings(post({ prediction: 'yes' }))).status, 400)

  const routeHandler = createSuggestHandler({ getSettings: () => settingsOn, getSession: () => session, getTurn: () => liveTurn, getResult: async () => ({ state: 'none' }) })
  assert.equal((await routeHandler(new Request('http://host/api/x'))).status, 405)
  const oversized = await routeHandler(new Request('http://host/api/x', {
    method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '5000' }, body: '{}',
  }))
  assert.equal(oversized.status, 413)
  const recapHandler = createRecapHandler({ getSettings: () => settingsOn, getSession: () => undefined, getTurn: () => undefined, getResult: async () => undefined, getSummary: () => undefined, promptVersion: PROMPT_VERSION })
  assert.equal((await recapHandler(post(identity))).status, 400)
})

test('a real system-only replacement preserves both routes until a non-head compaction replaces the reply', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-routes-'))
  const routes = new Map()
  const listeners = new Map()
  const cleanups = []
  const messageText = '最终答复说明修复已完成。\n\n验证结果全部通过。\n\n发布仍待用户确认。'
  const session = {
    id: 'session-live',
    header: {},
    surface: { contentGeneration: 17 },
    requestHeader: () => undefined,
  }
  const llmCalls = { prepare: 0, stream: 0, options: undefined }
  const llm = {
    async prepareCall(config, _signal, configure) {
      llmCalls.prepare += 1
      const controls = configure({ maxTokens: config.maxTokens }, { reasoning: { efforts: [{ id: 'low' }] } })
      const prepared = { ...config, ...controls }
      return {
        config: prepared,
        stream: async function* (options) {
          llmCalls.stream += 1
          llmCalls.options = options
          yield { type: 'text-delta', text: JSON.stringify({ recap: '已完成并验证，仍有一项待确认。', suggestion: '继续检查剩余项目。' }) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
  const scope = {
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
    },
    effect(effect) { cleanups.push(effect()) },
  }
  const ctx = {
    logger: undefined,
    get(name) {
      if (name === 'dshHomePath') return () => home
      if (name === 'llm') return llm
      if (name === 'sessions') return { get: id => id === session.id ? session : undefined }
      if (name === 'sessionProjections') return { snapshot: () => ({ values: { modelSelection: { next: route } } }) }
      return undefined
    },
    effect(effect) { cleanups.push(effect()) },
    on(name, listener) { listeners.set(name, listener) },
    inject(_dependencies, callback) { callback(scope) },
  }
  const route = { provider: 'p', model: 'm', reasoningEffort: 'high' }

  try {
    apply(ctx)
    await routes.get(SETTINGS_PATH).fetch(new Request('http://host/settings'))
    await routes.get(SETTINGS_PATH).fetch(post({ prediction: true }))
    const observe = listeners.get('session/event')
    observe(session, { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } })
    observe(session, {
      type: 'system/message', seq: 2, time: 2, surfaceOp: 'append',
      data: { turn: 1, step: 0, message: { id: 'system-original', role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'Original system prompt' }] } },
    })
    session.surface.contentGeneration = 18
    observe(session, {
      type: 'system/message', seq: 3, time: 3,
      surfaceOp: { op: 'replace', startSeq: 2, endSeq: 2 },
      sourceEventSeqs: [2],
      data: { turn: 1, step: 1, message: { id: 'system-normalized', role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'Normalized system prompt' }] } },
    })
    observe(session, { type: 'user/message', seq: 4, time: 4, surfaceOp: 'append', data: { id: 'user-4', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '完成后检查剩余项目。' }] } })
    observe(session, { type: 'assistant/message', seq: 5, time: 5, surfaceOp: 'append', data: { turn: 1, message: { id: 'assistant-5', role: 'assistant', source: { kind: 'model' }, content: [
      { type: 'text', text: '最终答复说明修复已完成。' }, { type: 'text', text: '验证结果全部通过。' }, { type: 'text', text: '发布仍待用户确认。' },
    ] } } })
    observe(session, { type: 'turn/end', seq: 6, time: 6, data: { turn: 1, reason: { kind: 'completed' } } })
    const requestIdentity = { sessionId: session.id, turn: 1, endSeq: 6 }
    const [suggestion, recap] = await Promise.all([
      routes.get(SUGGEST_PATH).fetch(post(requestIdentity)),
      routes.get(RECAP_PATH).fetch(post({ ...requestIdentity, replyHash: replyFingerprint(messageText) })),
    ])
    assert.deepEqual(await suggestion.json(), { state: 'ready', ...requestIdentity, text: '继续检查剩余项目。', route })
    assert.deepEqual(await recap.json(), { ...requestIdentity, replyHash: replyFingerprint(messageText), state: 'ready', recap: '已完成并验证，仍有一项待确认。', persisted: true })
    assert.equal(llmCalls.prepare, 1)
    assert.equal(llmCalls.stream, 1)
    assert.deepEqual(llmCalls.options.tools, [])
    assert.equal(llmCalls.options.messages[0].content[0].type, 'text')

    const compactionId = '00000000-0000-4000-8000-000000000001'
    observe(session, { type: 'compaction/start', seq: 7, time: 7, data: { compactionId, turn: null } })
    observe(session, {
      type: 'compaction/summary', seq: 8, time: 8,
      data: {
        compactionId,
        summary: [{ type: 'text', text: 'The change is complete and its validation passed; confirmation remains pending.' }],
        shadowedRange: { start: 4, end: 5 },
        shadowedSeqs: [4, 5],
        shadowedTokenCount: 24,
        provider: 'p',
        model: 'm',
      },
    })
    session.surface.contentGeneration = 19
    observe(session, {
      type: 'user/message', seq: 9, time: 9,
      surfaceOp: { op: 'replace', startSeq: 4, endSeq: 5 },
      sourceEventSeqs: [4, 5],
      data: { id: 'compact-checkpoint-9', role: 'user', source: { kind: 'compact-checkpoint', compactionId }, content: [{ type: 'text', text: 'The change is complete and its validation passed; confirmation remains pending.' }] },
    })
    observe(session, { type: 'compaction/end', seq: 10, time: 10, data: { compactionId, turn: null } })
    assert.deepEqual(await (await routes.get(SUGGEST_PATH).fetch(post(requestIdentity))).json(), { state: 'none', reason: 'historical' })
    assert.deepEqual(await (await routes.get(RECAP_PATH).fetch(post({ ...requestIdentity, replyHash: replyFingerprint(messageText) }))).json(), { state: 'none', reason: 'historical' })
  } finally {
    for (const cleanup of cleanups) cleanup?.()
    await rm(home, { recursive: true, force: true })
  }
})

test('short replies skip recap generation; three sentences and list replies reach the model', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-brief-recap-'))
  const routes = new Map()
  const listeners = new Map()
  const cleanups = []
  const sessions = new Map([
    ['brief', { id: 'brief', header: {}, surface: { contentGeneration: 1 } }],
    ['three', { id: 'three', header: {}, surface: { contentGeneration: 1 } }],
    ['list', { id: 'list', header: {}, surface: { contentGeneration: 1 } }],
  ])
  const calls = []
  const sourceRoute = { provider: 'p', model: 'm' }
  const llm = {
    async prepareCall(config, _signal, configure) {
      const controls = configure({ maxTokens: config.maxTokens }, { reasoning: { efforts: [{ id: 'low' }] } })
      return {
        config: { ...config, ...controls },
        stream: async function* (options) {
          calls.push(options)
          yield { type: 'text-delta', text: JSON.stringify({ recap: null, suggestion: null }) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
  const scope = { connection: { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } }, effect(effect) { cleanups.push(effect()) } }
  const ctx = {
    get(name) {
      if (name === 'dshHomePath') return () => home
      if (name === 'llm') return llm
      if (name === 'sessions') return { get: id => sessions.get(id) }
      if (name === 'sessionProjections') return { snapshot: () => ({ values: { modelSelection: { next: sourceRoute } } }) }
      return undefined
    },
    effect(effect) { cleanups.push(effect()) },
    on(name, listener) { listeners.set(name, listener) },
    inject(_dependencies, callback) { callback(scope) },
  }
  const observe = (sessionId, event) => listeners.get('session/event')(sessions.get(sessionId), event)
  const completeTurn = async (sessionId, text, baseSeq) => {
    observe(sessionId, { type: 'turn/start', seq: baseSeq, time: baseSeq, data: { turn: 1 } })
    observe(sessionId, { type: 'user/message', seq: baseSeq + 1, time: baseSeq + 1, surfaceOp: 'append', data: { id: `user-${sessionId}`, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Please review the completed work.' }] } })
    observe(sessionId, { type: 'assistant/message', seq: baseSeq + 2, time: baseSeq + 2, surfaceOp: 'append', data: { turn: 1, message: { id: `assistant-${sessionId}`, role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text }] } } })
    observe(sessionId, { type: 'turn/end', seq: baseSeq + 3, time: baseSeq + 3, data: { turn: 1, reason: { kind: 'completed' } } })
    const request = { sessionId, turn: 1, endSeq: baseSeq + 3, replyHash: replyFingerprint(text) }
    return (await routes.get(RECAP_PATH).fetch(post(request))).json()
  }

  try {
    apply(ctx)
    await routes.get(SETTINGS_PATH).fetch(new Request('http://host/settings'))
    assert.deepEqual(await completeTurn('brief', 'Done.', 1), { state: 'none', reason: 'not-needed' })
    assert.equal(calls.length, 0)

    assert.deepEqual(await completeTurn('three', 'The change is complete. Validation passed. One item remains.', 10), { state: 'none', reason: 'not-needed' })
    assert.equal(calls.length, 1)
    assert.match(calls[0].system, /Enabled outputs: recap=true; suggestion=false/u)

    assert.deepEqual(await completeTurn('list', '- Check the first result.\n- Check the second result.', 20), { state: 'none', reason: 'not-needed' })
    assert.equal(calls.length, 2)
  } finally {
    for (const cleanup of cleanups) cleanup?.()
    await rm(home, { recursive: true, force: true })
  }
})

test('prediction off clears completed suggestions and an off/on epoch suppresses in-flight suggestions', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-prediction-epoch-'))
  const routes = new Map()
  const listeners = new Map()
  const cleanups = []
  const session = { id: 'epoch-session', header: {}, surface: { contentGeneration: 7 } }
  let callCount = 0
  let markSecondStarted
  let releaseSecond
  let markThirdStarted
  let releaseThird
  let thirdSignal
  const secondStarted = new Promise(resolve => { markSecondStarted = resolve })
  const secondRelease = new Promise(resolve => { releaseSecond = resolve })
  const thirdStarted = new Promise(resolve => { markThirdStarted = resolve })
  const thirdRelease = new Promise(resolve => { releaseThird = resolve })
  const llm = {
    async prepareCall(config, _signal, configure) {
      callCount += 1
      const controls = configure({ maxTokens: config.maxTokens }, { reasoning: { efforts: [{ id: 'low' }] } })
      return {
        config: { ...config, ...controls },
        stream: async function* (options) {
          if (callCount === 2) {
            markSecondStarted()
            await secondRelease
          }
          if (callCount === 3) {
            thirdSignal = options.signal
            markThirdStarted()
            await thirdRelease
          }
          yield { type: 'text-delta', text: JSON.stringify({ recap: '这一轮有摘要。', suggestion: '继续核对待办。' }) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
  const route = { provider: 'p', model: 'm' }
  const scope = { connection: { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } }, effect(effect) { cleanups.push(effect()) } }
  const ctx = {
    get(name) {
      if (name === 'dshHomePath') return () => home
      if (name === 'llm') return llm
      if (name === 'sessions') return { get: id => id === session.id ? session : undefined }
      if (name === 'sessionProjections') return { snapshot: () => ({ values: { modelSelection: { next: route } } }) }
      return undefined
    },
    effect(effect) { cleanups.push(effect()) },
    on(name, listener) { listeners.set(name, listener) },
    inject(_dependencies, callback) { callback(scope) },
  }
  const observe = (...args) => listeners.get('session/event')(...args)
  const endTurn = (turn, baseSeq) => {
    observe(session, { type: 'turn/start', seq: baseSeq, data: { turn } })
    const reply = `Turn ${turn} finished the change. Validation passed for this route. One follow-up remains.`
    observe(session, { type: 'user/message', seq: baseSeq + 1, surfaceOp: 'append', data: { id: `user-${turn}`, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: `intent ${turn}` }] } })
    observe(session, { type: 'assistant/message', seq: baseSeq + 2, surfaceOp: 'append', data: { turn, message: { id: `assistant-${turn}`, role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: reply }] } } })
    observe(session, { type: 'turn/end', seq: baseSeq + 3, data: { turn, reason: { kind: 'completed' } } })
    return { sessionId: session.id, turn, endSeq: baseSeq + 3, replyHash: replyFingerprint(reply) }
  }

  try {
    apply(ctx)
    await routes.get(SETTINGS_PATH).fetch(new Request('http://host/settings'))
    await routes.get(SETTINGS_PATH).fetch(post({ prediction: true }))
    const first = endTurn(1, 1)
    const firstRecap = await routes.get(RECAP_PATH).fetch(post(first))
    assert.deepEqual(await firstRecap.json(), { ...first, state: 'ready', recap: '这一轮有摘要。', persisted: true })
    assert.deepEqual(await (await routes.get(SUGGEST_PATH).fetch(post({ sessionId: first.sessionId, turn: first.turn, endSeq: first.endSeq }))).json(), {
      state: 'ready', sessionId: first.sessionId, turn: first.turn, endSeq: first.endSeq, text: '继续核对待办。', route,
    })

    await routes.get(SETTINGS_PATH).fetch(post({ prediction: false }))
    await routes.get(SETTINGS_PATH).fetch(post({ prediction: true }))
    assert.deepEqual(await (await routes.get(SUGGEST_PATH).fetch(post({ sessionId: first.sessionId, turn: first.turn, endSeq: first.endSeq }))).json(), {
      state: 'none', reason: 'unavailable',
    })

    const second = endTurn(2, 10)
    const secondSuggestion = routes.get(SUGGEST_PATH).fetch(post({ sessionId: second.sessionId, turn: second.turn, endSeq: second.endSeq }))
    await secondStarted
    await routes.get(SETTINGS_PATH).fetch(post({ prediction: false }))
    await routes.get(SETTINGS_PATH).fetch(post({ prediction: true }))
    releaseSecond()
    assert.deepEqual(await (await secondSuggestion).json(), { state: 'none', reason: 'unavailable' })
    assert.equal(callCount, 2)
    assert.deepEqual(await (await routes.get(RECAP_PATH).fetch(post(second))).json(), {
      ...second, state: 'ready', recap: '这一轮有摘要。', persisted: true,
    })

    const third = endTurn(3, 20)
    const thirdSuggestion = routes.get(SUGGEST_PATH).fetch(post({ sessionId: third.sessionId, turn: third.turn, endSeq: third.endSeq }))
    await thirdStarted
    await routes.get(SETTINGS_PATH).fetch(post({ recap: false, semanticRecap: false, prediction: false }))
    assert.equal(thirdSignal.aborted, true)
    releaseThird()
    assert.deepEqual(await (await thirdSuggestion).json(), { state: 'none', reason: 'historical' })
    assert.equal(callCount, 3)
  } finally {
    if (releaseSecond) releaseSecond()
    if (releaseThird) releaseThird()
    for (const cleanup of cleanups) cleanup?.()
    await rm(home, { recursive: true, force: true })
  }
})

test('a provider that returns after a new Turn cannot publish or cache the old output', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-late-'))
  const routes = new Map()
  const listeners = new Map()
  const cleanups = []
  const session = { id: 'late-session', header: {}, surface: { contentGeneration: 2 } }
  let release
  let markStarted
  const started = new Promise(resolve => { markStarted = resolve })
  const llmCalls = { prepare: 0, signal: undefined }
  const llm = {
    async prepareCall(config, _signal, configure) {
      llmCalls.prepare += 1
      const controls = configure({ maxTokens: config.maxTokens }, { reasoning: { efforts: [{ id: 'low' }] } })
      const prepared = { ...config, ...controls }
      return {
        config: prepared,
        stream: async function* (options) {
          llmCalls.signal = options.signal
          markStarted()
          await new Promise(resolve => { release = resolve })
          yield { type: 'text-delta', text: JSON.stringify({ recap: '迟到摘要。', suggestion: '迟到建议。' }) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
  const scope = {
    connection: { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } },
    effect(effect) { cleanups.push(effect()) },
  }
  const ctx = {
    get(name) {
      if (name === 'dshHomePath') return () => home
      if (name === 'llm') return llm
      if (name === 'sessions') return { get: id => id === session.id ? session : undefined }
      if (name === 'sessionProjections') return { snapshot: () => ({ values: { modelSelection: { next: route } } }) }
      return undefined
    },
    effect(effect) { cleanups.push(effect()) },
    on(name, listener) { listeners.set(name, listener) },
    inject(_dependencies, callback) { callback(scope) },
  }
  const route = { provider: 'p', model: 'm' }
  const observe = (...args) => listeners.get('session/event')(...args)
  const endTurn = (turn, baseSeq, reply) => {
    observe(session, { type: 'turn/start', seq: baseSeq, data: { turn } })
    observe(session, { type: 'user/message', seq: baseSeq + 1, surfaceOp: 'append', data: { id: `user-${turn}`, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: `intent ${turn}` }] } })
    observe(session, { type: 'assistant/message', seq: baseSeq + 2, surfaceOp: 'append', data: { turn, message: { id: `assistant-${turn}`, role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: reply }] } } })
    observe(session, { type: 'turn/end', seq: baseSeq + 3, time: baseSeq + 3, data: { turn, reason: { kind: 'completed' } } })
  }

  try {
    apply(ctx)
    await routes.get(SETTINGS_PATH).fetch(new Request('http://host/settings'))
    await routes.get(SETTINGS_PATH).fetch(post({ prediction: true }))
    const oldReply = 'The first result is complete. Validation passed. Another check remains pending.'
    endTurn(1, 1, oldReply)
    const oldIdentity = { sessionId: session.id, turn: 1, endSeq: 4 }
    const suggestionPromise = routes.get(SUGGEST_PATH).fetch(post(oldIdentity))
    const recapPromise = routes.get(RECAP_PATH).fetch(post({ ...oldIdentity, replyHash: replyFingerprint(oldReply) }))
    await started
    observe(session, { type: 'turn/start', seq: 5, data: { turn: 2 } })
    release()
    assert.deepEqual(await (await suggestionPromise).json(), { state: 'none', reason: 'historical' })
    assert.deepEqual(await (await recapPromise).json(), { state: 'none', reason: 'historical' })
    assert.equal(llmCalls.prepare, 1)
    assert.equal(llmCalls.signal.aborted, true)
    const persisted = JSON.parse(await readFile(join(home, 'dsh-conversation-assist', 'assistance.json'), 'utf8'))
    assert.deepEqual(persisted.summaries, [])
  } finally {
    if (release) release()
    for (const cleanup of cleanups) cleanup?.()
    await rm(home, { recursive: true, force: true })
  }
})

test('an explicit recap omission survives Host restart without a second call; invalid output is not cached as an omission', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-omit-restart-'))
  let calls = 0
  let modelOutput = JSON.stringify({ recap: null, suggestion: 'A valid independent next step.' })
  const makeHost = ({ session } = {}) => {
    const routes = new Map()
    const listeners = new Map()
    const cleanups = []
    const llm = {
      async prepareCall(config, _signal, configure) {
        calls += 1
        const controls = configure({ maxTokens: config.maxTokens }, { reasoning: { efforts: [{ id: 'low' }] } })
        return {
          config: { ...config, ...controls },
          stream: async function* () {
            yield { type: 'text-delta', text: modelOutput }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }
      },
    }
    const route = { provider: 'p', model: 'm' }
    const scope = {
      connection: { fetch: { register(value) { routes.set(value.path, value); return () => routes.delete(value.path) } } },
      effect(effect) { cleanups.push(effect()) },
    }
    const ctx = {
      get(name) {
        if (name === 'dshHomePath') return () => home
        if (name === 'llm') return llm
        if (name === 'sessions') return { get: id => id === session?.id ? session : undefined }
        if (name === 'sessionProjections') return { snapshot: () => ({ values: { modelSelection: { next: route } } }) }
        return undefined
      },
      effect(effect) { cleanups.push(effect()) },
      on(name, listener) { listeners.set(name, listener) },
      inject(_dependencies, callback) { callback(scope) },
    }
    apply(ctx)
    return { routes, listeners, cleanups }
  }
  const session = { id: 'omit-session', header: {}, surface: { contentGeneration: 1 } }
  const firstHost = makeHost({ session })
  let restarted
  const reply = 'The implementation is complete with the persistence marker in place. Validation covered the reply hash and the model output shape while the Host was running. One separate manual check remains pending before this change is treated as fully verified.'

  try {
    await firstHost.routes.get(SETTINGS_PATH).fetch(new Request('http://host/settings'))
    await firstHost.routes.get(SETTINGS_PATH).fetch(post({ prediction: true }))
    const observe = firstHost.listeners.get('session/event')
    const finishTurn = (turn, baseSeq, text) => {
      observe(session, { type: 'turn/start', seq: baseSeq, data: { turn } })
      observe(session, { type: 'user/message', seq: baseSeq + 1, surfaceOp: 'append', data: { id: `user-${turn}`, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Please finish the requested work.' }] } })
      observe(session, { type: 'assistant/message', seq: baseSeq + 2, surfaceOp: 'append', data: { turn, message: { id: `assistant-${turn}`, role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text }] } } })
      observe(session, { type: 'turn/end', seq: baseSeq + 3, data: { turn, reason: { kind: 'completed' } } })
      return { sessionId: session.id, turn, endSeq: baseSeq + 3, replyHash: replyFingerprint(text) }
    }
    const omitted = finishTurn(1, 1, reply)
    assert.deepEqual(await (await firstHost.routes.get(RECAP_PATH).fetch(post(omitted))).json(), {
      state: 'none', reason: 'not-needed',
    })
    assert.equal(calls, 1)
    let saved = JSON.parse(await readFile(join(home, 'dsh-conversation-assist', 'assistance.json'), 'utf8'))
    assert.equal(saved.summaries.length, 1)
    assert.equal(saved.summaries[0].omitted, true)
    assert.equal('recap' in saved.summaries[0], false)

    modelOutput = JSON.stringify({ recap: 42, suggestion: null })
    const invalid = finishTurn(2, 10, reply)
    assert.deepEqual(await (await firstHost.routes.get(RECAP_PATH).fetch(post(invalid))).json(), {
      state: 'none', reason: 'unavailable',
    })
    assert.equal(calls, 2)
    saved = JSON.parse(await readFile(join(home, 'dsh-conversation-assist', 'assistance.json'), 'utf8'))
    assert.deepEqual(saved.summaries.map(row => row.turn), [1])

    for (const cleanup of firstHost.cleanups) cleanup?.()
    restarted = makeHost()
    await restarted.routes.get(SETTINGS_PATH).fetch(new Request('http://host/settings'))
    assert.deepEqual(await (await restarted.routes.get(RECAP_PATH).fetch(post(omitted))).json(), {
      state: 'none', reason: 'not-needed',
    })
    assert.deepEqual(await (await restarted.routes.get(RECAP_PATH).fetch(post({ ...omitted, replyHash: 'ffffffffffffffff' }))).json(), {
      state: 'none', reason: 'historical',
    })
    assert.equal(calls, 2)
  } finally {
    for (const cleanup of firstHost.cleanups) cleanup?.()
    for (const cleanup of restarted?.cleanups ?? []) cleanup?.()
    await rm(home, { recursive: true, force: true })
  }
})

test('an explicit recap null remains omitted when the independent suggestion field is invalid', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-omit-invalid-suggestion-'))
  const routes = new Map()
  const listeners = new Map()
  const cleanups = []
  const session = { id: 'omit-invalid-suggestion', header: {}, surface: { contentGeneration: 1 } }
  let calls = 0
  const llm = {
    async prepareCall(config, _signal, configure) {
      calls += 1
      const controls = configure({ maxTokens: config.maxTokens }, { reasoning: { efforts: [{ id: 'low' }] } })
      return {
        config: { ...config, ...controls },
        stream: async function* () {
          yield { type: 'text-delta', text: JSON.stringify({ recap: null, suggestion: 42 }) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
  const route = { provider: 'p', model: 'm' }
  const scope = {
    connection: { fetch: { register(value) { routes.set(value.path, value); return () => routes.delete(value.path) } } },
    effect(effect) { cleanups.push(effect()) },
  }
  const makeContext = currentSession => ({
    get(name) {
      if (name === 'dshHomePath') return () => home
      if (name === 'llm') return llm
      if (name === 'sessions') return { get: id => id === currentSession?.id ? currentSession : undefined }
      if (name === 'sessionProjections') return { snapshot: () => ({ values: { modelSelection: { next: route } } }) }
      return undefined
    },
    effect(effect) { cleanups.push(effect()) },
    on(name, listener) { listeners.set(name, listener) },
    inject(_dependencies, callback) { callback(scope) },
  })
  try {
    apply(makeContext(session))
    await routes.get(SETTINGS_PATH).fetch(new Request('http://host/settings'))
    await routes.get(SETTINGS_PATH).fetch(post({ prediction: true }))
    const onEvent = event => listeners.get('session/event')(session, event)
    const reply = 'The implementation is complete with the requested behavior in place. Validation covered persistence and the model output protocol in this session. One separate manual check remains pending before this change is treated as fully verified.'
    onEvent({ type: 'turn/start', seq: 1, data: { turn: 1 } })
    onEvent({ type: 'user/message', seq: 2, surfaceOp: 'append', data: { id: 'user-2', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Please complete the requested work.' }] } })
    onEvent({ type: 'assistant/message', seq: 3, surfaceOp: 'append', data: { turn: 1, message: { id: 'assistant-3', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: reply }] } } })
    onEvent({ type: 'turn/end', seq: 4, data: { turn: 1, reason: { kind: 'completed' } } })
    const identity = { sessionId: session.id, turn: 1, endSeq: 4, replyHash: replyFingerprint(reply) }

    assert.deepEqual(await (await routes.get(RECAP_PATH).fetch(post(identity))).json(), {
      state: 'none', reason: 'not-needed',
    })
    assert.deepEqual(await (await routes.get(SUGGEST_PATH).fetch(post(identity))).json(), {
      state: 'none', reason: 'unavailable',
    })
    assert.equal(calls, 1)
    const saved = JSON.parse(await readFile(join(home, 'dsh-conversation-assist', 'assistance.json'), 'utf8'))
    assert.deepEqual(saved.summaries, [{
      sessionId: session.id,
      turn: 1,
      endSeq: 4,
      replyHash: identity.replyHash,
      promptVersion: PROMPT_VERSION,
      generation: 1,
      omitted: true,
    }])

    for (const cleanup of cleanups.splice(0)) cleanup?.()
    routes.clear()
    listeners.clear()
    apply(makeContext())
    await routes.get(SETTINGS_PATH).fetch(new Request('http://host/settings'))
    assert.deepEqual(await (await routes.get(RECAP_PATH).fetch(post(identity))).json(), {
      state: 'none', reason: 'not-needed',
    })
    assert.deepEqual(await (await routes.get(RECAP_PATH).fetch(post({ ...identity, replyHash: 'ffffffffffffffff' }))).json(), {
      state: 'none', reason: 'historical',
    })
    assert.equal(calls, 1)
  } finally {
    for (const cleanup of cleanups.splice(0)) cleanup?.()
    await rm(home, { recursive: true, force: true })
  }
})

test('replacing a Session instance prevents its late result from reaching the recap cache', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-session-replace-'))
  const routes = new Map()
  const listeners = new Map()
  const cleanups = []
  const session = { id: 'replace-session', header: {}, surface: { contentGeneration: 3 } }
  let currentSession = session
  let release
  let markStarted
  const started = new Promise(resolve => { markStarted = resolve })
  const llm = {
    async prepareCall(config, _signal, configure) {
      const controls = configure({ maxTokens: config.maxTokens }, { reasoning: { efforts: [{ id: 'low' }] } })
      return {
        config: { ...config, ...controls },
        stream: async function* () {
          markStarted()
          await new Promise(resolve => { release = resolve })
          yield { type: 'text-delta', text: JSON.stringify({ recap: '旧 Session 的迟到摘要。', suggestion: null }) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
  const route = { provider: 'p', model: 'm' }
  const scope = { connection: { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } }, effect(effect) { cleanups.push(effect()) } }
  const ctx = {
    get(name) {
      if (name === 'dshHomePath') return () => home
      if (name === 'llm') return llm
      if (name === 'sessions') return { get: id => id === session.id ? currentSession : undefined }
      if (name === 'sessionProjections') return { snapshot: () => ({ values: { modelSelection: { next: route } } }) }
      return undefined
    },
    effect(effect) { cleanups.push(effect()) },
    on(name, listener) { listeners.set(name, listener) },
    inject(_dependencies, callback) { callback(scope) },
  }

  try {
    apply(ctx)
    await routes.get(SETTINGS_PATH).fetch(new Request('http://host/settings'))
    const observe = listeners.get('session/event')
    observe(session, { type: 'turn/start', seq: 1, data: { turn: 1 } })
    const finalReply = 'The update is complete. Validation passed. One check remains pending.'
    observe(session, { type: 'user/message', seq: 2, surfaceOp: 'append', data: { id: 'user-2', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'session replacement' }] } })
    observe(session, { type: 'assistant/message', seq: 3, surfaceOp: 'append', data: { turn: 1, message: { id: 'assistant-3', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: finalReply }] } } })
    observe(session, { type: 'turn/end', seq: 4, data: { turn: 1, reason: { kind: 'completed' } } })
    await started
    const requestIdentity = { sessionId: session.id, turn: 1, endSeq: 4, replyHash: replyFingerprint(finalReply) }
    const responsePromise = routes.get(RECAP_PATH).fetch(post(requestIdentity))
    currentSession = { ...session, surface: { ...session.surface } }
    release()

    assert.deepEqual(await (await responsePromise).json(), { state: 'none', reason: 'historical' })
    const persisted = JSON.parse(await readFile(join(home, 'dsh-conversation-assist', 'assistance.json'), 'utf8'))
    assert.deepEqual(persisted.summaries, [])
    assert.equal(persisted.attempts[0].count, 1)
  } finally {
    if (release) release()
    for (const cleanup of cleanups) cleanup?.()
    await rm(home, { recursive: true, force: true })
  }
})

test('Host marks a summary memory-only after persistence fails and on cached re-read', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-memory-cache-'))
  const routes = new Map()
  const listeners = new Map()
  const cleanups = []
  const session = { id: 'memory-cache-session', header: {}, surface: { contentGeneration: 8 } }
  let markStarted
  let release
  const started = new Promise(resolve => { markStarted = resolve })
  const llm = {
    async prepareCall(config, _signal, configure) {
      const controls = configure({ maxTokens: config.maxTokens }, { reasoning: { efforts: [{ id: 'low' }] } })
      return {
        config: { ...config, ...controls },
        stream: async function* () {
          markStarted()
          await new Promise(resolve => { release = resolve })
          yield { type: 'text-delta', text: JSON.stringify({ recap: '只保存在内存中的摘要。', suggestion: null }) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
  const route = { provider: 'p', model: 'm' }
  const scope = { connection: { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } }, effect(effect) { cleanups.push(effect()) } }
  const ctx = {
    get(name) {
      if (name === 'dshHomePath') return () => home
      if (name === 'llm') return llm
      if (name === 'sessions') return { get: id => id === session.id ? session : undefined }
      if (name === 'sessionProjections') return { snapshot: () => ({ values: { modelSelection: { next: route } } }) }
      return undefined
    },
    effect(effect) { cleanups.push(effect()) },
    on(name, listener) { listeners.set(name, listener) },
    inject(_dependencies, callback) { callback(scope) },
  }

  try {
    apply(ctx)
    await routes.get(SETTINGS_PATH).fetch(new Request('http://host/settings'))
    const observe = listeners.get('session/event')
    observe(session, { type: 'turn/start', seq: 1, data: { turn: 1 } })
    const finalReply = 'The repair is complete. Validation passed. A follow-up remains.'
    observe(session, { type: 'user/message', seq: 2, surfaceOp: 'append', data: { id: 'user-2', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'memory persistence test' }] } })
    observe(session, { type: 'assistant/message', seq: 3, surfaceOp: 'append', data: { turn: 1, message: { id: 'assistant-3', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: finalReply }] } } })
    observe(session, { type: 'turn/end', seq: 4, data: { turn: 1, reason: { kind: 'completed' } } })
    await started
    const requestIdentity = { sessionId: session.id, turn: 1, endSeq: 4, replyHash: replyFingerprint(finalReply) }
    const responsePromise = routes.get(RECAP_PATH).fetch(post(requestIdentity))
    const assistance = join(home, 'dsh-conversation-assist', 'assistance.json')
    const backup = `${assistance}.backup`
    await rename(assistance, backup)
    await mkdir(assistance)
    release()

    assert.deepEqual(await (await responsePromise).json(), {
      ...requestIdentity, state: 'ready', recap: '只保存在内存中的摘要。', persisted: false,
    })
    assert.deepEqual(await (await routes.get(RECAP_PATH).fetch(post(requestIdentity))).json(), {
      ...requestIdentity, state: 'ready', recap: '只保存在内存中的摘要。', persisted: false,
    })
  } finally {
    if (release) release()
    for (const cleanup of cleanups) cleanup?.()
    await rm(home, { recursive: true, force: true })
  }
})

test('a failed durable reservation prevents the auxiliary model call', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dca-reserve-'))
  const blockedHome = join(temp, 'not-a-directory')
  await writeFile(blockedHome, 'file blocks the state directory', 'utf8')
  const routes = new Map()
  const listeners = new Map()
  const cleanups = []
  const session = { id: 'blocked-session', header: {}, surface: { contentGeneration: 1 } }
  let calls = 0
  const llm = { async prepareCall() { calls += 1; throw new Error('must not dispatch') } }
  const scope = {
    connection: { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } },
    effect(effect) { cleanups.push(effect()) },
  }
  const ctx = {
    get(name) {
      if (name === 'dshHomePath') return () => blockedHome
      if (name === 'llm') return llm
      if (name === 'sessions') return { get: id => id === session.id ? session : undefined }
      if (name === 'sessionProjections') return { snapshot: () => ({ values: { modelSelection: { next: { provider: 'p', model: 'm' } } } }) }
      return undefined
    },
    effect(effect) { cleanups.push(effect()) },
    on(name, listener) { listeners.set(name, listener) },
    inject(_dependencies, callback) { callback(scope) },
  }

  try {
    apply(ctx)
    await routes.get(SETTINGS_PATH).fetch(new Request('http://host/settings'))
    const observe = listeners.get('session/event')
    observe(session, { type: 'turn/start', seq: 1, data: { turn: 1 } })
    const reply = 'The repair is complete. Validation passed. A follow-up remains.'
    observe(session, { type: 'user/message', seq: 2, surfaceOp: 'append', data: { id: 'user-2', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'intent' }] } })
    observe(session, { type: 'assistant/message', seq: 3, surfaceOp: 'append', data: { turn: 1, message: { id: 'assistant-3', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: reply }] } } })
    observe(session, { type: 'turn/end', seq: 4, data: { turn: 1, reason: { kind: 'completed' } } })
    const response = await routes.get(RECAP_PATH).fetch(post({
      sessionId: session.id, turn: 1, endSeq: 4, replyHash: replyFingerprint(reply),
    }))
    assert.deepEqual(await response.json(), { state: 'none', reason: 'unavailable' })
    assert.equal(calls, 0)
  } finally {
    for (const cleanup of cleanups) cleanup?.()
    await rm(temp, { recursive: true, force: true })
  }
})

test('model selection permanently consumes ready and waiting suggestions but keeps the recap', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dca-model-selection-'))
  const routes = new Map()
  const listeners = new Map()
  const cleanups = []
  const sessions = new Map([
    ['selection-ready', { id: 'selection-ready', header: {}, surface: { contentGeneration: 7 } }],
    ['selection-waiting', { id: 'selection-waiting', header: {}, surface: { contentGeneration: 7 } }],
  ])
  let calls = 0
  let markWaitingStarted
  let releaseWaiting
  const waitingStarted = new Promise(resolve => { markWaitingStarted = resolve })
  const waitingRelease = new Promise(resolve => { releaseWaiting = resolve })
  const llm = {
    async prepareCall(config, _signal, configure) {
      calls += 1
      const controls = configure({ maxTokens: config.maxTokens }, { reasoning: { efforts: [{ id: 'low' }] } })
      return {
        config: { ...config, ...controls },
        stream: async function* () {
          if (calls === 2) {
            markWaitingStarted()
            await waitingRelease
          }
          yield { type: 'text-delta', text: JSON.stringify({ recap: 'The result is complete and validated.', suggestion: 'Continue checking the remaining item.' }) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
  const sourceRoute = { provider: 'p', model: 'model-a' }
  const scope = { connection: { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } }, effect(effect) { cleanups.push(effect()) } }
  const ctx = {
    get(name) {
      if (name === 'dshHomePath') return () => home
      if (name === 'llm') return llm
      if (name === 'sessions') return { get: id => sessions.get(id) }
      if (name === 'sessionProjections') return { snapshot: () => ({ values: { modelSelection: { next: sourceRoute } } }) }
      return undefined
    },
    effect(effect) { cleanups.push(effect()) },
    on(name, listener) { listeners.set(name, listener) },
    inject(_dependencies, callback) { callback(scope) },
  }
  const observe = (sessionId, event) => listeners.get('session/event')(sessions.get(sessionId), event)
  const finishTurn = (sessionId, baseSeq) => {
    const session = sessions.get(sessionId)
    const reply = 'The result is complete. Validation passed. One follow-up remains.'
    observe(sessionId, { type: 'turn/start', seq: baseSeq, time: baseSeq, data: { turn: 1 } })
    observe(sessionId, { type: 'user/message', seq: baseSeq + 1, time: baseSeq + 1, surfaceOp: 'append', data: { id: `user-${sessionId}`, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Please finish and validate this work.' }] } })
    observe(sessionId, { type: 'assistant/message', seq: baseSeq + 2, time: baseSeq + 2, surfaceOp: 'append', data: { turn: 1, message: { id: `assistant-${sessionId}`, role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: reply }] } } })
    observe(sessionId, { type: 'turn/end', seq: baseSeq + 3, time: baseSeq + 3, data: { turn: 1, reason: { kind: 'completed' } } })
    return { sessionId, turn: 1, endSeq: baseSeq + 3, replyHash: replyFingerprint(reply) }
  }
  const switchAwayAndBack = sessionId => {
    observe(sessionId, { type: 'model/selection', seq: 20, time: 20, data: { provider: 'p', model: 'model-b' } })
    observe(sessionId, { type: 'model/selection', seq: 21, time: 21, data: { provider: 'p', model: 'model-a' } })
  }

  try {
    apply(ctx)
    await routes.get(SETTINGS_PATH).fetch(new Request('http://host/settings'))
    await routes.get(SETTINGS_PATH).fetch(post({ prediction: true }))

    const ready = finishTurn('selection-ready', 1)
    assert.deepEqual(await (await routes.get(SUGGEST_PATH).fetch(post(ready))).json(), {
      state: 'ready', sessionId: ready.sessionId, turn: ready.turn, endSeq: ready.endSeq,
      text: 'Continue checking the remaining item.', route: sourceRoute,
    })
    switchAwayAndBack(ready.sessionId)
    assert.deepEqual(await (await routes.get(SUGGEST_PATH).fetch(post(ready))).json(), {
      state: 'none', reason: 'selection-changed',
    })
    assert.deepEqual(await (await routes.get(RECAP_PATH).fetch(post(ready))).json(), {
      ...ready, state: 'ready', recap: 'The result is complete and validated.', persisted: true,
    })

    const waiting = finishTurn('selection-waiting', 10)
    const suggestionWait = routes.get(SUGGEST_PATH).fetch(post({ sessionId: waiting.sessionId, turn: waiting.turn, endSeq: waiting.endSeq }))
    const recapWait = routes.get(RECAP_PATH).fetch(post(waiting))
    await waitingStarted
    switchAwayAndBack(waiting.sessionId)
    releaseWaiting()
    assert.deepEqual(await (await suggestionWait).json(), { state: 'none', reason: 'selection-changed' })
    assert.deepEqual(await (await recapWait).json(), {
      ...waiting, state: 'ready', recap: 'The result is complete and validated.', persisted: true,
    })
    assert.equal(calls, 2)
  } finally {
    releaseWaiting()
    for (const cleanup of cleanups) cleanup?.()
    await rm(home, { recursive: true, force: true })
  }
})
