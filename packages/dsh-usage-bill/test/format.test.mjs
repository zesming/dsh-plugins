import assert from 'node:assert/strict'
import test from 'node:test'

import { compactTokens, formatMoney, groupCount, keyOf, relativeDays, shiftDays } from '../src/ui/format.js'

test('token counts abbreviate at each magnitude', () => {
  assert.deepEqual(compactTokens(0), { value: '0', unit: '' })
  assert.deepEqual(compactTokens(999), { value: '999', unit: '' })
  assert.deepEqual(compactTokens(12_345), { value: '12.3', unit: 'K' })
  assert.deepEqual(compactTokens(1_234_567), { value: '1.2', unit: 'M' })
  assert.deepEqual(compactTokens(1_036_995_668), { value: '1.04', unit: 'B' })
  assert.deepEqual(compactTokens(Number.NaN), { value: '0', unit: '' })
  assert.deepEqual(compactTokens(-5), { value: '0', unit: '' })
})

test('money keeps the exact cents the wallet sent', () => {
  assert.equal(formatMoney('128.42', 'CNY'), '¥128.42')
  assert.equal(formatMoney('128.4', 'CNY'), '¥128.40')
  assert.equal(formatMoney('128', 'CNY'), '¥128.00')
  assert.equal(formatMoney('1,234', 'CNY'), '¥--')
  assert.equal(formatMoney('5.0000000000000000', 'CNY'), '¥5.00')
  assert.equal(formatMoney('0E-16', 'CNY'), '¥0.00')
  assert.equal(formatMoney('0', 'CNY'), '¥0.00')
})

test('truncation never rounds a positive amount up', () => {
  assert.equal(formatMoney('1.005', 'CNY'), '¥1.00')
  assert.equal(formatMoney('999.999', 'CNY'), '¥999.99')
  assert.equal(formatMoney('0.004', 'CNY'), '¥<0.01')
})

test('negatives round away from zero with a visible magnitude', () => {
  assert.equal(formatMoney('-3.456', 'CNY'), '-¥3.46')
  assert.equal(formatMoney('-1.005', 'CNY'), '-¥1.01')
  assert.equal(formatMoney('-0.004', 'CNY'), '-¥0.01')
})

test('large amounts group digits and USD uses its own symbol', () => {
  assert.equal(formatMoney('1234567.891', 'CNY'), '¥1,234,567.89')
  assert.equal(formatMoney('128.42', 'USD'), '$128.42')
})

test('malformed money reads as unknown, never as zero', () => {
  assert.equal(formatMoney(undefined, 'CNY'), '¥--')
  assert.equal(formatMoney('abc', 'CNY'), '¥--')
  assert.equal(formatMoney('Infinity', 'CNY'), '¥--')
})

test('per-day money sublines use the same formatter', () => {
  assert.equal(formatMoney('20.00', 'CNY'), '¥20.00')
})

test('relative days read naturally in both languages', () => {
  assert.equal(relativeDays(6, 'zh-CN'), '6 天后')
  assert.equal(relativeDays(0, 'zh-CN'), '今天')
  assert.equal(relativeDays(1, 'en-US'), 'in 1 day')
  assert.equal(relativeDays(6, 'en-US'), 'in 6 days')
})

test('counts group digits', () => {
  assert.equal(groupCount(1234567), new Intl.NumberFormat().format(1234567))
})

test('day keys and shifts survive month and year edges', () => {
  assert.equal(keyOf(new Date(2026, 11, 31, 23, 59)), '2026-12-31')
  assert.equal(keyOf(shiftDays(new Date(2026, 11, 31), 1)), '2027-01-01')
  assert.equal(keyOf(shiftDays(new Date(2026, 0, 1), -1)), '2025-12-31')
})
