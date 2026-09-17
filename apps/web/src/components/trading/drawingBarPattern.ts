import type { Candle } from "./chartIndicators";
import type { ChartDrawing, DrawingAnchor, DrawingGeometry, DrawingPoint } from "./drawingGeometry";
/** Snapshot OHLC tuples are independent of the live series after capture. */
export type DrawingBarPattern = Array<[number, number, number, number]>;
export const BAR_PATTERN_MODES = ["bars", "open", "high", "low", "close"] as const;
export type BarPatternMode = (typeof BAR_PATTERN_MODES)[number];
export const MAX_PATTERN_BARS = 100;
export function normalizeBarPattern(value: unknown): DrawingBarPattern | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_PATTERN_BARS) return null;
  const result: DrawingBarPattern = [];
  for (const row of value) {
    if (
      !Array.isArray(row) ||
      row.length !== 4 ||
      !row.every((value) => typeof value === "number" && Number.isFinite(value))
    )
      return null;
    const [open, high, low, close] = row as [number, number, number, number];
    if (high < Math.max(open, low, close) || low > Math.min(open, high, close)) return null;
    result.push([open, high, low, close]);
  }
  return result;
}
export function captureBarPattern(
  bars: readonly Candle[],
  start: number,
  end: number,
): DrawingBarPattern | null {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    !bars.length ||
    bars[0]!.time > start ||
    bars.at(-1)!.time < end
  )
    return null;
  return normalizeBarPattern(
    bars
      .filter((bar) => bar.time >= start && bar.time <= end)
      .map((bar) => [bar.open, bar.high, bar.low, bar.close]),
  );
}
export function barPatternGeometry(
  drawing: ChartDrawing,
  project: (anchor: DrawingAnchor) => DrawingPoint | null,
): DrawingGeometry {
  const result: DrawingGeometry = { lines: [], handles: [] };
  if (drawing.hidden) return result;
  const [a, b] = drawing.anchors;
  if (!a || !b) return result;
  const first = project(a),
    last = project(b);
  if (!first || !last) return result;
  result.handles = [first, last];
  const samples = drawing.pattern;
  if (!samples || samples.length < 2) {
    result.lines.push({
      from: first,
      to: last,
      lineStyle: "dashed",
      label: "Select 2–100 loaded bars",
    });
    return result;
  }
  const origin = samples[0]![3],
    change = samples.at(-1)![3] - origin;
  const factor = change === 0 ? 1 : (b.price - a.price) / change;
  const half = Math.min(5, (Math.abs(last.x - first.x) / (samples.length - 1)) * 0.3);
  const mode = drawing.patternMode ?? "bars";
  let previous: DrawingPoint | null = null;
  samples.forEach(([open, high, low, close], index) => {
    const x = first.x + ((last.x - first.x) * index) / (samples.length - 1);
    const point = (value: number) =>
      project({
        time: a.time,
        price:
          a.price +
          (value - origin) * factor +
          (change === 0 ? ((b.price - a.price) * index) / (samples.length - 1) : 0),
      });
    if (mode !== "bars") {
      const value = { open, high, low, close }[mode];
      const projected = point(value);
      const current = projected ? { x, y: projected.y } : null;
      if (previous && current) result.lines.push({ from: previous, to: current });
      previous = current;
      return;
    }
    const o = point(open),
      h = point(high),
      l = point(low),
      c = point(close);
    if (!o || !h || !l || !c) return;
    result.lines.push(
      { from: { x, y: h.y }, to: { x, y: l.y } },
      { from: { x: x - half, y: o.y }, to: { x, y: o.y } },
      { from: { x, y: c.y }, to: { x: x + half, y: c.y } },
    );
  });
  return result;
}
