import { resolveIndicatorStyle } from "./indicatorStyles";
import {
  HistogramSeries,
  LineSeries,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, IndicatorPoint } from "./chartIndicators";
import type { InitialBalanceStats } from "./initialBalance";
import type { IndicatorPlot } from "./indicatorDefinition";
import { createInitialBalancePrimitive } from "./initialBalancePrimitive";
import type { ChartAppearance } from "./chartPreferences";
import {
  INDICATOR_CATALOG,
  getIndicatorInputs,
  type IndicatorInputSettings,
  type ChartIndicators,
  type IndicatorKey,
  type InitialBalanceSettings,
} from "./indicatorCatalog";

export const INDICATOR_COLORS = Object.fromEntries(
  INDICATOR_CATALOG.map((item) => [
    item.key,
    item.styles.find((style) => style.primary)?.color ?? item.styles[0]?.color ?? "#9299a7",
  ]),
) as Record<IndicatorKey, string>;
const OSCILLATORS = INDICATOR_CATALOG.filter((item) => item.placement === "pane").map(
  (item) => item.key,
);
export const oscillatorPaneCount = (enabled: ChartIndicators) =>
  OSCILLATORS.filter((key) => enabled[key]).length;
export type IndicatorReadings = Partial<Record<IndicatorKey, number>>;
type Plot = {
  series: ISeriesApi<"Line"> | ISeriesApi<"Histogram">;
  indicator: IndicatorKey;
  primary: boolean;
  oscillator: boolean;
  initialBalance?: ReturnType<typeof createInitialBalancePrimitive>;
};

