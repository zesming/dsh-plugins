# Manual checklist

Run in a real DSH window, after installing the package and restarting. The
automated suite cannot cover focus, the real keyboard layer, theme tokens, or a
resident Host.

1. Install into a profile, restart, open the plugin list. A `dsh-conversation-assist`
   row appears, and Settings has a **Conversation assist** page with two switches.
2. With the defaults (recap on, suggestion off), complete a short turn. A recap
   appears below the last message, in secondary ink, with no suggestion row. No
   extra request is made.
3. Turn the suggestion switch on. Complete another turn. A row appears under the
   composer: `↳` + text + `Tab` / `→` + **Accept** + close.
4. Press `Tab`; the whole text becomes the draft and focus stays in the composer.
   Press `Cmd/Ctrl+Z` once; the draft is empty again. Click **Accept** in a second
   turn; same result, and a text selection elsewhere in the transcript does not
   block the click.
5. Press `Esc` (or the close control) on a visible row; it disappears and does not
   come back for that turn. `Shift+Tab` still moves focus backward.
6. Type a character, attach a file, add a reference chip, or queue a message while
   a row is visible; the row hides. Clear the input; the same row returns without a
   new model call (check the audit count).
7. Switch to another Session and back; the same row may return. Switch the model;
   the row disappears and does not return for that turn. Send a message; the row
   disappears and does not return for that turn.
8. Exercise the recap endings: stop a turn, make a request fail (offline/provider
   error), trigger a permission block, and a truncated turn. Each shows the
   matching sentence, never "task completed" unless the turn completed; an empty
   reply gets the neutral no-progress line.
9. Toggle recap off, complete a turn, toggle it back on. The turn completed while
   off has no recap; the next turn does. Restart; both switches keep their values
   and old turns get no new recap.
10. Make the settings directory read-only and toggle a switch. The row disables
    while saving, then rolls back with an inline error; the other row and the
    composer are unaffected.
11. Dark theme, 125% zoom, and a narrow window: the row keeps one line, hides the
    keycaps when narrow, and the text ellipsizes; a 400-character recap wraps,
    never scrolls horizontally, and does not cover the composer.
12. With a screen reader, the recap reads once as a paragraph (no live region);
    the suggestion is one named group, the keycaps are not announced, and Accept
    and Close have readable names.
13. Open `$DSH_HOME/dsh-conversation-assist/audit.jsonl`. Each suggestion attempt
    has one line with time, Session, turn, provider/model, token counts and output
    length; there is no message text, draft, or tool output. A cache hit adds no
    line. A 1 MiB file rotates to one previous file.
14. Remove the package, restart. No row, section, key handling, or spacer remains.
    The settings and audit files stay until you delete the directory by hand.
