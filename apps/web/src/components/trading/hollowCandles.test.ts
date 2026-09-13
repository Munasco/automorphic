import { describe, expect, it } from "vite-plus/test";
import type { Candle } from "./chartIndicators";
import { hollowCandleColors } from "./hollowCandles";

const candle = (open: number, close: number, time = 2): Candle => ({
  time,
  open,
  close,
  high: Math.max(open, close) + 1,
  low: Math.min(open, close) - 1,
  volume: 100,
});
const green = "#26a69a",
  red = "#ef5350";

describe("hollowCandleColors", () => {
  it.each([
    [10, 12, 11, "transparent", green],
    [14, 12, 11, green, green],
    [10, 12, 13, "transparent", red],
    [14, 12, 13, red, red],
  ] as const)(
    "colors open %s / close %s against previous close %s independently from fill",
    (open, close, prior, color, direction) => {
      expect(hollowCandleColors(candle(open, close), candle(prior, prior, 1))).toEqual({
        color,
        borderColor: direction,
        wickColor: direction,
      });
    },
  );
  it.each([10, 12, 14])("keeps unchanged previous closes green with current open %s", (open) => {
    expect(hollowCandleColors(candle(open, 12), candle(12, 12, 1))).toEqual({
      color: open < 12 ? "transparent" : green,
      borderColor: green,
      wickColor: green,
    });
  });
  it.each([
    [11, green],
    [13, red],
  ] as const)("keeps a doji visible against prior close %s", (prior, direction) => {
    expect(hollowCandleColors(candle(12, 12), candle(prior, prior, 1))).toEqual({
      color: direction,
      borderColor: direction,
      wickColor: direction,
    });
  });
  it.each([
    [10, 12, "transparent", green],
    [14, 12, red, red],
    [12, 12, green, green],
  ] as const)(
    "falls back to open-to-close direction on the first bar (%s to %s)",
    (open, close, color, direction) => {
      const expected = { color, borderColor: direction, wickColor: direction };
      expect(hollowCandleColors(candle(open, close))).toEqual(expected);
      expect(hollowCandleColors(candle(open, close), candle(12, NaN, 1))).toEqual(expected);
    },
  );
  it("keeps the previous close across session gaps and ignores wick direction without mutating candles", () => {
    const previous = candle(100, 110, 1);
    const bar = { ...candle(120, 115, 86401), high: 130, low: 90 };
    const original = structuredClone([previous, bar]);
    expect(hollowCandleColors(bar, previous)).toEqual({
      color: green,
      borderColor: green,
      wickColor: green,
    });
    expect([previous, bar]).toEqual(original);
  });
  it("supports zero and negative prices without treating zero as a missing previous close", () => {
    expect(hollowCandleColors(candle(-2, -1), candle(0, 0, 1))).toEqual({
      color: "transparent",
      borderColor: red,
      wickColor: red,
    });
  });
  it.each([NaN, Infinity, -Infinity])(
    "does not invent a direction for invalid current prices %s",
    (value) => {
      const transparent = {
        color: "transparent",
        borderColor: "transparent",
        wickColor: "transparent",
      };
      expect(hollowCandleColors(candle(value, 12), candle(10, 10, 1))).toEqual(transparent);
      expect(hollowCandleColors(candle(12, value), candle(10, 10, 1))).toEqual(transparent);
    },
  );
});
