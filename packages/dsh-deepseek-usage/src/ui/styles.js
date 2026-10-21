/**
 * Component styles, emitted as one inert string.
 *
 * The plugin injects this through a React `<style>` element inside its own
 * subtree, so unmounting removes it without touching the host document. Every
 * value references a host theme token, which keeps light and dark mode correct
 * for free and makes the plugin a passenger in the product's design system
 * rather than a second one.
 */

/** The five heatmap shades, palest to darkest, per theme. */
const HEAT = {
  // One hue, five lightness steps. The darkest light-mode shade is the mid-blue
  // rather than the navy, because the navy reads as black next to blue cells and
  // stops looking like a step in the same ramp.
  light: ['var(--dsw-static-deepseek-100)', 'var(--dsw-static-deepseek-200)', 'var(--dsw-static-deepseek-300)', 'var(--dsw-static-deepseek-450)', 'var(--dsw-static-deepseek-600)'],
  dark: ['var(--dsw-static-deepseek-800)', 'var(--dsw-static-deepseek-500)', 'var(--dsw-static-deepseek-450)', 'var(--dsw-static-deepseek-400)', 'var(--dsw-static-deepseek-200)'],
}

/**
 * Build the stylesheet.
 *
 * @returns CSS text scoped under `.dsu`.
 */
