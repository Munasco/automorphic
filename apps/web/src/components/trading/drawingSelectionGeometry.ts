import type { DrawingGeometry, DrawingPoint } from "./drawingGeometry";

type Rect = { x: number; y: number; width: number; height: number };
const finitePoint = (point: DrawingPoint) => Number.isFinite(point.x) && Number.isFinite(point.y);
const validRect = (rect: Rect) =>
  finitePoint(rect) &&
  Number.isFinite(rect.width) &&
  Number.isFinite(rect.height) &&
  rect.width > 0 &&
  rect.height > 0 &&
  Number.isFinite(rect.x + rect.width) &&
  Number.isFinite(rect.y + rect.height);
const visible = (opacity: number | undefined) =>
  opacity === undefined || (Number.isFinite(opacity) && opacity > 0);
const corners = (rect: Rect): DrawingPoint[] => [
  { x: rect.x, y: rect.y },
  { x: rect.x + rect.width, y: rect.y },
  { x: rect.x + rect.width, y: rect.y + rect.height },
  { x: rect.x, y: rect.y + rect.height },
];
const insideRect = (point: DrawingPoint, rect: Rect) =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;

/** Parametric clipping handles strokes crossing the marquee with both endpoints outside. */
function segmentIntersectsRect(a: DrawingPoint, b: DrawingPoint, rect: Rect) {
  let from = 0,
    to = 1;
  for (const axis of ["x", "y"] as const) {
    const delta = b[axis] - a[axis];
    if (!Number.isFinite(delta)) return false;
    const low = rect[axis],
      high = low + (axis === "x" ? rect.width : rect.height);
    if (delta === 0) {
      if (a[axis] < low || a[axis] > high) return false;
    } else {
      const first = (low - a[axis]) / delta,
        last = (high - a[axis]) / delta;
      from = Math.max(from, Math.min(first, last));
      to = Math.min(to, Math.max(first, last));
      if (from > to) return false;
    }
  }
  return true;
}

function distanceToSegment(point: DrawingPoint, a: DrawingPoint, b: DrawingPoint) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (!Number.isFinite(length)) return Infinity;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function strokeIntersectsRect(a: DrawingPoint, b: DrawingPoint, rect: Rect, width: number) {
  if (!finitePoint(a) || !finitePoint(b) || !Number.isFinite(width) || width <= 0) return false;
  if (segmentIntersectsRect(a, b, rect)) return true;
  const radius = width / 2;
  const distanceToRect = (point: DrawingPoint) =>
    Math.hypot(
      Math.max(rect.x - point.x, 0, point.x - rect.x - rect.width),
      Math.max(rect.y - point.y, 0, point.y - rect.y - rect.height),
    );
  return (
    distanceToRect(a) <= radius ||
    distanceToRect(b) <= radius ||
    corners(rect).some((point) => distanceToSegment(point, a, b) <= radius)
  );
}

function polygonIntersectsRect(points: readonly DrawingPoint[], rect: Rect) {
  if (points.length < 3 || !points.every(finitePoint)) return false;
  if (points.some((point) => insideRect(point, rect))) return true;
  let winding = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!,
      b = points[(index + 1) % points.length]!;
    if (segmentIntersectsRect(a, b, rect)) return true;
    const side = (b.x - a.x) * (rect.y - a.y) - (rect.x - a.x) * (b.y - a.y);
    if (a.y <= rect.y && b.y > rect.y && side > 0) winding++;
    else if (a.y > rect.y && b.y <= rect.y && side < 0) winding--;
  }
  return winding !== 0;
}

