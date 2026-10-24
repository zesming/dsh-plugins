/** Browser entry: settings, recap definition, suggestion row, and settings section. */

import { NS, dictionaryFor } from './shared/locales.mjs'
import { createRecapDefinition, RecapTail } from './ui/recap.js'
import { SettingsSection } from './ui/settings.js'
import { SuggestionRow } from './ui/suggestion.js'
import { installStyles } from './ui/styles.js'
import { decideFixedInput } from './shared/keyboard.mjs'
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
  const accepts = new Map()
  let armedAt = startedAt
  let wasPrediction = false
  const runtime = { hidden, accepts, language, requestSuggestion, armedAt: () => armedAt }

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
    () => ctx.uiConversation.events.register(createRecapDefinition({
      startedAt,
      isRecapEnabled: () => settings.getSnapshot().recap,
    })),
    'dsh-conversation-assist: recap definition',
  )

  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: 'dsh-conversation-assist.recap',
    order: 20,
    locale: NS,
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
    label: () => dictionaryFor(language())['settings.nav'],
    locale: NS,
    inject: () => ({ hooks: { settings }, store: settings }),
  }, SettingsSection))

  ctx.inject(['shortcuts'], (scope) => {
    scope.effect(() => scope.shortcuts.observeFixedInput((input) => {
      if (input.type === 'reset') return
      const { gesture, context } = input
      const target = context.target
      const element = target instanceof Element ? target : null
      const sessionId = element?.closest('[data-conversation-session]')?.getAttribute('data-conversation-session')
      const entry = sessionId === undefined || sessionId === null ? undefined : accepts.get(sessionId)
      const action = decideFixedInput({
        gesture,
        context: {
          modal: context.modal,
          region: context.region,
          targetIsInput: element?.closest('[data-composer-input]') !== null && element !== null,
        },
        visible: entry !== undefined,
      })
      if (action === 'ignore' || entry === undefined) return
      if (action === 'dismiss') {
        entry.dismiss()
        input.consume()
        return
      }
      if (entry.accept('key')) input.consume()
    }, 'dsh-conversation-assist: fixed input'))
  })
}

export { translate }
