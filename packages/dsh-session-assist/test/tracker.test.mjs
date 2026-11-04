import assert from 'node:assert/strict'
import test from 'node:test'

import { createTracker } from '../src/host/tracker.mjs'
import { buildAssistanceContext } from '../src/shared/context.mjs'

const session = { id: 's1', surface: { contentGeneration: 4 }, requestHeader: () => ({ config: { provider: 'p', model: 'm' } }) }
const SURFACE_TYPES = new Set(['system/message', 'developer/message', 'user/message', 'assistant/message', 'tool/result'])
const event = (type, data, seq = 0, time = 1) => ({
  type, seq, time, data,
  ...(SURFACE_TYPES.has(type) ? { surfaceOp: 'append' } : {}),
})
let messageId = 0
const message = (source, blocks, extra = {}) => ({
  id: `message-${++messageId}`,
  role: source?.kind === 'user' || source?.kind === 'context' ? 'user' : source?.kind === 'tool' ? 'tool' : 'assistant',
  source,
  content: blocks,
  ...extra,
})
const text = value => ({ type: 'text', text: value })

test('tracker captures only real user intent, every final text block, and correlated tool evidence', () => {
  const tracker = createTracker()
  tracker.observe(session, event('turn/start', { turn: 1 }, 1), { provider: 'p', model: 'm' })
  tracker.observe(session, event('user/message', message({ kind: 'context', plugin: 'x' }, [text('injected context')]), 2))
  tracker.observe(session, event('user/message', message({ kind: 'user' }, [text('do work'), text('retain last requirement')]), 3))
  tracker.observe(session, event('assistant/message', { turn: 1, message: message({ kind: 'model' }, [
    { type: 'tool-call', id: 'call-fail', name: 'test', arguments: { input: 'must not be retained' } },
  ]) }, 4))
  tracker.observe(session, event('tool/call', { turn: 1, step: 2, callId: 'call-fail', name: 'test', arguments: { input: 'must not be retained' } }, 5))
  tracker.observe(session, event('tool/result', {
    turn: 1,
    step: 3,
    message: message({ kind: 'tool', callId: 'call-fail' }, [text('first test failed')], { role: 'tool', toolCallId: 'call-fail', isError: true }),
    error: { code: 'FAILED' },
  }, 6))
  tracker.observe(session, event('tool/call', { turn: 1, step: 4, callId: 'call-repair', name: 'test', arguments: { input: 'test passed' } }, 7))
  tracker.observe(session, event('tool/result', {
    turn: 1,
    step: 5,
    message: message({ kind: 'tool' }, [text('fixed test passed')], { role: 'tool', source: { kind: 'tool', callId: 'call-repair' }, isError: false }),
  }, 8))
  tracker.observe(session, event('assistant/message', { turn: 1, message: message({ kind: 'model' }, [
    text('Result: fixed.'), text('Validation: the test passed; release is still pending.'),
  ]) }, 9))
  tracker.observe(session, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 10, 11))

  const turn = tracker.get('s1')
  assert.deepEqual(turn.userMessages.map(row => row.text), ['do work\n\nretain last requirement'])
  assert.equal(turn.finalText, 'Result: fixed.\n\nValidation: the test passed; release is still pending.')
  assert.equal(turn.endSeq, 10)
  assert.equal(turn.reason.kind, 'completed')
  assert.equal(turn.surfaceGeneration, 4)
  assert.deepEqual(turn.sourceSelection, { provider: 'p', model: 'm' })
  assert.deepEqual(turn.evidence.map(row => [row.callId, row.callSeq, row.resultSeq, row.isError, row.errorCode]), [
    ['call-fail', 5, 6, true, 'FAILED'],
    ['call-repair', 7, 8, false, null],
  ])
  assert.match(JSON.stringify(turn), /first test failed/u)
  assert.doesNotMatch(JSON.stringify(turn), /must not be retained/u)
  assert.doesNotMatch(JSON.stringify(turn), /injected context/u)
})

