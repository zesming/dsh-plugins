/**
 * Publish a package to a registry that requires a scope, without renaming it
 * in this repository.
 *
 * Some registries refuse an unscoped package outright. The packages in
 * `packages/*` keep their unscoped names for the public registry, so this script
 * derives a scoped copy in a temporary directory and publishes that. The
 * checkout is never modified.
 *
 * A scope changes three identifiers the loader resolves, not just the manifest:
 * the package name, the row `name` in `cordis.patch.yml`, and the factory id in
 * `lib/client.js`. Renaming only the manifest installs a bundle whose browser
 * half registers a module id the boot graph never asks for, which fails at page
 * load rather than at install.
 *
 * Usage:
 *   node scripts/publish-scoped.mjs <package> <scope> [--dry-run] [--registry <url>]
 *
 * Examples:
 *   node scripts/publish-scoped.mjs dsh-usage-bill @your-scope --dry-run
 *   node scripts/publish-scoped.mjs dsh-usage-bill @your-scope
 */

import { execFile } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Repository root. */
const root = path.resolve(import.meta.dirname, '..')

/** Default registry: the public one. */
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/'

/** Split argv into positional words and the two flags this script accepts. */
function parseArguments(argv) {
  const positional = []
  let dryRun = false
  let registry = DEFAULT_REGISTRY
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--dry-run') dryRun = true
    else if (argument === '--registry') {
      const value = argv[index + 1]
      if (value === undefined) throw new Error('--registry needs a URL')
      registry = value
      index += 1
    } else if (argument.startsWith('--registry=')) registry = argument.slice('--registry='.length)
    else if (argument.startsWith('-')) throw new Error(`unknown flag: ${argument}`)
    else positional.push(argument)
  }
  return { positional, dryRun, registry }
}

/**
 * Read a file or throw a message naming the package, so a missing artifact
 * reads as a build problem rather than a publish problem.
 * @param file - absolute path.
 * @param why - what the file is for.
 * @returns its text.
 */
async function readOrFail(file, why) {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    throw new Error(`${path.relative(root, file)} is required to publish (${why}); run \`npm run build\` first: ${String(error)}`)
  }
}

const { positional, dryRun, registry } = parseArguments(process.argv.slice(2))
if (positional.length !== 2) throw new Error('usage: node scripts/publish-scoped.mjs <package> <scope> [--dry-run] [--registry <url>]')
const [packageName, scope] = positional
if (!/^@[a-z0-9][a-z0-9._~-]*$/.test(scope)) throw new Error(`not a scope: ${scope}; expected something like @team`)

const source = path.join(root, 'packages', packageName)
if (!existsSync(path.join(source, 'package.json'))) throw new Error(`no such package under packages/: ${packageName}`)

const manifestPath = path.join(source, 'package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (manifest.name !== packageName) throw new Error(`${packageName}: manifest name is ${String(manifest.name)}; the directory and the name must agree`)
if (manifest.private === true) throw new Error(`${packageName}: still private; remove "private" before publishing`)

// The scoped name takes the package's own unscoped tail, so the published name
// keeps the words a person searches for.
const scopedName = `${scope}/${packageName}`

const workspace = await mkdtemp(path.join(tmpdir(), `dsh-publish-${packageName}-`))
const target = path.join(workspace, 'package')

try {
  // Copy exactly what ships, plus the manifest; `files` decides what npm keeps.
  await cp(source, target, {
    recursive: true,
    filter: (entry) => !entry.split(path.sep).includes('node_modules') && !entry.split(path.sep).includes('src') && !entry.split(path.sep).includes('test'),
  })

  const patchPath = path.join(target, 'cordis.patch.yml')
  const clientPath = path.join(target, 'lib', 'client.js')
  const hostPath = path.join(target, 'lib', 'index.js')
  const patch = await readOrFail(patchPath, 'the bundle patch names the row')
  const client = await readOrFail(clientPath, 'the browser half registers its module id')
  await readOrFail(hostPath, 'the Host entry is the bundle itself')

  // Rewrite only the identity strings, never a comment about the public name.
  // The row `id` is a profile-local handle the loader never resolves, so it
  // keeps its unscoped spelling; rewriting it would also need YAML quoting,
  // because a `@`-leading scalar is not a valid plain scalar.
  const scopedPatch = patch.replace(
    new RegExp(`(\\bname:\\s*)(['"])${packageName}\\2`, 'g'),
    (_, before, quote) => `${before}${quote}${scopedName}${quote}`,
  )
  if (!scopedPatch.includes(scopedName)) throw new Error(`${packageName}: cordis.patch.yml never mentions the package name; refusing to publish a row that would not resolve`)

  // The factory id is the first `id: "<name>"` the bundle registers; the boot
  // graph looks it up by the specifier without `/client`, which is the scoped name.
  const factoryPattern = new RegExp(`(\\bid:\\s*)['"]${packageName}['"]`)
  if (!factoryPattern.test(client)) throw new Error(`${packageName}: lib/client.js does not register "${packageName}"; run \`npm run build\` before publishing`)
  const scopedClient = client.replace(factoryPattern, (_, before) => `${before}${JSON.stringify(scopedName)}`)

  const scopedManifest = {
    ...manifest,
    name: scopedName,
  }

  await writeFile(patchPath, scopedPatch)
  await writeFile(clientPath, scopedClient)
  await writeFile(path.join(target, 'package.json'), `${JSON.stringify(scopedManifest, null, 2)}\n`)

  // A publish that leaves the old name in a field the loader resolves produces
  // a bundle that installs and then fails to load, so check each one.
  // `cordis.patch.yml` is checked on its `name` value only: its `id` is a
  // profile-local handle, not a specifier.
  const unresolved = []
  if (!/^\s*-?\s*name:\s*['"]?@/mu.test(scopedPatch)) unresolved.push('cordis.patch.yml row name')
  if (!scopedClient.includes(JSON.stringify(scopedName))) unresolved.push('lib/client.js factory id')
  if (scopedManifest.name !== scopedName) unresolved.push('package.json name')
  if (unresolved.length > 0) throw new Error(`${packageName}: these still name the unscoped package: ${unresolved.join(', ')}`)

  const args = ['publish', '--registry', registry]
  if (dryRun) args.push('--dry-run')
  process.stdout.write(`publishing ${scopedName} from ${path.relative(root, source)} (registry ${registry}${dryRun ? ', dry run' : ''})\n`)
  try {
    const { stdout, stderr } = await run('npm', args, { cwd: target, maxBuffer: 32 * 1024 * 1024 })
    process.stdout.write(stdout)
    if (stderr.trim() !== '') process.stdout.write(stderr)
  } catch (error) {
    process.stderr.write(`${error.stdout ?? ''}${error.stderr ?? ''}`)
    throw new Error(`${scopedName}: npm publish failed with exit ${String(error.code)}`)
  }
} finally {
  await rm(workspace, { recursive: true, force: true })
}
