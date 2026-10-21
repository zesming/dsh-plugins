/**
 * Browser half of the DeepSeek balance and usage plugin.
 *
 * It contributes three seats, none of which replaces a shipped component:
 * the balance row above the account launcher, the usage page in Settings, and
 * the usage panel in the main area. The panel is how the row's "Usage" entry
 * opens: a third-party bundle cannot address a Settings section directly, and
 * the heatmap needs the wider column anyway.
 */

import React from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'

import { USAGE } from './ui/icons.js'
import { BalanceRow, Glyph } from './ui/balance-row.js'
import { Styles, UsageView } from './ui/usage-view.js'
import { dictionaryFor, interpolate } from './ui/locale.js'

const h = React.createElement

/** Services this client plugin reads. */
export const inject = ['slots', 'layout', 'locale']

/** Main-area panel id the balance row opens. */
export const PANEL_ID = 'deepseek-usage'

/** Settings section id. */
export const SECTION_ID = 'usage'

/** Locale namespace owned by the plugin. */
const NS = 'deepseek-usage'

/**
 * Build the `t` lookup bound to one dictionary.
 *
 * @param language - active UI language.
 * @returns a lookup that interpolates placeholders.
 */
function lookup(language) {
  const rows = dictionaryFor(language)
  return (key, values) => interpolate(rows[key] ?? key, values)
}

/**
 * Read the active language from the locale service, falling back to the browser.
 *
 * @param ctx - client context.
 * @returns a language tag.
 */
function languageOf(ctx) {
  try {
    return ctx.locale.getSnapshot().active ?? navigator.language ?? 'en'
  } catch {
    return navigator.language ?? 'en'
  }
}

/**
 * Mount the plugin's three contributions.
 *
 * @param ctx - client context.
 */
export function apply(ctx) {
  const t = () => lookup(languageOf(ctx))

  ctx.effect(() => ctx.locale.register(NS, { zh: dictionaryFor('zh'), en: dictionaryFor('en') }), 'deepseek-usage: dictionaries')

  const openUsage = () => {
    try {
      ctx.layout.selectPanel(PANEL_ID)
    } catch (error) {
      ctx.logger?.warn?.('deepseek-usage: usage panel is not mounted', error)
    }
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'deepseek-usage-balance',
    order: -10,
    locale: NS,
    inject: () => ({
      openUsage,
      openTopUp: () => {
        const target = globalThis.__DSH_USAGE_TOP_UP_URL__
        if (typeof target === 'string' && target !== '') window.open(target, '_blank', 'noopener')
      },
      t: t(),
      language: languageOf(ctx),
      primitives,
    }),
  }, BalanceRow))

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({ t: t(), language: languageOf(ctx), primitives }),
  }, UsagePanel))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    locale: NS,
    label: () => t()('usage'),
  }, () => h(Glyph, { description: USAGE })))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: SECTION_ID,
    order: 5,
    label: () => t()('nav'),
    locale: NS,
    inject: () => ({ t: t(), language: languageOf(ctx), primitives }),
  }, UsageSettingsSection))
}

/**
 * The main-area panel wrapper: heading, refresh, and the shared usage view.
 *
 * @param props.t - locale lookup.
 * @param props.language - active UI language.
 * @returns the panel.
 */
export function UsagePanel({ t, language, primitives }) {
  const [refreshToken, setRefreshToken] = React.useState(0)
  return h('div', { className: 'dsu dsu-panel' },
    h(Styles),
    h('div', { className: 'dsu-panel-head' },
      h('h1', { className: 'dsu-panel-title' }, t('title')),
      h('div', { className: 'dsu-panel-actions' },
        h('button', {
          type: 'button',
          className: 'dsu-icon-btn',
          'aria-label': t('refresh'),
          title: t('refresh'),
          onClick: () => { setRefreshToken(value => value + 1) },
        }, h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
          h('path', { d: 'M20 12a8 8 0 1 1-2.3-5.6' }),
          h('path', { d: 'M20 4v4h-4' }))),
      ),
    ),
    h(UsageView, { t, language, container: 'panel', initialRefreshToken: refreshToken, primitives }),
  )
}

/**
 * The Settings section wrapper around the same usage view.
 *
 * @param props.t - locale lookup.
 * @param props.language - active UI language.
 * @returns the section.
 */
export function UsageSettingsSection({ t, language, primitives }) {
  const [refreshToken, setRefreshToken] = React.useState(0)
  return h('div', { className: 'dsu' },
    h(Styles),
    h(UsageView, { t, language, container: 'settings', initialRefreshToken: refreshToken, primitives }),
  )
}
