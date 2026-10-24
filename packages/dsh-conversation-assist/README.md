# dsh-conversation-assist

A short factual recap after each turn, and an optional next-message suggestion you can send as a
draft. Recaps use no model call; suggestions are off by default and send one small auxiliary request
per completed turn.

## What it does

**Turn recap.** After a turn closes, a secondary-ink sentence appears below the last message and above
the action row. It carries the opening paragraph of the final reply, so a completed turn reads as
work rather than a count, and names how the turn ended when it did not complete — stopped, blocked,
failed, truncated, or closed during recovery. Tool counts and failure tallies are deliberately not
shown. The copy never claims a task is done, deployed, or published when the turn only closed.
Recaps are derived in the browser from the loaded Session events, so every loaded Turn carries one,
including after a restart, and they need no network and make no model request.

**Next suggestion.** When enabled, a completed turn may place one suggestion above the composer, in
the input zone: the text, a small **↙** insert control, **Send**, and a dismiss control. Send places
the suggestion in the draft and submits it; ↙ only inserts it as an editable draft; nothing else is
sent. The row exists only while the composer is empty, ordinary, idle and
free of attachments or reference chips; it disappears as soon as you type, attach something, send,
switch model, or close the plugin, and returns immediately from the retained candidate when the
composer is empty again. Switching Session only hides it: coming back shows the same
suggestion without a second model call. Switching the model consumes that Turn, because the
suggestion belongs to the route that produced it.

The row is above the composer card, not inside the editor, so it uses a lightbulb marker and an
explicit Send control instead of accepting inline. The public composer contract exposes the dock,
but not an editor-inline decoration; drawing ghost text over the editor would depend on host
internals, so that remains an upstream request rather than part of this plugin.

The Settings row's label carries the plugin's lightbulb marker. The shell renders `label` as React
children and falls back to the settings gear per section id; the plugin's stylesheet hides that
glyph only in its own row and lays the marker in the gear's seat, so every other row keeps the
shipped icon.

## Install

```bash
dsh plugin --profile <profile> add "link:/absolute/path/to/packages/dsh-conversation-assist"
```

Restart DSH after installing or rebuilding; a profile applies its bundle list at startup. The plugin
adds one row to the plugin list and one **Conversation assist** page in Settings. It does not replace
a shipped component or occupy another package's single-occupant slot. Both plugin routes are served
only to the profile owner; another viewer receives 403 and simply sees no suggestions.

To remove it, use `dsh plugin --profile <profile> remove dsh-conversation-assist`, then restart. The
settings and audit files described below are plugin-owned state and are left in place; delete that
directory to discard them.

## Settings

| Setting | Default | Effect |
|---|---|---|
| Turn recap | On | Every loaded turn closes with a recap, including turns replayed after a restart. Turning it off hides all recaps; turning it back on shows them again. |
| Next-suggestion | Off | No row and no request while off. When on, every completed turn may send one auxiliary model request. |

Changes apply immediately and survive a restart. The plugin registers no composer shortcuts: Send
sends the suggestion, the dismiss control hides it, and `Shift+Tab` stays focus navigation. Use the
Send control rather than inserting the hint into the editor.

## Cost and audit

Turning suggestions on sends **one extra model request per completed turn** (at most one; cached per
turn). **That request does not appear on the DSH usage page** — the Host records usage only from
Session events, and an auxiliary request writes none. The plugin does not show or estimate any
currency amount, and it does not describe the feature as free.

The plugin keeps its own audit trail, without message content:

```
$DSH_HOME/dsh-conversation-assist/audit.jsonl
```

Each line carries the time, Session, turn, `endSeq`, provider/model, message count and input bytes,
the output-token cap, the finish reason, the output length, duration, token usage and an error code.
It never contains prompts, drafts, tool output, or the suggestion text. The file rotates once at 1
MiB, keeping `audit.jsonl` and one previous file. If the audit directory is not writable the audit row is
dropped with a single warning and suggestions keep working. A failed settings write returns an
error, the toggle rolls back, and the page shows an inline error; only an unreadable settings
document falls back to the in-memory defaults.

Settings live next to it in `settings.json`. Both files are shared by every browser connected to this
Host.

## Limits

- Facts-only recap: no semantic summary mode in this version.
- Suggestions only after `completed` turns, never after stop, block, error, truncation or a resumed
  fork; only the main Session, never a subagent.
- No suggestion backfill: a Turn completed before the Host plugin started shows no suggestion. Recaps
  rebuild from the loaded Session events for every Turn, including after a restart.
- No tools, no `followup` / `inject`, and no Session writes: the auxiliary request is logged only in
  the plugin's audit file.
- The suggestion never reads an unsent draft; only the ↙ insert or Send writes it into the draft,
  and Send also submits it. It never uses the clipboard.

## Development

```bash
node scripts/build.mjs dsh-conversation-assist   # rebuild lib/
node --test packages/dsh-conversation-assist/test/*.test.mjs
```

The package has no runtime dependencies beyond the modules DSH already provides; `src/` is the source
and `lib/` is generated.
