/** Bounded live capture of the open Turn and its correlated tool evidence. */

import { LIMITS } from '../shared/limits.mjs'
import { textOfMessage } from '../shared/identity.mjs'

const MAX_CAPTURE_BYTES = LIMITS.maxContextBytes * 2
const MAX_USER_MESSAGES = 32
const MAX_TOOL_EXCERPT = 360
const MAX_SYSTEM_NODES = 256

function truncateText(text, maxBytes = MAX_CAPTURE_BYTES) {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length <= maxBytes) return { text, partial: false }
  const chars = [...text]
  const budget = Math.max(0, maxBytes - 32)
  const headBudget = Math.floor(budget * 0.62)
  const tailBudget = budget - headBudget
  let head = ''
  let headBytes = 0
  let split = 0
  while (split < chars.length) {
    const size = new TextEncoder().encode(chars[split]).length
    if (headBytes + size > headBudget) break
    head += chars[split]
    headBytes += size
    split += 1
  }
  let tail = ''
  let tailBytes = 0
  let index = chars.length - 1
  while (index >= split) {
    const size = new TextEncoder().encode(chars[index]).length
    if (tailBytes + size > tailBudget) break
    tail = chars[index] + tail
    tailBytes += size
    index -= 1
  }
  return { text: `${head}\n[…]\n${tail}`, partial: true }
}

function textExcerpt(text) {
  const chars = [...text]
  if (chars.length <= MAX_TOOL_EXCERPT) return { text, partial: false }
  const first = chars.slice(0, MAX_TOOL_EXCERPT / 2).join('')
  const last = chars.slice(-MAX_TOOL_EXCERPT / 2).join('')
  return { text: `${first}\n[…]\n${last}`, partial: true }
}

function callIdOf(value) {
  const id = value?.callId
    ?? value?.toolCallId
    ?? value?.id
    ?? value?.message?.toolCallId
    ?? value?.message?.source?.callId
  return typeof id === 'string' ? id : undefined
}

function resultTextOf(data) {
  return textOfMessage(data?.message)
}

function safeErrorCode(data) {
  const code = data?.error?.code
  return typeof code === 'string' ? code.slice(0, 96) : undefined
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))
}

const SURFACE_MESSAGE_TYPES = new Set([
  'system/message', 'developer/message', 'user/message', 'assistant/message', 'tool/result',
])

function isReplaceOperation(value) {
  return value !== null && typeof value === 'object' && value.op === 'replace'
    && Number.isSafeInteger(value.startSeq) && Number.isSafeInteger(value.endSeq)
    && value.startSeq <= value.endSeq
}

function isSafeSystemReplacement(state, event) {
  if (state.systemNodesKnown !== true || event?.type !== 'system/message' || event?.data?.message?.role !== 'system'
    || !isReplaceOperation(event.surfaceOp) || !Number.isSafeInteger(event.seq)) return false
  const sources = event.sourceEventSeqs
  if (!Array.isArray(sources) || sources.length === 0
    || sources.some(seq => !Number.isSafeInteger(seq)) || new Set(sources).size !== sources.length) return false
  const shadowed = [...state.systemNodes]
    .filter(seq => seq >= event.surfaceOp.startSeq && seq <= event.surfaceOp.endSeq)
    .sort((a, b) => a - b)
  const cited = [...sources].sort((a, b) => a - b)
  return shadowed.length > 0
    && shadowed.length === cited.length
    && shadowed.every((seq, index) => seq === cited[index])
}

