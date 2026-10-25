import { validDrawingAnchors, type ChartDrawing, type DrawingAnchor } from "./drawingGeometry";
import { isPositionDrawing } from "./projectionDrawingGeometry";

function validPosition(drawing: ChartDrawing, endpoint: 1 | 2, tickSize: number): boolean {
  return (
    isPositionDrawing(drawing.kind) &&
    (endpoint === 1 || endpoint === 2) &&
    Number.isFinite(tickSize) &&
    tickSize > 0 &&
    Array.isArray(drawing.anchors) &&
    validDrawingAnchors(drawing.kind, drawing.anchors)
  );
}

/** Keep fractional legacy distances visible; only editing requires whole ticks. */
export function positionDrawingTicks(
  drawing: ChartDrawing,
  endpoint: 1 | 2,
  tickSize: number,
): number | null {
  if (!validPosition(drawing, endpoint, tickSize)) return null;
  const distance = Math.abs(drawing.anchors[endpoint]!.price - drawing.anchors[0]!.price);
  const ticks = distance / tickSize;
  if (!Number.isFinite(ticks) || ticks <= 0 || ticks > Number.MAX_SAFE_INTEGER) return null;
  const nearest = Math.round(ticks);
  // Scale cancellation noise by the prices, but never erase meaningful legacy fractional ticks.
  const tolerance = Math.min(
    1e-8,
    (4 *
      Number.EPSILON *
      Math.max(Math.abs(drawing.anchors[0]!.price), Math.abs(drawing.anchors[endpoint]!.price))) /
      tickSize,
  );
  return nearest > 0 && Math.abs(ticks - nearest) <= tolerance ? nearest : ticks;
}

const decimals = (value: number): number => {
  const [coefficient = "", exponent = "0"] = value.toString().split("e");
  return Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent));
};

/** Change one price relative to entry, preserving duration and the other position levels. */
export function positionAnchorsAtTicks(
  drawing: ChartDrawing,
  endpoint: 1 | 2,
  ticks: number,
  tickSize: number,
): DrawingAnchor[] | null {
  if (!validPosition(drawing, endpoint, tickSize) || !Number.isSafeInteger(ticks) || ticks <= 0)
    return null;
  const entry = drawing.anchors[0]!.price;
  if (!Number.isFinite(entry / tickSize) || Math.abs(entry / tickSize) > Number.MAX_SAFE_INTEGER)
    return null;
  const direction = (drawing.kind === "long-position" ? 1 : -1) * (endpoint === 1 ? 1 : -1);
  const distance = ticks * tickSize;
  const raw = entry + direction * distance;
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(raw) ||
    !Number.isFinite(raw / tickSize) ||
    Math.abs(raw / tickSize) > Number.MAX_SAFE_INTEGER
  )
    return null;
  // Include entry precision: an off-grid legacy entry must retain its exact relative offset.
  const precision = Math.max(decimals(tickSize), decimals(entry));
  const price = precision <= 100 ? Number(raw.toFixed(precision)) : raw;
  const anchors = drawing.anchors.map((anchor, index) =>
    index === endpoint ? { ...anchor, price: price === 0 ? 0 : price } : anchor,
  );
  return validDrawingAnchors(drawing.kind, anchors) ? anchors : null;
}