test('tool calls and interrupted assistant text cannot be treated as the final reply', () => {
  const tracker = createTracker()
  tracker.observe(session, event('turn/start', { turn: 2 }, 10))
  tracker.observe(session, event('user/message', message({ kind: 'user' }, [text('please inspect')]), 11))
  tracker.observe(session, event('assistant/message', { turn: 2, message: message({ kind: 'model' }, [text('working'), { type: 'tool-call', id: 'a', name: 'read', arguments: {} }]) }, 12))
  assert.equal(tracker.get('s1').finalText, '')
  tracker.observe(session, event('assistant/message', { turn: 2, interrupted: true, message: message({ kind: 'model' }, [text('stopped early')]) }, 13))
  tracker.observe(session, event('turn/end', { turn: 2, reason: { kind: 'aborted' } }, 14))
  assert.equal(tracker.get('s1').finalText, '')
  assert.equal(tracker.get('s1').hasInterruptedAssistant, true)
})

test('capture uses the current open Turn when user/message.data has no turn field', () => {
  const tracker = createTracker()
  tracker.observe(session, event('turn/start', { turn: 7 }, 20))
  tracker.observe(session, event('user/message', message({ kind: 'user' }, [text('human input')]), 21))
  assert.equal(tracker.get('s1').turn, 7)
  assert.equal(tracker.get('s1').userMessages[0].text, 'human input')
})

test('a known system-only replacement preserves Turn trust, while a real non-head compaction invalidates it', () => {
  const tracker = createTracker()
  const surfaceSession = { id: 'surface-session', surface: { contentGeneration: 0 } }
  tracker.observe(surfaceSession, event('turn/start', { turn: 1 }, 1))
  tracker.observe(surfaceSession, {
    type: 'system/message', seq: 2, time: 1,
    surfaceOp: 'append',
    data: { turn: 1, step: 0, message: { id: 'system-2', role: 'system', source: { kind: 'system-prompt' }, content: [text('old prompt')] } },
  })
  surfaceSession.surface.contentGeneration = 1
  tracker.observe(surfaceSession, {
    type: 'system/message', seq: 3, time: 2,
    surfaceOp: { op: 'replace', startSeq: 2, endSeq: 2 },
    sourceEventSeqs: [2],
    data: { turn: 1, step: 1, message: { id: 'system-3', role: 'system', source: { kind: 'system-prompt' }, content: [text('normalized prompt')] } },
  })
  tracker.observe(surfaceSession, event('user/message', message({ kind: 'user' }, [text('intent')]), 4))
  tracker.observe(surfaceSession, event('assistant/message', { turn: 1, message: message({ kind: 'model' }, [text('The answer has three sentences. It includes a concrete result. One check remains pending.')]) }, 5))
  tracker.observe(surfaceSession, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 6))

  const completed = tracker.get(surfaceSession.id)
  assert.equal(completed.surfaceGeneration, 0)
  assert.equal(completed.surfaceRevision, 0)
  assert.equal(tracker.surfaceMatches(surfaceSession, completed), true)

  const compactionId = '00000000-0000-4000-8000-000000000001'
  tracker.observe(surfaceSession, event('compaction/start', { compactionId, turn: null }, 7, 3))
  tracker.observe(surfaceSession, event('compaction/summary', {
    compactionId,
    summary: [text('The completed work and pending check are retained.')],
    shadowedRange: { start: 4, end: 5 },
    shadowedSeqs: [4, 5],
    shadowedTokenCount: 24,
    provider: 'p',
    model: 'm',
  }, 8, 3))
  surfaceSession.surface.contentGeneration = 2
  tracker.observe(surfaceSession, {
    type: 'user/message', seq: 9, time: 4,
    surfaceOp: { op: 'replace', startSeq: 4, endSeq: 5 },
    sourceEventSeqs: [4, 5],
    data: { id: 'checkpoint-9', role: 'user', source: { kind: 'compact-checkpoint', compactionId }, content: [text('The completed work and pending check are retained.')] },
  })
  tracker.observe(surfaceSession, event('compaction/end', { compactionId, turn: null }, 10, 4))
  assert.equal(tracker.surfaceMatches(surfaceSession, tracker.get(surfaceSession.id)), false)
})

