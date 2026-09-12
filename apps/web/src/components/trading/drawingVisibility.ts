export interface DrawingVisibilityRange {
  enabled: boolean;
  min: number;
  max: number;
}

export interface DrawingVisibility {
  ticks: boolean;
  seconds: DrawingVisibilityRange;
  minutes: DrawingVisibilityRange;
  hours: DrawingVisibilityRange;
  days: DrawingVisibilityRange;
  weeks: DrawingVisibilityRange;
  months: DrawingVisibilityRange;
  ranges: boolean;
}

export const DEFAULT_DRAWING_VISIBILITY: DrawingVisibility = {
  ticks: true,
  seconds: { enabled: true, min: 1, max: 59 },
  minutes: { enabled: true, min: 1, max: 59 },
  hours: { enabled: true, min: 1, max: 24 },
  days: { enabled: true, min: 1, max: 366 },
  weeks: { enabled: true, min: 1, max: 52 },
  months: { enabled: true, min: 1, max: 12 },
  ranges: true,
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sanitizeRange(value: unknown, limit: number): DrawingVisibilityRange {
  const input = record(value);
  const bound = (candidate: unknown, fallback: number) =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.max(1, Math.min(limit, Math.round(candidate)))
      : fallback;
  const min = bound(input.min, 1);
  const max = bound(input.max, limit);
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    min: Math.min(min, max),
    max: Math.max(min, max),
  };
}

export function sanitizeDrawingVisibility(value: unknown): DrawingVisibility {
  const input = record(value);
  return {
    ticks: typeof input.ticks === "boolean" ? input.ticks : true,
    seconds: sanitizeRange(input.seconds, 59),
    minutes: sanitizeRange(input.minutes, 59),
    hours: sanitizeRange(input.hours, 24),
    days: sanitizeRange(input.days, 366),
    weeks: sanitizeRange(input.weeks, 52),
    months: sanitizeRange(input.months, 12),
    ranges: typeof input.ranges === "boolean" ? input.ranges : true,
  };
}

function inRange(range: DrawingVisibilityRange, value: number): boolean {
  return range.enabled && value >= range.min && value <= range.max;
}

/**
 * The chart currently identifies timeframes by duration, not an interval unit.
 * Normalize exact 30-day multiples to months, then exact 7-day multiples to
 * weeks; other durations use days, hours, minutes or seconds. Consequently 7D
 * and 1W are indistinguishable here. Tick/range flags are retained for future
 * non-time charts, but neither is represented by a numeric minute duration.
 */
export function isDrawingVisibleAtInterval(
  visibility: DrawingVisibility | undefined,
  intervalMinutes: number,
): boolean {
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return false;
  const settings = visibility ?? DEFAULT_DRAWING_VISIBILITY;
  if (intervalMinutes % 43_200 === 0) return inRange(settings.months, intervalMinutes / 43_200);
  if (intervalMinutes % 10_080 === 0) return inRange(settings.weeks, intervalMinutes / 10_080);
  if (intervalMinutes >= 1_440) return inRange(settings.days, intervalMinutes / 1_440);
  if (intervalMinutes >= 60) return inRange(settings.hours, intervalMinutes / 60);
  if (intervalMinutes >= 1) return inRange(settings.minutes, intervalMinutes);
  return inRange(settings.seconds, intervalMinutes * 60);
}
