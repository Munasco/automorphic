import { describe, expect, it } from "vite-plus/test";
import {
  calculateIndicatorMovingAverage,
  type IndicatorMovingAverageType,
} from "./indicatorMovingAverage";

const types = ["sma", "ema", "rma", "wma"] as const;
const chart = (count: number) => Array.from({ length: count }, (_, index) => ({ time: index + 1 }));
const readings = (values: number[]) => values.map((value, index) => ({ time: index + 1, value }));
const expected: Record<IndicatorMovingAverageType, number[]> = {
  sma: [20, 100 / 3, 100 / 3],
  ema: [20, 35, 32.5],
  rma: [20, 30, 30],
  wma: [65 / 3, 110 / 3, 35],
};

describe("indicator moving average", () => {
  it.each(types)(
    "calculates independently derived %s values after an exact period warmup",
    (type) => {
      const result = calculateIndicatorMovingAverage(
        chart(5),
        readings([10, 30, 20, 50, 30]),
        3,
        type,
      );
      expect(result.map((point) => point.time)).toEqual([3, 4, 5]);
      result.forEach((point, index) => expect(point.value).toBeCloseTo(expected[type][index]!, 10));
    },
  );

  it.each(types)(
    "keeps zero and bounded readings, including period one and flat windows for %s",
    (type) => {
      const points = readings([0, 100, 0, 50, 100]);
      expect(calculateIndicatorMovingAverage(chart(5), points, 1, type)).toEqual(points);
      expect(calculateIndicatorMovingAverage(chart(4), readings([0, 0, 0, 0]), 3, type)).toEqual([
        { time: 3, value: 0 },
        { time: 4, value: 0 },
      ]);
      for (const point of calculateIndicatorMovingAverage(chart(5), points, 3, type)) {
        expect(point.value).toBeGreaterThanOrEqual(0);
        expect(point.value).toBeLessThanOrEqual(100);
      }
      expect(calculateIndicatorMovingAverage(chart(2), points, 3, type)).toEqual([]);
    },
  );

  it.each(types)(
    "restarts %s warmup across missing readings rather than compressing chart gaps",
    (type) => {
      const points = [
        { time: 2, value: 10 },
        { time: 3, value: 20 },
        { time: 4, value: 30 },
        { time: 6, value: 40 },
        { time: 7, value: 60 },
        { time: 8, value: 80 },
      ];
      const result = calculateIndicatorMovingAverage(chart(8), points, 3, type);
      expect(result.map((point) => point.time)).toEqual([4, 8]);
      expect(result[0]!.value).toBeCloseTo(type === "wma" ? 70 / 3 : 20, 10);
      expect(result[1]!.value).toBeCloseTo(type === "wma" ? 200 / 3 : 60, 10);
      expect(calculateIndicatorMovingAverage(chart(8), points, 4, type)).toEqual([]);
    },
  );

  it.each(types)(
    "resets %s on nonfinite values/times and ignores points outside the chart",
    (type) => {
      const clean = readings([10, 20, 30, 40, 50, 60, 70]);
      const bars = chart(7);
      for (const invalid of [NaN, Infinity, -Infinity]) {
        const points = clean.map((point, index) =>
          index === 3 ? { ...point, value: invalid } : point,
        );
        const wanted = [
          ...calculateIndicatorMovingAverage(bars.slice(0, 3), clean.slice(0, 3), 3, type),
          ...calculateIndicatorMovingAverage(bars.slice(4), clean.slice(4), 3, type),
        ];
        expect(calculateIndicatorMovingAverage(bars, points, 3, type)).toEqual(wanted);
        expect(
          calculateIndicatorMovingAverage(
            bars.map((bar, index) => (index === 3 ? { time: invalid } : bar)),
            [...clean, { time: invalid, value: 1000 }],
            3,
            type,
          ),
        ).toEqual(wanted);
      }
      expect(
        calculateIndicatorMovingAverage(
          bars,
          [{ time: -10, value: 1e9 }, ...clean, { time: 99, value: -1e9 }],
          3,
          type,
        ),
      ).toEqual(calculateIndicatorMovingAverage(bars, clean, 3, type));
    },
  );

  it.each(types)(
    "aligns %s by time rather than point-array position and uses chart bars for warmup",
    (type) => {
      const bars = [{ time: 1 }, { time: 1000 }, { time: 100000 }];
      const points = [
        { time: 100000, value: 30 },
        { time: 1, value: 10 },
        { time: 1000, value: 20 },
      ];
      const result = calculateIndicatorMovingAverage(bars, points, 3, type);
      expect(result).toHaveLength(1);
      expect(result[0]!.time).toBe(100000);
      expect(result[0]!.value).toBeCloseTo(type === "wma" ? 70 / 3 : 20, 10);
    },
  );

  it("validates period and method without silently choosing an average", () => {
    for (const type of types) {
      for (const period of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
        expect(
          calculateIndicatorMovingAverage(chart(3), readings([1, 2, 3]), period, type),
        ).toEqual([]);
      expect(calculateIndicatorMovingAverage([], [], 1, type)).toEqual([]);
      expect(calculateIndicatorMovingAverage(chart(3), [], 1, type)).toEqual([]);
    }
    for (const invalid of [undefined, null, "EMA", "", "vwma", 0, {}, ["sma"]])
      expect(
        calculateIndicatorMovingAverage(
          chart(3),
          readings([1, 2, 3]),
          2,
          invalid as IndicatorMovingAverageType,
        ),
      ).toEqual([]);
  });

  it("keeps RMA weighted arithmetic finite when a seed sum would overflow", () => {
    const result = calculateIndicatorMovingAverage(
      chart(3),
      readings([1e308, 1e308, 1e308]),
      2,
      "rma",
    );
    expect(result).toEqual([
      { time: 2, value: 1e308 },
      { time: 3, value: 1e308 },
    ]);
  });

  it.each(types)(
    "recomputes %s revisions purely without altering prior readings or inputs",
    (type) => {
      const bars = chart(5);
      const points = readings([10, 30, 20, 50, 30]);
      const snapshot = structuredClone({ bars, points });
      const original = calculateIndicatorMovingAverage(bars, points, 3, type);
      const revised = [...points.slice(0, -1), { time: 5, value: 100 }];
      const changed = calculateIndicatorMovingAverage(bars, revised, 3, type);
      expect(changed.slice(0, -1)).toEqual(original.slice(0, -1));
      expect(changed.at(-1)!.value).not.toBe(original.at(-1)!.value);
      expect({ bars, points }).toEqual(snapshot);
      expect(calculateIndicatorMovingAverage(bars, points, 3, type)).toEqual(original);
    },
  );
});
