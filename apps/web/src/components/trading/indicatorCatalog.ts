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
  { key: "rsi", label: "RSI 14", detail: "Relative strength index", category: "Oscillators" },
  { key: "macd", label: "MACD", detail: "12 / 26 EMA · 9-period signal", category: "Oscillators" },
  { key: "atr", label: "ATR 14", detail: "Average true range", category: "Oscillators" },
  {
    key: "stochastic",
    label: "Stochastic",
    detail: "14-period %K · 3-period %D",
    category: "Oscillators",
  },
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
  rsi: false,
  macd: false,
  atr: false,
  stochastic: false,
  adx: false,
  obv: false,
  cci: false,
  williams: false,
  volume: true,
  vwap: false,
  ib: false,
};
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
