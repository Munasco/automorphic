export type ChartStyle = "candles" | "bars" | "line" | "area";
export const INDICATOR_CATEGORIES = ["Overlays", "Oscillators", "Session"] as const;
export const INDICATOR_CATALOG = [
  { key: "sma", label: "SMA 20", detail: "Simple moving average", category: "Overlays" },
  { key: "ema", label: "EMA 20", detail: "Exponential moving average", category: "Overlays" },
  {
    key: "bollinger",
    label: "Bollinger Bands",
    detail: "20 periods · 2 standard deviations",
    category: "Overlays",
  },
  {
    key: "donchian",
    label: "Donchian Channel",
    detail: "20-period high and low",
    category: "Overlays",
  },
  {
    key: "keltner",
    label: "Keltner Channels",
    detail: "20-period EMA · 10-period ATR × 2",
    category: "Overlays",
  },
  { key: "rsi", label: "RSI 14", detail: "Relative strength index", category: "Oscillators" },
  { key: "macd", label: "MACD", detail: "12 / 26 EMA · 9-period signal", category: "Oscillators" },
  { key: "atr", label: "ATR 14", detail: "Average true range", category: "Oscillators" },
  {
    key: "stochastic",
    label: "Stochastic",
    detail: "14-period %K · 3-period %D",
    category: "Oscillators",
  },
  {
    key: "stochRsi",
    label: "Stochastic RSI",
    detail: "14-period RSI · 14-period stochastic · 3 / 3 smoothing",
    category: "Oscillators",
  },
  { key: "cmf", label: "CMF 20", detail: "Chaikin money flow", category: "Oscillators" },
  { key: "roc", label: "ROC 9", detail: "Rate of change", category: "Oscillators" },
  { key: "adx", label: "ADX 14", detail: "Average directional index", category: "Oscillators" },
  { key: "obv", label: "OBV", detail: "On-balance volume", category: "Oscillators" },
  { key: "cci", label: "CCI 20", detail: "Commodity channel index", category: "Oscillators" },
  {
    key: "williams",
    label: "Williams %R 14",
    detail: "Price within its recent range",
    category: "Oscillators",
  },
  { key: "volume", label: "Volume", detail: "Traded volume per bar", category: "Oscillators" },
  {
    key: "vwap",
    label: "Session VWAP",
    detail: "Volume-weighted average price",
    category: "Session",
  },
  {
    key: "ib",
    label: "Initial balance",
    detail: "Opening range high, low and midpoint",
    category: "Session",
  },
] as const;
export type IndicatorKey = (typeof INDICATOR_CATALOG)[number]["key"];
export type ChartIndicators = Record<IndicatorKey, boolean>;
export const DEFAULT_INDICATORS: ChartIndicators = {
  sma: false,
  ema: false,
  bollinger: false,
  donchian: false,
  keltner: false,
  rsi: false,
  macd: false,
  atr: false,
  stochastic: false,
  stochRsi: false,
  cmf: false,
  roc: false,
  adx: false,
  obv: false,
  cci: false,
  williams: false,
  volume: true,
  vwap: false,
  ib: false,
};
export type IndicatorInputKey =
  | "period"
  | "deviations"
  | "atrPeriod"
  | "multiplier"
  | "rsiPeriod"
  | "stochasticPeriod"
  | "smoothK"
  | "periodD"
  | "fast"
  | "slow"
  | "signalPeriod"
  | "adxPeriod";
