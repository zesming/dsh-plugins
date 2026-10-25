/** Plugin stylesheet, installed for the plugin's lifetime. */

const CSS = `
/* The shell draws one nav glyph per settings row and falls back to the gear for
   unknown section ids. The label is React children, so this marker hides that
   glyph only in our row and lays the lightbulb out in its seat. */
button:has(> [data-dca-navmark]) > svg { display: none; }
button:has(> span > [data-dca-navmark]) > svg { display: none; }
button:has(> span > [data-dca-navmark]) > span { display: flex; align-items: center; gap: 8px; min-width: 0; }
[data-dca-navmark] { display: inline-flex; flex: none; width: 16px; height: 16px; color: currentColor; }
[data-dca-navtext] { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dca-recap {
  margin: 12px 0 0;
  padding-left: 12px;
  border-left: 2px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font: 400 12px/20px var(--dsw-font-family);
  overflow-wrap: anywhere;
  white-space: normal;
}
.dca-recap-heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; }
.dca-recap-heading strong { color: var(--dsw-alias-label-secondary); font-weight: 500; }
.dca-recap-state, .dca-recap-status, .dca-recap-note { color: var(--dsw-alias-label-tertiary); }
.dca-recap-copy, .dca-recap-status, .dca-recap-note { margin: 4px 0 0; overflow-wrap: anywhere; }
.dca-recap-copy { white-space: pre-wrap; }
.dca-recap-details { margin-top: 4px; }
.dca-recap-details summary { cursor: pointer; overflow-wrap: anywhere; }
.dca-recap-expand { margin-left: 8px; white-space: nowrap; text-decoration: underline; text-underline-offset: 2px; }
.dca-recap-details summary:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; border-radius: 2px; }
.dca-recap-source { margin-top: 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
.dca-suggest {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px 10px;
  /* Keep the row tucked under the top edge of the public input dock's
     composer card. */
  width: calc(
    100% -
    var(--dsh-composer-side-clearance, 0px) -
    var(--dsh-composer-side-clearance, 0px) -
    var(--dsh-composer-dock-inset, 0px) -
    var(--dsh-composer-dock-inset, 0px) -
    var(--dsh-composer-dock-inset, 0px) -
    var(--dsh-composer-dock-inset, 0px)
  );
  max-width: calc(
    var(--dsh-composer-card-max-width, 760px) -
    var(--dsh-composer-dock-inset, 0px) -
    var(--dsh-composer-dock-inset, 0px) -
    var(--dsh-composer-dock-inset, 0px) -
    var(--dsh-composer-dock-inset, 0px)
  );
  margin: 0 auto calc(0px - var(--dsh-composer-stack-gap, 0px) - 3px);
  /* The composer overlaps the last stack-gap + 3px. Add real breathing room
     on both visible edges as well as that concealed joining area. */
  padding: 10px 14px calc(var(--dsh-composer-stack-gap, 0px) + 13px);
  min-height: 48px;
  border: .5px solid var(--dsw-alias-border-l1);
  border-bottom: 0;
  border-radius: var(--dsw-radius-lg) var(--dsw-radius-lg) 0 0;
  background: var(--dsw-specific-menu);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  color: var(--dsw-alias-label-secondary);
  font: 400 13px/22px var(--dsw-font-family);
}
.dca-suggest[hidden] { display: none; }
.dca-mark { display: block; flex: none; margin-top: 6px; color: var(--dsw-alias-label-tertiary); }
.dca-text {
  flex: 1 1 min(220px, calc(100% - 30px));
  min-width: 0;
  padding: 3px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.dca-insert, .dca-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dca-insert {
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: none;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dca-insert:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dca-insert:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.dca-send {
  flex: none;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: none;
  color: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary));
  font: 500 13px/20px var(--dsw-font-family);
  cursor: pointer;
}
.dca-send:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dca-send:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.dca-dismiss {
  flex: none;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: none;
  color: var(--dsw-alias-label-tertiary);
  font: 400 14px/1 var(--dsw-font-family);
  cursor: pointer;
}
.dca-dismiss:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
.dca-dismiss:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.dca-settings {
  max-width: 640px;
  padding: 0 24px 24px;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}
.dca-settings-title { display: flex; align-items: center; gap: 8px; margin: 18px 0 4px; font-size: 18px; line-height: 26px; font-weight: 600; }
.dca-settings-icon { flex: none; color: var(--dsw-alias-label-tertiary); }
.dca-settings-intro { margin: 0 0 8px; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
.dca-setrow {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 0;
  border-bottom: .5px solid var(--dsw-alias-border-l2);
}
.dca-setrow:last-of-type { border-bottom: 0; }
.dca-setbody { flex: 1; min-width: 0; }
.dca-setname { font-size: 14px; line-height: 20px; }
.dca-setdesc { margin-top: 4px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dca-seterror { margin-top: 4px; color: var(--dsw-alias-state-error-primary, var(--dsw-alias-state-warn-label)); font-size: 12px; line-height: 18px; }
.dca-switch { width: 36px; height: 20px; border-radius: 10px; border: 0; background: var(--dsw-alias-border-l3); position: relative; cursor: pointer; flex: none; }
.dca-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); }
.dca-switch:disabled { opacity: .5; cursor: default; }
.dca-switch:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.dca-note {
  margin-top: 16px;
  padding: 12px 14px;
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dca-note-title { margin-bottom: 2px; color: var(--dsw-alias-label-primary); font-weight: 500; }
`

/**
 * Append the plugin stylesheet once.
 * @returns a disposer removing it.
 */
export function installStyles() {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-conversation-assist'
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => { tag.remove() }
}