test('dropping an early user message marks the current intent partial and blocks generation', () => {
  const tracker = createTracker()
  tracker.observe(session, event('turn/start', { turn: 8 }, 80))
  for (let index = 0; index < 33; index += 1) {
    const intent = index === 0 ? '禁止发布' : `追加输入 ${index}`
    tracker.observe(session, event('user/message', message({ kind: 'user' }, [text(intent)]), 81 + index))
  }
  tracker.observe(session, event('assistant/message', { turn: 8, message: message({ kind: 'model' }, [text('reply')]) }, 120))

  const turn = tracker.get('s1')
  assert.equal(turn.userMessages.length, 32)
  assert.equal(turn.userMessages[0].text, '追加输入 1')
  assert.equal(turn.userMessages.at(-1).text, '追加输入 32')
  assert.equal(turn.intentPartial, true)
  const context = buildAssistanceContext(turn, [], undefined, 's1')
  const serialized = JSON.stringify(context.messages)
  assert.equal(context.state, 'partial')
  assert.equal(context.currentComplete, false)
  assert.doesNotMatch(serialized, /禁止发布/u)
  assert.match(serialized, /追加输入 32/u)
})

test('history holds only the last two completed captures and new Turns clear their final reply', () => {
  const tracker = createTracker()
  for (let turn = 1; turn <= 4; turn += 1) {
    tracker.observe(session, event('turn/start', { turn }, turn * 10))
    tracker.observe(session, event('user/message', message({ kind: 'user' }, [text(`intent ${turn}`)]), turn * 10 + 1))
    tracker.observe(session, event('assistant/message', { turn, message: message({ kind: 'model' }, [text(`reply ${turn}`)]) }, turn * 10 + 2))
    tracker.observe(session, event('turn/end', { turn, reason: { kind: 'completed' } }, turn * 10 + 3))
  }
  assert.deepEqual(tracker.history('s1').map(item => item.turn), [2, 3])
  tracker.observe(session, event('turn/start', { turn: 5 }, 50))
  assert.equal(tracker.get('s1').endSeq, undefined)
  assert.equal(tracker.matches(session, { turn: 4, endSeq: 43, generation: 4 }), false)
  tracker.forget('s1')
  assert.equal(tracker.get('s1'), undefined)
  assert.deepEqual(tracker.history('s1'), [])
})

test('an abnormal Turn becomes the nearest prior context and cuts off older completed Turns', () => {
  const tracker = createTracker()
  const closeTurn = (turn, baseSeq, intent, reason) => {
    tracker.observe(session, event('turn/start', { turn }, baseSeq))
    tracker.observe(session, event('user/message', message({ kind: 'context', plugin: 'x' }, [text('derived text')]), baseSeq + 1))
    tracker.observe(session, event('user/message', message({ kind: 'user' }, [text(intent)]), baseSeq + 2))
    tracker.observe(session, event('assistant/message', { turn, message: message({ kind: 'model' }, [text(`reply ${turn}`)]) }, baseSeq + 3))
    tracker.observe(session, event('turn/end', { turn, reason }, baseSeq + 4))
  }
  closeTurn(1, 100, 'original request', { kind: 'completed' })
  closeTurn(2, 110, 'interrupted correction', { kind: 'aborted' })
  tracker.observe(session, event('turn/start', { turn: 3 }, 120))

  const history = tracker.history('s1')
  assert.equal(history.length, 1)
  assert.equal(history[0].turn, 2)
  assert.equal(history[0].reason.kind, 'aborted')
  assert.deepEqual(history[0].userMessages.map(item => item.text), ['interrupted correction'])
})

test('tracker ignores events without a Session or a valid Turn match', () => {
  const tracker = createTracker()
  tracker.observe(null, event('turn/start', { turn: 1 }))
  tracker.observe(session, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 2))
  assert.equal(tracker.get('s1'), undefined)
  tracker.observe(session, event('turn/start', { turn: 2 }, 3))
  tracker.observe(session, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 4))
  assert.equal(tracker.get('s1').endSeq, undefined)
})
