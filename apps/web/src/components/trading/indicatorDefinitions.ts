import {
  calculateEMA,
  PRICE_SOURCES,
  calculateRSI,
  calculateSMA,
  calculateVWAPBands,
  type IndicatorPoint,
} from "./chartIndicators";
import {
  BOLLINGER_BASIS_TYPES,
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
  type IndicatorInputValues,
} from "./indicatorDefinition";
import { resolveInitialBalanceSettings } from "./initialBalanceSettings";
import { calculateParabolicSAR } from "./parabolicSar";
import { calculateSupertrend } from "./supertrend";
import { calculateMoneyFlowIndex } from "./moneyFlowIndex";
import { calculateHullMovingAverage } from "./hullMovingAverage";
import { calculateWeightedMovingAverage } from "./weightedMovingAverage";
import { calculateBollingerPercentB } from "./bollingerPercentB";
import { calculateAwesomeOscillator } from "./awesomeOscillator";
const length = (
  defaultValue: number,
  key: IndicatorInputKey = "period",
  label = "Length",
): IndicatorInputDescriptor => ({ key, label, defaultValue, min: 1, max: 500, step: 1 });

const priceSource: IndicatorInputDescriptor = {
  key: "source",
  label: "Source",
  kind: "select",
  legend: false,
  defaultValue: 0,
  min: 0,
  max: PRICE_SOURCES.length - 1,
  step: 1,
  options: PRICE_SOURCES.map((source, value) => ({
    value,
    label: /\d/.test(source) ? source.toUpperCase() : source[0]!.toUpperCase() + source.slice(1),
  })),
};

const movingAverageType = (key: string, label: string): IndicatorInputDescriptor => ({
  key,
  label,
  kind: "select",
  legend: false,
  defaultValue: 0,
  min: 0,
  max: 1,
  step: 1,
  options: [
    { value: 0, label: "EMA" },
    { value: 1, label: "SMA" },
  ],
});

const oscillatorLevelInputs = (lower: number, upper: number): IndicatorInputDescriptor[] => [
  {
    key: "showLevels",
    label: "Show levels",
    kind: "boolean",
    legend: false,
    defaultValue: 1,
    min: 0,
    max: 1,
    step: 1,
  },
  {
    key: "lowerLevel",
    label: "Lower level",
    legend: false,
    defaultValue: lower,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "upperLevel",
    label: "Upper level",
    legend: false,
    defaultValue: upper,
    min: 0,
    max: 100,
    step: 0.1,
  },
];
const validOscillatorLevels = (values: IndicatorInputValues) =>
  values.lowerLevel! < values.upperLevel!;
