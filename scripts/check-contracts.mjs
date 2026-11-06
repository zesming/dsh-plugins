/**
 * Contract alignment check for the DSH host surface these plugins depend on.
 *
 * Two checks:
 *   1. Always: every slot name, composer attribute, and input action in the
 *      fixture is actually referenced by the plugin that claims it, so a
 *      rename in one place desyncs loudly here instead of at runtime.
 *   2. Optional host check with `--asar <extracted app.asar dir>`: confirm the
 *      host bundles still expose each slot string and the turnTail owner shape
 *      (rich Turn + seq). Run after extracting the app, e.g.
 *      npx @electron/asar extract "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar" /tmp/dsh
 *      node scripts/check-contracts.mjs --asar /tmp/dsh/dsh
 *
 * This is a smoke check for renames/removals, not a behavioral verification.
 *
 * @module
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const contractsPath = join(root, 'scripts', 'contracts', 'dsh-contracts.json')
const contracts = JSON.parse(readFileSync(contractsPath, 'utf8'))

/** Read one file as text, returning '' when it is absent. */
const readOrEmpty = path => (existsSync(path) ? readFileSync(path, 'utf8') : '')

/** Concatenate a package's client source (the surface that consumes slots). */
function clientSource(pkg) {
  return readOrEmpty(join(root, 'packages', pkg, 'src', 'client.js'))
}
function allSource(pkg) {
  const base = join(root, 'packages', pkg, 'src')
  let out = ''
  const walk = dir => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(js|mjs)$/.test(entry)) out += readFileSync(path, 'utf8')
    }
  }
  if (existsSync(base)) walk(base)
  return out
}

const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }

/* 1. Plugin source stays aligned with the fixture. */
for (const slot of contracts.slots) {
  for (const pkg of slot.usedBy ?? []) {
    const src = clientSource(pkg)
    check(src.includes(slot.name), `${pkg}: does not reference slot "${slot.name}"`)
  }
}
const assistSource = allSource('dsh-session-assist')
for (const attr of contracts.composerAttributes) {
  check(assistSource.includes(attr), `dsh-session-assist: missing composer attribute ${attr}`)
}
for (const action of contracts.inputActions) {
  check(assistSource.includes(action), `dsh-session-assist: missing input action ${action}`)
}
for (const hook of contracts.sessionHooks) {
  check(assistSource.includes(hook), `dsh-session-assist: missing session hook ${hook}`)
}

/* 2. Optional host presence check against an extracted app.asar. */
const asarArgIndex = process.argv.indexOf('--asar')
if (asarArgIndex !== -1) {
  const asar = resolve(process.argv[asarArgIndex + 1] ?? '')
  const packagesDir = join(asar, 'node_modules', '@deepseek-ai')
  check(existsSync(packagesDir), `host packages dir not found: ${packagesDir}`)
  if (existsSync(packagesDir)) {
    const bundles = []
    for (const name of readdirSync(packagesDir)) {
      const lib = join(packagesDir, name, 'lib')
      if (!existsSync(lib)) continue
      for (const file of readdirSync(lib)) {
        if (file.endsWith('.js')) bundles.push(readFileSync(join(lib, file), 'utf8'))
      }
    }
    const hostText = bundles.join('\n')
    for (const slot of contracts.slots) {
      check(hostText.includes(`"${slot.name}"`) || hostText.includes(`'${slot.name}'`),
        `host: slot string "${slot.name}" not found`)
    }
    for (const event of contracts.hostEvents) {
      check(hostText.includes(`"${event}"`), `host: event "${event}" not found`)
    }
    // turnTail hands occupants the rich Timeline Turn (node.location.turn) plus
    // a closing seq; facts live on that turn's data store. This is a presence
    // smoke check - the exact shape is pinned in dsh-contracts.json.
    check(
      hostText.includes('renderSlot("conversation.chat.turnTail"') && hostText.includes('seq:'),
      'host: turnTail renderSlot no longer carries { turn, seq }',
    )
    check(hostText.includes('turnDataSource'), 'host: nodes.turnDataSource API not found')
    check(hostText.includes('topUpUrl'), 'host: account state no longer exposes links.topUpUrl')
  }
} else {
  console.log('(skip host check: pass --asar <extracted app.asar dir> to verify host exposure)')
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`✖ ${failure}`)
  process.exit(1)
}
console.log('contract alignment OK')
