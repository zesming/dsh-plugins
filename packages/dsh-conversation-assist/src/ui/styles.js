/** Plugin stylesheet, installed for the plugin's lifetime. */

const CSS = `
.dca-recap {
  margin: 12px 0 0;
  color: var(--dsw-alias-label-secondary);
  font: 400 12px/20px var(--dsw-font-family);
  overflow-wrap: anywhere;
  white-space: normal;
}
.dca-suggest {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  padding: 0 12px 0 14px;
  color: var(--dsw-alias-label-secondary);
  font: 400 13px/20px var(--dsw-font-family);
  container-type: inline-size;
}
.dca-mark {
  margin-right: 6px;
  color: var(--dsw-alias-label-tertiary);
}
.dca-text {
  min-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dca-gap { flex: 1 1 auto; }
.dca-keys {
  display: flex;
  gap: 2px;
  margin: 0 12px;
  color: var(--dsw-alias-label-secondary);
}
.dca-keys kbd {
  min-width: 18px;
  height: 18px;
  padding: 1px 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-bottom-width: 2px;
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-bg-module-platform);
  font: 500 11px/14px var(--dsw-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  text-align: center;
}
.dca-accept {
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: none;
  color: var(--dsw-alias-label-secondary);
  font: 500 12px/18px var(--dsw-font-family);
  cursor: pointer;
}
.dca-accept:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dca-accept:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.dca-dismiss {
  width: 24px;
  height: 24px;
  margin-left: 4px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: none;
  color: var(--dsw-alias-label-tertiary);
  font: 400 12px/1 var(--dsw-font-family);
  cursor: pointer;
}
.dca-dismiss:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
.dca-dismiss:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
@container (max-width: 560px) {
  .dca-keys { display: none; }
}
.dca-settings {
  max-width: 640px;
  padding: 0 24px 24px;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}
.dca-settings-title { margin: 18px 0 4px; font-size: 18px; line-height: 26px; font-weight: 600; }
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
