/** Browser entry: settings, recap definition, suggestion row, prompt recall, and settings section. */

import { NS, dictionaryFor } from './shared/locales.mjs'
import { createRecapDefinition, RecapTail } from './ui/recap.js'
import { SettingsSection } from './ui/settings.js'
import { NavIcon } from './ui/nav-icon.js'
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

  ctx.effect(() => ctx.locale.register(NS, { zh: dictionaryFor('zh'), en: dictionaryFor('en') }), 'dsh-session-assist: dictionaries')
  ctx.effect(() => installStyles(), 'dsh-session-assist: stylesheet')
  ctx.effect(() => ctx.on('connection/reset', () => { void settings.start() }), 'dsh-session-assist: settings reset')
  void settings.start()

  ctx.effect(
    () => ctx.uiConversation.events.register(createRecapDefinition()),
    'dsh-session-assist: recap definition',
  )

  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: 'dsh-session-assist.recap',
    order: 20,
    locale: NS,
    // The turnTail slot hands occupants the Turn number, not the Turn object:
    // the shell owns the location index. Expose this plugin's folded recap
    // facts as a keyed hook over chat's per-turn data source.
    inject: (sessionId) => {
      const injected = { hooks: { settings }, runtime: { requestRecap } }
      const binding = ctx.sessions?.binding?.(sessionId)
      if (binding === undefined || binding === null) return injected
      let chat
      try {
        chat = ctx.uiConversation.binding(binding).target('chat')
      } catch {
        return injected
      }
      return {
        ...injected,
        keyedHooks: {
          recapFacts: turn => chat.getSnapshot()?.nodes.turnDataSource(Number(turn), 'session-assist.recap'),
        },
      }
    },
  }, RecapTail))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'dsh-session-assist.suggestion',
    order: 30,
    locale: NS,
    inject: () => ({ hooks: { settings }, runtime }),
  }, SuggestionRow))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'dsh-session-assist.recall',
    order: 10,
    locale: NS,
    inject: () => ({ runtime }),
  }, PromptRecallSeat))

  // The settings shell renders the occupant of `settings.section.icon`
  // (matched by section id) in its nav-glyph seat and falls back to the gear
  // for ids without one. Register the lightbulb there; the section label
  // stays plain text because the shell owns the whole nav button.
  ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
    name: 'settings.section.icon',
    id: 'session-assist',
    locale: NS,
  }, NavIcon))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'session-assist',
    order: 6,
    label: () => dictionaryFor(language())['settings.nav'],
    locale: NS,
    inject: () => ({ hooks: { settings }, store: settings }),
  }, SettingsSection))

}

export { translate }