export type IndicatorInputDescriptor = {
  key: IndicatorInputKey;
  label: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
};
export type IndicatorInputValues = Partial<Record<IndicatorInputKey, number>>;
export type IndicatorInputSettings = Partial<Record<IndicatorKey, IndicatorInputValues>>;
const length = (
  defaultValue: number,
  key: IndicatorInputKey = "period",
  label = "Length",
): IndicatorInputDescriptor => ({ key, label, defaultValue, min: 1, max: 500, step: 1 });
export const INDICATOR_INPUTS: Record<IndicatorKey, readonly IndicatorInputDescriptor[]> = {
  sma: [length(20)],
  ema: [length(20)],
  bollinger: [
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
  donchian: [length(20)],
  keltner: [
    length(20, "period", "EMA length"),
    length(10, "atrPeriod", "ATR length"),
    { key: "multiplier", label: "ATR multiplier", defaultValue: 2, min: 0, max: 20, step: 0.1 },
  ],
  rsi: [length(14)],
  macd: [
    length(12, "fast", "Fast length"),
    length(26, "slow", "Slow length"),
    length(9, "signalPeriod", "Signal length"),
  ],
  atr: [length(14)],
  stochastic: [
    length(14, "period", "Stochastic length"),
    length(3, "smoothK", "K smoothing"),
    length(3, "periodD", "D smoothing"),
  ],
  stochRsi: [
    length(14, "rsiPeriod", "RSI length"),
    length(14, "stochasticPeriod", "Stochastic length"),
    length(3, "smoothK", "K smoothing"),
    length(3, "periodD", "D smoothing"),
  ],
  cmf: [length(20)],
  roc: [length(9)],
  adx: [length(14, "period", "DI length"), length(14, "adxPeriod", "ADX smoothing")],
  obv: [],
  cci: [length(20)],
  williams: [length(14)],
  volume: [],
  vwap: [],
  ib: [],
};
const validInput = (value: unknown, descriptor: IndicatorInputDescriptor): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= descriptor.min &&
  value <= descriptor.max &&
  (descriptor.step !== 1 || Number.isInteger(value));

/** Merge only known, valid inputs; older workspace preferences receive the original defaults. */
export function getIndicatorInputs(
  key: IndicatorKey,
  settings: IndicatorInputSettings = {},
): IndicatorInputValues {
  const result: IndicatorInputValues = {};
  for (const descriptor of INDICATOR_INPUTS[key]) {
    const value = settings[key]?.[descriptor.key];
    result[descriptor.key] = validInput(value, descriptor) ? value : descriptor.defaultValue;
  }
  if (key === "macd" && result.fast! >= result.slow!) {
    result.fast = 12;
    result.slow = 26;
  }
  return result;
}

export function normalizeIndicatorInputs(value: unknown): IndicatorInputSettings {
  if (!value || typeof value !== "object") return {};
  const input = value as IndicatorInputSettings;
  const result: IndicatorInputSettings = {};
  for (const { key } of INDICATOR_CATALOG) {
    if (!input[key] || typeof input[key] !== "object" || !INDICATOR_INPUTS[key].length) continue;
    result[key] = getIndicatorInputs(key, input);
  }
  return result;
}

/** Reject invalid edits atomically, including MACD's fast < slow relationship. */
export function updateIndicatorInputs(
  key: IndicatorKey,
  current: IndicatorInputSettings,
  patch: IndicatorInputValues,
): IndicatorInputSettings | null {
  for (const [name, value] of Object.entries(patch)) {
    const descriptor = INDICATOR_INPUTS[key].find((input) => input.key === name);
    if (!descriptor || !validInput(value, descriptor)) return null;
  }
  if (!INDICATOR_INPUTS[key].length) return null;
  const next = { ...getIndicatorInputs(key, current), ...patch };
  if (key === "macd" && next.fast! >= next.slow!) return null;
  return { ...current, [key]: next };
}

export function getIndicatorLabel(
  key: IndicatorKey,
  settings: IndicatorInputSettings = {},
): string {
  const label = INDICATOR_CATALOG.find((item) => item.key === key)!.label;
  const inputs = getIndicatorInputs(key, settings);
  const values = INDICATOR_INPUTS[key].map((input) => inputs[input.key]);
  return values.length ? `${label.replace(/ \d+$/, "")} ${values.join(" / ")}` : label;
}

export const INITIAL_BALANCE_TIME_ZONES = ["America/New_York", "America/Chicago", "UTC"] as const;
export type InitialBalanceSettings = {
  startTime: string;
  timeZone: (typeof INITIAL_BALANCE_TIME_ZONES)[number];
  durationMinutes: number;
};
export const DEFAULT_INITIAL_BALANCE: InitialBalanceSettings = {
  startTime: "09:30",
  timeZone: "America/New_York",
  durationMinutes: 60,
};
export function isValidInitialBalanceSettings(value: unknown): value is InitialBalanceSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<InitialBalanceSettings>;
  return (
    typeof settings.startTime === "string" &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(settings.startTime) &&
    INITIAL_BALANCE_TIME_ZONES.some((zone) => zone === settings.timeZone) &&
    typeof settings.durationMinutes === "number" &&
    Number.isInteger(settings.durationMinutes) &&
    settings.durationMinutes >= 1 &&
    settings.durationMinutes <= 240
  );
}
export function findIndicators(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return INDICATOR_CATALOG.filter((indicator) => {
    const searchable =
      `${indicator.key} ${indicator.label} ${indicator.detail} ${indicator.category}`.toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}