function updateSurfaceState(state, session, event) {
  const generation = session?.surface?.contentGeneration
  const prior = state.contentGeneration
  if (!Number.isSafeInteger(generation) || !Number.isSafeInteger(prior)) {
    if (event?.surfaceOp !== undefined || state.initialized) state.revision += 1
  } else if (generation !== prior) {
    const delta = generation - prior
    if (delta !== 1 || !isSafeSystemReplacement(state, event)) state.revision += 1
  }
  if (Number.isSafeInteger(generation)) state.contentGeneration = generation
  state.initialized = true

  if (!SURFACE_MESSAGE_TYPES.has(event?.type)) return
  if (!Number.isSafeInteger(event.seq)) {
    state.revision += 1
    return
  }
  if (event.surfaceOp === 'append') {
    if (event.type === 'system/message' && state.systemNodesKnown) {
      state.systemNodes.add(event.seq)
      if (state.systemNodes.size > MAX_SYSTEM_NODES) {
        state.systemNodes.clear()
        state.systemNodesKnown = false
      }
    }
    return
  }
  if (isReplaceOperation(event.surfaceOp)) {
    if (state.systemNodesKnown) {
      for (const seq of event.sourceEventSeqs ?? []) state.systemNodes.delete(seq)
      if (event.type === 'system/message') state.systemNodes.add(event.seq)
      if (state.systemNodes.size > MAX_SYSTEM_NODES) {
        state.systemNodes.clear()
        state.systemNodesKnown = false
      }
    }
  } else {
    state.revision += 1
  }
}

function routeFromEvent(event) {
  const envelope = event?.data?.header ?? event?.data ?? {}
  const header = envelope.config ?? envelope
  if (typeof header?.provider !== 'string' || header.provider === '' || typeof header?.model !== 'string' || header.model === '') return undefined
  const effort = envelope.adapterDefaults?.reasoningEffort === true ? undefined : header.reasoningEffort
  return {
    provider: header.provider,
    model: header.model,
    ...(typeof effort === 'string' ? { reasoningEffort: effort } : {}),
  }
}

function snapshot(entry) {
  return {
    turn: entry.turn,
    startSeq: entry.startSeq,
    endSeq: entry.endSeq,
    endTime: entry.endTime,
    reason: entry.reason === undefined ? undefined : clone(entry.reason),
    sourceSelection: entry.sourceSelection === undefined ? undefined : clone(entry.sourceSelection),
    generation: entry.generation,
    surfaceGeneration: entry.surfaceGeneration,
    surfaceRevision: entry.surfaceRevision,
    userMessages: clone(entry.userMessages),
    intentPartial: entry.intentPartial,
    finalMessages: clone(entry.finalMessages),
    finalText: entry.finalMessages.map(item => item.text).join('\n\n'),
    replyPartial: entry.finalMessages.some(item => item.partial),
    evidence: clone(entry.evidence),
    evidencePartial: entry.evidencePartial,
    hasInterruptedAssistant: entry.hasInterruptedAssistant,
    hasAssistantToolCall: entry.hasAssistantToolCall,
  }
}

/**
 * Create one capture per Session. Only explicitly user-sourced messages become
 * human intent; derived context and assistant/tool text remain separate.
 * @param options - tracker bounds.
 * @returns live observer and identity-safe read operations.
 */
