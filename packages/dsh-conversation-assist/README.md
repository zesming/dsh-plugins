# dsh-conversation-assist

A short factual recap after each turn, and an optional next-message suggestion you can accept as a
draft. Recaps use no model call; suggestions are off by default and send one small auxiliary request
per completed turn.

## What it does

**Turn recap.** After a turn closes, one or two secondary-ink sentences appear below the last message
and above the action row. They name the tool calls and their outcomes, how the turn ended — completed,
stopped, blocked, failed, truncated, or closed during recovery — and the first sentence of the final
reply, so a completed turn reads as work rather than a count. A tool result is only "confirmed" when a non-error result arrived; a call with no result
stays pending. The copy never claims a task is done, deployed, or published when the turn only
closed. Recaps are derived in the browser from the loaded Session events, so they need no network and
make no model request, and they are not backfilled for turns that ended before the plugin started.

**Next suggestion.** When enabled, a completed turn may place one suggestion above the composer, in
the input zone: the text, the `Tab` / `→` hint, an **Accept** control, and a dismiss control. Accepting turns the whole
suggestion into an editable draft and nothing more; the draft is never sent automatically, and one
undo returns to the empty draft. The row exists only while the composer is empty, ordinary, idle and
free of attachments or reference chips; it disappears as soon as you type, attach something, send,
switch model, or close the plugin. Switching Session only hides it: coming back shows the same
suggestion without a second model call. Switching the model consumes that Turn, because the
suggestion belongs to the route that produced it.

The row is above the composer card, not inside the editor. Inline ghost text needs a host-level
composer suggestion interface that this plugin does not have; that is tracked separately.

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
| Turn recap | On | New turns close with a recap. Turning it off leaves the transcript and composer unchanged, and turning it back on starts with the next turn — turns that ended while it was off stay without one. |
| Next-suggestion | Off | No row, no request, and no key handling while off. When on, every completed turn may send one auxiliary model request. |

Changes apply immediately and survive a restart. There is no second shortcut configuration: `Tab`,
`→` and a click accept, `Esc` or the dismiss control hide the row for that turn, and `Shift+Tab`
always remains focus navigation.

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
- No backfill: turns that ended before the plugin started show no recap or suggestion.
- No tools, no `followup` / `inject`, and no Session writes: the auxiliary request is logged only in
  the plugin's audit file.
- The suggestion never reads an unsent draft and never enters the draft, clipboard, or send payload
  before you accept it.

## Development

```bash
node scripts/build.mjs dsh-conversation-assist   # rebuild lib/
node --test packages/dsh-conversation-assist/test/*.test.mjs
```

The package has no runtime dependencies beyond the modules DSH already provides; `src/` is the source
and `lib/` is generated.
