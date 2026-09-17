import type { ChartDrawing, DrawingGeometry, DrawingAnchor, DrawingPoint } from "./drawingGeometry";

export const isPositionDrawing = (kind: string) =>
  kind === "long-position" || kind === "short-position";
/** Target and stop share a duration; resizing either endpoint preserves the other price. */
export function positionDrawingAnchors(
  kind: string,
  anchors: DrawingAnchor[],
  editedEndpoint = 1,
): DrawingAnchor[] {
  if (!isPositionDrawing(kind) || anchors.length !== 3) return anchors;
  const target = anchors[1],
    stop = anchors[2];
  if (!target || !stop) return anchors;
  const time = editedEndpoint === 2 ? stop.time : target.time;
  return [anchors[0]!, { ...target, time }, { ...stop, time }];
}
export const isRangeDrawing = (kind: string) =>
  ["price-range", "date-range", "date-price-range"].includes(kind);

/** Measured values use source prices/times, never screen distances or assumed bar spacing. */
export function projectionDrawingGeometry(
  drawing: ChartDrawing,
  project: (anchor: DrawingAnchor) => DrawingPoint | null,
  formatPrice: (price: number) => string,
  timeValue: (time: DrawingAnchor["time"]) => number | null,
): DrawingGeometry {
  const result: DrawingGeometry = { lines: [], handles: [] };
  if (drawing.hidden) return result;
  const [a, b, c] = positionDrawingAnchors(drawing.kind, drawing.anchors);
  if (!a) return result;
  const first = project(a);
  if (!first) return result;
  result.handles.push(first);
  if (!b) return result;
  const second = project(b);
  if (!second) return result;
  result.handles.push(second);
  const label = (from: DrawingPoint, to: DrawingPoint, text?: string, color?: string) => {
    result.lines.push({
      from,
      to,
      ...(text
        ? {
            label: text,
            labelAlign: "center",
            labelPoint: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 6 },
          }
        : {}),
      ...(color ? { color } : {}),
    });
  };
  const box = (x1: number, x2: number, y1: number, y2: number, color: string) => {
    const points = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ];
    if (drawing.background !== false)
      (result.polygons ??= []).push({ points, color, opacity: drawing.backgroundOpacity ?? 0.18 });
    for (let index = 0; index < 4; index++)
      label(points[index]!, points[(index + 1) % 4]!, undefined, color);
  };
  if (drawing.kind === "sector") {
    label(first, second);
    if (!c) return result;
    const third = project(c);
    if (!third) return result;
    const radius = Math.hypot(second.x - first.x, second.y - first.y);
    const start = Math.atan2(second.y - first.y, second.x - first.x);
    const end = Math.atan2(third.y - first.y, third.x - first.x);
    const sweep = (end - start + Math.PI * 2) % (Math.PI * 2);
    if (!radius || !sweep) return result;
    const points = Array.from({ length: 65 }, (_, index) => ({
      x: first.x + radius * Math.cos(start + (sweep * index) / 64),
      y: first.y + radius * Math.sin(start + (sweep * index) / 64),
    }));
    result.handles.push(points.at(-1)!);
    for (let index = 1; index < points.length; index++) label(points[index - 1]!, points[index]!);
    label(points.at(-1)!, first);
    if (drawing.background !== false)
      result.polygons = [
        {
          points: [first, ...points],
          color: drawing.backgroundColor ?? drawing.color,
          opacity: drawing.backgroundOpacity ?? 0.18,
        },
      ];
    return result;
  }
  if (isPositionDrawing(drawing.kind)) {
    const targetColor = drawing.positionTargetColor ?? "#26a69a",
      stopColor = drawing.positionStopColor ?? "#ef5350";
    box(first.x, second.x, first.y, second.y, targetColor);
    label(
      { x: first.x, y: second.y },
      second,
      `Target ${formatPrice(b.price)} · ${formatPrice(Math.abs(b.price - a.price))}`,
      targetColor,
    );
    label(first, { x: second.x, y: first.y }, `Entry ${formatPrice(a.price)}`);
    if (!c) return result;
    const third = project(c);
    if (!third) return result;
    result.handles.push(third);
    box(first.x, third.x, first.y, third.y, stopColor);
    label(
      { x: first.x, y: third.y },
      third,
      `Stop ${formatPrice(c.price)} · ${formatPrice(Math.abs(c.price - a.price))}`,
      stopColor,
    );
    const risk = Math.abs(c.price - a.price),
      reward = Math.abs(b.price - a.price);
    if (risk > 0 && Number.isFinite(reward / risk))
      label(first, { x: second.x, y: first.y }, `Risk/reward ${(reward / risk).toFixed(2)}`);
    const ratioLabel = result.lines.at(-1);
    if (ratioLabel?.label?.startsWith("Risk/reward"))
      ratioLabel.labelPoint = { x: (first.x + second.x) / 2, y: first.y + 18 };
    return result;
  }
  const delta = b.price - a.price;
  const percent = a.price === 0 ? "" : ` (${((delta / Math.abs(a.price)) * 100).toFixed(2)}%)`;
  const priceLabel = `${delta > 0 ? "+" : ""}${formatPrice(delta)}${percent}`;
  if (drawing.kind !== "date-range") {
    label(first, { x: second.x, y: first.y });
    label({ x: first.x, y: second.y }, second);
    label({ x: second.x, y: first.y }, second, priceLabel);
  }
  if (drawing.kind !== "price-range") {
    const start = timeValue(a.time),
      end = timeValue(b.time);
    if (start !== null && end !== null) {
      const seconds = Math.abs(end - start);
      const days = Math.floor(seconds / 86400),
        hours = Math.floor((seconds % 86400) / 3600),
        minutes = Math.floor((seconds % 3600) / 60);
      const duration =
        [
          days ? `${days}d` : "",
          hours ? `${hours}h` : "",
          minutes ? `${minutes}m` : "",
          seconds % 60 ? `${Number((seconds % 60).toFixed(3))}s` : "",
        ]
          .filter(Boolean)
          .join(" ") || "0s";
      label(first, { x: second.x, y: first.y }, duration);
    }
    label(first, { x: first.x, y: second.y });
    label({ x: second.x, y: first.y }, second);
  }
  if (drawing.kind === "date-price-range")
    box(first.x, second.x, first.y, second.y, drawing.backgroundColor ?? drawing.color);
  return result;
}
