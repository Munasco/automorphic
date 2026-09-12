import {
  calculateEMA,
  calculateRSI,
  calculateSMA,
  calculateVWAP,
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
import { calculateInitialBalance, getInitialBalanceStats } from "./initialBalance";
import {
  defineIndicator,
  type IndicatorInputDescriptor,
  type IndicatorInputKey,
  type IndicatorPlot,
  type IndicatorResult,
  type IndicatorContext,
} from "./indicatorDefinition";
import { resolveInitialBalanceSettings } from "./initialBalanceSettings";
const length = (
  defaultValue: number,
  key: IndicatorInputKey = "period",
  label = "Length",
): IndicatorInputDescriptor => ({ key, label, defaultValue, min: 1, max: 500, step: 1 });

const style = (key: string, label: string, color: string, primary = false, lineWidth = 1) => ({
  key,
  label,
  color,
  primary,
  lineWidth,
});
const single = (
  points: readonly IndicatorPoint[],
  options: Partial<IndicatorPlot> = {},
): IndicatorResult => ({ plots: [{ id: "main", styleKey: "main", points, ...options }] });
const bands = (result: ReturnType<typeof calculateBollingerBands>): IndicatorResult => ({
  plots: [
    { id: "upper", styleKey: "upper", points: result.upper, primary: false },
    { id: "middle", styleKey: "main", points: result.middle },
    { id: "lower", styleKey: "lower", points: result.lower, primary: false },
  ],
});
const stochasticPlots = (result: ReturnType<typeof calculateStochastic>): IndicatorResult => ({
  plots: [
    {
      id: "k",
      styleKey: "main",
      points: result.k,
      title: "%K",
      bounds: [0, 100],
      levels: [20, 80],
    },
    {
      id: "d",
      styleKey: "signal",
      points: result.d,
      title: "%D",
      bounds: [0, 100],
      primary: false,
    },
  ],
});
function calculateSession({ bars, session, interval }: IndicatorContext): IndicatorResult {
  const resolved = resolveInitialBalanceSettings(session);
  const result = calculateInitialBalance(bars, resolved, interval);
  const atr = calculateATR(bars).at(-1);
  const stats = getInitialBalanceStats(
    result,
    bars,
    resolved,
    atr && atr.time === bars.at(-1)?.time ? atr.value : null,
  );
  const sessions = resolved.showHistory
    ? result.segments.slice(-20)
    : result.segments.filter((segment) => segment.session === result.activeSession);
  return {
    reading: stats?.midpoint,
    sessionStats: stats,
    status: `${session.startTime} ${session.timeZone} · ${session.durationMinutes} min · ${result.reason ?? result.status}`,
    plots: sessions.flatMap((segment) => [
      {
        id: `${segment.session}.high`,
        styleKey: "high",
        points: segment.high.filter((point) => point.time <= segment.range.sessionEndTime),
        primary: false,
        steps: true,
        invisible: true,
        overlay: { kind: "initial-balance" as const, range: segment.range, settings: resolved },
      },
      {
        id: `${segment.session}.low`,
        styleKey: "low",
        points: segment.low.filter((point) => point.time <= segment.range.sessionEndTime),
        primary: false,
        steps: true,
        invisible: true,
      },
      {
        id: `${segment.session}.mid`,
        styleKey: "internal",
        points: segment.mid.filter((point) => point.time <= segment.range.sessionEndTime),
        steps: true,
        invisible: true,
      },
    ]),
  };
}

export const INDICATOR_DEFINITIONS = [
  defineIndicator({
    key: "sma",
    label: "SMA 20",
    detail: "Simple moving average",
    category: "Overlays",
    placement: "overlay",
    inputs: [length(20)],
    styles: [style("main", "Line", "#eab676", true)],
    calculate: ({ bars, inputs }) => single(calculateSMA(bars, inputs.period ?? 20)),
  }),
  defineIndicator({
    key: "ema",
    label: "EMA 20",
    detail: "Exponential moving average",
    category: "Overlays",
    placement: "overlay",
    inputs: [length(20)],
    styles: [style("main", "Line", "#67a6ef", true)],
    calculate: ({ bars, inputs }) => single(calculateEMA(bars, inputs.period ?? 20)),
  }),
  defineIndicator({
    key: "bollinger",
    label: "Bollinger Bands",
    detail: "20 periods · 2 standard deviations",
    category: "Overlays",
    placement: "overlay",
    inputs: [
      length(20),
      {
        key: "deviations",
        label: "Standard deviations",
        defaultValue: 2,
        min: 0,
        max: 20,
        step: 0.1,
      },
    ],
    styles: [
      { ...style("upper", "Upper", "#60a5fa"), legacyColor: true },
      style("main", "Middle", "#93c5fd", true),
      { ...style("lower", "Lower", "#60a5fa"), legacyColor: true },
    ],
    calculate: ({ bars, inputs }) =>
      bands(calculateBollingerBands(bars, inputs.period, inputs.deviations)),
  }),
  defineIndicator({
    key: "donchian",
    label: "Donchian Channel",
    detail: "20-period high and low",
    category: "Overlays",
    placement: "overlay",
    inputs: [length(20)],
    styles: [
      { ...style("upper", "Upper", "#2dd4bf"), legacyColor: true },
      style("main", "Middle", "#99f6e4", true),
      { ...style("lower", "Lower", "#2dd4bf"), legacyColor: true },
    ],
    calculate: ({ bars, inputs }) => bands(calculateDonchian(bars, inputs.period)),
  }),
  defineIndicator({
    key: "keltner",
    label: "Keltner Channels",
    detail: "20-period EMA · 10-period ATR × 2",
    category: "Overlays",
    placement: "overlay",
    inputs: [
      length(20, "period", "EMA length"),
      length(10, "atrPeriod", "ATR length"),
      { key: "multiplier", label: "ATR multiplier", defaultValue: 2, min: 0, max: 20, step: 0.1 },
    ],
    styles: [
      { ...style("upper", "Upper", "#f472b6"), legacyColor: true },
      style("main", "Middle", "#fbcfe8", true),
      { ...style("lower", "Lower", "#f472b6"), legacyColor: true },
    ],
    calculate: ({ bars, inputs }) =>
      bands(calculateKeltnerChannels(bars, inputs.period, inputs.atrPeriod, inputs.multiplier)),
  }),
  defineIndicator({
    key: "rsi",
    label: "RSI 14",
    detail: "Relative strength index",
    category: "Oscillators",
    placement: "pane",
    inputs: [length(14)],
    styles: [style("main", "Line", "#c084fc", true)],
    calculate: ({ bars, inputs }) =>
      single(calculateRSI(bars, inputs.period ?? 14), {
        title: "RSI",
        bounds: [0, 100],
        levels: [30, 70],
      }),
  }),
  defineIndicator({
    key: "macd",
    label: "MACD",
    detail: "12 / 26 EMA · 9-period signal",
    category: "Oscillators",
    placement: "pane",
    inputs: [
      length(12, "fast", "Fast length"),
      length(26, "slow", "Slow length"),
      length(9, "signalPeriod", "Signal length"),
    ],
    styles: [
      style("main", "Primary line", "#60a5fa", true),
      style("signal", "Signal line", "#fb923c"),
      { ...style("positive", "Positive histogram", "#26a69a"), kind: "fill" },
      { ...style("negative", "Negative histogram", "#ef5350"), kind: "fill" },
    ],
    validateInputs: (values) => values.fast! < values.slow!,
    repairInputs: (values) => ({ ...values, fast: 12, slow: 26 }),
    calculate: ({ bars, inputs }) => {
      const result = calculateMACD(bars, inputs.fast, inputs.slow, inputs.signalPeriod);
      return {
        plots: [
          {
            id: "histogram",
            points: result.histogram,
            title: "Histogram",
            histogram: true,
            positiveStyleKey: "positive",
            negativeStyleKey: "negative",
            primary: false,
          },
          { id: "macd", styleKey: "main", points: result.macd, title: "MACD", levels: [0] },
          {
            id: "signal",
            styleKey: "signal",
            points: result.signal,
            title: "Signal",
            primary: false,
          },
        ],
      };
    },
  }),
  defineIndicator({
    key: "atr",
    label: "ATR 14",
    detail: "Average true range",
    category: "Oscillators",
    placement: "pane",
    inputs: [length(14)],
    styles: [style("main", "Line", "#fbbf24", true)],
    calculate: ({ bars, inputs }) => single(calculateATR(bars, inputs.period), { title: "ATR" }),
  }),
  defineIndicator({
    key: "stochastic",
    label: "Stochastic",
    detail: "14-period %K · 3-period %D",
    category: "Oscillators",
    placement: "pane",
    inputs: [
      length(14, "period", "Stochastic length"),
      length(3, "smoothK", "K smoothing"),
      length(3, "periodD", "D smoothing"),
    ],
    styles: [
      style("main", "Primary line", "#38bdf8", true),
      style("signal", "Signal line", "#fb923c"),
    ],
    calculate: ({ bars, inputs }) =>
      stochasticPlots(calculateStochastic(bars, inputs.period, inputs.smoothK, inputs.periodD)),
  }),
  defineIndicator({
    key: "stochRsi",
    label: "Stochastic RSI",
    detail: "14-period RSI · 14-period stochastic · 3 / 3 smoothing",
    category: "Oscillators",
    placement: "pane",
    inputs: [
      length(14, "rsiPeriod", "RSI length"),
      length(14, "stochasticPeriod", "Stochastic length"),
      length(3, "smoothK", "K smoothing"),
      length(3, "periodD", "D smoothing"),
    ],
    styles: [
      style("main", "Primary line", "#a78bfa", true),
      style("signal", "Signal line", "#fb923c"),
    ],
    calculate: ({ bars, inputs }) =>
      stochasticPlots(
        calculateStochasticRSI(
          bars,
          inputs.rsiPeriod,
          inputs.stochasticPeriod,
          inputs.smoothK,
          inputs.periodD,
        ),
      ),
  }),
  defineIndicator({
    key: "cmf",
    label: "CMF 20",
    detail: "Chaikin money flow",
    category: "Oscillators",
    placement: "pane",
    inputs: [length(20)],
    styles: [style("main", "Line", "#34d399", true)],
    calculate: ({ bars, inputs }) =>
      single(calculateCMF(bars, inputs.period), { title: "CMF", levels: [0] }),
  }),
  defineIndicator({
    key: "roc",
    label: "ROC 9",
    detail: "Rate of change",
    category: "Oscillators",
    placement: "pane",
    inputs: [length(9)],
    styles: [style("main", "Line", "#fbbf24", true)],
    calculate: ({ bars, inputs }) =>
      single(calculateROC(bars, inputs.period), { title: "ROC", levels: [0] }),
  }),
  defineIndicator({
    key: "adx",
    label: "ADX 14",
    detail: "Average directional index",
    category: "Oscillators",
    placement: "pane",
    inputs: [length(14, "period", "DI length"), length(14, "adxPeriod", "ADX smoothing")],
    styles: [
      style("main", "ADX", "#fbbf24", true),
      style("plus", "+DI", "#26a69a"),
      style("minus", "−DI", "#ef5350"),
    ],
    calculate: ({ bars, inputs }) => {
      const result = calculateADX(bars, inputs.period, inputs.adxPeriod);
      return {
        plots: [
          {
            id: "adx",
            styleKey: "main",
            points: result.adx,
            title: "ADX",
            bounds: [0, 100],
            levels: [25],
          },
          {
            id: "plus",
            styleKey: "plus",
            points: result.plusDI,
            title: "+DI",
            bounds: [0, 100],
            primary: false,
          },
          {
            id: "minus",
            styleKey: "minus",
            points: result.minusDI,
            title: "−DI",
            bounds: [0, 100],
            primary: false,
          },
        ],
      };
    },
  }),
  defineIndicator({
    key: "obv",
    label: "OBV",
    detail: "On-balance volume",
    category: "Oscillators",
    placement: "pane",
    inputs: [],
    styles: [style("main", "Line", "#2dd4bf", true)],
    calculate: ({ bars }) => single(calculateOBV(bars), { title: "OBV", volumeFormat: true }),
  }),
  defineIndicator({
    key: "cci",
    label: "CCI 20",
    detail: "Commodity channel index",
    category: "Oscillators",
    placement: "pane",
    inputs: [length(20)],
    styles: [style("main", "Line", "#a78bfa", true)],
    calculate: ({ bars, inputs }) =>
      single(calculateCCI(bars, inputs.period), { title: "CCI", levels: [-100, 0, 100] }),
  }),
  defineIndicator({
    key: "williams",
    label: "Williams %R 14",
    detail: "Price within its recent range",
    category: "Oscillators",
    placement: "pane",
    inputs: [length(14)],
    styles: [style("main", "Line", "#fb923c", true)],
    calculate: ({ bars, inputs }) =>
      single(calculateWilliamsR(bars, inputs.period), {
        title: "%R",
        bounds: [-100, 0],
        levels: [-80, -20],
      }),
  }),
  defineIndicator({
    key: "volume",
    label: "Volume",
    detail: "Traded volume per bar",
    category: "Oscillators",
    placement: "volume",
    inputs: [],
    styles: [],
    enabledByDefault: true,
    calculate: ({ bars }) => ({ plots: [], reading: bars.at(-1)?.volume }),
  }),
  defineIndicator({
    key: "vwap",
    label: "Session VWAP",
    detail: "Volume-weighted average price",
    category: "Session",
    placement: "overlay",
    inputs: [],
    styles: [style("main", "Line", "#c084fc", true)],
    calculate: ({ bars }) => single(calculateVWAP(bars)),
  }),
  defineIndicator({
    key: "ib",
    label: "Initial balance",
    detail: "Opening range high, low and midpoint",
    category: "Session",
    placement: "overlay",
    inputs: [],
    styles: [
      style("high", "High and upper expansions", "#26a69a", false, 2),
      style("low", "Low and lower expansions", "#ef5350", false, 2),
      style("internal", "Midpoint and quarters", "#9ca3af", true),
    ],
    calculate: ({ bars, inputs, interval, session }) =>
      calculateSession({ bars, inputs, interval, session }),
  }),
] as const;