const oscillatorLevels = (inputs: IndicatorInputValues, lower: number, upper: number) =>
  inputs.showLevels === 0 ? [] : [inputs.lowerLevel ?? lower, inputs.upperLevel ?? upper];

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
const bands = (
  result: ReturnType<typeof calculateBollingerBands>,
  candles?: readonly { time: number }[],
): IndicatorResult => {
  const nextTime =
    candles && new Map(candles.map((bar, index) => [bar.time, candles[index + 1]?.time]));
  const fills: NonNullable<IndicatorResult["fills"]> = [];
  let start = 0;
  for (let end = 1; end <= result.upper.length; end++) {
    if (
      end !== result.upper.length &&
      (!nextTime || nextTime.get(result.upper[end - 1]!.time) === result.upper[end]!.time)
    )
      continue;
    fills.push({
      id: `background-${start}`,
      styleKey: "background",
      upper: result.upper.slice(start, end),
      lower: result.lower.slice(start, end),
    });
    start = end;
  }
  return {
    fills,
    plots: [
      {
        id: "upper",
        styleKey: "upper",
        points: result.upper,
        primary: false,
        breakOnGaps: !!candles,
      },
      { id: "middle", styleKey: "main", points: result.middle, breakOnGaps: !!candles },
      {
        id: "lower",
        styleKey: "lower",
        points: result.lower,
        primary: false,
        breakOnGaps: !!candles,
      },
    ],
  };
};
const stochasticPlots = (
  result: ReturnType<typeof calculateStochastic>,
  inputs: IndicatorInputValues,
): IndicatorResult => ({
  plots: [
    {
      id: "k",
      styleKey: "main",
      points: result.k,
      title: "%K",
      bounds: [0, 100],
      levels: oscillatorLevels(inputs, 20, 80),
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
  if (interval === 0)
    return {
      plots: [],
      status: "Initial balance needs time-based bars; choose a second or minute interval.",
    };
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
    key: "sar",
    label: "Parabolic SAR",
    detail: "Stop-and-reverse trend markers with adjustable acceleration",
    category: "Overlays",
    placement: "overlay",
    inputs: [
      { key: "start", label: "Start", defaultValue: 0.02, min: 0, max: 1, step: 0.01 },
      { key: "increment", label: "Increment", defaultValue: 0.02, min: 0, max: 1, step: 0.01 },
      { key: "maximum", label: "Maximum", defaultValue: 0.2, min: 0, max: 1, step: 0.01 },
    ],
    validateInputs: (values) => (values.start ?? 0.02) <= (values.maximum ?? 0.2),
    styles: [{ ...style("main", "SAR", "#2962ff", true), kind: "markers" }],
    calculate: ({ bars, inputs }) => ({
      plots: [
        {
          id: "main",
          styleKey: "main",
          markers: "cross",
          points: calculateParabolicSAR(
            bars,
            inputs.start ?? 0.02,
            inputs.increment ?? 0.02,
            inputs.maximum ?? 0.2,
          ),
        },
      ],
    }),
  }),
  defineIndicator({
    key: "supertrend",
    label: "Supertrend",
    detail: "ATR-based trend direction and trailing bands",
    category: "Overlays",
    placement: "overlay",
    inputs: [
      length(10, "period", "ATR length"),
      { key: "multiplier", label: "Factor", defaultValue: 3, min: 0.1, max: 100, step: 0.1 },
    ],
    styles: [
      style("up", "Up trend", "#26a69a", true, 2),
      style("down", "Down trend", "#ef5350", false, 2),
    ],
    calculate: ({ bars, inputs }) => {
      const result = calculateSupertrend(bars, inputs.period ?? 10, inputs.multiplier ?? 3);
      return {
        reading: result.reading,
        plots: [
          {
            id: "up",
            styleKey: "up",
            points: result.upSegments.flat(),
            primary: true,
            breakOnGaps: true,
          },
          {
            id: "down",
            styleKey: "down",
            points: result.downSegments.flat(),
            primary: true,
            breakOnGaps: true,
          },
        ],
      };
    },
  }),
  defineIndicator({
    key: "sma",
    label: "SMA 20",
    detail: "Simple moving average",
    category: "Overlays",
    placement: "overlay",
    inputs: [length(20), priceSource],
    styles: [style("main", "Line", "#eab676", true)],
    calculate: ({ bars, inputs }) =>
      single(calculateSMA(bars, inputs.period ?? 20, PRICE_SOURCES[inputs.source ?? 0])),
  }),
  defineIndicator({
    key: "ema",
    label: "EMA 20",
    detail: "Exponential moving average",
    category: "Overlays",
    placement: "overlay",
    inputs: [length(20), priceSource],
    styles: [style("main", "Line", "#67a6ef", true)],
    calculate: ({ bars, inputs }) =>
      single(calculateEMA(bars, inputs.period ?? 20, PRICE_SOURCES[inputs.source ?? 0])),
  }),
  defineIndicator({
    key: "wma",
    label: "WMA 9",
    detail: "Weighted moving average",
    category: "Overlays",
    placement: "overlay",
    inputs: [length(9), priceSource],
    styles: [style("main", "Line", "#34d399", true, 2)],
    calculate: ({ bars, inputs }) =>
      single(
        calculateWeightedMovingAverage(bars, inputs.period, PRICE_SOURCES[inputs.source ?? 0]),
        {
          title: "WMA",
          breakOnGaps: true,
        },
      ),
  }),
  defineIndicator({
    key: "hma",
    label: "HMA 9",
    detail: "Hull moving average",
    category: "Overlays",
    placement: "overlay",
    inputs: [length(9), priceSource],
    styles: [style("main", "Line", "#f59e0b", true, 2)],
    calculate: ({ bars, inputs }) =>
      single(calculateHullMovingAverage(bars, inputs.period, PRICE_SOURCES[inputs.source ?? 0]), {
        title: "HMA",
        breakOnGaps: true,
      }),
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
        key: "basisType",
        label: "Basis MA type",
        kind: "select",
        legend: false,
        defaultValue: 0,
        min: 0,
        max: 4,
        step: 1,
        options: BOLLINGER_BASIS_TYPES.map((basis, value) => ({
          value,
          label: basis === "rma" ? "SMMA (RMA)" : basis.toUpperCase(),
        })),
      },
      priceSource,
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
      { ...style("background", "Background", "#60a5fa"), kind: "fill", opacity: 0.05 },
    ],
    calculate: ({ bars, inputs }) =>
      bands(
        calculateBollingerBands(
          bars,
          inputs.period,
          inputs.deviations,
          PRICE_SOURCES[inputs.source ?? 0],
          BOLLINGER_BASIS_TYPES[inputs.basisType ?? 0],
        ),
        bars,
      ),
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
      { ...style("background", "Background", "#2dd4bf"), kind: "fill", opacity: 0.05 },
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
      { ...style("background", "Background", "#f472b6"), kind: "fill", opacity: 0.05 },
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
    inputs: [length(14), priceSource, ...oscillatorLevelInputs(30, 70)],
    validateInputs: validOscillatorLevels,
    repairInputs: (values) => ({ ...values, lowerLevel: 30, upperLevel: 70 }),
    styles: [style("main", "Line", "#c084fc", true)],
    calculate: ({ bars, inputs }) =>
      single(calculateRSI(bars, inputs.period ?? 14, PRICE_SOURCES[inputs.source ?? 0]), {
        title: "RSI",
        bounds: [0, 100],
        levels: oscillatorLevels(inputs, 30, 70),
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
      priceSource,
      movingAverageType("oscillatorMA", "Oscillator MA type"),
      movingAverageType("signalMA", "Signal MA type"),
    ],
    styles: [
      style("main", "Primary line", "#60a5fa", true),
      style("signal", "Signal line", "#fb923c"),
      { ...style("positive", "Positive histogram", "#26a69a"), kind: "fill", opacity: 144 / 255 },
      { ...style("negative", "Negative histogram", "#ef5350"), kind: "fill", opacity: 144 / 255 },
    ],
    validateInputs: (values) => values.fast! < values.slow!,
    repairInputs: (values) => ({ ...values, fast: 12, slow: 26 }),
    calculate: ({ bars, inputs }) => {
      const result = calculateMACD(bars, inputs.fast, inputs.slow, inputs.signalPeriod, {
        source: PRICE_SOURCES[inputs.source ?? 0] ?? "close",
        oscillatorMA: inputs.oscillatorMA === 1 ? "sma" : "ema",
        signalMA: inputs.signalMA === 1 ? "sma" : "ema",
      });
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
    inputs: [
      length(14),
      {
        key: "smoothing",
        label: "Smoothing",
        kind: "select",
        legend: false,
        defaultValue: 0,
        min: 0,
        max: 3,
        step: 1,
        options: [
          { value: 0, label: "RMA" },
          { value: 1, label: "SMA" },
          { value: 2, label: "EMA" },
          { value: 3, label: "WMA" },
        ],
      },
    ],
    styles: [style("main", "Line", "#fbbf24", true)],
    calculate: ({ bars, inputs }) =>
      single(
        calculateATR(
          bars,
          inputs.period,
          (["rma", "sma", "ema", "wma"] as const)[inputs.smoothing ?? 0] ?? "rma",
        ),
        { title: "ATR" },
      ),
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
      ...oscillatorLevelInputs(20, 80),
    ],
    validateInputs: validOscillatorLevels,
    repairInputs: (values) => ({ ...values, lowerLevel: 20, upperLevel: 80 }),
    styles: [
      style("main", "Primary line", "#38bdf8", true),
      style("signal", "Signal line", "#fb923c"),
    ],
    calculate: ({ bars, inputs }) =>
      stochasticPlots(
        calculateStochastic(bars, inputs.period, inputs.smoothK, inputs.periodD),
        inputs,
      ),
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
      { ...priceSource, label: "RSI source" },
      ...oscillatorLevelInputs(20, 80),
    ],
    validateInputs: validOscillatorLevels,
    repairInputs: (values) => ({ ...values, lowerLevel: 20, upperLevel: 80 }),
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
          PRICE_SOURCES[inputs.source ?? 0] ?? "close",
        ),
        inputs,
      ),
  }),
  defineIndicator({
    key: "ao",
    label: "Awesome Oscillator",
    detail: "AO · Median-price momentum",
    category: "Oscillators",
    placement: "pane",
    inputs: [length(5, "fast", "Fast length"), length(34, "slow", "Slow length")],
    validateInputs: (values) => values.fast! < values.slow!,
    repairInputs: (values) => ({ ...values, fast: 5, slow: 34 }),
    styles: [
      { ...style("growing", "Growing", "#26a69a", true), kind: "fill", opacity: 1 },
      { ...style("falling", "Falling", "#ef5350"), kind: "fill", opacity: 1 },
    ],
    calculate: ({ bars, inputs }) =>
      single(calculateAwesomeOscillator(bars, inputs.fast, inputs.slow), {
        title: "AO",
        styleKey: "growing",
        histogram: true,
        histogramColorMode: "change",
        positiveStyleKey: "growing",
        negativeStyleKey: "falling",
        levels: [0],
      }),
  }),
  defineIndicator({
    key: "mfi",
    label: "MFI 14",
    detail: "Money Flow Index · Price and volume momentum",
    category: "Oscillators",
    placement: "pane",
    inputs: [length(14), ...oscillatorLevelInputs(20, 80)],
    validateInputs: validOscillatorLevels,
    repairInputs: (values) => ({ ...values, lowerLevel: 20, upperLevel: 80 }),
    styles: [style("main", "Line", "#a78bfa", true)],
    calculate: ({ bars, inputs }) =>
      single(calculateMoneyFlowIndex(bars, inputs.period), {
        title: "MFI",
        bounds: [0, 100],
        levels: oscillatorLevels(inputs, 20, 80),
        breakOnGaps: true,
      }),
  }),
  defineIndicator({
    key: "bbPercentB",
    label: "Bollinger %B",
    detail: "Price position within Bollinger Bands",
    category: "Oscillators",
    placement: "pane",
    inputs: [
      length(20),
      priceSource,
      {
        key: "deviations",
        label: "Standard deviations",
        defaultValue: 2,
        min: 0.1,
        max: 10,
        step: 0.1,
      },
      ...oscillatorLevelInputs(0, 1).map((input) =>
        input.key === "showLevels" ? input : { ...input, min: -10, max: 10, step: 0.1 },
      ),
    ],
    validateInputs: validOscillatorLevels,
    repairInputs: (values) => ({ ...values, lowerLevel: 0, upperLevel: 1 }),
    styles: [style("main", "Line", "#60a5fa", true, 2)],
    calculate: ({ bars, inputs }) =>
      single(
        calculateBollingerPercentB(
          bars,
          inputs.period,
          inputs.deviations,
          PRICE_SOURCES[inputs.source ?? 0],
        ),
        {
          title: "%B",
          levels: oscillatorLevels(inputs, 0, 1),
          breakOnGaps: true,
        },
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
    inputs: [
      {
        key: "bandMode",
        label: "Bands calculation mode",
        kind: "select",
        options: [
          { value: 0, label: "Standard Deviation" },
          { value: 1, label: "Percentage" },
        ],
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 1,
        legend: false,
      },
      ...[1, 2, 3].flatMap((number) => [
        {
          key: `band${number}Enabled`,
          label: `Bands #${number}`,
          kind: "boolean" as const,
          defaultValue: number === 1 ? 1 : 0,
          min: 0,
          max: 1,
          step: 1,
          legend: false,
        },
        {
          key: `band${number}Multiplier`,
          label: `Bands multiplier #${number}`,
          defaultValue: number,
          min: 0,
          max: 20,
          step: 0.1,
          legend: false,
          shownWhen: { key: `band${number}Enabled`, value: 1 },
        },
      ]),
    ],
    styles: [
      style("main", "VWAP", "#2962ff", true),
      ...["#81c784", "#808000", "#089981"].flatMap((color, index) => {
        const number = index + 1,
          shownWhen = { key: `band${number}Enabled`, value: 1 };
        return [
          { ...style(`upper${number}`, `Upper Band #${number}`, color), shownWhen },
          { ...style(`lower${number}`, `Lower Band #${number}`, color), shownWhen },
          {
            ...style(`fill${number}`, `Bands Fill #${number}`, color),
            kind: "fill" as const,
            opacity: 0.05,
            shownWhen,
          },
        ];
      }),
    ],
    calculate: ({ bars, inputs }) => {
      const result = calculateVWAPBands(
        bars,
        [1, 2, 3].map((number) => inputs[`band${number}Multiplier`] ?? number),
        inputs.bandMode === 1 ? "percentage" : "standard-deviation",
      );
      const plots: IndicatorPlot[] = [{ id: "main", styleKey: "main", points: result.middle }];
      const fills: NonNullable<IndicatorResult["fills"]> = [];
      for (let index = 0; index < 3; index++) {
        const number = index + 1;
        if ((inputs[`band${number}Enabled`] ?? (number === 1 ? 1 : 0)) !== 1) continue;
        const band = result.bands[index]!;
        plots.push(
          { id: `upper${number}`, styleKey: `upper${number}`, points: band.upper, primary: false },
          { id: `lower${number}`, styleKey: `lower${number}`, points: band.lower, primary: false },
        );
        fills.push({
          id: `fill${number}`,
          styleKey: `fill${number}`,
          upper: band.upper,
          lower: band.lower,
        });
      }
      return { plots, fills };
    },
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
