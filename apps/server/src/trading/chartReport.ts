import * as DateTime from "effect/DateTime";
import type { Candle } from "./marketData.ts";

export interface ChartReportInput {
  title: string;
  summary: string;
  annotations: readonly { time: number; price: number; label: string; detail: string }[];
  levels: readonly { price: number; label: string }[];
}
export interface ChartReportEvidence {
  symbol: string;
  interval: number;
  unit: string;
  source: string;
  datasetId: string;
  updatedAt: number;
  generatedAt: number;
  totalBars: number;
  offset: number;
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
const price = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 6 });
const date = (seconds: number) =>
  DateTime.formatIso(DateTime.makeUnsafe(seconds * 1000))
    .replace("T", " ")
    .replace(".000Z", " UTC");

/** Render observed candles only. All agent-authored content is escaped and annotations remain interpretations. */
export function renderChartReport(
  bars: readonly Candle[],
  input: ChartReportInput,
  evidence: ChartReportEvidence,
) {
  if (!bars.length || bars.length > 500) throw new Error("Choose a window of 1–500 saved candles.");
  if (
    !input.title.trim() ||
    input.title.length > 160 ||
    input.summary.length > 5000 ||
    input.annotations.length > 20 ||
    input.levels.length > 10
  )
    throw new Error(
      "Use a title up to 160 characters, a summary up to 5,000, up to 20 annotations and 10 levels.",
    );
  bars.forEach((bar, index) => {
    if (
      ![bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) ||
      Math.abs(bar.time * 1000) > 8.64e15 ||
      bar.volume < 0 ||
      bar.high < Math.max(bar.open, bar.close, bar.low) ||
      bar.low > Math.min(bar.open, bar.close) ||
      (index > 0 && bar.time <= bars[index - 1]!.time)
    )
      throw new Error("Saved candles must have valid OHLCV and strictly ascending timestamps.");
  });
  const indices = new Map(bars.map((bar, index) => [bar.time, index]));
  for (const item of [...input.annotations, ...input.levels]) {
    if (!Number.isFinite(item.price) || !item.label.trim() || item.label.length > 120)
      throw new Error("Use finite annotation prices and labels of 1–120 characters.");
  }
  for (const item of input.annotations) {
    if (!indices.has(item.time) || item.detail.length > 2000)
      throw new Error(
        "Each annotation must match a candle in the displayed window and have at most 2,000 detail characters.",
      );
  }
  const low = Math.min(
    ...bars.map((bar) => bar.low),
    ...input.levels.map((l) => l.price),
    ...input.annotations.map((a) => a.price),
  );
  const high = Math.max(
    ...bars.map((bar) => bar.high),
    ...input.levels.map((l) => l.price),
    ...input.annotations.map((a) => a.price),
  );
  const span = Math.max(high - low, Math.abs(high) * 0.001, 0.01);
  if (
    !Number.isFinite(span) ||
    !Number.isFinite(low - span * 0.08) ||
    !Number.isFinite(high + span * 0.08)
  )
    throw new Error("Price range is too large to render.");
  const min = low - span * 0.08,
    max = high + span * 0.08;
  const left = 24,
    right = 904,
    top = 28,
    bottom = 388;
  const step = (right - left) / bars.length;
  const x = (index: number) => left + step * (index + 0.5);
  const y = (value: number) => top + ((max - value) / (max - min)) * (bottom - top);
  const maxVolume = Math.max(1, ...bars.map((bar) => bar.volume));
  const axis = Array.from({ length: 6 }, (_, index) => {
    const value = min + ((max - min) * index) / 5,
      py = y(value);
    return `<line x1="${left}" x2="${right}" y1="${py}" y2="${py}" class="grid"/><text x="${right + 12}" y="${py + 4}" class="axis">${price(value)}</text>`;
  }).join("");
  const candles = bars
    .map((bar, index) => {
      const px = x(index),
        width = Math.max(0.6, step * 0.64),
        color = bar.close >= bar.open ? "#51c5aa" : "#f0808b";
      const tooltip = `${date(bar.time)} · O ${price(bar.open)} · H ${price(bar.high)} · L ${price(bar.low)} · C ${price(bar.close)} · Vol ${price(bar.volume)}`;
      return `<g tabindex="0" role="img" aria-label="${escape(tooltip)}"><title>${escape(tooltip)}</title><rect x="${px - step / 2}" y="${top}" width="${step}" height="442" fill="transparent"/><line x1="${px}" x2="${px}" y1="${y(bar.high)}" y2="${y(bar.low)}" stroke="${color}"/><rect x="${px - width / 2}" y="${Math.min(y(bar.open), y(bar.close))}" width="${width}" height="${Math.max(1, Math.abs(y(bar.open) - y(bar.close)))}" fill="${color}"/><rect x="${px - width / 2}" y="${462 - (bar.volume / maxVolume) * 46}" width="${width}" height="${(bar.volume / maxVolume) * 46}" fill="${color}" opacity="0.4"/></g>`;
    })
    .join("");
  const levels = input.levels
    .map(
      (level) =>
        `<g><title>${escape(level.label)} · ${price(level.price)}</title><line x1="${left}" x2="${right}" y1="${y(level.price)}" y2="${y(level.price)}" stroke="#a6b8fa" stroke-dasharray="5 5"/><text x="${right - 6}" y="${y(level.price) - 6}" text-anchor="end" class="level">${escape(level.label)} · ${price(level.price)}</text></g>`,
    )
    .join("");
  const annotations = input.annotations
    .map(
      (a, index) =>
        `<a href="#note-${index + 1}" aria-label="${escape(a.label)}"><circle cx="${x(indices.get(a.time)!)}" cy="${y(a.price)}" r="12" fill="#a6b8fa" stroke="#10151e" stroke-width="2"/><text x="${x(indices.get(a.time)!)}" y="${y(a.price) + 4}" text-anchor="middle" fill="#10151e" font-size="11" font-weight="700">${index + 1}</text><title>${escape(a.label)}</title></a>`,
    )
    .join("");
  const ticks = [...new Set([0, Math.floor((bars.length - 1) / 2), bars.length - 1])]
    .map(
      (index, n, all) =>
        `<text x="${x(index)}" y="491" text-anchor="${n === 0 ? "start" : n === all.length - 1 ? "end" : "middle"}" class="axis">${date(bars[index]!.time).slice(0, 16)}</text>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(input.title)}</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b1018;color:#e8edf7;font:16px/1.65 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:48px 24px}header p,.meta,footer{color:#9eacc1}h1{font-size:clamp(26px,4vw,42px);line-height:1.2;letter-spacing:-.035em;margin:10px 0 18px}h2{font-size:18px;margin:0 0 10px}.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase}.summary{max-width:820px;white-space:pre-wrap}.chart{background:#101722;border:1px solid #263041;border-radius:12px;padding:18px 10px;overflow:auto;margin:28px 0 12px}svg{display:block;width:100%;min-width:720px}.grid{stroke:#263041;stroke-width:1}.axis{fill:#9eacc1;font:11px system-ui}.level{fill:#c1ceff;font:12px system-ui;paint-order:stroke;stroke:#101722;stroke-width:4px;stroke-linejoin:round}svg g:focus{outline:none}svg g:focus>rect:first-of-type{fill:#ffffff10}.notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin:24px 0}article{padding:20px;border:1px solid #263041;border-radius:10px;scroll-margin-top:24px}article:target{border-color:#a6b8fa}article p{margin:8px 0;white-space:pre-wrap;color:#bac6d9}.meta{font-size:13px}a{color:#b5c6ff}details{margin:28px 0}summary{cursor:pointer}table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}th,td{text-align:right;padding:8px;border-bottom:1px solid #263041}th:first-child,td:first-child{text-align:left}.table{overflow:auto}footer{margin-top:28px;font-size:13px}@media print{:root{color-scheme:light}body{background:white;color:#172135}main{padding:0}.chart{break-inside:avoid}article{break-inside:avoid}}
</style></head><body><main><header><div class="eyebrow">Automorphic · Setup review</div><h1>${escape(input.title)}</h1><p class="summary">${escape(input.summary)}</p><div class="meta">${escape(evidence.symbol)} · ${evidence.interval} ${escape(evidence.unit)} · UTC · ${escape(evidence.source)}</div></header>
<div class="chart"><svg viewBox="0 0 1030 512" role="group" aria-label="${escape(evidence.symbol)} candlesticks with analyst annotations"><title>${escape(input.title)}</title>${axis}${candles}${levels}${annotations}${ticks}<text x="24" y="409" class="axis">Volume</text></svg></div>
<div class="meta">${bars.length} of ${evidence.totalBars} saved candles · ${date(bars[0]!.time)} – ${date(bars.at(-1)!.time)}<br>Hover candles for OHLCV, or open the data table. Select a numbered marker for its explanation. Time gaps are compressed; timestamps remain exact.</div>
<section class="notes" aria-label="Setup annotations">${input.annotations.map((a, index) => `<article id="note-${index + 1}"><h2>${index + 1}. ${escape(a.label)}</h2><div class="meta">${date(a.time)} · ${price(a.price)}</div><p>${escape(a.detail)}</p></article>`).join("")}</section>
<details><summary>Candle data and provenance</summary><p class="meta">Dataset ${escape(evidence.datasetId)} · Offset ${evidence.offset}<br>Data retrieved ${DateTime.formatIso(DateTime.makeUnsafe(evidence.updatedAt))} · Report created ${DateTime.formatIso(DateTime.makeUnsafe(evidence.generatedAt))}</p><div class="table"><table><thead><tr><th>Time (UTC)</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr></thead><tbody>${bars.map((b) => `<tr><td>${date(b.time)}</td>${[b.open, b.high, b.low, b.close, b.volume].map((v) => `<td>${price(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>
<footer>Historical snapshot · Analyst annotations</footer></main></body></html>`;
}
