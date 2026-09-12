import {
  HistogramSeries,
  LineSeries,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  calculateEMA,
  calculateRSI,
  calculateSMA,
  calculateVWAP,
  type Candle,
  type IndicatorPoint,
} from "./chartIndicators";
import {
  calculateADX,
  calculateATR,
  calculateBollingerBands,
  calculateCCI,
  calculateCMF,
  calculateKeltnerChannels,
  calculateROC,
  calculateStochasticRSI,
  calculateDonchian,
  calculateMACD,
  calculateOBV,
  calculateStochastic,
  calculateWilliamsR,
} from "./advancedIndicators";
import { calculateInitialBalance } from "./initialBalance";
import type { ChartAppearance } from "./chartPreferences";
import {
  INDICATOR_CATALOG,
  getIndicatorInputs,
  type IndicatorInputSettings,
  type ChartIndicators,
  type IndicatorKey,
  type InitialBalanceSettings,
} from "./indicatorCatalog";

export const INDICATOR_COLORS: Record<IndicatorKey, string> = {
  sma: "#eab676",
  ema: "#67a6ef",
  vwap: "#c084fc",
  bollinger: "#60a5fa",
  donchian: "#2dd4bf",
  keltner: "#f472b6",
  stochRsi: "#a78bfa",
  cmf: "#34d399",
  roc: "#fbbf24",
  rsi: "#c084fc",
  macd: "#60a5fa",
  atr: "#fbbf24",
  stochastic: "#38bdf8",
  adx: "#fbbf24",
  obv: "#2dd4bf",
  cci: "#a78bfa",
  williams: "#fb923c",
  volume: "#9299a7",
  ib: "#facc15",
};
const OSCILLATORS = INDICATOR_CATALOG.filter(
  (item) => item.category === "Oscillators" && item.key !== "volume",
).map((item) => item.key);
export const oscillatorPaneCount = (enabled: ChartIndicators) =>
  OSCILLATORS.filter((key) => enabled[key]).length;
