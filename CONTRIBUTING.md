# Contributing

## Adding a plugin

1. Create `packages/<package-name>/` with the files listed in the root README's conventions table.
2. Keep the package name identical to the factory id in `lib/client.js` and to the row name in
   `cordis.patch.yml`; the loader resolves all three.
3. Add pure functions for anything that computes a value, and a `node --test` suite beside them.
4. Add `locale/zh.json` and `locale/en.json` with a `meta.title` and `meta.description`.
5. Run `node scripts/build.mjs` and `node --test packages/*/test/`.

## Working rules

- Never write into a profile by hand: `dsh plugin --profile <name> add|remove` owns
  `package.json`, the bundle list, and the lockfile.
- A plugin may read DSH services but must not patch another package's files or DOM.
- Every user-visible string goes through the plugin's own dictionary, in both languages.
- Numbers that a person acts on must come from a recorded fact, never from an estimate: a
  fabricated figure in a spend or balance view is worse than a blank.

## Commit messages

Plain, imperative, and scoped to the package: `deepseek-usage: fix weekly cell geometry`.
