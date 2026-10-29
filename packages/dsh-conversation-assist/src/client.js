/** Browser entry: settings, recap definition, suggestion row, prompt recall, and settings section. */

import { NS, dictionaryFor } from './shared/locales.mjs'
import { createRecapDefinition, RecapTail } from './ui/recap.js'
import { SettingsSection } from './ui/settings.js'
import { navLabel } from './ui/nav-label.js'
import { SuggestionRow } from './ui/suggestion.js'
import { PromptRecallSeat } from './ui/recall-seat.js'
import { installStyles } from './ui/styles.js'
import { createHiddenTurns, createSettingsStore, requestRecap, requestSuggestion, translate } from './ui/store.js'

/** Services this client plugin requires. */
export const inject = ['slots', 'locale', 'uiConversation', 'shortcuts', 'sessions']

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
  const settings = createSettingsStore({ language })
  const hidden = createHiddenTurns()
  const runtime = {
    hidden, language, requestRecap, requestSuggestion, shortcuts: ctx.shortcuts,
    /** Resolved per read: the Session service may arrive after this plugin. */
    get sessions() { return ctx.get('sessions') },
  }

  ctx.effect(() => ctx.locale.register(NS, { zh: dictionaryFor('zh'), en: dictionaryFor('en') }), 'dsh-conversation-assist: dictionaries')
  ctx.effect(() => installStyles(), 'dsh-conversation-assist: stylesheet')
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
    inject: () => ({ hooks: { settings }, runtime: { requestRecap } }),
  }, RecapTail))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'dsh-conversation-assist.suggestion',
    order: 30,
    locale: NS,
    inject: () => ({ hooks: { settings }, runtime }),
  }, SuggestionRow))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'dsh-conversation-assist.recall',
    order: 10,
    locale: NS,
    inject: () => ({ runtime }),
  }, PromptRecallSeat))

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
