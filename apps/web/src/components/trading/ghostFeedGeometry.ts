import type { ChartDrawing, DrawingAnchor, DrawingGeometry, DrawingPoint } from "./drawingGeometry";

/** User-directed hypothetical candles, rendered only as a drawing, never market OHLC. */
export function ghostFeedGeometry(
  drawing: ChartDrawing,
  project: (anchor: DrawingAnchor) => DrawingPoint | null,
): DrawingGeometry {
  const result: DrawingGeometry = { lines: [], handles: [] };
  if (drawing.hidden) return result;
  for (const anchor of drawing.anchors) {
    const point = project(anchor);
    if (!point) return result;
    result.handles.push(point);
  }
  const count = drawing.ghostBars ?? 12;
  const range = drawing.ghostRange ?? 10;
  const variance = drawing.ghostVariance ?? 3;
  for (let segment = 1; segment < drawing.anchors.length; segment++) {
    const a = drawing.anchors[segment - 1]!,
      b = drawing.anchors[segment]!;
    const first = result.handles[segment - 1]!,
      last = result.handles[segment]!;
    let previous = a.price;
    const half = Math.min(5, (Math.abs(last.x - first.x) / count) * 0.3);
    for (let index = 1; index <= count; index++) {
      const fraction = index / count;
      const close =
        a.price +
        (b.price - a.price) * fraction +
        (index === count ? 0 : Math.sin(index * 2.399 + segment) * variance);
      const open = previous;
      previous = close;
      const wick = Math.max(0, range - Math.abs(close - open)) / 2;
      const point = (price: number) => project({ time: a.time, price });
      const o = point(open),
        c = point(close),
        h = point(Math.max(open, close) + wick),
        l = point(Math.min(open, close) - wick);
      if (!o || !c || !h || !l) continue;
      const x = first.x + (last.x - first.x) * fraction;
      const color = close >= open ? "#26a69a" : "#ef5350";
      result.lines.push({ from: { x, y: h.y }, to: { x, y: l.y }, color });
      const points = [
        { x: x - half, y: o.y },
        { x: x + half, y: o.y },
        { x: x + half, y: c.y },
        { x: x - half, y: c.y },
      ];
      for (let edge = 0; edge < 4; edge++)
        result.lines.push({ from: points[edge]!, to: points[(edge + 1) % 4]!, color });
      (result.polygons ??= []).push({ points, color, opacity: drawing.backgroundOpacity ?? 0.3 });
    }
  }
  const first = result.handles[0];
  if (first)
    result.lines.push({
      from: first,
      to: first,
      label: "Hypothetical candles",
      labelPoint: { x: first.x, y: first.y - 12 },
    });
  return result;
}
