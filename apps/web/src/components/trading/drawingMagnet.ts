import type { DrawingAnchor, DrawingPoint } from "./drawingGeometry";

type Candle = DrawingAnchor & { open: number; high: number; low: number; close: number };

/** Both rulers and drawing handles snap to the nearest OHLC on the pointed-at candle. */
export function snapDrawingAnchor(
  anchor: DrawingAnchor,
  point: DrawingPoint,
  candle: Omit<Candle, "price"> | undefined,
  mode: "off" | "weak" | "strong",
  priceToCoordinate: (price: number) => number | null,
): DrawingAnchor {
  if (mode === "off" || !candle) return anchor;
  let distance = mode === "strong" ? Infinity : 12;
  let snapped = anchor;
  for (const price of [candle.open, candle.high, candle.low, candle.close]) {
    const y = priceToCoordinate(price);
    if (y === null || !Number.isFinite(y) || !Number.isFinite(price)) continue;
    const delta = Math.abs(point.y - y);
    if (delta <= distance) {
      distance = delta;
      snapped = { time: candle.time, price };
    }
  }
  return snapped;
}
