/** Locale namespace and dictionaries shared by the client entry and the tests. */

/** Locale namespace owned by this plugin. */
export const NS = 'conversation-assist'

/** Chinese copy. */
export const zh = {
  'recap.ariaLabel': '智能回顾',
  'recap.prefix': '回顾：',
  'recap.notPersisted': '本次回顾仅在内存中可用，重启后可能无法显示。',
  'suggestion.label': '下一条建议',
  'suggestion.dismiss': '关闭建议',
  'suggestion.insert': '填入聊天',
  'suggestion.send': '发送',
  'settings.nav': '对话辅助',
  'settings.title': '对话辅助',
  'settings.intro': '设置即时生效，重启后保留。',
  'settings.recap.name': '显示回顾',
  'settings.recap.desc': '显示每轮的智能回顾。没有可用的智能回顾时不显示。关闭后，所有回顾隐藏。',
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
  'recap.notPersisted': 'This recap is in memory only and may be unavailable after a restart.',
  'suggestion.label': 'Next suggestion',
  'suggestion.dismiss': 'Dismiss suggestion',
  'suggestion.insert': 'Insert into chat',
  'suggestion.send': 'Send',
  'settings.nav': 'Conversation assist',
  'settings.title': 'Conversation assist',
  'settings.intro': 'Settings take effect immediately and persist across restarts.',
  'settings.recap.name': 'Show recaps',
  'settings.recap.desc': 'Show a smart recap for each turn. A turn without an available recap shows nothing. Turning this off hides all recaps.',
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