/** Owns only indicator series; price, volume, drawings, and the chart lifetime remain with the caller. */
export function createIndicatorRenderer(chart: IChartApi, minMove: number) {
  const plots = new Map<string, Plot>();
  let paneSignature = "";
  const readCrosshair = (event: MouseEventParams): IndicatorReadings => {
    const result: IndicatorReadings = {};
    for (const plot of plots.values()) {
      if (!plot.primary) continue;
      const point = event.seriesData.get(plot.series);
      if (point && "value" in point && typeof point.value === "number")
        result[plot.indicator] = point.value;
    }
    return result;
  };
  const update = (
    bars: readonly Candle[],
    enabled: ChartIndicators,
    ibSettings: InitialBalanceSettings,
    interval: number,
    appearance: ChartAppearance = {},
    indicatorInputs: IndicatorInputSettings = {},
  ) => {
    const inputs = (key: IndicatorKey) => getIndicatorInputs(key, indicatorInputs);
    const oscillatorKeys = OSCILLATORS.filter((key) => enabled[key]);
    const nextSignature = oscillatorKeys.join(",");
    const changedPanes = nextSignature !== paneSignature;
    if (changedPanes) {
      // Removing the final series also removes its pane. Rebuild the oscillator group
      // together so every remaining pane has the correct index after a toggle.
      for (const [id, plot] of plots)
        if (plot.oscillator) {
          chart.removeSeries(plot.series);
          plots.delete(id);
        }
      paneSignature = nextSignature;
    }
    const panes = new Map<IndicatorKey, number>(
      oscillatorKeys.map((key, index) => [key, index + 1]),
    );
    const desired = new Set<string>();
    const readings: IndicatorReadings = {};
    const latestTime = bars.at(-1)?.time;
    const line = (
      id: string,
      indicator: IndicatorKey,
      points: readonly IndicatorPoint[],
      options: Partial<IndicatorPlot> = {},
    ) => {
      desired.add(id);
      const style = resolveIndicatorStyle(
        indicator,
        options.styleKey ?? "main",
        appearance[indicator],
      );
      const pane = panes.get(indicator) ?? 0;
      let plot = plots.get(id);
      if (!plot) {
        const priceFormat = options.volumeFormat
          ? { type: "volume" as const }
          : { type: "price" as const, precision: 2, minMove: pane ? 0.01 : minMove };
        const common = {
          title: options.title ?? "",
          priceLineVisible: false,
          lastValueVisible: pane > 0,
          priceFormat,
        };
        const series = options.histogram
          ? chart.addSeries(HistogramSeries, common, pane)
          : chart.addSeries(
              LineSeries,
              {
                ...common,
                color: style.color,
                lineWidth: 1,
                lineType: options.steps ? LineType.WithSteps : LineType.Simple,
                ...(options.invisible ? { lineVisible: false, crosshairMarkerVisible: false } : {}),
                ...(options.bounds
                  ? {
                      autoscaleInfoProvider: () => ({
                        priceRange: { minValue: options.bounds![0], maxValue: options.bounds![1] },
                      }),
                    }
                  : {}),
              },
              pane,
            );
        if (options.levels)
          for (const price of options.levels)
            series.createPriceLine({
              price,
              color: "#515766",
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: false,
              title: "",
            });
        plot = { series, indicator, primary: options.primary ?? true, oscillator: pane > 0 };
        plots.set(id, plot);
      }
      if (!options.histogram) {
        plot.series.applyOptions({
          color: style.color,
          lineWidth: style.lineWidth as 1 | 2 | 3 | 4,
        });
      }
      const data = points.map((point) => ({
        ...point,
        time: point.time as UTCTimestamp,
        ...(options.histogram
          ? {
              color: `${
                resolveIndicatorStyle(
                  indicator,
                  (point.value >= 0 ? options.positiveStyleKey : options.negativeStyleKey) ??
                    options.styleKey ??
                    "main",
                  appearance[indicator],
                ).color
              }90`,
            }
          : {}),
      }));
      plot.series.setData(data);
      if (options.invisible && plot.series.seriesType() === "Line")
        plot.series.applyOptions({ pointMarkersVisible: false });
      const latest = points.at(-1);
      if (plot.primary && latest && latest.time === latestTime) readings[indicator] = latest.value;
    };
    let initialBalanceStatus = "";
    let initialBalanceStats: InitialBalanceStats | null = null;
    // Catalog order keeps pane assignment stable when enabling several studies together.
    for (const definition of INDICATOR_CATALOG) {
      if (!enabled[definition.key]) continue;
      const result = definition.calculate({
        bars,
        inputs: inputs(definition.key),
        interval,
        session: ibSettings,
      });
      for (const output of result.plots) {
        const id = `${definition.key}.${output.id}`;
        line(id, definition.key, output.points, output);
        if (output.overlay?.kind === "initial-balance") {
          const host = plots.get(id)!;
          if (!host.initialBalance) {
            host.initialBalance = createInitialBalancePrimitive(
              chart,
              host.series as ISeriesApi<"Line">,
            );
            host.series.attachPrimitive(host.initialBalance.primitive);
          }
          host.initialBalance.update(
            output.overlay.range,
            output.overlay.settings,
            bars,
            interval,
            Object.fromEntries(
              definition.styles.map((style) => [
                style.key,
                resolveIndicatorStyle(definition.key, style.key, appearance[definition.key]),
              ]),
            ),
          );
        }
      }
      if (result.reading !== undefined) readings[definition.key] = result.reading;
      if (result.sessionStats) initialBalanceStats = result.sessionStats;
      if (result.status) initialBalanceStatus = result.status;
    }
    for (const [id, plot] of plots)
      if (!desired.has(id)) {
        chart.removeSeries(plot.series);
        plots.delete(id);
      }
    if (changedPanes) {
      chart.panes()[0]?.setStretchFactor(3);
      for (const pane of chart.panes().slice(1)) pane.setStretchFactor(1);
    }
    if (initialBalanceStats) readings.ib = initialBalanceStats.midpoint;
    return { readings, initialBalanceStatus, initialBalanceStats };
  };
  return { update, readCrosshair };
}
