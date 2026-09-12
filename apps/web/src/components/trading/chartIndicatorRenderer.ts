import { initialBalanceChartPoints, type InitialBalanceHistory } from "./useInitialBalanceHistory";
import { calculateATR } from "./advancedIndicators";
import { resolveIndicatorStyle, indicatorStyleColor } from "./indicatorStyles";
import { createIndicatorBandFill } from "./indicatorBandFill";
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
  bandFill?: ReturnType<typeof createIndicatorBandFill>;
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
    sessionHistory?: Pick<InitialBalanceHistory, "bars" | "status">,
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
                ...(indicator === "ib" && options.invisible
                  ? {
                      // IB's invisible data series retain crosshair readings; only its
                      // visible overlay levels and box should expand the price scale.
                      autoscaleInfoProvider: () => {
                        const primitive = plots.get(id)?.initialBalance?.primitive;
                        if (!primitive) return null;
                        const visible = chart.timeScale().getVisibleLogicalRange();
                        return visible
                          ? (primitive.autoscaleInfo?.(visible.from, visible.to) ?? null)
                          : null;
                      },
                    }
                  : {}),
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
          color: indicatorStyleColor(style),
          lineVisible: !options.invisible && style.visible,
          crosshairMarkerVisible: !options.invisible && style.visible,
          lastValueVisible: pane > 0 && style.visible,
          lineWidth: style.lineWidth as 1 | 2 | 3 | 4,
        });
      }
      const data = points.map((point) => ({
        ...point,
        time: point.time as UTCTimestamp,
        ...(options.histogram
          ? {
              color: indicatorStyleColor(
                resolveIndicatorStyle(
                  indicator,
                  (point.value >= 0 ? options.positiveStyleKey : options.negativeStyleKey) ??
                    options.styleKey ??
                    "main",
                  appearance[indicator],
                ),
              ),
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
      const auxiliary = definition.key === "ib" ? sessionHistory : undefined;
      const result = definition.calculate({
        bars: auxiliary?.bars ?? bars,
        inputs: inputs(definition.key),
        interval: auxiliary ? 1 : interval,
        session: ibSettings,
      });
      if (auxiliary && result.sessionStats) {
        const last = bars.at(-1);
        const atr = calculateATR(bars).at(-1);
        const stats = result.sessionStats;
        const value = atr && atr.time === last?.time ? atr.value : null;
        const nearestBoundary =
          last && Math.abs(last.close - stats.high) <= Math.abs(last.close - stats.low)
            ? "IBH"
            : "IBL";
        result.sessionStats = {
          ...stats,
          atr: value,
          rangeAtrPercent: value && value > 0 ? (stats.range / value) * 100 : null,
          ...(last
            ? {
                position:
                  last.close > stats.high
                    ? "Above IBH"
                    : last.close < stats.low
                      ? "Below IBL"
                      : "Inside",
                nearestBoundary,
                distance: last.close - (nearestBoundary === "IBH" ? stats.high : stats.low),
              }
            : {}),
        };
      }
      const sessionEnd = new Map(
        result.plots.flatMap((plot) =>
          plot.overlay?.kind === "initial-balance"
            ? [[plot.id.split(".")[0]!, plot.overlay.range.sessionEndTime] as const]
            : [],
        ),
      );
      for (const output of result.plots) {
        const id = `${definition.key}.${output.id}`;
        const points = auxiliary
          ? initialBalanceChartPoints(
              output.points,
              bars,
              sessionEnd.get(output.id.split(".")[0]!) ?? -Infinity,
            )
          : output.points;
        line(id, definition.key, points, output);
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
      const fillHost = result.plots[0]
        ? plots.get(`${definition.key}.${result.plots[0].id}`)
        : undefined;
      if (fillHost && (result.fills?.length || fillHost.bandFill)) {
        if (!fillHost.bandFill) {
          fillHost.bandFill = createIndicatorBandFill(chart, fillHost.series as ISeriesApi<"Line">);
          fillHost.series.attachPrimitive(fillHost.bandFill.primitive);
        }
        fillHost.bandFill.update(
          (result.fills ?? []).map((fill) => ({
            ...fill,
            ...resolveIndicatorStyle(definition.key, fill.styleKey, appearance[definition.key]),
          })),
        );
      }
      if (result.reading !== undefined) readings[definition.key] = result.reading;
      if (result.sessionStats) initialBalanceStats = result.sessionStats;
      if (result.status) initialBalanceStatus = auxiliary?.status || result.status;
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
