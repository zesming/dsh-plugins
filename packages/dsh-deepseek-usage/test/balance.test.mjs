import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EXPIRY_WINDOW_DAYS, addDecimal, balanceView, decimalOf, expiringBonuses, primaryWallet, totalOf,
} from '../src/balance.js'

/** Fixed clock so day math is deterministic. */
const NOW = Date.UTC(2026, 9, 21, 4, 0, 0)

/** Epoch milliseconds `days` from the fixed clock. */
const daysFrom = days => NOW + days * 86_400_000

/** A ready balance outcome. */
const ready = (value, bonusWallets = []) => ({ status: 'ready', value, bonusWallets })

test('decimal strings are accepted only in the Platform grammar', () => {
  assert.deepEqual(decimalOf('128.42'), { text: '128.42', number: 128.42 })
  assert.deepEqual(decimalOf('0E-16'), { text: '0E-16', number: 0 })
  assert.equal(decimalOf('1e'), undefined)
  assert.equal(decimalOf('NaN'), undefined)
  assert.equal(decimalOf('Infinity'), undefined)
  assert.equal(decimalOf(12), undefined)
  assert.equal(decimalOf(undefined), undefined)
})

test('decimal addition keeps cents exact', () => {
  assert.equal(addDecimal('128.40', '20.00'), '148.40')
  assert.equal(addDecimal('0.1', '0.2'), '0.3')
  assert.equal(addDecimal('1.005', '1.005'), '2.010')
  assert.equal(addDecimal('bad', '1'), undefined)
})

test('CNY leads, USD is used when it is the only wallet', () => {
  assert.equal(primaryWallet([{ currency: 'USD', balance: '5' }, { currency: 'CNY', balance: '10' }]).currency, 'CNY')
  assert.equal(primaryWallet([{ currency: 'USD', balance: '5' }]).currency, 'USD')
  assert.equal(primaryWallet([]), undefined)
  assert.equal(primaryWallet([{ currency: 'EUR', balance: '5' }]), undefined)
})

test('totals ignore other currencies and malformed rows', () => {
  const wallets = [{ currency: 'CNY', balance: '10.50' }, { currency: 'USD', balance: '9' }, { currency: 'CNY', balance: '2.50' }, { currency: 'CNY', balance: 'x' }]
  assert.equal(totalOf(wallets, 'CNY'), '13.00')
  assert.equal(totalOf(wallets, 'USD'), '9')
  assert.equal(totalOf(wallets, 'EUR'), undefined)
})

test('expiring notices keep only future dates inside the window', () => {
  const notices = expiringBonuses([
    { expiresAt: new Date(daysFrom(6)).toISOString(), amount: '20.00', currency: 'CNY' },
    { expiresAt: new Date(daysFrom(-1)).toISOString(), amount: '5.00', currency: 'CNY' },
    { expiresAt: new Date(daysFrom(EXPIRY_WINDOW_DAYS + 1)).toISOString(), amount: '7.00', currency: 'CNY' },
    { expiresAt: '', amount: '1.00' },
    { expiresAt: 'not-a-date', amount: '1.00' },
  ], NOW)
  assert.equal(notices.length, 1)
  assert.equal(notices[0].amount, '20.00')
  assert.equal(notices[0].daysLeft, 6)
})

test('the window edge is inclusive and days round up', () => {
  const edge = expiringBonuses([{ expiresAt: new Date(daysFrom(EXPIRY_WINDOW_DAYS)).toISOString() }], NOW)
  assert.equal(edge.length, 1)
  const fraction = expiringBonuses([{ expiresAt: new Date(NOW + 1.2 * 86_400_000).toISOString() }], NOW)
  assert.equal(fraction[0].daysLeft, 2)
})