export function stylesheet() {
  return `
.dsu{--dsu-heat-1:${HEAT.light[0]};--dsu-heat-2:${HEAT.light[1]};--dsu-heat-3:${HEAT.light[2]};--dsu-heat-4:${HEAT.light[3]};--dsu-heat-5:${HEAT.light[4]};--dsu-empty:var(--dsw-alias-bg-module-platform);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary);-webkit-font-smoothing:antialiased}
[data-ds-dark-theme] .dsu{--dsu-heat-1:${HEAT.dark[0]};--dsu-heat-2:${HEAT.dark[1]};--dsu-heat-3:${HEAT.dark[2]};--dsu-heat-4:${HEAT.dark[3]};--dsu-heat-5:${HEAT.dark[4]};--dsu-empty:rgba(255,255,255,.07)}

.dsu-row{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:0;border-radius:var(--dsw-radius-md);background:none;font:inherit;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;transition:background 140ms cubic-bezier(.23,1,.32,1)}
.dsu-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsu-row[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-active)}
.dsu-row:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dsu-row[data-collapsed=true]{justify-content:center;padding:6px 0;width:36px}
.dsu-row-glyph{display:flex;justify-content:center;width:20px;flex:none;color:var(--dsw-alias-label-tertiary)}
.dsu-row-glyph[data-tone=accent]{color:var(--dsw-alias-state-business-primary)}
.dsu-row-main{display:flex;flex-direction:column;min-width:0;flex:1;gap:1px}
.dsu-row-amount{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsu-row-unit{margin-left:2px;font-size:11.5px;font-weight:500;color:var(--dsw-alias-label-tertiary)}
.dsu-row-sub{display:flex;align-items:center;gap:4px;font-size:11.5px;line-height:16px;color:var(--dsw-alias-state-warn-label);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsu-row-sub[data-tone=muted]{color:var(--dsw-alias-label-tertiary)}

.dsu-anchor{position:relative;display:block}
.dsu-pop{position:absolute;left:0;right:0;bottom:calc(100% + 6px);z-index:60;display:flex;flex-direction:column;gap:1px;padding:6px;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-mask-blur);box-shadow:0 0 0 1px var(--dsw-alias-border-l2),var(--dsw-elevation-prominent)}
.dsu-pop[data-collapsed=true]{left:0;right:auto;width:200px}
.dsu-pop-head{display:flex;flex-direction:column;gap:2px;padding:8px 10px 6px}
.dsu-pop-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dsu-pop-note{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary)}
.dsu-pop-item{display:flex;align-items:center;gap:8px;padding:7px 10px;border:0;border-radius:var(--dsw-radius-md);background:none;font:inherit;font-size:13.5px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer}
.dsu-pop-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsu-pop-item:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dsu-pop-item svg{color:var(--dsw-alias-menu-icon);flex:none}
.dsu-pop-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1)}

.dsu-view{display:flex;flex-direction:column;gap:0;padding:0 24px 28px;min-height:0;overflow-y:auto;height:100%}
.dsu-view[data-container=panel]{padding:0 32px 32px}
.dsu-kpis{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:0;padding:4px 0 18px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsu-kpi{display:flex;flex-direction:column;gap:3px;padding-right:18px}
.dsu-kpi+.dsu-kpi{padding-left:18px;border-left:1px solid var(--dsw-alias-border-l1)}
.dsu-kpi-label{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-caption)}
.dsu-kpi-value{font-size:26px;font-weight:600;line-height:30px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.dsu-kpi-value .u{margin-left:3px;font-size:13px;font-weight:500;letter-spacing:0;color:var(--dsw-alias-label-tertiary)}
.dsu-kpi-meta{font-size:11.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}

.dsu-controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:16px 0 14px}
.dsu-seg{display:inline-flex;gap:2px;padding:2px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform)}
.dsu-seg button{padding:5px 11px;border:0;border-radius:var(--dsw-radius-sm);background:none;font:inherit;font-size:12.5px;font-weight:500;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background 120ms ease,color 120ms ease}
.dsu-seg button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.07)}
.dsu-seg button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dsu-spacer{flex:1}
.dsu-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border:1px solid transparent;border-radius:999px;background:var(--dsw-alias-bg-module-platform);font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
.dsu-chip[aria-pressed=true]{border-color:var(--dsw-alias-state-business-tertiary);background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-label-primary);font-weight:500}
.dsu-chip:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dsu-chip i{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.75}
.dsu-switch{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
.dsu-switch input{position:absolute;opacity:0;pointer-events:none}
.dsu-track{position:relative;width:30px;height:18px;flex:none;border-radius:999px;background:var(--dsu-empty);transition:background 150ms ease;pointer-events:none}
.dsu-track::after{content:"";position:absolute;inset:3px auto 3px 3px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-switch-thumb);box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform 160ms cubic-bezier(.23,1,.32,1)}
.dsu-switch input:checked+.dsu-track{background:var(--dsw-alias-state-business-primary)}
.dsu-switch input:checked+.dsu-track::after{transform:translateX(12px)}
.dsu-switch input:focus-visible+.dsu-track{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}

.dsu-hm-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px}
.dsu-hm-title{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dsu-hm-hint{font-size:11px;color:var(--dsw-alias-label-caption)}
.dsu-lanes{display:flex;flex-direction:column;gap:16px}
.dsu-lane{display:flex;flex-direction:column;gap:6px}
.dsu-lane-head{display:flex;align-items:center;gap:8px}
.dsu-lane-name{font-size:12.5px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsu-lane-total{margin-left:auto;font-size:11.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dsu-tag{flex:none;padding:1.5px 5px;border-radius:4px;background:var(--dsw-alias-bg-module-platform);font-size:9.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}
.dsu-hm-body{display:flex;gap:6px}
.dsu-hm-canvas{flex:1;min-width:0}
.dsu-months{position:relative;height:14px;margin-bottom:3px;font-size:10.5px;color:var(--dsw-alias-label-caption)}
.dsu-months span{position:absolute;top:0;white-space:nowrap}
.dsu-svg{display:block;width:100%;height:auto;overflow:visible}
.dsu-svg rect{transition:opacity 100ms}
.dsu-svg rect:hover{opacity:.72}
.dsu-dow{display:flex;flex-direction:column;justify-content:space-between;width:14px;flex:none;padding:20px 0 2px;font-size:9px;line-height:1.1;color:var(--dsw-alias-label-caption)}
.dsu-legend{display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-top:12px;font-size:10.5px;color:var(--dsw-alias-label-caption)}
.dsu-swatch{display:inline-block;width:10px;height:10px;flex:none;border-radius:2.5px}
.dsu-wk-months{position:relative;height:14px;margin-top:8px;font-size:10px;color:var(--dsw-alias-label-caption)}
.dsu-wk-months span{position:absolute;top:0}
.dsu-wk-svg{display:block;width:100%;height:auto}
.dsu-wk-svg rect{transition:opacity 100ms}
.dsu-wk-svg rect:hover{opacity:.72}

.dsu-cum-legend{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:6px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dsu-cum-legend span{display:inline-flex;align-items:center;gap:5px}
.dsu-cum-legend i{display:inline-block;width:14px;height:3px;border-radius:2px}
.dsu-chart{display:block;width:100%;overflow:visible}
.dsu-chart .axis{font-size:9.5px;fill:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}
.dsu-chart .gridline{stroke:var(--dsw-alias-border-l1);stroke-width:1}

.dsu-table-wrap{margin-top:8px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsu-table-title{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dsu-table-title span:last-child{font-weight:400;color:var(--dsw-alias-label-caption)}
.dsu-table{width:100%;border-collapse:collapse;font-size:12.5px}
.dsu-table th{padding:0 0 7px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:10.5px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;text-align:right;color:var(--dsw-alias-label-caption)}
.dsu-table th:first-child,.dsu-table td:first-child{text-align:left}
.dsu-table td{padding:9px 0;border-bottom:1px solid var(--dsw-alias-border-l1);text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}
.dsu-table tbody tr:last-child td{border-bottom:0}
.dsu-table td.model{font-weight:500;color:var(--dsw-alias-label-primary)}
.dsu-table td.model .sub{display:block;margin-top:1px;font-size:10.5px;font-weight:400;color:var(--dsw-alias-label-caption)}
.dsu-table td.total{font-weight:600;color:var(--dsw-alias-label-primary)}
.dsu-share{display:flex;align-items:center;justify-content:flex-end;gap:8px}
.dsu-share-bar{width:52px;height:4px;flex:none;overflow:hidden;border-radius:2px;background:var(--dsu-empty)}
.dsu-share-bar i{display:block;height:100%;border-radius:2px;background:var(--dsw-alias-state-business-primary)}

.dsu-foot{margin-top:14px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption)}
.dsu-empty{padding:44px 24px;text-align:center;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.dsu-empty strong{display:block;margin-bottom:4px;font-size:14px;color:var(--dsw-alias-label-secondary)}
.dsu-empty button,.dsu-retry{margin-top:12px;padding:6px 14px;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);font:inherit;font-size:12.5px;color:var(--dsw-alias-label-primary);cursor:pointer}
.dsu-skeleton{display:flex;flex-direction:column;gap:10px;padding:24px 0}
.dsu-skeleton i{display:block;height:12px;border-radius:6px;background:var(--dsw-alias-bg-skeleton)}
.dsu-skeleton i:first-child{width:40%;height:26px}
.dsu-skeleton i:nth-child(2){width:72%}
.dsu-skeleton i:nth-child(3){width:100%;height:120px}

.dsu-panel{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-layer-1)}
.dsu-panel-head{display:flex;align-items:center;gap:10px;padding:14px 32px 0;flex:none}
.dsu-panel-title{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em}
.dsu-panel-actions{display:flex;align-items:center;gap:6px;margin-left:auto}
.dsu-icon-btn{display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:none;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsu-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsu-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
`
}
