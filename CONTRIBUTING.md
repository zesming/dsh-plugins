# Contributing

## Adding a plugin

1. Create `packages/<package-name>/` with the files listed in the root README's conventions table.
2. Keep the package name identical to the factory id in `lib/client.js` and to the row name in
   `cordis.patch.yml`; the loader resolves all three.
3. Add pure functions for anything that computes a value, and a `node --test` suite beside them.
4. Add `locale/zh.json` and `locale/en.json` with a `meta.title` and `meta.description`.
5. Run `npm run check`.

## Working rules

- Never write into a profile by hand: `dsh plugin --profile <name> add|remove` owns
  `package.json`, the bundle list, and the lockfile.
- Do not replace a shipped component or claim a slot another package already occupies. Contribute a
  new seat instead.
- A settings section contributes its nav glyph through the `settings.section.icon` slot, registered
  with the same `id` as its `settings.section` entry. The component only owns the glyph (it receives
  `size`/`active`); the shell owns the button, label, and fallback gear. Do not hide or override the
  shell's glyph with structural CSS: the slot is the supported seam and survives shell DOM changes.
- Take host UI primitives (`Menu`, `SegmentedControl`, `Switch`, icons) from the shared module table
  and declare them under `dsh.client.external`. A bundled second copy loses theme tokens and focus
  rings.
- Install stylesheets for the plugin's lifetime with `ctx.effect`, not from a component. A seat the
  plugin only marks is visible before its page is ever opened.
- Every user-visible string goes through the plugin's own dictionary, in both languages.
- Numbers that a person acts on must come from a recorded fact, never from an estimate: a
  fabricated figure in a spend or balance view is worse than a blank.
- Rebuild `lib/` before committing. A generated artifact that does not match `src/` is worse than a
  missing one, because it looks authoritative.

## Commit messages

Plain, imperative, and scoped to the package: `usage-bill: fix weekly cell geometry`.

Body text explains the cause, not only the change: what was observed, why it happened, and what the
fix assumes. A future reader debugging the same area needs the reasoning more than the diff.
