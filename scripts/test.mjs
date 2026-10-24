/** Run every package's `node --test` suites without relying on shell globbing. */

import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const packages = await readdir(path.join(root, 'packages'), { withFileTypes: true })
const files = []
for (const entry of packages) {
  if (!entry.isDirectory()) continue
  const dir = path.join(root, 'packages', entry.name, 'test')
  let names
  try {
    names = await readdir(dir)
  } catch {
    continue
  }
  for (const name of names.sort()) {
    if (name.endsWith('.test.mjs')) files.push(path.join(dir, name))
  }
}
if (files.length === 0) {
  console.error('no test files found under packages/*/test')
  process.exit(1)
}
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
process.exit(result.status ?? 1)
