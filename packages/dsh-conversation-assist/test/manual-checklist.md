# Manual validation checklist

Use a real DSH window with the planned host version after the package is
installed and restarted. The synthetic semantic cases are in
[quality-cases.json](./quality-cases.json); use those as human-rated model
examples. A mocked request or structural assertion does not establish summary
or suggestion quality.

1. Open Conversation assist settings. Confirm **Show recaps** is on and
   **Next suggestion** is off. The intro says settings take effect immediately
   and persist after restart. The usage note says both share at most one
   auxiliary request per turn and disclose the small added usage.
2. Complete a normal turn with a multi-paragraph reply. Confirm the tail shows
   **Recap:** before the complete model recap, preserves the result, completed checks,
   limitations and undecided items that matter, and wraps the whole generated
   text without clipping. A tool call or normal turn ending alone must not be
   described as proof that the task completed. Delay the recap response and
   confirm **Generating smart recap…** stays visible until the request resolves.
   For a ready response with `persisted: false`, confirm a localized note says
   the recap may be unavailable after restart. A clearly brief final reply has
   no extra recap row or recap request. If the model declines to recap a longer
   reply, confirm the UI does not substitute a reply excerpt.
3. Stop a turn, trigger a block, provider error and output truncation. Confirm
   each retains its actual ending status, shows **Reply excerpt**, and makes no
   auxiliary request. The excerpt disclosure expands to every retained text
   block; reasoning and tool-call content are absent. If the source reply is
   longer than the client excerpt bound, the note names the limit and points to
   the full reply above.
4. Open an uncached historical turn and one with an existing cached recap.
   Confirm the uncached turn says **Historical turn · Reply excerpt** without a
   model request, while the matching cached recap appears only when its
   `sessionId`, turn, `turn.end.seq`, and reply fingerprint match.
5. Use [quality-cases.json](./quality-cases.json) with synthetic records. Rate
   whether the recap preserves corrected intent, results, verification,
   limitations and approval boundaries. Check that a no-next-step case stays
   empty and the real plugin-development case is not filtered by its wording.
   Record semantic misses separately from automated structural results.
6. Enable **Next suggestion** and finish a turn with an explicit follow-up.
   Confirm the tucked card appears above the composer, aligned to its width,
   with the lightbulb, the fully wrapped candidate, a named arrow **Fill into
   chat** control, a visible **Send** button, and a named close control. The
   controls stay reachable at narrow widths. A completed task with no explicit
   follow-up has no row or placeholder.
7. Click **Fill into chat**, edit the inserted prompt, then send it using the
   host's normal send control. Confirm insertion does not send, the caret is at
   the end, typing appends, and one undo removes the insertion. On a fresh
   candidate, click its **Send** button and confirm it uses the standard DSH
   submission path and consumes that candidate. If the guarded editor insertion
   is refused or its revision changes, confirm Send does not submit. A failed
   standard submission keeps DSH's restored draft without a second overwrite.
   Clicking close consumes the candidate for the turn.
8. With a visible candidate, confirm Tab and Shift+Tab keep native browser
   focus navigation, Escape closes the candidate, and Enter keeps host
   behavior. Verify repeat, composition, or default-prevented key events do not
   consume a key. Another Session's editor, a modal, a disabled or inert/
   read-only editor, a hidden seat, an occupied composer, and another composer
   seat cannot accept or send this row's candidate through its controls.
9. Type then clear draft text, add/remove an attachment and reference, and add
   or clear a queued message. The candidate may hide and return for the same
   unconsumed turn without a second model generation. During submission,
   command claim, pending submission, first-turn wait, or running state, it is
   consumed and must not return.
10. With a Chinese IME, start and finish composition while the row is visible.
    Confirm the row hides for the composition and Tab/Escape continue to the
    host unchanged. No document capture listener should block IME input, and
    Send must not submit while composition is active.
11. Delay a suggestion read, start a new turn or switch Session/model before
    it resolves, and confirm the late result never appears or fills a draft.
    Repeat with a quick running transition that ends before React can render
    the running state. Toggle suggestions off and back on; the consumed turn
    stays consumed.
12. Verify settings migration from an older saved record with
    `semanticRecap: false`: recap and suggestion values survive, recap stays
    enabled when its own preference is on, and the retired field is omitted
    from the next saved document. Turn recaps off while suggestions are off and
    confirm no auxiliary request starts; turn suggestions on and confirm they
    still work while recaps remain off. Force a save failure and confirm only
    the changed switch rolls back, its pending state clears, and the inline
    error is localized.
13. Inspect the Network panel: suggestion reads use
    `/api/dsh-conversation-assist.rpc` with `{sessionId, turn, endSeq}`;
    recap reads use `/api/dsh-conversation-assist.recap` with the same identity
    plus `replyHash`. Verify recap-off with suggestions off starts no request,
    suggestions still work independently when enabled, historic reads do not
    generate, and no request includes draft text or attachments.
14. Check light and dark themes, narrow widths, and 125% zoom. Recap and
    suggestion text should wrap without horizontal overflow; controls remain
    reachable. Verify native Tab navigation, Escape, fill, Send, and caret
    placement in the actual DSH editor.
15. Remove the package and restart. No recap, suggestion row, Escape observer,
    settings section, or empty input-dock space remains.