export type IndicatorReadings = Partial<Record<IndicatorKey, number>>;
type Plot = {
  series: ISeriesApi<"Line"> | ISeriesApi<"Histogram">;
  indicator: IndicatorKey;
  primary: boolean;
  oscillator: boolean;
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
      options: {
        color?: string;
        title?: string;
        primary?: boolean;
        histogram?: boolean;
        bounds?: [number, number];
        levels?: number[];
        steps?: boolean;
      } = {},
    ) => {
      desired.add(id);
      const pane = panes.get(indicator) ?? 0;
      let plot = plots.get(id);
      if (!plot) {
        const priceFormat =
          indicator === "obv"
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
                color: options.color ?? INDICATOR_COLORS[indicator],
                lineWidth: 1,
                lineType: options.steps ? LineType.WithSteps : LineType.Simple,
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
          color:
            options.primary === false
              ? (options.color ?? appearance[indicator]?.color ?? INDICATOR_COLORS[indicator])
              : (appearance[indicator]?.color ?? options.color ?? INDICATOR_COLORS[indicator]),
          lineWidth: (appearance[indicator]?.lineWidth ?? 1) as 1 | 2 | 3 | 4,
        });
      }
      const data = points.map((point) => ({
        ...point,
        time: point.time as UTCTimestamp,
        ...(options.histogram ? { color: point.value >= 0 ? "#26a69a90" : "#ef535090" } : {}),
      }));
      plot.series.setData(data);
      if (indicator === "ib" && plot.series.seriesType() === "Line")
        plot.series.applyOptions({ pointMarkersVisible: points.length === 1 });
      const latest = points.at(-1);
      if (plot.primary && latest && latest.time === latestTime) readings[indicator] = latest.value;
    };
    const bands = (
      indicator: "bollinger" | "donchian" | "keltner",
      result: ReturnType<typeof calculateBollingerBands>,
    ) => {
      line(`${indicator}.upper`, indicator, result.upper, { primary: false });
      line(`${indicator}.middle`, indicator, result.middle, {
        color:
          indicator === "bollinger" ? "#93c5fd" : indicator === "keltner" ? "#fbcfe8" : "#99f6e4",
      });
      line(`${indicator}.lower`, indicator, result.lower, { primary: false });
    };
    if (enabled.sma) line("sma", "sma", calculateSMA(bars, inputs("sma").period ?? 20));
    if (enabled.ema) line("ema", "ema", calculateEMA(bars, inputs("ema").period ?? 20));
    if (enabled.vwap) line("vwap", "vwap", calculateVWAP(bars));
    if (enabled.bollinger)
      bands(
        "bollinger",
        calculateBollingerBands(bars, inputs("bollinger").period, inputs("bollinger").deviations),
      );
    if (enabled.donchian) bands("donchian", calculateDonchian(bars, inputs("donchian").period));
    if (enabled.keltner)
      bands(
        "keltner",
        calculateKeltnerChannels(
          bars,
          inputs("keltner").period,
          inputs("keltner").atrPeriod,
          inputs("keltner").multiplier,
        ),
      );
    // Create panes in catalog order, including when several are enabled together.
    for (const key of oscillatorKeys) {
      if (key === "rsi")
        line("rsi", "rsi", calculateRSI(bars, inputs("rsi").period ?? 14), {
          title: "RSI",
          bounds: [0, 100],
          levels: [30, 70],
        });
      else if (key === "macd") {
        const result = calculateMACD(
          bars,
          inputs("macd").fast,
          inputs("macd").slow,
          inputs("macd").signalPeriod,
        );
        line("macd.histogram", "macd", result.histogram, {
          title: "Histogram",
          histogram: true,
          primary: false,
        });
        line("macd.macd", "macd", result.macd, { title: "MACD", levels: [0] });
        line("macd.signal", "macd", result.signal, {
          title: "Signal",
          color: "#fb923c",
          primary: false,
        });
      } else if (key === "atr")
        line("atr", "atr", calculateATR(bars, inputs("atr").period), { title: "ATR" });
      else if (key === "stochastic" || key === "stochRsi") {
        const result =
          key === "stochRsi"
            ? calculateStochasticRSI(
                bars,
                inputs(key).rsiPeriod,
                inputs(key).stochasticPeriod,
                inputs(key).smoothK,
                inputs(key).periodD,
              )
            : calculateStochastic(
                bars,
                inputs(key).period,
                inputs(key).smoothK,
                inputs(key).periodD,
              );
        line(`${key}.k`, key, result.k, {
          title: "%K",
          bounds: [0, 100],
          levels: [20, 80],
        });
        line(`${key}.d`, key, result.d, {
          title: "%D",
          bounds: [0, 100],
          color: "#fb923c",
          primary: false,
        });
      } else if (key === "adx") {
        const result = calculateADX(bars, inputs("adx").period, inputs("adx").adxPeriod);
        line("adx.adx", "adx", result.adx, { title: "ADX", bounds: [0, 100], levels: [25] });
        line("adx.plus", "adx", result.plusDI, {
          title: "+DI",
          bounds: [0, 100],
          color: "#26a69a",
          primary: false,
        });
        line("adx.minus", "adx", result.minusDI, {
          title: "−DI",
          bounds: [0, 100],
          color: "#ef5350",
          primary: false,
        });
      } else if (key === "cmf")
        line("cmf", "cmf", calculateCMF(bars, inputs("cmf").period), { title: "CMF", levels: [0] });
      else if (key === "roc")
        line("roc", "roc", calculateROC(bars, inputs("roc").period), { title: "ROC", levels: [0] });
      else if (key === "obv") line("obv", "obv", calculateOBV(bars), { title: "OBV" });
      else if (key === "cci")
        line("cci", "cci", calculateCCI(bars, inputs("cci").period), {
          title: "CCI",
          levels: [-100, 0, 100],
        });
      else if (key === "williams")
        line("williams", "williams", calculateWilliamsR(bars, inputs("williams").period), {
          title: "%R",
          bounds: [-100, 0],
          levels: [-80, -20],
        });
    }
    let initialBalanceStatus = "";
    if (enabled.ib) {
      const result = calculateInitialBalance(bars, ibSettings, interval);
      initialBalanceStatus = `${ibSettings.startTime} ${ibSettings.timeZone} · ${ibSettings.durationMinutes} min · ${result.reason ?? result.status}`;
      for (const segment of result.segments.slice(-20)) {
        // Separate series are essential: whitespace alone can bridge overnight sessions.
        line(`ib.${segment.session}.high`, "ib", segment.high, { primary: false, steps: true });
        line(`ib.${segment.session}.low`, "ib", segment.low, { primary: false, steps: true });
        line(`ib.${segment.session}.mid`, "ib", segment.mid, { color: "#fde68a", steps: true });
      }
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
    return { readings, initialBalanceStatus };
  };
  return { update, readCrosshair };
}
