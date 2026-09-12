/** Native vendor bar sizes verified by the trading feed. */
export const MINUTE_INTERVALS = [1, 2, 3, 5, 10, 15, 30, 45, 60, 120, 180, 240] as const;
export const SECOND_INTERVALS = [1, 5, 10, 15, 30, 45] as const;
export const TICK_INTERVALS = [10, 100, 1000] as const;
export type ChartInterval =
  | { unit: "minute"; value: (typeof MINUTE_INTERVALS)[number] }
  | { unit: "second"; value: (typeof SECOND_INTERVALS)[number] }
  | { unit: "tick"; value: (typeof TICK_INTERVALS)[number] };
export const CHART_INTERVALS: readonly ChartInterval[] = [
  // Tick bars can share timestamps; enable only after the feed preserves their distinct identities.
  ...SECOND_INTERVALS.map((value) => ({ unit: "second" as const, value })),
  ...MINUTE_INTERVALS.map((value) => ({ unit: "minute" as const, value })),
];
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
/** Tick bars have no fixed duration; never substitute their trade count for minutes. */
export function chartIntervalMinutes(interval: ChartInterval): number | null {
  return interval.unit === "tick"
    ? null
    : interval.unit === "second"
      ? interval.value / 60
      : interval.value;
}
export function formatChartInterval(interval: ChartInterval | number): string {
  if (typeof interval === "number")
    return interval >= 60 && interval % 60 === 0 ? `${interval / 60}h` : `${interval}m`;
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
