import { describe, expect, it } from "vite-plus/test";
import type { Candle } from "./chartIndicators";
import { calculateParabolicSAR } from "./parabolicSar";

const candles = (values: readonly (readonly [number, number, number])[]): Candle[] =>
  values.map(([high, low, close], index) => ({
    time: index + 1,
    open: close,
    high,
    low,
    close,
    volume: 100,
  }));
const expectValues = (
  points: ReturnType<typeof calculateParabolicSAR>,
  values: readonly number[],
) => {
  expect(points).toHaveLength(values.length);
  points.forEach((point, index) => expect(point.value).toBeCloseTo(values[index]!, 10));
};

describe("calculateParabolicSAR", () => {
  it("initializes on the second candle using close direction and treats tied closes as down", () => {
    expect(calculateParabolicSAR([])).toEqual([]);
    expect(calculateParabolicSAR(candles([[11, 9, 10]]))).toEqual([]);
    expect(
      calculateParabolicSAR(
        candles([
          [11, 9, 10],
          [12, 10, 11],
        ]),
      ),
    ).toEqual([{ time: 2, value: 9 }]);
    expect(
      calculateParabolicSAR(
        candles([
          [11, 9, 10],
          [10, 8, 9],
        ]),
      ),
    ).toEqual([{ time: 2, value: 11 }]);
    expect(
      calculateParabolicSAR(
        candles([
          [11, 9, 10],
          [10, 8, 10],
        ]),
      ),
    ).toEqual([{ time: 2, value: 11 }]);
  });
  it("clamps against two previous lows and caps acceleration on successive new highs", () => {
    const input = candles([
      [11, 9, 10],
      [12, 10, 11],
      [13, 11, 12],
      [14, 12, 13],
      [15, 13, 14],
      [16, 14, 15],
    ]);
    expectValues(calculateParabolicSAR(input, 0.1, 0.1, 0.2), [9, 9, 9.8, 10.64, 11.512]);
    expectValues(calculateParabolicSAR(input), [9, 9, 9.16, 9.4504, 9.894368]);
    expect(calculateParabolicSAR(input, 0.1, 0.1, 0.2).map((point) => point.time)).toEqual([
      2, 3, 4, 5, 6,
    ]);
  });
  it("applies symmetric high clamps and acceleration to a falling market", () => {
    const input = candles([
      [11, 9, 10],
      [12, 10, 11],
      [13, 11, 12],
      [14, 12, 13],
      [15, 13, 14],
      [16, 14, 15],
    ]).map((bar) => ({
      ...bar,
      open: -bar.open,
      close: -bar.close,
      high: -bar.low,
      low: -bar.high,
    }));
    expectValues(calculateParabolicSAR(input, 0.1, 0.1, 0.2), [-9, -9, -9.8, -10.64, -11.512]);
  });
  it("increments acceleration only for a new extreme, not repeated highs", () => {
    const input = candles([
      [11, 9, 10],
      [12, 10, 11],
      [12, 10, 11],
      [12, 10, 11],
      [13, 11, 12],
      [13, 11, 12],
    ]);
    expectValues(calculateParabolicSAR(input, 0.1, 0.1, 0.8), [9, 9, 9.3, 9.57, 10]);
  });
  it("resets the extreme and acceleration at both reversals, including outside bars", () => {
    const input = candles([
      [11, 9, 10],
      [12, 10, 11],
      [13, 11, 12],
      [14, 8, 9],
      [12, 7, 8],
      [15, 6, 14],
      [16, 7, 15],
    ]);
    expectValues(calculateParabolicSAR(input, 0.1, 0.1, 0.5), [9, 9, 14, 14, 6, 6]);
  });
  it("uses strict penetration checks and tests reversal before applying the historical clamp", () => {
    const touches = candles([
      [2, 0, 1],
      [3, 1, 2],
      [3, 0, 2],
      [3, -1, 2],
    ]);
    expectValues(calculateParabolicSAR(touches, 0, 0, 0), [0, 0, 3]);
    const crossesProjection = candles([
      [11, 9, 10],
      [12, 10, 11],
      [13, 9.1, 12],
    ]);
    // Projected SAR=9.3 crosses 9.1; clamping to the first low of 9 first would miss reversal.
    expectValues(calculateParabolicSAR(crossesProjection, 0.1, 0.1, 0.2), [9, 13]);
  });
  it("restarts after malformed bars and does not mutate source data", () => {
    const input = candles([
      [11, 9, 10],
      [12, 10, 11],
      [0, 1, 0],
      [21, 19, 20],
      [22, 20, 21],
    ]);
    const before = structuredClone(input);
    expect(calculateParabolicSAR(input)).toEqual([
      { time: 2, value: 9 },
      { time: 5, value: 19 },
    ]);
    expect(input).toEqual(before);
    expect(calculateParabolicSAR(input)).toEqual(calculateParabolicSAR(input, 0.02, 0.02, 0.2));
  });
  it.each([
    [NaN, 0.02, 0.2],
    [0.02, Infinity, 0.2],
    [0.02, 0.02, Infinity],
    [-1, 0.02, 0.2],
    [0.02, -1, 0.2],
    [0.3, 0.02, 0.2],
  ])("rejects invalid acceleration inputs (%s, %s, %s)", (start, increment, maximum) => {
    expect(
      calculateParabolicSAR(
        candles([
          [11, 9, 10],
          [12, 10, 11],
        ]),
        start,
        increment,
        maximum,
      ),
    ).toEqual([]);
  });
  it("keeps flat zero-price bars finite and drops overflowed projections", () => {
    expect(
      calculateParabolicSAR(
        candles([
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ]),
      ),
    ).toEqual([
      { time: 2, value: 0 },
      { time: 3, value: 0 },
    ]);
    const huge = candles([
      [Number.MAX_VALUE, -Number.MAX_VALUE, 0],
      [Number.MAX_VALUE, -Number.MAX_VALUE, 1],
    ]);
    expect(calculateParabolicSAR(huge)).toEqual([]);
    const invalid = candles([
      [11, 9, 10],
      [12, 10, 11],
      [13, 11, 12],
      [14, 12, 13],
    ]);
    invalid[1]!.high = Infinity;
    expect(calculateParabolicSAR(invalid)).toEqual([{ time: 4, value: 11 }]);
  });
});
