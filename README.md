# dsh-plugins

Community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).

This repository is a monorepo: every plugin lives in its own package under `packages/`, so one
checkout can hold many small, independently installable features while sharing a build script,
a test runner, and a set of conventions.

```
packages/
  dsh-deepseek-usage/     DeepSeek account balance and a token-usage heatmap
scripts/
  build.mjs               builds every package's Host entry and browser bundle
```

## Install a plugin

Plugins are installed into a DSH profile. From any directory:

```bash
dsh plugin --profile <profile> add "link:/absolute/path/to/packages/dsh-deepseek-usage"
```

`link:` keeps the profile pointed at your checkout, so rebuilding the package and restarting DSH
picks up your changes. For a published package the same command takes the package name.

The profile whose bundle list gains the plugin is the one you have to boot again; DSH applies
profile changes at startup for the Desktop profile.

## Plugin conventions

Every package follows the same shape, because that is what DSH's loader expects:

| File | Purpose |
|---|---|
| `package.json` | `dsh.bundle.patch` names the patch file; `dsh.client` declares the browser half |
| `cordis.patch.yml` | one `insert` row naming the package |
| `lib/index.js` | Host entry: an ES module exporting `apply(ctx)` |
| `lib/client.js` | Browser bundle: one `window.__ModuleLoader__.load()` factory |
| `src/` | sources; `lib/` is generated |
| `test/` | `node --test` suites over the pure logic |
| `locale/*.json` | display title and description for the plugin list, per language |

Two rules matter more than the rest:

- **Do not replace a shipped component.** A plugin contributes new seats; it does not occupy a
  single-occupant slot a shipped package already owns, because that breaks the product on upgrade.
- **Keep display logic pure and tested.** Host code folds data; the browser formats and draws it.
  Everything that decides a number lives in a function that a test can call without a browser.

## Build

```bash
pnpm install     # only needed for workspace tooling
node scripts/build.mjs
```

The build uses [Bun](https://bun.sh) as its bundler; it must be on `PATH`.

## Test

```bash
node --test packages/*/test/
```

## License

MIT — see [LICENSE](LICENSE).
