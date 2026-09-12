import type { Time } from "lightweight-charts";
export type DrawingKind =
  | "horizontal"
  | "trend"
  | "ray"
  | "horizontal-ray"
  | "vertical"
  | "rectangle"
  | "fib"
  | "channel"
  | "text";
export type DrawingAnchor = { time: Time; price: number };
export type ChartDrawing = {
  id: string;
  kind: DrawingKind;
  anchors: DrawingAnchor[];
  color: string;
  width: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  locked?: boolean;
  hidden?: boolean;
  name?: string;
  text?: string;
};
export type DrawingPoint = { x: number; y: number };
export type DrawingLine = { from: DrawingPoint; to: DrawingPoint; label?: string };
export type DrawingGeometry = {
  lines: DrawingLine[];
  rectangle?: { x: number; y: number; width: number; height: number };
  text?: { point: DrawingPoint; value: string };
  handles: DrawingPoint[];
};
export const DRAWING_ANCHORS: Record<DrawingKind, number> = {
  horizontal: 1,
  trend: 2,
  ray: 2,
  "horizontal-ray": 1,
  vertical: 1,
  rectangle: 2,
  fib: 2,
  channel: 3,
  text: 1,
};
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export function drawingTimeValue(time: unknown): number | null {
  if (typeof time === "number") return Number.isFinite(time) ? time : null;
  if (typeof time === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(time)) return null;
    const value = Date.parse(`${time}T00:00:00Z`);
    return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === time
      ? value / 1000
      : null;
  }
  if (time && typeof time === "object" && "year" in time && "month" in time && "day" in time) {
    const { year, month, day } = time;
    if (![year, month, day].every((part) => typeof part === "number" && Number.isInteger(part)))
      return null;
    return drawingTimeValue(
      `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }
  return null;
}
function isAnchor(value: unknown): value is DrawingAnchor {
  return (
    !!value &&
    typeof value === "object" &&
    "time" in value &&
    drawingTimeValue(value.time) !== null &&
    "price" in value &&
    typeof value.price === "number" &&
    Number.isFinite(value.price)
  );
}
export function parseChartDrawings(value: string | null): ChartDrawing[] {
  if (!value) return [];
  try {
    const decoded: unknown = JSON.parse(value);
    if (!Array.isArray(decoded)) return [];
    return decoded
      .flatMap((record, index): ChartDrawing[] => {
        if (!record || typeof record !== "object" || !Object.hasOwn(DRAWING_ANCHORS, record.kind))
          return [];
        const kind = record.kind as DrawingKind;
        const anchors: unknown =
          record.anchors ??
          (kind === "horizontal"
            ? [{ time: 0, price: record.price }]
            : kind === "trend"
              ? [record.from, record.to]
              : []);
        if (
          !Array.isArray(anchors) ||
          anchors.length !== DRAWING_ANCHORS[kind] ||
          !anchors.every(isAnchor)
        )
          return [];
        if (
          (kind === "trend" || kind === "channel" || kind === "rectangle" || kind === "fib") &&
          drawingTimeValue(anchors[0]!.time) === drawingTimeValue(anchors[1]!.time)
        )
          return [];
        return [
          {
            id: typeof record.id === "string" ? record.id.slice(0, 100) : `legacy-${index}`,
            kind,
            anchors,
            color: /^#[a-f\d]{6}$/i.test(record.color) ? record.color : "#729bff",
            width: [1, 2, 3, 4].includes(record.width) ? record.width : 2,
            ...(["solid", "dashed", "dotted"].includes(record.lineStyle)
              ? { lineStyle: record.lineStyle as NonNullable<ChartDrawing["lineStyle"]> }
              : {}),
            ...(record.locked === true ? { locked: true } : {}),
            ...(record.hidden === true ? { hidden: true } : {}),
            ...(typeof record.name === "string" ? { name: record.name.trim().slice(0, 80) } : {}),
            ...(kind === "text"
              ? { text: typeof record.text === "string" ? record.text.slice(0, 140) : "Text" }
              : {}),
          },
        ];
      })
      .slice(-100);
  } catch {
    return [];
  }
}
export function buildDrawingGeometry(
  drawing: ChartDrawing,
  project: (anchor: DrawingAnchor) => DrawingPoint | null,
  priceY: (price: number) => number | null,
  width: number,
  height: number,
): DrawingGeometry {
  const result: DrawingGeometry = { lines: [], handles: [] };
  if (drawing.hidden) return result;
  const a = drawing.anchors[0];
  if (!a) return result;
  const ay = priceY(a.price);
  if (ay === null) return result;
  const first =
    drawing.kind === "horizontal" ? (project(a) ?? { x: width / 2, y: ay }) : project(a);
  if (!first) return result;
  result.handles.push(first);
  const line = (from: DrawingPoint, to: DrawingPoint, label?: string) =>
    result.lines.push({ from, to, ...(label ? { label } : {}) });
  if (drawing.kind === "horizontal") {
    line({ x: 0, y: ay }, { x: width, y: ay });
    return result;
  }
  if (drawing.kind === "horizontal-ray") {
    line(first, { x: width, y: ay });
    return result;
  }
  if (drawing.kind === "vertical") {
    line({ x: first.x, y: 0 }, { x: first.x, y: height });
    return result;
  }
  if (drawing.kind === "text") {
    result.text = { point: first, value: drawing.text ?? "Text" };
    return result;
  }
  const b = drawing.anchors[1];
  const second = b && project(b);
  if (!b || !second) return result;
  result.handles.push(second);
  if (drawing.kind === "ray") {
    const dx = second.x - first.x,
      dy = second.y - first.y;
    if (dx === 0 && dy === 0) return result;
    const tx = dx > 0 ? (width - first.x) / dx : dx < 0 ? -first.x / dx : Infinity;
    const ty = dy > 0 ? (height - first.y) / dy : dy < 0 ? -first.y / dy : Infinity;
    const scale = Math.min(tx >= 0 ? tx : Infinity, ty >= 0 ? ty : Infinity);
    if (Number.isFinite(scale)) line(first, { x: first.x + dx * scale, y: first.y + dy * scale });
    return result;
  }
  if (drawing.kind === "rectangle") {
    const x = Math.min(first.x, second.x),
      y = Math.min(first.y, second.y);
    const w = Math.abs(first.x - second.x),
      h = Math.abs(first.y - second.y);
    result.rectangle = { x, y, width: w, height: h };
    line({ x, y }, { x: x + w, y });
    line({ x: x + w, y }, { x: x + w, y: y + h });
    line({ x: x + w, y: y + h }, { x, y: y + h });
    line({ x, y: y + h }, { x, y });
    return result;
  }
  if (drawing.kind === "fib") {
    for (const ratio of FIB_LEVELS) {
      const price = b.price + (a.price - b.price) * ratio;
      const y = priceY(price);
      if (y !== null)
        line(
          { x: Math.min(first.x, second.x), y },
          { x: Math.max(first.x, second.x), y },
          `${(ratio * 100).toFixed(1).replace(/\.0$/, "")}%`,
        );
    }
    return result;
  }
  line(first, second);
  if (drawing.kind === "channel") {
    const third = drawing.anchors[2] && project(drawing.anchors[2]);
    if (!third || first.x === second.x) return result;
    result.handles.push(third);
    const baselineY = first.y + (second.y - first.y) * ((third.x - first.x) / (second.x - first.x));
    const offset = third.y - baselineY;
    line({ x: first.x, y: first.y + offset }, { x: second.x, y: second.y + offset });
    line({ x: first.x, y: first.y + offset / 2 }, { x: second.x, y: second.y + offset / 2 });
  }
  return result;
}
function distance(point: DrawingPoint, line: DrawingLine) {
  const dx = line.to.x - line.from.x,
    dy = line.to.y - line.from.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - line.from.x) * dx + (point.y - line.from.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(point.x - line.from.x - dx * t, point.y - line.from.y - dy * t);
}
export function hitDrawingGeometry(
  geometry: DrawingGeometry,
  point: DrawingPoint,
  tolerance = 7,
): boolean {
  if (geometry.lines.some((line) => distance(point, line) <= tolerance)) return true;
  if (geometry.text) {
    const { point: anchor, value } = geometry.text;
    return (
      point.x >= anchor.x - 5 &&
      point.x <= anchor.x + value.length * 8 + 5 &&
      point.y >= anchor.y - 17 &&
      point.y <= anchor.y + 5
    );
  }
  return geometry.handles.some(
    (handle) => Math.hypot(handle.x - point.x, handle.y - point.y) <= tolerance,
  );
}

/** Handles take priority over the body so a selected endpoint can be resized precisely. */
export function hitDrawingHandle(geometry: DrawingGeometry, point: DrawingPoint, tolerance = 9) {
  return geometry.handles.findIndex(
    (handle) => Math.hypot(handle.x - point.x, handle.y - point.y) <= tolerance,
  );
}

export function validDrawingAnchors(kind: DrawingKind, anchors: DrawingAnchor[]) {
  if (anchors.length !== DRAWING_ANCHORS[kind] || !anchors.every(isAnchor)) return false;
  const [first, second] = anchors;
  if (!first || !second) return true;
  if (["trend", "rectangle", "fib", "channel"].includes(kind))
    return drawingTimeValue(first.time) !== drawingTimeValue(second.time);
  return (
    kind !== "ray" ||
    drawingTimeValue(first.time) !== drawingTimeValue(second.time) ||
    first.price !== second.price
  );
}
