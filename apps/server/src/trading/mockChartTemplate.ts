import { TRADING_REPORT_CSS } from "./visualStyle.ts";

export const MOCK_CHART_TEMPLATE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trading setup schematic</title><style>${TRADING_REPORT_CSS}
.chart-wrap{overflow:auto;margin:24px 0}.chart-wrap svg{display:block;width:100%;min-width:560px}button{font:inherit;color:var(--text);background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:8px 12px;cursor:pointer}.toolbar{display:flex;align-items:center;gap:16px;margin-top:20px}.notes{display:flex;flex-wrap:wrap;gap:24px;margin-top:20px}
</style></head><body><main>
<header><div class="eyebrow">Schematic · Synthetic candles</div><h1 id="title"></h1><p id="summary" class="summary"></p></header>
<div class="toolbar"><button id="mode" type="button" aria-pressed="false">Show price path</button><span class="meta">Illustrative prices · No measured performance</span></div>
<section class="card chart-wrap" aria-label="Setup diagram"><svg id="chart" viewBox="0 0 900 430" role="img" aria-label="Synthetic candlestick setup"></svg></section>
<div id="notes" class="notes"></div><footer>Conceptual example. These candles are invented to explain structure, not a historical trade or backtest.</footer>
</main><script>
// Edit this setup to explain a different pattern. Keep synthetic charts labeled.
const setup = {
  title: "Higher-low reversal",
  summary: "A first trough, a bounce, then a higher low. Confirmation and invalidation are shown as conceptual levels.",
  closes: [110,108,104,98,102,107,111,108,105,102,104,109,113,115],
  marks: [{bar:3,label:"First trough"},{bar:9,label:"Higher low"},{bar:12,label:"Confirmation"}],
  levels: [{price:112,label:"Neckline"},{price:97,label:"Invalidation"}]
};
// Replace this construction with explicit {open,high,low,close} objects if needed.
const bars = setup.closes.map((close,i)=>{const open=setup.closes[Math.max(0,i-1)];return {open,close,high:Math.max(open,close)+1.5,low:Math.min(open,close)-1.5}});
const NS="http://www.w3.org/2000/svg",chart=document.querySelector("#chart");
document.querySelector("#title").textContent=setup.title;
document.querySelector("#summary").textContent=setup.summary;
const el=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!==undefined)n.textContent=text;return n};
let line=false;
function draw(){
  chart.replaceChildren();
  const lo=Math.min(...bars.map(b=>b.low),...setup.levels.map(l=>l.price))-3;
  const hi=Math.max(...bars.map(b=>b.high),...setup.levels.map(l=>l.price))+5;
  const x=i=>40+(i+.5)*740/bars.length,y=p=>30+(hi-p)/(hi-lo)*340;
  for(let i=0;i<5;i++){const p=lo+(hi-lo)*i/4;chart.append(el("line",{x1:30,x2:790,y1:y(p),y2:y(p),stroke:"#262626"}),el("text",{x:805,y:y(p)+4,fill:"#a3a3a3","font-size":12},p.toFixed(1)))}
  bars.forEach((b,i)=>{const color=b.close>=b.open?"#4ade80":"#f87171";const group=el("g",{tabindex:0,role:"img","aria-label":"Illustrative bar "+(i+1)+": open "+b.open+", high "+b.high+", low "+b.low+", close "+b.close});group.append(el("title",{},"O "+b.open+" H "+b.high+" L "+b.low+" C "+b.close));if(!line)group.append(el("line",{x1:x(i),x2:x(i),y1:y(b.high),y2:y(b.low),stroke:color}),el("rect",{x:x(i)-14,y:Math.min(y(b.open),y(b.close)),width:28,height:Math.max(2,Math.abs(y(b.open)-y(b.close))),fill:color}));chart.append(group)});
  if(line)chart.append(el("polyline",{points:bars.map((b,i)=>x(i)+","+y(b.close)).join(" "),fill:"none",stroke:"#ededed","stroke-width":2}));
  setup.levels.forEach(l=>chart.append(el("line",{x1:30,x2:790,y1:y(l.price),y2:y(l.price),stroke:"#737373","stroke-dasharray":"5 5"}),el("text",{x:780,y:y(l.price)-8,"text-anchor":"end",fill:"#ededed","font-size":12},l.label)));
  setup.marks.forEach((m,i)=>{chart.append(el("circle",{cx:x(m.bar),cy:y(bars[m.bar].low)+20,r:10,fill:"#ededed"}),el("text",{x:x(m.bar),y:y(bars[m.bar].low)+24,"text-anchor":"middle",fill:"#0a0a0a","font-size":11},String(i+1)))});
}
setup.marks.forEach((m,i)=>{const p=document.createElement("p");p.textContent=(i+1)+". "+m.label;document.querySelector("#notes").append(p)});
document.querySelector("#mode").addEventListener("click",e=>{line=!line;e.currentTarget.textContent=line?"Show candles":"Show price path";e.currentTarget.setAttribute("aria-pressed",String(line));draw()});
draw();
</script></body></html>`;
