import { isChartInterval, type ChartInterval } from "./tradingIntervals";
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

export type DrawingVisibilityPreset = "above" | "below" | "only" | "all";
type VisibilityRangeGroup = "seconds" | "minutes" | "hours" | "days" | "weeks" | "months";
const visibilityRangeGroups: readonly VisibilityRangeGroup[] = [
  "seconds",
  "minutes",
  "hours",
  "days",
  "weeks",
  "months",
];

/** Presets follow the same group boundaries as matching; tick counts have no editable range. */
export function createDrawingVisibilityPreset(
  interval: number | ChartInterval,
  preset: DrawingVisibilityPreset,
): DrawingVisibility | null {
  const settings = sanitizeDrawingVisibility(undefined);
  if (preset === "all") return settings;
  if (preset !== "above" && preset !== "below" && preset !== "only") return null;
  if (typeof interval !== "number" && !isChartInterval(interval)) return null;

  let group: VisibilityRangeGroup;
  let value: number;
  if (typeof interval !== "number" && interval.unit === "day") {
    group = "days";
    value = interval.value;
  } else if (typeof interval !== "number" && interval.unit === "week") {
    group = "weeks";
    value = interval.value;
  } else if (typeof interval !== "number" && interval.unit === "month") {
    group = "months";
    value = interval.value;
  } else {
    if (typeof interval !== "number" && interval.unit === "tick") return null;
    const minutes =
      typeof interval === "number"
        ? interval
        : interval.unit === "second"
          ? interval.value / 60
          : interval.value;
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    [group, value] =
      minutes % 43_200 === 0
        ? ["months", minutes / 43_200]
        : minutes % 10_080 === 0
          ? ["weeks", minutes / 10_080]
          : minutes >= 1_440
            ? ["days", minutes / 1_440]
            : minutes >= 60
              ? ["hours", minutes / 60]
              : minutes >= 1
                ? ["minutes", minutes]
                : ["seconds", minutes * 60];
  }
  // The existing matcher compares exact bounds, so rounding fractional values could hide
  // the very interval being selected (including legacy floating-point conversion noise).
  if (!Number.isInteger(value) || value < 1 || value > settings[group].max) return null;
  const selectedIndex = visibilityRangeGroups.indexOf(group);
  settings.ticks = preset === "below";
  settings.ranges = preset === "above";
  for (const [index, key] of visibilityRangeGroups.entries()) {
    settings[key].enabled =
      index === selectedIndex ||
      (preset === "above" ? index > selectedIndex : preset === "below" && index < selectedIndex);
  }
  if (preset !== "below") settings[group].min = value;
  if (preset !== "above") settings[group].max = value;
  return settings;
}

function inRange(range: DrawingVisibilityRange, value: number): boolean {
  return range.enabled && value >= range.min && value <= range.max;
}

export function isDrawingVisibleAtInterval(
  visibility: DrawingVisibility | undefined,
  interval: number | ChartInterval,
): boolean {
  const settings = visibility ?? DEFAULT_DRAWING_VISIBILITY;
  if (typeof interval !== "number" && interval.unit === "day")
    return inRange(settings.days, interval.value);
  if (typeof interval !== "number" && interval.unit === "week")
    return inRange(settings.weeks, interval.value);
  if (typeof interval !== "number" && interval.unit === "month")
    return inRange(settings.months, interval.value);
  if (typeof interval !== "number" && interval.unit === "tick") return settings.ticks;
  const intervalMinutes =
    typeof interval === "number"
      ? interval
      : interval.unit === "second"
        ? interval.value / 60
        : interval.value;
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return false;
  if (intervalMinutes % 43_200 === 0) return inRange(settings.months, intervalMinutes / 43_200);
  if (intervalMinutes % 10_080 === 0) return inRange(settings.weeks, intervalMinutes / 10_080);
  if (intervalMinutes >= 1_440) return inRange(settings.days, intervalMinutes / 1_440);
  if (intervalMinutes >= 60) return inRange(settings.hours, intervalMinutes / 60);
  if (intervalMinutes >= 1) return inRange(settings.minutes, intervalMinutes);
  return inRange(settings.seconds, intervalMinutes * 60);
}
