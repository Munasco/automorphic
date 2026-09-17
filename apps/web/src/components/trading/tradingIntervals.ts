/** Native vendor bar sizes verified by the trading feed. */
export const MINUTE_INTERVALS = [1, 2, 3, 5, 10, 15, 30, 45, 60, 120, 180, 240] as const;
export const SECOND_INTERVALS = [1, 5, 10, 15, 30, 45] as const;
export const DAY_INTERVALS = [1, 2, 3] as const;
export const WEEK_INTERVALS = [1] as const;
export const MONTH_INTERVALS = [1, 3, 6, 12] as const;
export const TICK_INTERVALS = [10, 100, 1000] as const;
export type ChartInterval =
  | { unit: "minute"; value: (typeof MINUTE_INTERVALS)[number] }
  | { unit: "second"; value: (typeof SECOND_INTERVALS)[number] }
  | { unit: "day"; value: (typeof DAY_INTERVALS)[number] }
  | { unit: "week"; value: (typeof WEEK_INTERVALS)[number] }
  | { unit: "month"; value: (typeof MONTH_INTERVALS)[number] }
  | { unit: "tick"; value: (typeof TICK_INTERVALS)[number] };
export const CHART_INTERVALS: readonly ChartInterval[] = [
  // Tick bars can share timestamps; enable only after the feed preserves their distinct identities.
  ...SECOND_INTERVALS.map((value) => ({ unit: "second" as const, value })),
  ...MINUTE_INTERVALS.map((value) => ({ unit: "minute" as const, value })),
  ...DAY_INTERVALS.map((value) => ({ unit: "day" as const, value })),
  ...WEEK_INTERVALS.map((value) => ({ unit: "week" as const, value })),
  ...MONTH_INTERVALS.map((value) => ({ unit: "month" as const, value })),
];
/** Intervals currently exposed by the chart menu and available for favorites. */
export const CHART_MENU_INTERVALS = CHART_INTERVALS.filter(
  (item) => item.unit !== "tick" && (item.unit !== "second" || item.value === 30),
);

export const DEFAULT_CHART_INTERVAL: ChartInterval = { unit: "minute", value: 5 };

export function isChartInterval(value: unknown): value is ChartInterval {
  if (!value || typeof value !== "object" || !("unit" in value) || !("value" in value))
    return false;
  return CHART_INTERVALS.some((item) => item.unit === value.unit && item.value === value.value);
}
/** Numeric workspace settings predate interval units and always mean minutes. */
export function normalizeChartInterval(value: unknown): ChartInterval | undefined {
  const candidate = typeof value === "number" ? { unit: "minute", value } : value;
  return isChartInterval(candidate)
    ? CHART_INTERVALS.find((item) => item.unit === candidate.unit && item.value === candidate.value)
    : undefined;
}
export function chartIntervalKey(interval: ChartInterval): string {
  return `${interval.unit}:${interval.value}`;
}
export function chartIntervalFromKey(key: unknown): ChartInterval | undefined {
  return CHART_INTERVALS.find((item) => chartIntervalKey(item) === key);
}
/** Tick and calendar-month bars have no fixed duration in minutes. */
export function chartIntervalMinutes(interval: ChartInterval): number | null {
  if (interval.unit === "day") return interval.value * 1440;
  if (interval.unit === "week") return interval.value * 10080;
  if (interval.unit === "month") return null;
  return interval.unit === "tick"
    ? null
    : interval.unit === "second"
      ? interval.value / 60
      : interval.value;
}
export function formatChartInterval(interval: ChartInterval | number): string {
  if (typeof interval === "number")
    return interval >= 60 && interval % 60 === 0 ? `${interval / 60}h` : `${interval}m`;
  if (interval.unit === "day") return `${interval.value}D`;
  if (interval.unit === "week") return `${interval.value}W`;
  if (interval.unit === "month") return `${interval.value}M`;
  if (interval.unit === "tick") return `${interval.value}T`;
  if (interval.unit === "second") return `${interval.value}s`;
  return formatChartInterval(interval.value);
}
export function chartIntervalQuery(interval: ChartInterval): {
  interval: string;
  intervalUnit: ChartInterval["unit"];
} {
  return { interval: String(interval.value), intervalUnit: interval.unit };
}

export function normalizeFavoriteChartIntervals(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const available = new Set(CHART_MENU_INTERVALS.map(chartIntervalKey));
  return [
    ...new Set(value.filter((key): key is string => typeof key === "string" && available.has(key))),
  ];
}

/** Time charts keep deeper history; native tick snapshots retain their existing bounded window. */
export function chartHistoryLimit(interval: Pick<ChartInterval, "unit">): number {
  return interval.unit === "tick" ? 1200 : 6000;
}
