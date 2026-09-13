import { initialBalanceChartPoints, type InitialBalanceHistory } from "./useInitialBalanceHistory";
import { calculateATR } from "./advancedIndicators";
import { resolveIndicatorStyle, indicatorStyleColor } from "./indicatorStyles";
import { createIndicatorMarkers } from "./indicatorMarkers";
import { createIndicatorBandFill } from "./indicatorBandFill";
import {
  HistogramSeries,
  LineSeries,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, IndicatorPoint } from "./chartIndicators";
import type { InitialBalanceStats } from "./initialBalance";
import type { IndicatorPlot } from "./indicatorDefinition";
import { createInitialBalancePrimitive } from "./initialBalancePrimitive";
import type { ChartAppearance } from "./chartPreferences";
import {
  indicatorReadingKey,
  DEFAULT_VOLUME_COLORS,
  type ChartIndicatorInstance,
} from "./chartIndicatorInstances";
import {
  INDICATOR_CATALOG,
  getIndicatorInputs,
  getIndicatorDefinition,
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
export const oscillatorInstancePaneCount = (instances: readonly ChartIndicatorInstance[]) =>
  instances.filter(
    (instance) =>
      !instance.hidden &&
      (OSCILLATORS.includes(instance.key) ||
        (instance.key === "volume" && instance.id !== "base:volume")),
  ).length;
export type IndicatorReadings = Partial<Record<string, number>>;
type Plot = {
  series: ISeriesApi<"Line"> | ISeriesApi<"Histogram">;
  readingKey: string;
  primary: boolean;
  oscillator: boolean;
  levels: { price: number; line: IPriceLine }[];
  initialBalance?: ReturnType<typeof createInitialBalancePrimitive>;
  bandFill?: ReturnType<typeof createIndicatorBandFill>;
  markers?: ReturnType<typeof createIndicatorMarkers>;
};

/** Owns only indicator series; price, volume, drawings, and the chart lifetime remain with the caller. */
export function createIndicatorRenderer(chart: IChartApi, minMove: number) {
  const plots = new Map<string, Plot>();
  let paneSignature = "";
  const removePlot = (plot: Plot) => {
    for (const { line } of plot.levels) plot.series.removePriceLine(line);
    plot.levels.length = 0;
    chart.removeSeries(plot.series);
  };
  const readCrosshair = (event: MouseEventParams): IndicatorReadings => {
    const result: IndicatorReadings = {};
    for (const plot of plots.values()) {
      if (!plot.primary) continue;
      const point = event.seriesData.get(plot.series);
      if (point && "value" in point && typeof point.value === "number")
        result[plot.readingKey] = point.value;
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
    instances?: readonly ChartIndicatorInstance[],
  ) => {
    const active: readonly ChartIndicatorInstance[] = instances
      ? instances.filter((instance) => !instance.hidden)
      : INDICATOR_CATALOG.filter(({ key }) => enabled[key]).map(({ key }) => ({
          id: `base:${key}`,
          key,
          hidden: false,
          inputs: getIndicatorInputs(key, indicatorInputs),
          appearance: appearance[key] ?? {},
          ...(key === "ib" ? { initialBalance: ibSettings } : {}),
        }));
    const oscillatorIds = active
      .filter(
        (instance) =>
          OSCILLATORS.includes(instance.key) ||
          (instance.key === "volume" && instance.id !== "base:volume"),
      )
      .map(({ id }) => id);
    const nextSignature = oscillatorIds.join(",");
    const changedPanes = nextSignature !== paneSignature;
    if (changedPanes) {
      // Removing the final series also removes its pane. Rebuild the oscillator group
      // together so every remaining pane has the correct index after a toggle.
      for (const [id, plot] of plots)
        if (plot.oscillator) {
          removePlot(plot);
          plots.delete(id);
        }
      paneSignature = nextSignature;
    }
    const panes = new Map<string, number>(oscillatorIds.map((id, index) => [id, index + 1]));
    const desired = new Set<string>();
    const readings: IndicatorReadings = {};
    const latestTime = bars.at(-1)?.time;
    const upBars = new Map(bars.map((bar) => [bar.time, bar.close >= bar.open]));
    const line = (
      id: string,
      instance: ChartIndicatorInstance,
      points: readonly IndicatorPoint[],
      options: Partial<IndicatorPlot> = {},
    ) => {
      desired.add(id);
      const indicator = instance.key;
      const readingKey = indicatorReadingKey(instance);
      const style = resolveIndicatorStyle(
        indicator,
        options.styleKey ?? "main",
        instance.appearance,
      );
      const pane = panes.get(instance.id) ?? 0;
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
        plot = {
          series,
          readingKey,
          primary: options.primary ?? true,
          oscillator: pane > 0,
          levels: [],
        };
        plots.set(id, plot);
      }
      const levels = options.levels ?? [];
      for (let index = 0; index < levels.length; index++) {
        const price = levels[index]!;
        const existing = plot.levels[index];
        if (existing) {
          if (existing.price !== price) {
            existing.line.applyOptions({ price });
            existing.price = price;
          }
        } else {
          const line = plot.series.createPriceLine({
            price,
            color: "#515766",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: false,
            title: "",
          });
          plot.levels.push({ price, line });
        }
      }
      while (plot.levels.length > levels.length)
        plot.series.removePriceLine(plot.levels.pop()!.line);
      if (!options.histogram) {
        plot.series.applyOptions({
          color: indicatorStyleColor(style),
          lineVisible: !options.invisible && !options.markers && style.visible,
          crosshairMarkerVisible: !options.invisible && style.visible,
          lastValueVisible: pane > 0 && style.visible,
          lineWidth: style.lineWidth as 1 | 2 | 3 | 4,
          ...(options.breakOnGaps
            ? { crosshairMarkerBackgroundColor: indicatorStyleColor(style) }
            : {}),
        });
      }
      const data = points.map((point) => ({
        ...point,
        time: point.time as UTCTimestamp,
        ...(options.histogram
          ? {
              color:
                indicator === "volume"
                  ? (instance.volumeColors ?? DEFAULT_VOLUME_COLORS)[
                      upBars.get(point.time) ? "up" : "down"
                    ]
                  : indicatorStyleColor(
                      resolveIndicatorStyle(
                        indicator,
                        (point.value >= 0 ? options.positiveStyleKey : options.negativeStyleKey) ??
                          options.styleKey ??
                          "main",
                        instance.appearance,
                      ),
                    ),
            }
          : {}),
      }));
      if (options.breakOnGaps) {
        // Whitespace preserves missing readings, but line series still connect the
        // surrounding points. A point's color owns its outgoing edge, so hide
        // that edge when the next plotted point is not the next candle.
        const nextTime = new Map(bars.map((bar, index) => [bar.time, bars[index + 1]?.time]));
        const byTime = new Map(
          data.map((point, index) => [
            point.time as number,
            {
              ...point,
              color:
                data[index + 1] && data[index + 1]!.time !== nextTime.get(point.time as number)
                  ? "transparent"
                  : indicatorStyleColor(style),
            },
          ]),
        );
        plot.series.setData(
          bars.map((bar) => byTime.get(bar.time) ?? { time: bar.time as UTCTimestamp }),
        );
      } else plot.series.setData(data);
      if (options.invisible && plot.series.seriesType() === "Line")
        plot.series.applyOptions({ pointMarkersVisible: false });
      if (options.markers && plot.series.seriesType() === "Line") {
        if (!plot.markers) {
          plot.markers = createIndicatorMarkers(chart, plot.series as ISeriesApi<"Line">);
          plot.series.attachPrimitive(plot.markers.primitive);
        }
        plot.markers.update(points, style);
      }
      const latest = points.at(-1);
      if (plot.primary && latest && latest.time === latestTime) readings[readingKey] = latest.value;
    };
    let initialBalanceStatus = "";
    let initialBalanceStats: InitialBalanceStats | null = null;
    const initialBalanceStatuses: Record<string, string> = {};
    // Stable instance IDs keep duplicate settings, plot ownership, and readings separate.
    for (const instance of active) {
      const definition = getIndicatorDefinition(instance.key);
      const readingKey = indicatorReadingKey(instance);
      if (instance.key === "volume" && instance.id !== "base:volume") {
        line(
          `${instance.id}.volume`,
          instance,
          bars
            .filter((bar) => Number.isFinite(bar.volume))
            .map((bar) => ({ time: bar.time, value: bar.volume! })),
          { histogram: true, volumeFormat: true },
        );
        continue;
      }
      const auxiliary = definition.key === "ib" ? sessionHistory : undefined;
      const result = definition.calculate({
        bars: auxiliary?.bars ?? bars,
        inputs: instance.inputs,
        interval: auxiliary ? 1 : interval,
        session: instance.initialBalance ?? ibSettings,
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
        const id = `${instance.id}.${output.id}`;
        const points = auxiliary
          ? initialBalanceChartPoints(
              output.points,
              bars,
              sessionEnd.get(output.id.split(".")[0]!) ?? -Infinity,
            )
          : output.points;
        line(id, instance, points, output);
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
                resolveIndicatorStyle(definition.key, style.key, instance.appearance),
              ]),
            ),
          );
        }
      }
      const fillHost = result.plots[0]
        ? plots.get(`${instance.id}.${result.plots[0].id}`)
        : undefined;
      if (fillHost && (result.fills?.length || fillHost.bandFill)) {
        if (!fillHost.bandFill) {
          fillHost.bandFill = createIndicatorBandFill(chart, fillHost.series as ISeriesApi<"Line">);
          fillHost.series.attachPrimitive(fillHost.bandFill.primitive);
        }
        fillHost.bandFill.update(
          (result.fills ?? []).map((fill) => ({
            ...fill,
            ...resolveIndicatorStyle(definition.key, fill.styleKey, instance.appearance),
          })),
        );
      }
      if (result.reading !== undefined) readings[readingKey] = result.reading;
      if (result.sessionStats) {
        readings[readingKey] = result.sessionStats.midpoint;
        initialBalanceStats ??= result.sessionStats;
      }
      if (result.status) {
        initialBalanceStatuses[instance.id] = auxiliary?.status || result.status;
        initialBalanceStatus ||= initialBalanceStatuses[instance.id]!;
      }
    }
    for (const [id, plot] of plots)
      if (!desired.has(id)) {
        removePlot(plot);
        plots.delete(id);
      }
    if (changedPanes) {
      chart.panes()[0]?.setStretchFactor(3);
      for (const pane of chart.panes().slice(1)) pane.setStretchFactor(1);
    }
    return { readings, initialBalanceStatus, initialBalanceStats, initialBalanceStatuses };
  };
  return { update, readCrosshair };
}
