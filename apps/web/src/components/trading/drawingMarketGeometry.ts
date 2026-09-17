import type { Candle } from "./chartIndicators";
import type { ChartDrawing, DrawingAnchor, DrawingGeometry, DrawingPoint } from "./drawingGeometry";
export type DrawingDataSource = {
  bars: ReadonlyMap<number, Candle>;
  subscribeBars: (listener: () => void) => () => void;
};

/** Anchored VWAP uses actual loaded candle volume; no proxy volume or interpolation across gaps. */
export function anchoredVwapGeometry(
  drawing: ChartDrawing,
  bars: readonly Candle[],
  project: (anchor: DrawingAnchor) => DrawingPoint | null,
  timeValue: (time: DrawingAnchor["time"]) => number | null,
): DrawingGeometry {
  const result: DrawingGeometry = { lines: [], handles: [] };
  const anchor = drawing.anchors[0];
  if (!anchor || drawing.hidden) return result;
  const handle = project(anchor);
  if (handle) result.handles.push(handle);
  const start = timeValue(anchor.time);
  if (start === null || !bars.length || bars[0]!.time > start) return result;
  let total = 0,
    mean = 0;
  let previous: DrawingPoint | null = null;
  for (const bar of bars) {
    if (bar.time < start) continue;
    if (
      ![bar.time, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) ||
      bar.volume < 0
    ) {
      break;
    }
    const price = bar.high / 3 + bar.low / 3 + bar.close / 3;
    const nextTotal = total + bar.volume;
    if (!Number.isFinite(nextTotal)) return { lines: [], handles: result.handles };
    if (bar.volume > 0) {
      const ratio = bar.volume / nextTotal;
      mean = mean * (1 - ratio) + price * ratio;
      total = nextTotal;
    }
    if (total === 0) continue;
    const point = project({ time: bar.time as DrawingAnchor["time"], price: mean });
    if (previous && point) result.lines.push({ from: previous, to: point });
    previous = point;
  }
  return result;
}

export function positionForecastGeometry(
  drawing: ChartDrawing,
  bars: readonly Candle[],
  project: (anchor: DrawingAnchor) => DrawingPoint | null,
  timeValue: (time: DrawingAnchor["time"]) => number | null,
  formatPrice: (price: number) => string,
): DrawingGeometry {
  const result: DrawingGeometry = { lines: [], handles: [] };
  if (drawing.hidden) return result;
  const [a, b] = drawing.anchors;
  if (!a) return result;
  const first = project(a);
  if (!first) return result;
  result.handles.push(first);
  if (!b) return result;
  const second = project(b);
  if (!second) return result;
  result.handles.push(second);
  const start = timeValue(a.time),
    end = timeValue(b.time);
  const upward = b.price > a.price;
  let status = "Pending";
  if (start !== null && end !== null && bars.length && bars[0]!.time <= start) {
    const window = bars.filter((bar) => bar.time >= start && bar.time < end);
    const reached = window.some(
      (bar) =>
        Number.isFinite(upward ? bar.high : bar.low) &&
        (upward ? bar.high >= b.price : bar.low <= b.price),
    );
    if (reached) status = "Target reached";
    else if (bars.at(-1)!.time >= end && window.length) status = "Target not reached";
  } else if (bars.length) status = "History unavailable";
  result.lines.push({
    from: first,
    to: second,
    label: `${formatPrice(a.price)} → ${formatPrice(b.price)} · ${status}`,
    labelPoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 - 10 },
    labelAlign: "center",
  });
  const angle = Math.atan2(second.y - first.y, second.x - first.x);
  for (const side of [-1, 1])
    result.lines.push({
      from: {
        x: second.x - 10 * Math.cos(angle + side * 0.45),
        y: second.y - 10 * Math.sin(angle + side * 0.45),
      },
      to: second,
    });
  return result;
}
