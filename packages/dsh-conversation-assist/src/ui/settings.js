/** Settings section: two host switches and the usage note. */

import React from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'

const h = React.createElement

/**
 * One labelled switch row.
 * @param props - key, copy, value, pending, failure, and change callback.
 * @returns the row.
 */
function Row({ setting, name, description, checked, pending, failed, errorText, t, onChange }) {
  const Switch = typeof primitives?.Switch === 'function' ? primitives.Switch : undefined
  const control = Switch === undefined
    ? h('button', {
      type: 'button',
      role: 'switch',
      className: 'dca-switch',
      'aria-checked': checked,
      'aria-label': name,
      disabled: pending,
      onClick: () => { onChange(setting, !checked) },
    })
    : h(Switch, {
      checked,
      disabled: pending,
      label: name,
      onChange: next => { onChange(setting, next) },
    })
  return h('div', { className: 'dca-setrow' },
    h('div', { className: 'dca-setbody' },
      h('div', { className: 'dca-setname' }, name),
      h('div', { className: 'dca-setdesc' }, description),
      failed ? h('div', { className: 'dca-seterror', role: 'alert' }, errorText) : null),
    control)
}

/**
 * Render the plugin settings section.
 * @param props - translator and the shared settings store.
 * @returns the section.
 */
export function SettingsSection({ t, useSettings, store }) {
  const state = useSettings(value => value)
  const change = (setting, next) => { void store.update({ [setting]: next }) }
  return h('div', { className: 'dca-settings' },
    h('h2', { className: 'dca-settings-title' }, t('settings.title')),
    h('p', { className: 'dca-settings-intro' }, t('settings.intro')),
    h(Row, {
      setting: 'recap',
      name: t('settings.recap.name'),
      description: t('settings.recap.desc'),
      checked: state.recap,
      pending: state.pending.recap,
      failed: state.failed === 'recap',
      errorText: t('settings.error'),
      t,
      onChange: change,
    }),
    h(Row, {
      setting: 'prediction',
      name: t('settings.prediction.name'),
      description: t('settings.prediction.desc'),
      checked: state.prediction,
      pending: state.pending.prediction,
      failed: state.failed === 'prediction',
      errorText: t('settings.error'),
      t,
      onChange: change,
    }),
    h('div', { className: 'dca-note' },
      h('div', { className: 'dca-note-title' }, t('settings.note.title')),
      h('div', null, t('settings.note.body'))))
}