function textIntersectsRect(text: NonNullable<DrawingGeometry["text"]>, rect: Rect) {
  const { point, value, fontSize = 14, angle = 0, align = "left", baseline = "bottom" } = text;
  if (!finitePoint(point) || !Number.isFinite(fontSize) || fontSize <= 0 || !Number.isFinite(angle))
    return false;
  const layout = text.layout;
  if (layout) {
    const transformed = (bounds: Rect) =>
      corners(bounds).map((p) => ({
        x: point.x + p.x * Math.cos(angle) - p.y * Math.sin(angle),
        y: point.y + p.x * Math.sin(angle) + p.y * Math.cos(angle),
      }));
    const box = transformed({
      x: layout.left,
      y: layout.top,
      width: layout.width,
      height: layout.height,
    });
    if (text.background && visible(text.background.opacity) && polygonIntersectsRect(box, rect))
      return true;
    if (
      text.border &&
      visible(text.border.opacity) &&
      box.some((p, index) => strokeIntersectsRect(p, box[(index + 1) % box.length]!, rect, 1))
    )
      return true;
    if (!visible(text.opacity)) return false;
    return layout.rows.some((row, index) => {
      if (!row.trim()) return false;
      const width = layout.rowWidths[index]!;
      const left =
        align === "right"
          ? layout.left + layout.width - layout.padding - width
          : align === "center"
            ? layout.left + layout.width / 2 - width / 2
            : layout.left + layout.padding;
      return polygonIntersectsRect(
        transformed({
          x: left,
          y: layout.top + layout.padding + index * layout.rowHeight,
          width,
          height: layout.rowHeight,
        }),
        rect,
      );
    });
  }
  if (!value.trim()) return false;
  // Geometry has no font metrics. Match its existing text hit-box approximation,
  // testing each row separately so multiline whitespace does not become a solid box.
  const rows = value.split(/\r?\n/),
    rowHeight = fontSize * 1.2,
    height = rows.length * rowHeight;
  const top = baseline === "top" ? 0 : baseline === "middle" ? -height / 2 : -height;
  return rows.some((row, index) => {
    if (!row.trim()) return false;
    const width = Array.from(row).length * fontSize * 0.65;
    const left = align === "right" ? -width : align === "center" ? -width / 2 : 0;
    return polygonIntersectsRect(
      corners({ x: left, y: top + index * rowHeight, width, height: rowHeight }).map((p) => ({
        x: point.x + p.x * Math.cos(angle) - p.y * Math.sin(angle),
        y: point.y + p.x * Math.sin(angle) + p.y * Math.cos(angle),
      })),
      rect,
    );
  });
}

/** Intersect visible artwork, never the anchor/handle bounding box. Caller supplies normalized bounds. */
export function drawingIntersectsRect(geometry: DrawingGeometry, rect: Rect): boolean {
  if (!validRect(rect)) return false;
  for (const line of geometry.lines) {
    if (!visible(geometry.opacity) || !visible(line.opacity)) continue;
    if (strokeIntersectsRect(line.from, line.to, rect, line.width ?? geometry.strokeWidth ?? 1))
      return true;
    if (
      line.label &&
      textIntersectsRect(
        {
          point: line.labelPoint ?? { x: line.to.x + 4, y: line.to.y - 3 },
          value: line.label,
          align: line.labelAlign ?? "left",
          baseline: line.labelBaseline ?? "bottom",
          fontSize: 12,
        },
        rect,
      )
    )
      return true;
  }
  if (geometry.rectangle && validRect(geometry.rectangle)) {
    const points = corners(geometry.rectangle);
    if (
      geometry.rectangleFill &&
      visible(geometry.rectangleFill.opacity) &&
      polygonIntersectsRect(points, rect)
    )
      return true;
    if (
      visible(geometry.opacity) &&
      points.some((point, index) =>
        strokeIntersectsRect(
          point,
          points[(index + 1) % points.length]!,
          rect,
          geometry.strokeWidth ?? 1,
        ),
      )
    )
      return true;
  }
  for (const polygon of geometry.polygons ?? []) {
    if (visible(polygon.opacity) && polygonIntersectsRect(polygon.points, rect)) return true;
  }
  if (
    visible(geometry.opacity) &&
    geometry.priceLabels?.some((label) =>
      textIntersectsRect({ ...label, baseline: "middle", fontSize: 12 }, rect),
    )
  )
    return true;
  return geometry.text ? textIntersectsRect(geometry.text, rect) : false;
}
