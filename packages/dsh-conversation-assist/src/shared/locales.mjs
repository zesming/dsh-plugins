/** Locale namespace and dictionaries shared by the client entry and the tests. */

/** Locale namespace owned by this plugin. */
export const NS = 'conversation-assist'

/** Chinese copy. */
export const zh = {
  'recap.ariaLabel': '智能回顾',
  'recap.prefix': '回顾：',
  'recap.excerptLabel': '回复摘录',
  'recap.historicalLabel': '历史轮次 · 回复摘录',
  'recap.loading': '正在生成智能回顾…',
  'recap.notPersisted': '本次回顾仅在内存中可用，重启后可能无法显示。',
  'recap.expand': '展开摘录',
  'recap.longExcerpt': '原回复较长，摘录仅保留前 {count} 个字符；完整内容见上方回复。',
  'recap.noReply': '本轮没有文字回复。',
  'recap.completed': '本轮正常结束。',
  'recap.aborted': '本轮已停止（{cause}）。',
  'recap.blocked': '本轮被阻塞，尚待处理。',
  'recap.error': '本轮失败{code}。',
  'recap.maxTokens': '本轮输出达到上限并被截断。',
  'recap.interrupted': '本轮在恢复时闭合，回复可能不完整。',
  'recap.forked': '本轮继承自截断的分叉，回复可能不完整。',
  'recap.unknown': '本轮以未知原因结束。',
  'recap.code': '（{code}）',
  'recap.cause.user': '用户取消',
  'recap.cause.parent': '父会话取消',
  'recap.cause.hook': '被钩子取消',
  'recap.cause.disposed': '会话被释放',
  'recap.cause.legacy': '旧记录未注明原因',
  'recap.cause.unknown': '原因未知',
  'recap.reason.historical': '此历史轮次没有已缓存的智能回顾。',
  'recap.reason.unavailable': '智能回顾暂不可用。',
  'recap.reason.budget': '已达到辅助请求限额。',
  'recap.reason.disabled': '智能回顾已关闭。',
  'recap.reason.no-context': '本轮缺少可供回顾的完整回复。',
  'recap.reason.unknown': '智能回顾暂不可用。',
  'suggestion.label': '下一条建议',
  'suggestion.dismiss': '关闭建议',
  'suggestion.insert': '填入聊天',
  'suggestion.send': '发送',
  'settings.nav': '对话辅助',
  'settings.title': '对话辅助',
  'settings.intro': '设置即时生效，重启后保留。',
  'settings.recap.name': '显示回顾',
  'settings.recap.desc': '显示每轮的智能回顾或回复摘录。关闭后，所有回顾隐藏。',
  'settings.prediction.name': '下一条建议',
  'settings.prediction.desc': '有明确后续意图时，在输入框上方显示一条建议，可填入聊天或点击发送。默认关闭',
  'settings.note.title': '用量说明',
  'settings.note.body': '显示回顾和下一条建议共用每轮最多一次辅助请求，会增加微量用量。',
  'settings.error': '设置未保存，请重试。',
}

/** English copy. */
export const en = {
  'recap.ariaLabel': 'Smart recap',
  'recap.prefix': 'Recap: ',
  'recap.excerptLabel': 'Reply excerpt',
  'recap.historicalLabel': 'Historical turn · Reply excerpt',
  'recap.loading': 'Generating smart recap…',
  'recap.notPersisted': 'This recap is in memory only and may be unavailable after a restart.',
  'recap.expand': 'Expand excerpt',
  'recap.longExcerpt': 'The reply is long. This excerpt keeps the first {count} characters; the full text is above.',
  'recap.noReply': 'No reply text this turn.',
  'recap.completed': 'This turn ended normally.',
  'recap.aborted': 'This turn stopped ({cause}).',
  'recap.blocked': 'This turn is blocked and needs attention.',
  'recap.error': 'This turn failed{code}.',
  'recap.maxTokens': 'This turn hit the output limit and was truncated.',
  'recap.interrupted': 'This turn closed during recovery; its reply may be incomplete.',
  'recap.forked': 'This turn was inherited from a truncated fork; its reply may be incomplete.',
  'recap.unknown': 'This turn ended for an unknown reason.',
  'recap.code': ' ({code})',
  'recap.cause.user': 'cancelled by the user',
  'recap.cause.parent': 'cancelled by the parent',
  'recap.cause.hook': 'cancelled by a hook',
  'recap.cause.disposed': 'the session was disposed',
  'recap.cause.legacy': 'cancelled for a legacy reason',
  'recap.cause.unknown': 'an unknown reason',
  'recap.reason.historical': 'No cached smart recap is available for this historical turn.',
  'recap.reason.unavailable': 'The smart recap is temporarily unavailable.',
  'recap.reason.budget': 'The auxiliary request limit was reached.',
  'recap.reason.disabled': 'Smart recap is turned off.',
  'recap.reason.no-context': 'This turn has no complete reply to recap.',
  'recap.reason.unknown': 'The smart recap is temporarily unavailable.',
  'suggestion.label': 'Next suggestion',
  'suggestion.dismiss': 'Dismiss suggestion',
  'suggestion.insert': 'Insert into chat',
  'suggestion.send': 'Send',
  'settings.nav': 'Conversation assist',
  'settings.title': 'Conversation assist',
  'settings.intro': 'Settings take effect immediately and persist across restarts.',
  'settings.recap.name': 'Show recaps',
  'settings.recap.desc': 'Show a smart recap or reply excerpt for each turn. Turning this off hides all recaps.',
  'settings.prediction.name': 'Next suggestion',
  'settings.prediction.desc': 'When there is clear follow-up intent, show one suggestion above the composer. Fill it into chat or click Send. Off by default.',
  'settings.note.title': 'Usage',
  'settings.note.body': 'Recaps and next suggestions share at most one auxiliary request per turn, with a small amount of added usage.',
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
