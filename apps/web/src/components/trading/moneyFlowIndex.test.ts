import { describe, expect, it } from "vite-plus/test";
import type { Candle } from "./chartIndicators";
import { calculateMoneyFlowIndex } from "./moneyFlowIndex";

const bar = (time: number, typical: number, volume = 1): Candle => ({
  time,
  open: typical,
  high: typical + 1,
  low: typical - 1,
  close: typical,
  volume,
});
const mixed = [bar(1, 10), bar(2, 12, 10), bar(3, 11, 20), bar(4, 13, 30), bar(5, 12, 40)];

describe("Money Flow Index", () => {
  it("weights typical-price direction by actual volume and expires the oldest comparison", () => {
    const result = calculateMoneyFlowIndex(mixed, 3);
    // First window: positive 120 + 390, negative 220; second: positive 390, negative 220 + 480.
    expect(result.map(({ time }) => time)).toEqual([4, 5]);
    expect(result[0]!.value).toBeCloseTo((100 * 510) / 730, 12);
    expect(result[1]!.value).toBeCloseTo((100 * 390) / 1090, 12);
  });

  it("uses high/low/close rather than closing-price or opening-price direction", () => {
    const input = [bar(1, 10), { ...bar(2, 11, 5), open: 15, high: 16, low: 9, close: 9 }];
    // Close falls from 10 to 9, but typical rises from 10 to 34/3.
    expect(calculateMoneyFlowIndex(input, 1)).toEqual([{ time: 2, value: 100 }]);
  });

  it.each([1, -1])("reaches the endpoint for monotonic movement with direction %s", (direction) => {
    const input = Array.from({ length: 20 }, (_, index) =>
      bar(index, 30 + direction * index, index + 1),
    );
    const result = calculateMoneyFlowIndex(input);
    expect(result).toHaveLength(6);
    expect(result[0]!.time).toBe(14);
    expect(result.every(({ value }) => value === (direction > 0 ? 100 : 0))).toBe(true);
  });

  it("requires period complete comparisons and supports a one-comparison period", () => {
    expect(calculateMoneyFlowIndex([], 3)).toEqual([]);
    expect(calculateMoneyFlowIndex(mixed.slice(0, 3), 3)).toEqual([]);
    expect(calculateMoneyFlowIndex(mixed.slice(0, 4), 3)).toHaveLength(1);
    expect(calculateMoneyFlowIndex(mixed, 1)).toEqual([
      { time: 2, value: 100 },
      { time: 3, value: 0 },
      { time: 4, value: 100 },
      { time: 5, value: 0 },
    ]);
    for (const period of [0, -1, 1.5, NaN, Infinity])
      expect(calculateMoneyFlowIndex(mixed, period)).toEqual([]);
  });

  it("treats flat typical prices and all zero-volume windows as neutral", () => {
    const flat = Array.from({ length: 5 }, (_, index) => bar(index, 10, 100));
    expect(calculateMoneyFlowIndex(flat, 2)).toEqual([
      { time: 2, value: 50 },
      { time: 3, value: 50 },
      { time: 4, value: 50 },
    ]);
    expect(
      calculateMoneyFlowIndex(
        mixed.map((item) => ({ ...item, volume: 0 })),
        2,
      ),
    ).toEqual([
      { time: 3, value: 50 },
      { time: 4, value: 50 },
      { time: 5, value: 50 },
    ]);
    expect(calculateMoneyFlowIndex([bar(1, 0), bar(2, 0), bar(3, 0)], 2)).toEqual([
      { time: 3, value: 50 },
    ]);
  });

  it("counts flat and zero-volume comparisons in the window without assigning them buying or selling flow", () => {
    const input = [bar(1, 10), bar(2, 12, 10), bar(3, 12, 1000), bar(4, 11, 0), bar(5, 11, 20)];
    expect(calculateMoneyFlowIndex(input, 2)).toEqual([
      { time: 3, value: 100 },
      { time: 4, value: 50 },
      { time: 5, value: 50 },
    ]);
  });

  it.each([
    { time: NaN },
    { high: Infinity },
    { low: NaN },
    { close: NaN },
    { high: 5, low: 6 },
    { close: 500 },
    { close: -500 },
    { volume: NaN },
    { volume: Infinity },
    { volume: -1 },
    { high: -1, low: -3, close: -2 },
    { volume: Number.MAX_VALUE },
  ])("restarts warmup after an invalid bar %j without connecting across it", (patch) => {
    const valid = Array.from({ length: 8 }, (_, index) => bar(index, 10 + index));
    const input = valid.map((item, index) => (index === 3 ? { ...item, ...patch } : item));
    expect(calculateMoneyFlowIndex(input, 2)).toEqual([
      { time: 2, value: 100 },
      { time: 6, value: 100 },
      { time: 7, value: 100 },
    ]);
  });

  it("keeps the calculation within 0–100 when finite positive and negative totals would overflow if added", () => {
    const input = [bar(1, 1), bar(2, 2, 5e307), bar(3, 1, 1e308)];
    expect(calculateMoneyFlowIndex(input, 2)).toEqual([{ time: 3, value: 50 }]);
  });

  it("returns exactly neutral when fractional flows leave the window", () => {
    const input = [
      bar(1, 1, 0),
      bar(2, 2, 0.05),
      bar(3, 3, 0.1),
      bar(4, 4, 0.075),
      bar(5, 4),
      bar(6, 4),
      bar(7, 4),
    ];
    expect(calculateMoneyFlowIndex(input, 3).at(-1)).toEqual({ time: 7, value: 50 });
  });

  it("is prefix-stable and recomputes last-bar revisions without mutating historical prices or volume", () => {
    const snapshot = structuredClone(mixed);
    for (let end = 1; end <= mixed.length; end++) {
      const prefix = calculateMoneyFlowIndex(mixed.slice(0, end), 2);
      expect(prefix).toEqual(calculateMoneyFlowIndex(mixed, 2).filter(({ time }) => time <= end));
    }
    const before = calculateMoneyFlowIndex(mixed, 3);
    const revised = [...mixed.slice(0, -1), { ...mixed.at(-1)!, volume: 80 }];
    const after = calculateMoneyFlowIndex(revised, 3);
    expect(after[0]).toEqual(before[0]);
    expect(after[1]!.value).toBeCloseTo((100 * 390) / (390 + 220 + 960), 12);
    expect(calculateMoneyFlowIndex(mixed, 3)).toEqual(before);
    expect(mixed).toEqual(snapshot);
  });
});
