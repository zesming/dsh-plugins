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
- Reaching into another package's rendering needs a reason and a narrow rule. Two cases exist today:
  a settings section's nav glyph, which the shell chooses by section id with no option for third-party
  sections. The plugin marks its own label and hides the shell's fallback glyph **in that row only**,
  keyed on structure and its own marker — never on a class token the shell hashes per build. Any such
  rule must be conditional on something only this plugin emits.
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

Plain, imperative, and scoped to the package: `deepseek-usage: fix weekly cell geometry`.

Body text explains the cause, not only the change: what was observed, why it happened, and what the
fix assumes. A future reader debugging the same area needs the reasoning more than the diff.