test('expiring notices sort by soonest expiry', () => {
  const notices = expiringBonuses([
    { expiresAt: new Date(daysFrom(10)).toISOString() },
    { expiresAt: new Date(daysFrom(2)).toISOString() },
  ], NOW)
  assert.deepEqual(notices.map(n => n.daysLeft), [2, 10])
})

test('signed out renders nothing at all', () => {
  assert.deepEqual(balanceView({ signedIn: false, now: NOW }), { signedIn: false, available: false, error: null })
})

test('a failed balance read is unavailable, never zero', () => {
  const view = balanceView({ signedIn: true, balance: { status: 'failed' }, now: NOW })
  assert.equal(view.available, false)
  assert.equal(view.error, 'balance-failed')
  assert.equal('balance' in view, false)
})

test('a ready read reports balance, bonus, and their total', () => {
  const view = balanceView({
    signedIn: true,
    now: NOW,
    balance: ready([{ currency: 'CNY', balance: '108.42' }], [{ currency: 'CNY', balance: '20.00' }]),
    bonuses: { bonuses: [{ expiresAt: new Date(daysFrom(6)).toISOString(), amount: '20.00', currency: 'CNY' }] },
  })
  assert.equal(view.available, true)
  assert.equal(view.balance, '108.42')
  assert.equal(view.bonus, '20.00')
  assert.equal(view.total, '128.42')
  assert.equal(view.expiring.length, 1)
})

test('a missing bonus wallet leaves the bonus null', () => {
  const view = balanceView({ signedIn: true, now: NOW, balance: ready([{ currency: 'CNY', balance: '5' }]) })
  assert.equal(view.bonus, null)
  assert.equal(view.total, '5')
})

test('a wallet list without a usable currency is unavailable', () => {
  const view = balanceView({ signedIn: true, now: NOW, balance: ready([{ currency: 'CNY', balance: 'oops' }]) })
  assert.equal(view.available, false)
  assert.equal(view.error, 'balance-empty')
})

test('bonus diagnostics stay off unless explicitly asked for', async () => {
  const { bonusDiagnosticsEnabled } = await import('../src/index.js')
  // An unasked diagnostic that writes order ids to the log is noise, and the
  // payload names campaigns; it has to be opt-in.
  assert.equal(bonusDiagnosticsEnabled({}), false)
  assert.equal(bonusDiagnosticsEnabled({ DSH_DEEPSEEK_USAGE_DEBUG_BONUS: '' }), false)
  assert.equal(bonusDiagnosticsEnabled({ DSH_DEEPSEEK_USAGE_DEBUG_BONUS: '0' }), false)
  assert.equal(bonusDiagnosticsEnabled({ DSH_DEEPSEEK_USAGE_DEBUG_BONUS: '1' }), true)
  assert.equal(bonusDiagnosticsEnabled({ DSH_DEEPSEEK_USAGE_DEBUG_BONUS: 'true' }), true)
})

test('a real expiry months away is still shown, not filtered out', () => {
  // Platform reports a date for very few grants, so the date is the scarce
  // thing: a window that silently discards it is worse than one that is too
  // generous. The soonest-first sort keeps a distant date from outranking a
  // near one.
  const far = expiringBonuses([{ expiresAt: new Date(daysFrom(200)).toISOString(), amount: '5.00' }], NOW)
  assert.equal(far.length, 1, '200 days out is inside the window')
  assert.ok(far[0].daysLeft > 100)

  const mixed = expiringBonuses([
    { expiresAt: new Date(daysFrom(200)).toISOString(), amount: '5.00' },
    { expiresAt: new Date(daysFrom(3)).toISOString(), amount: '6.00' },
  ], NOW)
  assert.deepEqual(mixed.map(row => row.amount), ['6.00', '5.00'], 'soonest first')
})

test('an already-expired date is not reported as expiring', () => {
  const past = expiringBonuses([{ expiresAt: new Date(NOW - 86_400_000).toISOString(), amount: '5.00' }], NOW)
  assert.deepEqual(past, [])
})
