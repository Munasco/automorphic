export type ChartAreaFill = {
  topColor: string | null;
  bottomColor: string | null;
  topOpacity: number;
  bottomOpacity: number;
};
export const DEFAULT_CHART_AREA_FILL: Readonly<ChartAreaFill> = Object.freeze({
  topColor: null,
  bottomColor: null,
  topOpacity: 33,
  bottomOpacity: 0,
});
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const color = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value));
const opacity = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
export function normalizeChartAreaFill(value: unknown): ChartAreaFill {
  const saved = record(value) ? value : {};
  return {
    topColor: color(saved.topColor) ? saved.topColor : null,
    bottomColor: color(saved.bottomColor) ? saved.bottomColor : null,
    topOpacity: opacity(saved.topOpacity) ? saved.topOpacity : 33,
    bottomOpacity: opacity(saved.bottomOpacity) ? saved.bottomOpacity : 0,
  };
}
export function updateChartAreaFill(current: ChartAreaFill, patch: unknown): ChartAreaFill | null {
  if (
    !record(patch) ||
    Object.entries(patch).some(([key, value]) =>
      key === "topColor" || key === "bottomColor"
        ? !color(value)
        : key === "topOpacity" || key === "bottomOpacity"
          ? !opacity(value)
          : true,
    )
  )
    return null;
  return normalizeChartAreaFill({ ...current, ...patch });
}
export function chartAreaFillColors(fill: ChartAreaFill, lineColor: string) {
  const rgba = (color: string, opacity: number) => {
    const rgb = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
    return `rgba(${rgb.join(", ")}, ${opacity / 100})`;
  };
  return {
    topColor: rgba(fill.topColor ?? lineColor, fill.topOpacity),
    bottomColor: rgba(fill.bottomColor ?? lineColor, fill.bottomOpacity),
  };
}
