/** Plugin stylesheet, installed for the plugin's lifetime. */

const CSS = `
/* The shell draws one nav glyph per settings row and falls back to the gear for
   unknown section ids. The label is React children, so this marker hides that
   glyph only in our row and lays the lightbulb out in its seat. */
button:has(> [data-dca-navmark]) > svg { display: none; }
button:has(> span > [data-dca-navmark]) > svg { display: none; }
button:has(> span > [data-dca-navmark]) > span { display: flex; align-items: center; gap: 8px; min-width: 0; }
[data-dca-navmark] { display: inline-flex; flex: none; width: 16px; height: 16px; color: currentColor; }
[data-dca-navtext] { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dca-recap {
  margin: 12px 0 0;
  color: var(--dsw-alias-label-secondary);
  font: 400 12px/20px var(--dsw-font-family);
  overflow-wrap: anywhere;
  white-space: normal;
}
.dca-suggest {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  /* The queue/todo dock contract: side clearance plus the card's dock inset,
     with the surface tucked under the input card's top edge. */
  width: 100%;
  max-width: 100%;
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
  padding: 0 12px;
  min-height: 36px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-bottom: none;
  border-radius: var(--dsw-radius-lg) var(--dsw-radius-lg) 0 0;
  background: var(--dsw-specific-menu);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  color: var(--dsw-alias-label-secondary);
  font: 400 13px/20px var(--dsw-font-family);
}
.dca-mark {
  display: block;
  flex: none;
  color: var(--dsw-alias-label-tertiary);
}
.dca-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dca-send {
  flex: none;
  height: 24px;
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
  width: 24px;
  height: 24px;
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
.dca-debug { margin-top: 10px; color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; }
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
