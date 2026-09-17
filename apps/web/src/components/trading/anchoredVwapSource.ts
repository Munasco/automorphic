import type { Candle } from "./chartIndicators";

export const ANCHORED_VWAP_SOURCES = [
  "open",
  "high",
  "low",
  "close",
  "hl2",
  "hlc3",
  "ohlc4",
] as const;
export type AnchoredVwapSource = (typeof ANCHORED_VWAP_SOURCES)[number];

export function anchoredVwapSourcePrice(bar: Candle, source: AnchoredVwapSource): number {
  switch (source) {
    case "open":
    case "high":
    case "low":
    case "close":
      return bar[source];
    case "hl2":
      return bar.high / 2 + bar.low / 2;
    case "hlc3":
      return bar.high / 3 + bar.low / 3 + bar.close / 3;
    case "ohlc4":
      return bar.open / 4 + bar.high / 4 + bar.low / 4 + bar.close / 4;
  }
}
