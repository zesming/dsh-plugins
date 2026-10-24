# Manual checklist

Run in a real DSH window, after installing the package and restarting. The
automated suite cannot cover focus, the real keyboard layer, theme tokens, or a
resident Host.

1. Install into a profile, restart, open the plugin list. A `dsh-conversation-assist`
   row appears, and Settings has a **Conversation assist** page with two switches and one usage
   sentence. Its nav row shows a lightbulb, not the gear; the rest of the Settings rows keep their
   shipped icons; there is no diagnostic line.
2. With the defaults (recap on, suggestion off), complete a short turn. A recap
   appears below the last message, in secondary ink, with no suggestion row. No
   extra request is made.
3. Turn the suggestion switch on. Complete another turn. A row appears above the
   composer: a lightbulb, the text, **↙**, **Send**, and close.
4. Click **↙**; the text becomes an editable draft and is not sent; the caret is at
   the end of the inserted text, and typing appends (does not jump to the front).
   Clear it.
   Click **Send** in a second turn; the text is placed in the draft and submitted
   as a normal turn; no draft is left behind. A text selection elsewhere in the
   transcript does not block either click.
5. Click the close control on a visible row; it disappears and does not come back
   for that turn. `Shift+Tab` still moves focus backward.
6. Type a character, attach a file, add a reference chip, or queue a message while
   a row is visible; the row hides. Clear the input; the same row returns without a
   new model call (check the audit count).
7. Switch to another Session and back; the old session's text must not appear, and the new session's
   row returns from the Host cache without a new model call or audit line. Switch the model;
   the row disappears and does not return for that turn. Send a message; the row
   disappears and does not return for that turn.
8. Exercise the recap endings: stop a turn, make a request fail (offline/provider
   error), trigger a permission block, and a truncated turn. Each shows the
   matching sentence, never "task completed" unless the turn completed; an empty
   reply gets the neutral no-progress line.
9. Toggle recap off; every recap hides. Toggle it back on; every loaded main-session turn shows
   its recap again. Restart; both switches keep their values and every loaded main-session turn
   still shows a recap. A subagent task gets no recap and no suggestion row/request.
10. Make the settings directory read-only and toggle a switch. The row disables
    while saving, then rolls back with an inline error; the other row and the
    composer are unaffected.
11. Dark theme, 125% zoom, and a narrow window: the row keeps one line and the text
    ellipsizes; a 400-character recap wraps, never scrolls horizontally, and does
    not cover the composer. Check the lightbulb row in the Settings nav at the same
    sizes, and the strip's alignment in the hero, docked, and embedded composer
    variants (it must sit on the card's optical left/right edge). Switch UI language
    zh/en; settings copy and suggestion labels update.
12. With a screen reader, the recap reads once as a paragraph (no live region);
    the suggestion is one named group, the lightbulb is decorative, and ↙, Send and
    Close have readable names. Tab to each button and press Enter: focus returns to
    the composer, not the page body.
13. In DevTools → Network, a suggestion request goes to
    `/api/dsh-conversation-assist.rpc` and returns 200; the old
    `.next` and `.debug` return 404; if a non-owner API peer is available,
    `.rpc` gets 403. The DSH usage page shows no new row for the
    auxiliary requests. With 2 concurrent suggestions running, a third Turn gets
    no row and no model call; after 50 attempts in one Session/local day, the same
    happens, all silently.
14. Open `$DSH_HOME/dsh-conversation-assist/audit.jsonl`. Each attempt that
    reaches the model has one line with time, Session, turn, prompt version,
    provider/model, token counts and output length; early returns (no LLM, no
    route, empty history) may add none. There is no message text, draft, or tool
    output. A cache hit adds no line. A 1 MiB file rotates to one previous file.
15. Remove the package, restart. No row, section, key handling, or spacer remains.
    The settings and audit files stay until you delete the directory by hand.
