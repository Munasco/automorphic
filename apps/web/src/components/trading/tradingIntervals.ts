/** Supported vendor MinuteBar sizes, expressed in minutes. */
export const CHART_INTERVALS = [1, 2, 3, 5, 10, 15, 30, 45, 60, 120, 180, 240] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];

export function isChartInterval(value: unknown): value is ChartInterval {
  return typeof value === "number" && CHART_INTERVALS.some((interval) => interval === value);
}

export function formatChartInterval(minutes: number): string {
  return minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
}
