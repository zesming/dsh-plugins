/** Locale namespace and dictionaries shared by the client entry and the tests. */

/** Locale namespace owned by this plugin. */
export const NS = 'conversation-assist'

/** Chinese copy. */
export const zh = {
  'recap.completed': '本轮已结束。{detail}{next}',
  'recap.aborted': '已停止（{cause}）。{detail}',
  'recap.blocked': '被阻塞：需要你处理后才能继续。{detail}',
  'recap.error': '本轮失败{code}。{detail}',
  'recap.maxTokens': '输出达到上限被截断。{detail}',
  'recap.interrupted': '这是恢复闭合的轮次，不是新的完成轮。',
  'recap.forked': '这是分叉时继承截断的轮次，不是新的完成轮。',
  'recap.unknown': '本轮以未知原因结束；不假定成功或失败。',
  'recap.detail': '已确认 {parts}。',
  'recap.noProgress': '本轮没有可确认的新进展。',
  'recap.next': '下一步由你决定。',
  'recap.code': '（{code}）',
  'recap.parts.join': '，',
  'recap.parts.tools': '{n} 个工具调用',
  'recap.parts.tools.one': '{n} 个工具调用',
  'recap.parts.failures': '{n} 个失败',
  'recap.parts.failures.one': '{n} 个失败',
  'recap.parts.pending': '{n} 个结果未返回',
  'recap.parts.pending.one': '{n} 个结果未返回',
  'recap.parts.unknown': '{n} 个结果未确认',
  'recap.parts.unknown.one': '{n} 个结果未确认',
  'recap.parts.noReply': '没有正文',
  'recap.cause.user': '用户取消',
  'recap.cause.parent': '父会话取消',
  'recap.cause.hook': '被钩子取消',
  'recap.cause.disposed': '会话被释放',
  'recap.cause.legacy': '旧记录未注明原因',
  'recap.cause.unknown': '原因未知',
  'suggestion.label': '下一条建议',
  'suggestion.accept': '接受',
  'suggestion.dismiss': '关闭建议',
  'suggestion.hint': '接受后是可编辑草稿，不会自动发送',
  'settings.nav': '对话辅助',
  'settings.title': '对话辅助',
  'settings.intro': '两个开关在同一处；改动即时生效，重启 DSH 后保留。',
  'settings.recap.name': '轮次回顾',
  'settings.recap.desc': '每轮结束后在最后一条消息下方用一两句话说明确认了什么、哪些失败或未确认。默认开启，不调用模型；关闭后新轮次不再出现回顾，正文与输入不变。',
  'settings.prediction.name': '下一条建议',
  'settings.prediction.desc': '一轮正常完成后在输入框下方给出下一条可接受为草稿的建议。默认关闭；开启后每轮完成会额外发一次模型请求，关闭后无建议行、无请求，按键行为回到默认。',
  'settings.note.title': '用量说明',
  'settings.note.body': '开启「下一条建议」后，每轮完成会额外发一次模型请求；这次请求不会出现在 DSH 用量页，插件只保留自己的审计记录（请求摘要、模型路由、输出、token 数、时间，位置见 README）。回顾不调用模型，因此不产生这类请求。插件不展示、也不估算任何货币成本。',
  'settings.error': '设置未保存，请重试。',
}

/** English copy. */
export const en = {
  'recap.completed': 'Turn ended. {detail}{next}',
  'recap.aborted': 'Stopped ({cause}). {detail}',
  'recap.blocked': 'Blocked: your action is needed before continuing. {detail}',
  'recap.error': 'Turn failed{code}. {detail}',
  'recap.maxTokens': 'Output hit the token limit and was truncated. {detail}',
  'recap.interrupted': 'This turn was closed during recovery; it is not a new completed turn.',
  'recap.forked': 'This turn was inherited from a truncated fork; it is not a new completed turn.',
  'recap.unknown': 'This turn ended for an unknown reason; success is not assumed.',
  'recap.detail': 'Confirmed {parts}.',
  'recap.noProgress': 'No confirmable progress this turn.',
  'recap.next': 'Next step is up to you.',
  'recap.code': ' ({code})',
  'recap.parts.join': ', ',
  'recap.parts.tools': '{n} tool calls',
  'recap.parts.tools.one': '{n} tool call',
  'recap.parts.failures': '{n} failed',
  'recap.parts.failures.one': '{n} failed',
  'recap.parts.pending': '{n} pending',
  'recap.parts.pending.one': '{n} pending',
  'recap.parts.unknown': '{n} unconfirmed',
  'recap.parts.unknown.one': '{n} unconfirmed',
  'recap.parts.noReply': 'no reply text',
  'recap.cause.user': 'cancelled by the user',
  'recap.cause.parent': 'cancelled by the parent',
  'recap.cause.hook': 'cancelled by a hook',
  'recap.cause.disposed': 'the session was disposed',
  'recap.cause.legacy': 'cancelled for a legacy reason',
  'recap.cause.unknown': 'an unknown reason',
  'suggestion.label': 'Suggestion',
  'suggestion.accept': 'Accept',
  'suggestion.dismiss': 'Dismiss suggestion',
  'suggestion.hint': 'Accepted as an editable draft; nothing is sent.',
  'settings.nav': 'Conversation assist',
  'settings.title': 'Conversation assist',
  'settings.intro': 'Both switches live here. Changes apply immediately and survive a restart.',
  'settings.recap.name': 'Turn recap',
  'settings.recap.desc': 'After each turn, a sentence under the last message says what was confirmed and what failed or stayed unconfirmed. On by default; no model call. When off, new turns show no recap and the transcript and composer are unchanged.',
  'settings.prediction.name': 'Next-suggestion',
  'settings.prediction.desc': 'After a completed turn, suggests a next message under the composer that you can accept as a draft. Off by default; when on, each completed turn sends one extra model request. When off, there is no row, no request, and keys behave as before.',
  'settings.note.title': 'Usage',
  'settings.note.body': 'With "Next-suggestion" on, every completed turn sends one extra model request. That request does not appear on the DSH usage page; the plugin keeps its own audit record (request summary, model route, output, token count, time; the README names the path). Recaps make no model calls and therefore no such requests. The plugin never shows or estimates a currency cost.',
  'settings.error': 'Settings were not saved. Try again.',
}

/**
 * Pick the dictionary for a language tag.
 * @param language - active UI language, e.g. `zh-CN`.
 * @returns the matching dictionary, falling back to English.
 */
export function dictionaryFor(language) {
  return typeof language === 'string' && language.toLowerCase().startsWith('zh') ? zh : en
}

/**
 * Replace `{name}` placeholders without depending on the host translator.
 * @param text - dictionary row.
 * @param values - replacement values keyed by placeholder name.
 * @returns the rendered string.
 */
export function formatRow(text, values = {}) {
  if (typeof text !== 'string') return ''
  return text.replace(/\{(\w+)\}/gu, (match, key) => {
    const value = values[key]
    return value === undefined ? match : String(value)
  })
}
