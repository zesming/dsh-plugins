import assert from 'node:assert/strict'
import test from 'node:test'

import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/ui/balance-row.js', import.meta.url), 'utf8')

test('the row re-checks sooner while no account is known', () => {
  // The row cannot render until a credential exists, and a sign-in from another
  // surface does not remount this component. A single slow interval would leave
  // the sidebar looking signed out for minutes after a successful login.
  assert.match(source, /SIGNED_OUT_POLL_MS\s*=\s*\d+/)
  // Match on the assignment target, not a substring: `POLL_MS` also matches
  // inside `SIGNED_OUT_POLL_MS`, which would compare the same number twice.
  // The declarations are expressions (`5 * 60_000`), so evaluate the whole
  // right-hand side rather than just its first number.
  const valueOf = name => {
    const match = new RegExp(`const \\b${name}\\b\\s*=\\s*([^\\n]+)`).exec(source)
    assert.ok(match, `${name} must be declared`)
    const expression = match[1].replace(/\/\/.*$/, '').replace(/[\d_]+/g, digits => String(Number(digits.replace(/_/g, ''))))
    const value = Function(`return (${expression})`)()
    assert.equal(typeof value, 'number', `${name} must be a number`)
    return value
  }
  const signedOut = valueOf('SIGNED_OUT_POLL_MS')
  const normal = valueOf('POLL_MS')
  assert.ok(signedOut < normal, `signed-out ${signedOut} must be shorter than ${normal}`)
  assert.ok(signedOut <= 30_000, 'a signed-in row should appear within half a minute')
})

test('the interval follows the last answer, not a fixed timer', () => {
  // A fixed interval cannot do both jobs: fast enough to catch a login, and
  // cheap enough not to hammer Platform for an answer that barely changes.
  assert.match(source, /if \(proved\) \{\s*signedIn\.current = true/)
  assert.match(source, /signedIn\.current \? POLL_MS : SIGNED_OUT_POLL_MS/)
})

test('a proven account stays mounted for a transient failure but signs out cleanly', () => {
  // Explicit no-credential / absent account service is a real sign-out: forget
  // prior proof and URL and show the raw payload (row hides).
  assert.match(source, /const signedOut = payload\?\.signedIn === false\s*\n?\s*&& \(payload\.error === null \|\| payload\.error === 'account-unavailable'\)/)
  assert.match(source, /if \(signedOut\) \{[\s\S]*?signedIn\.current = false[\s\S]*?topUpUrl\.current = null/)
  // Only a transient (network/http/malformed) failure after a prior proof keeps
  // the row mounted on the unavailable sub-state.
  assert.match(source, /else if \(signedIn\.current\) \{[\s\S]*?signedIn: true,[\s\S]*?available: false,[\s\S]*?error: typeof payload\?\.error === 'string' \? payload\.error : 'network'/)
})

test('top up opens the host-provided official URL and the item hides without one', () => {
  assert.match(source, /payload\.topUpUrl/)
  assert.match(source, /window\.open\(topUpHref, '_blank', 'noopener'\)/)
  assert.match(source, /topUpHref === null \? \[\] : \[/)
  assert.ok(!source.includes('__DSH_USAGE_TOP_UP_URL__'), 'the dead global switch is gone')
})

test('a window focus re-reads the balance', () => {
  // Signing in happens in a browser window; coming back to the app is the
  // moment the person expects the row to be there.
  assert.match(source, /addEventListener\('focus'/)
  assert.match(source, /removeEventListener\('focus'/)
})

test('every listener and timer is released on unmount', () => {
  const cleanup = source.slice(source.indexOf('return () =>'), source.indexOf('}, [load, open])'))
  assert.match(cleanup, /clearTimeout/)
  assert.match(cleanup, /removeEventListener\('visibilitychange'/)
  assert.match(cleanup, /removeEventListener\('focus'/)
})
