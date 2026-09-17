/** Shared, offline stylesheet for generated trading reports and the visual skill. */
export const TRADING_REPORT_CSS = `
:root{color-scheme:dark;--bg:#0a0a0a;--panel:#111;--panel-hover:#171717;--border:#262626;--text:#ededed;--muted:#a3a3a3;--subtle:#737373;--grid:#262626;--series:#ededed;--comparison:#737373;--positive:#4ade80;--negative:#f87171;--font:Geist,Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 var(--font);-webkit-font-smoothing:antialiased}
main{max-width:1120px;margin:auto;padding:32px 24px 48px}
h1,h2,h3{color:var(--text);text-wrap:balance}
h1{font-size:clamp(24px,3vw,34px);font-weight:550;line-height:1.25;letter-spacing:-.025em;margin:12px 0}
h2{font-size:16px;font-weight:550;line-height:1.4;letter-spacing:-.01em;margin:0 0 16px}
p{margin:0 0 12px}.summary,.lede{max-width:72ch;color:var(--muted);font-size:14px;line-height:1.7}
.eyebrow{font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.meta,.notes,.legend{color:var(--muted);font-size:12px}
.tag{display:inline-flex;flex-wrap:wrap;margin-top:8px;padding:3px 0;color:var(--muted);font-size:12px}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:0;border:1px solid var(--border);border-radius:8px;margin:24px 0;overflow:hidden}
.metric{padding:16px;background:var(--panel);min-width:0}
.metric b{display:block;font-size:26px;font-weight:500;line-height:1.25;letter-spacing:-.035em;font-variant-numeric:tabular-nums}
.metric span{display:block;margin-top:7px;font-size:12px;color:var(--muted)}
.metric small{display:block;margin-top:4px;color:var(--muted);font-size:11px}
.report-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.card{min-width:0;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:20px}
.wide{grid-column:1/-1}.verdict{border-left:2px solid var(--subtle);margin:20px 0}.verdict strong{font-weight:550;font-size:14px}.verdict p{margin:4px 0 0;color:var(--muted)}
.rules{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.rule b{display:block;font-size:12px;font-weight:550;margin-bottom:5px}.rule span{color:var(--muted);font-size:13px}
.axis{fill:var(--muted);font:11px var(--font);font-variant-numeric:tabular-nums}.gridline{stroke:var(--grid);stroke-width:1}
svg{max-width:100%}a{color:var(--text);text-underline-offset:3px}a:hover{color:white}
:focus-visible{outline:2px solid var(--text);outline-offset:4px}summary{cursor:pointer;padding:10px 0}
table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}th,td{text-align:right;padding:10px;border-bottom:1px solid var(--border)}th{color:var(--muted);font-weight:500}th:first-child,td:first-child{text-align:left}
footer,.footer{color:var(--muted);font-size:11px;margin-top:28px;border-top:1px solid var(--border);padding-top:16px}
@media(max-width:760px){.report-grid{grid-template-columns:minmax(0,1fr)}}
@media(max-width:420px){main{padding:24px 16px 36px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.card{padding:16px}.rules{grid-template-columns:1fr}}
@media print{:root{color-scheme:light;--bg:#fff;--panel:#fff;--text:#171717;--muted:#525252;--border:#ddd;--grid:#ddd;--series:#171717}main{padding:0}.card{break-inside:avoid}}
`;
