import {
  drawingTimeValue,
  type DrawingAnchor,
  type DrawingPoint,
  type DrawingSettings,
} from "./drawingGeometry";

export type DrawingStatKind = NonNullable<DrawingSettings["stats"]>[number];
export type DrawingStats = Record<DrawingStatKind, number | null>;

export function calculateDrawingStats(input: {
  anchors: readonly DrawingAnchor[];
  points?: readonly DrawingPoint[];
  logical?: readonly (number | null)[];
  minMove?: number;
}): DrawingStats {
  const result: DrawingStats = {
    price: null,
    percent: null,
    ticks: null,
    bars: null,
    datetime: null,
    distance: null,
    angle: null,
  };
  const [a, b] = input.anchors;
  if (!a || !b) return result;
  const finite = (value: number) => (Number.isFinite(value) ? value : null);
  result.price = finite(b.price - a.price);
  if (a.price !== 0) result.percent = finite(((b.price - a.price) / Math.abs(a.price)) * 100);
  if (input.minMove !== undefined && input.minMove > 0 && Number.isFinite(input.minMove))
    result.ticks = finite((b.price - a.price) / input.minMove);
  const at = drawingTimeValue(a.time),
    bt = drawingTimeValue(b.time);
  if (at !== null && bt !== null) result.datetime = finite(Math.abs(bt - at));
  const [al, bl] = input.logical ?? [];
  if (al != null && bl != null) result.bars = finite(Math.abs(bl - al));
  const [ap, bp] = input.points ?? [];
  if (ap && bp) {
    const dx = bp.x - ap.x,
      dy = ap.y - bp.y;
    result.distance = finite(Math.hypot(dx, dy));
    if (result.distance !== 0) result.angle = finite((Math.atan2(dy, dx) * 180) / Math.PI);
  }
  return result;
}

function duration(seconds: number): string {
  let remaining = Math.round(seconds);
  const pieces: string[] = [];
  for (const [unit, size] of [
    ["d", 86_400],
    ["h", 3_600],
    ["m", 60],
    ["s", 1],
  ] as const) {
    const count = Math.floor(remaining / size);
    if (count > 0) pieces.push(`${count}${unit}`);
    remaining %= size;
  }
  return pieces.join(" ") || "0s";
}

export function formatDrawingStats(
  stats: DrawingStats,
  kinds: readonly DrawingStatKind[],
  formatPrice: (value: number) => string,
): string[] {
  const decimal = (value: number) => String(Number(value.toFixed(2)));
  return kinds.map((kind) => {
    const value = stats[kind];
    if (value === null)
      return `${kind === "datetime" ? "Time" : kind[0]!.toUpperCase() + kind.slice(1)}: —`;
    switch (kind) {
      case "price":
        return formatPrice(value);
      case "percent":
        return `${decimal(value)}%`;
      case "ticks":
        return `${decimal(value)} ticks`;
      case "bars":
        return `${decimal(value)} bars`;
      case "datetime":
        return duration(value);
      case "distance":
        return `${decimal(value)} px`;
      case "angle":
        return `${decimal(value)}°`;
    }
  });
}
