import assert from 'node:assert/strict'
import test from 'node:test'

import { decideFixedInput } from '../src/shared/keyboard.mjs'

const gesture = (patch = {}) => ({
  code: 'Tab', control: false, alt: false, shift: false, meta: false,
  repeat: false, composing: false, defaultPrevented: false, ...patch,
})
const context = (patch = {}) => ({ modal: null, region: 'editable', targetIsInput: true, ...patch })

test('Tab and ArrowRight accept only in the focused composer', () => {
  assert.equal(decideFixedInput({ gesture: gesture(), context: context(), visible: true }), 'accept')
  assert.equal(decideFixedInput({ gesture: gesture({ code: 'ArrowRight' }), context: context(), visible: true }), 'accept')
  assert.equal(decideFixedInput({ gesture: gesture(), context: context(), visible: false }), 'ignore')
})

test('Escape dismisses only while a suggestion is visible', () => {
  assert.equal(decideFixedInput({ gesture: gesture({ code: 'Escape' }), context: context(), visible: true }), 'dismiss')
  assert.equal(decideFixedInput({ gesture: gesture({ code: 'Escape' }), context: context(), visible: false }), 'ignore')
})

test('modifiers, composition, repeats and a consumed key all pass through', () => {
  const cases = [
    gesture({ shift: true }), gesture({ control: true }), gesture({ alt: true }), gesture({ meta: true }),
    gesture({ composing: true }), gesture({ repeat: true }), gesture({ defaultPrevented: true }),
  ]
  for (const item of cases) assert.equal(decideFixedInput({ gesture: item, context: context(), visible: true }), 'ignore')
})

test('a modal, another region, or another target passes the key through', () => {
  assert.equal(decideFixedInput({ gesture: gesture(), context: context({ modal: 'dialog' }), visible: true }), 'ignore')
  assert.equal(decideFixedInput({ gesture: gesture(), context: context({ region: 'page' }), visible: true }), 'ignore')
  assert.equal(decideFixedInput({ gesture: gesture(), context: context({ targetIsInput: false }), visible: true }), 'ignore')
})

test('other keys are never consumed', () => {
  assert.equal(decideFixedInput({ gesture: gesture({ code: 'Enter' }), context: context(), visible: true }), 'ignore')
})
