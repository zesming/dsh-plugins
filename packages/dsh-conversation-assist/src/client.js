/** Browser entry: settings, recap definition, suggestion row, and settings section. */

import { NS, dictionaryFor } from './shared/locales.mjs'
import { createRecapDefinition, RecapTail } from './ui/recap.js'
import { SettingsSection } from './ui/settings.js'
import { navLabel } from './ui/nav-label.js'
import { SuggestionRow } from './ui/suggestion.js'
import { installStyles } from './ui/styles.js'
import { createHiddenTurns, createSettingsStore, requestSuggestion, translate } from './ui/store.js'

/** Services this client plugin requires. */
export const inject = ['slots', 'locale', 'uiConversation']

/**
 * Mount the browser half.
 * @param ctx - client root context.
 */
export function apply(ctx) {
  const language = () => {
    try {
      const active = ctx.locale.getSnapshot().active
      return typeof active === 'string' ? active : 'en'
    } catch {
      return 'en'
    }
  }
  const startedAt = Date.now()
  const settings = createSettingsStore({ language })
  const hidden = createHiddenTurns()
  let armedAt = startedAt
  let wasPrediction = false
  const runtime = { hidden, language, requestSuggestion, armedAt: () => armedAt }

  ctx.effect(() => ctx.locale.register(NS, { zh: dictionaryFor('zh'), en: dictionaryFor('en') }), 'dsh-conversation-assist: dictionaries')
  ctx.effect(() => installStyles(), 'dsh-conversation-assist: stylesheet')
  ctx.effect(() => settings.subscribe(() => {
    const enabled = settings.getSnapshot().prediction
    if (enabled && !wasPrediction) armedAt = Date.now()
    wasPrediction = enabled
  }), 'dsh-conversation-assist: prediction arming')
  wasPrediction = settings.getSnapshot().prediction
  ctx.effect(() => ctx.on('connection/reset', () => { void settings.start() }), 'dsh-conversation-assist: settings reset')
  void settings.start()

  ctx.effect(
    () => ctx.uiConversation.events.register(createRecapDefinition()),
    'dsh-conversation-assist: recap definition',
  )

  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: 'dsh-conversation-assist.recap',
    order: 20,
    locale: NS,
    inject: () => ({ hooks: { settings } }),
  }, RecapTail))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'dsh-conversation-assist.suggestion',
    order: 30,
    locale: NS,
    inject: () => ({ hooks: { settings }, runtime }),
  }, SuggestionRow))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'conversation-assist',
    order: 6,
    label: () => navLabel(dictionaryFor(language())['settings.nav']),
    locale: NS,
    inject: () => ({ hooks: { settings }, store: settings }),
  }, SettingsSection))

}

export { translate }