export function createTracker({ maxEvidence = LIMITS.maxEvidence } = {}) {
  const entries = new Map()
  const previous = new Map()
  const surfaces = new Map()
  let generation = 0

  const trimEvidence = entry => {
    while (entry.evidence.length > maxEvidence) {
      const removed = entry.evidence.shift()
      entry.evidencePartial = true
      if (removed?.callId && entry.calls.get(removed.callId) === removed) entry.calls.delete(removed.callId)
    }
  }

  const addCall = (entry, callId, name, seq) => {
    const existing = callId === undefined ? undefined : entry.calls.get(callId)
    if (existing !== undefined) {
      if (Number.isSafeInteger(seq)) existing.callSeq = seq
      if (typeof name === 'string') existing.name = name.slice(0, 120)
      return existing
    }
    const call = {
      callId: callId ?? `unknown-${seq ?? entry.evidence.length}`,
      callSeq: Number.isSafeInteger(seq) ? seq : null,
      name: typeof name === 'string' ? name.slice(0, 120) : null,
      resultSeq: null,
      isError: null,
      errorCode: null,
      resultText: '',
      resultPartial: false,
    }
    entry.evidence.push(call)
    if (callId !== undefined) entry.calls.set(callId, call)
    trimEvidence(entry)
    return call
  }

  const appendAssistantMessage = (entry, message, event) => {
    entry.finalMessages = []
    const blocks = Array.isArray(message?.content) ? message.content : []
    const toolCalls = blocks.filter(block => block?.type === 'tool-call')
    if (toolCalls.length > 0) {
      entry.hasAssistantToolCall = true
      entry.finalMessages = []
      for (const block of toolCalls) {
        addCall(entry, callIdOf(block), block.name, event.seq)
      }
      return
    }
    const interrupted = message?.interrupted === true || event?.data?.interrupted === true
    if (interrupted) {
      entry.hasInterruptedAssistant = true
      entry.finalMessages = []
      return
    }
    const raw = textOfMessage(message)
    if (raw.trim() === '') return
    const retained = truncateText(raw)
    entry.finalMessages = [{ seq: Number.isSafeInteger(event.seq) ? event.seq : null, text: retained.text, partial: retained.partial }]
  }

  const appendToolResult = (entry, data, seq) => {
    const callId = callIdOf(data)
    const call = callId === undefined ? undefined : entry.calls.get(callId)
    const rawText = resultTextOf(data)
    const excerpt = textExcerpt(rawText)
    const result = call ?? addCall(entry, callId, undefined, seq)
    result.resultSeq = Number.isSafeInteger(seq) ? seq : null
    result.isError = data?.message?.isError === true || (data?.error !== undefined && data.error !== null)
    result.errorCode = safeErrorCode(data) ?? null
    result.resultText = excerpt.text
    result.resultPartial = excerpt.partial
    trimEvidence(entry)
  }

  return {
    /** Observe one committed Session event. */
    observe(session, event, sourceSelection) {
      const sessionId = typeof session?.id === 'string' ? session.id : undefined
      if (sessionId === undefined || typeof event?.type !== 'string') return
      let surface = surfaces.get(sessionId)
      if (surface?.sessionInstance !== session) {
        surface = {
          sessionInstance: session,
          contentGeneration: Number.isSafeInteger(session?.surface?.contentGeneration) ? session.surface.contentGeneration : null,
          initialized: false,
          revision: 0,
          systemNodes: new Set(),
          systemNodesKnown: true,
        }
        surfaces.set(sessionId, surface)
      }
      updateSurfaceState(surface, session, event)
      if (event.type === 'turn/start') {
        const prior = entries.get(sessionId)
        const rawSurfaceGeneration = session?.surface?.contentGeneration
        const surfaceGeneration = Number.isSafeInteger(rawSurfaceGeneration) ? rawSurfaceGeneration : null
        const oldRevision = prior?.surfaceRevision
        if (Number.isSafeInteger(prior?.endSeq) && oldRevision === surface.revision) {
          const captured = snapshot(prior)
          if (prior.reason?.kind === 'completed') {
            const list = previous.get(sessionId) ?? []
            list.push(captured)
            previous.set(sessionId, list.slice(-2))
          } else {
            // An abnormal Turn is the boundary: retain its human intent, but
            // never let older completed work bridge over the interruption.
            previous.set(sessionId, [captured])
          }
        } else if (prior !== undefined && oldRevision !== surface.revision) {
          previous.delete(sessionId)
        }
        const selected = sourceSelection ?? routeFromEvent(event) ?? (() => {
          try {
            return routeFromEvent({ data: { header: session.requestHeader?.() } })
          } catch {
            return undefined
          }
        })()
        const entry = {
          sessionInstance: session,
          turn: event.data?.turn,
          startSeq: event.seq,
          endSeq: undefined,
          endTime: undefined,
          reason: undefined,
          sourceSelection: selected === undefined ? undefined : clone(selected),
          generation: ++generation,
          surfaceGeneration,
          surfaceRevision: surface.revision,
          userMessages: [],
          intentPartial: false,
          finalMessages: [],
          evidence: [],
          evidencePartial: false,
          hasInterruptedAssistant: false,
          hasAssistantToolCall: false,
          calls: new Map(),
        }
        entries.set(sessionId, entry)
        return
      }
      const entry = entries.get(sessionId)
      if (entry === undefined) return
      if (event.type === 'request/header') {
        const selected = sourceSelection ?? routeFromEvent(event)
        if (selected !== undefined) entry.sourceSelection = clone(selected)
        return
      }
      if (event.type === 'user/message') {
        const message = event.data
        if (message?.source?.kind !== 'user') return
        if (Number.isSafeInteger(message.turn) && message.turn !== entry.turn) return
        const raw = textOfMessage(message)
        if (raw.trim() === '') return
        const retained = truncateText(raw)
        entry.userMessages.push({ seq: Number.isSafeInteger(event.seq) ? event.seq : null, text: retained.text, partial: retained.partial })
        if (entry.userMessages.length > MAX_USER_MESSAGES) {
          entry.userMessages.shift()
          entry.intentPartial = true
        }
        return
      }
      if (event.type === 'assistant/message') {
        const message = event.data?.message
        if (Number.isSafeInteger(event.data?.turn) && event.data.turn !== entry.turn) return
        appendAssistantMessage(entry, message, event)
        return
      }
      if (event.type === 'tool/call') {
        const data = event.data ?? {}
        if (Number.isSafeInteger(data.turn) && data.turn !== entry.turn) return
        addCall(entry, data.callId, data.name, event.seq)
        entry.hasAssistantToolCall = true
        entry.finalMessages = []
        return
      }
      if (event.type === 'tool/result') {
        if (Number.isSafeInteger(event.data?.turn) && event.data.turn !== entry.turn) return
        appendToolResult(entry, event.data ?? {}, event.seq)
        return
      }
      if (event.type === 'turn/end' && event.data?.turn === entry.turn) {
        entry.endSeq = event.seq
        entry.endTime = event.time
        entry.reason = event.data.reason === undefined ? undefined : clone(event.data.reason)
      }
    },
    /** Return a serializable snapshot of the current tracked Turn. */
    get(sessionId) {
      const entry = entries.get(sessionId)
      return entry === undefined ? undefined : snapshot(entry)
    },
    /** Check the exact current Session instance and live Turn identity. */
    matches(session, identity) {
      const entry = entries.get(session?.id)
      return entry !== undefined
        && entry.sessionInstance === session
        && entry.turn === identity?.turn
        && entry.endSeq === identity?.endSeq
        && entry.generation === identity?.generation
    },
    /** Reject Turns after non-system replacement or an unknown surface mutation. */
    surfaceMatches(session, turn) {
      const surface = surfaces.get(session?.id)
      const entry = entries.get(session?.id)
      return surface !== undefined && surface.sessionInstance === session
        && entry !== undefined && entry.sessionInstance === session
        && Number.isSafeInteger(turn?.surfaceRevision)
        && surface.revision === turn.surfaceRevision
    },
    /** Record an official route fallback on the current Turn before generation. */
    setSourceSelection(sessionId, selection) {
      const entry = entries.get(sessionId)
      if (entry === undefined || selection === undefined) return false
      entry.sourceSelection = clone(selection)
      return true
    },
    /** Return a shallow list of the last two closed Turns for explanation only. */
    history(sessionId) {
      return (previous.get(sessionId) ?? []).map(item => clone(item))
    },
    /** Cancel in-memory history and capture when a Session is disposed. */
    forget(sessionId) {
      entries.delete(sessionId)
      previous.delete(sessionId)
      surfaces.delete(sessionId)
    },
  }
}
