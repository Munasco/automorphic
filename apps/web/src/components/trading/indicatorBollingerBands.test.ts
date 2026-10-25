import { describe, expect, it } from "vite-plus/test";
import { calculateIndicatorBollingerBands } from "./indicatorBollingerBands";

const chart = (count: number) => Array.from({ length: count }, (_, index) => ({ time: index + 1 }));
const readings = (values: number[]) => values.map((value, index) => ({ time: index + 1, value }));
const empty = { upper: [], middle: [], lower: [] };

describe("indicator Bollinger bands", () => {
  it("uses independently calculated SMA and population deviation, not sample deviation", () => {
    // Mean 5 and population variance 4 produce bounds 1..9 at 2 deviations.
    const result = calculateIndicatorBollingerBands(
      chart(8),
      readings([2, 4, 4, 4, 5, 5, 7, 9]),
      8,
      2,
    );
    expect(result).toEqual({
      upper: [{ time: 8, value: 9 }],
      middle: [{ time: 8, value: 5 }],
      lower: [{ time: 8, value: 1 }],
    });
    const rolling = calculateIndicatorBollingerBands(chart(4), readings([10, 30, 20, 50]), 3, 1.5);
    expect(rolling.middle).toEqual([
      { time: 3, value: 20 },
      { time: 4, value: 100 / 3 },
    ]);
    const deviations = [Math.sqrt(200 / 3), Math.sqrt(1400 / 9)];
    rolling.upper.forEach((point, index) =>
      expect(point.value).toBeCloseTo(rolling.middle[index]!.value + 1.5 * deviations[index]!, 10),
    );
    rolling.lower.forEach((point, index) =>
      expect(point.value).toBeCloseTo(rolling.middle[index]!.value - 1.5 * deviations[index]!, 10),
    );
  });

  it("supports length one, zero deviations, zero readings, and flat fractional values", () => {
    const points = readings([0, 50, 100]);
    expect(calculateIndicatorBollingerBands(chart(3), points, 1, 2)).toEqual({
      upper: points,
      middle: points,
      lower: points,
    });
    const zero = calculateIndicatorBollingerBands(chart(3), points, 2, 0);
    const means = [
      { time: 2, value: 25 },
      { time: 3, value: 75 },
    ];
    expect(zero).toEqual({ upper: means, middle: means, lower: means });
    const flat = calculateIndicatorBollingerBands(chart(3), readings([1.1, 1.1, 1.1]), 3, 2);
    expect(flat.upper).toEqual(flat.middle);
    expect(flat.lower).toEqual(flat.middle);
  });

  it("restarts warmup on missing chart readings rather than joining separated indicator points", () => {
    const points = [
      { time: 2, value: 10 },
      { time: 3, value: 30 },
      { time: 5, value: 20 },
      { time: 6, value: 40 },
    ];
    expect(calculateIndicatorBollingerBands(chart(6), points, 2, 2)).toEqual({
      middle: [
        { time: 3, value: 20 },
        { time: 6, value: 30 },
      ],
      upper: [
        { time: 3, value: 40 },
        { time: 6, value: 50 },
      ],
      lower: [
        { time: 3, value: 0 },
        { time: 6, value: 10 },
      ],
    });
    expect(calculateIndicatorBollingerBands(chart(6), points, 3, 2)).toEqual(empty);
  });

  it("treats nonfinite readings/timestamps as gaps without using off-chart readings", () => {
    const bars = chart(5);
    const points = readings([10, 20, 30, 40, 50]);
    const expected = {
      middle: [
        { time: 2, value: 15 },
        { time: 5, value: 45 },
      ],
      upper: [
        { time: 2, value: 25 },
        { time: 5, value: 55 },
      ],
      lower: [
        { time: 2, value: 5 },
        { time: 5, value: 35 },
      ],
    };
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(
        calculateIndicatorBollingerBands(
          bars,
          points.map((point) => (point.time === 3 ? { ...point, value: invalid } : point)),
          2,
          2,
        ),
      ).toEqual(expected);
      expect(
        calculateIndicatorBollingerBands(
          bars.map((bar) => (bar.time === 3 ? { time: invalid } : bar)),
          [...points, { time: invalid, value: 1000 }],
          2,
          2,
        ),
      ).toEqual(expected);
    }
    expect(
      calculateIndicatorBollingerBands(
        bars,
        [{ time: -1, value: 10000 }, ...points, { time: 99, value: -10000 }],
        2,
        2,
      ),
    ).toEqual(calculateIndicatorBollingerBands(bars, points, 2, 2));
  });

  it("aligns by chart time instead of reading order or elapsed time", () => {
    const result = calculateIndicatorBollingerBands(
      [{ time: 1 }, { time: 1000 }],
      [
        { time: 1000, value: 30 },
        { time: 1, value: 10 },
      ],
      2,
      2,
    );
    expect(result).toEqual({
      middle: [{ time: 1000, value: 20 }],
      upper: [{ time: 1000, value: 40 }],
      lower: [{ time: 1000, value: 0 }],
    });
  });

  it("rejects invalid parameters and waits for a complete window", () => {
    const bars = chart(3),
      points = readings([10, 20, 30]);
    for (const period of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(calculateIndicatorBollingerBands(bars, points, period, 2)).toEqual(empty);
    for (const deviation of [-1, NaN, Infinity])
      expect(calculateIndicatorBollingerBands(bars, points, 2, deviation)).toEqual(empty);
    expect(calculateIndicatorBollingerBands(bars, points, 4, 2)).toEqual(empty);
    expect(calculateIndicatorBollingerBands([], points, 1, 2)).toEqual(empty);
    expect(calculateIndicatorBollingerBands(bars, [], 1, 2)).toEqual(empty);
  });

  it("recomputes revisions without mutating inputs or changing earlier windows", () => {
    const bars = chart(5),
      points = readings([10, 20, 30, 40, 50]);
    const snapshot = structuredClone({ bars, points });
    const original = calculateIndicatorBollingerBands(bars, points, 3, 2);
    const changed = calculateIndicatorBollingerBands(
      bars,
      [...points.slice(0, -1), { time: 5, value: 80 }],
      3,
      2,
    );
    for (const key of ["upper", "middle", "lower"] as const)
      expect(changed[key].slice(0, -1)).toEqual(original[key].slice(0, -1));
    expect(changed.middle.at(-1)!.value).toBeCloseTo(50, 10);
    expect(changed.middle.at(-1)!.value).not.toBe(original.middle.at(-1)!.value);
    expect({ bars, points }).toEqual(snapshot);
    expect(calculateIndicatorBollingerBands(bars, points, 3, 2)).toEqual(original);
  });
});
