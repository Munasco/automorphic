import { describe, expect, it } from "vite-plus/test";
import type { Candle } from "./chartIndicators";
import { calculateVolumeMovingAverage } from "./volumeMovingAverage";
const bars = (volumes: number[]): Candle[] =>
  volumes.map((volume, i) => ({
    time: 1700000000 + i * 60,
    open: NaN,
    high: NaN,
    low: NaN,
    close: NaN,
    volume,
  }));
describe("volume moving average", () => {
  it("averages only volumes and rolls the window including the current candle", () => {
    const input = bars([10, 20, 30, 0, 60]);
    expect(calculateVolumeMovingAverage(input, 3)).toEqual([
      { time: input[2]!.time, value: 20 },
      { time: input[3]!.time, value: 50 / 3 },
      { time: input[4]!.time, value: 30 },
    ]);
  });
  it("defaults to 20 bars and allows single-bar and zero-volume averages", () => {
    const input = bars(Array.from({ length: 22 }, (_, i) => i));
    calculateVolumeMovingAverage(input).forEach((p, i) => expect(p.value).toBeCloseTo(9.5 + i, 12));
    expect(calculateVolumeMovingAverage(input.slice(0, 19))).toEqual([]);
    expect(calculateVolumeMovingAverage(input, 1)).toEqual(
      input.map(({ time, volume }) => ({ time, value: volume })),
    );
    expect(calculateVolumeMovingAverage(bars([0, 0, 0]), 2).map((p) => p.value)).toEqual([0, 0]);
  });
  it.each([NaN, Infinity, -1])("restarts a full window after invalid volume %s", (volume) => {
    const input = bars([10, 20, 30, volume, 40, 50, 60]);
    expect(calculateVolumeMovingAverage(input, 3)).toEqual([
      { time: input[2]!.time, value: 20 },
      { time: input[6]!.time, value: 50 },
    ]);
  });
  it("restarts after an invalid timestamp", () => {
    const input = bars([10, 20, 30, 40, 50]);
    input[2]!.time = NaN;
    expect(calculateVolumeMovingAverage(input, 2)).toEqual([
      { time: input[1]!.time, value: 15 },
      { time: input[4]!.time, value: 45 },
    ]);
  });
  it("retains flat and very large finite values without raw-sum overflow", () => {
    for (const volume of [1.1, 1e308, Number.MAX_VALUE])
      expect(
        calculateVolumeMovingAverage(bars(Array(25).fill(volume))).map((p) => p.value),
      ).toEqual(Array(6).fill(volume));
    expect(calculateVolumeMovingAverage(bars([0, 1e308, 1e308]), 3)[0]!.value / 1e308).toBeCloseTo(
      2 / 3,
      14,
    );
  });
  it("does not mutate history or change past results during a live revision", () => {
    const input = bars([10, 20, 30, 40, 50]);
    const snapshot = structuredClone(input);
    const full = calculateVolumeMovingAverage(input, 3);
    for (let end = 0; end <= input.length; end++)
      expect(calculateVolumeMovingAverage(input.slice(0, end), 3)).toEqual(
        full.slice(0, Math.max(0, end - 2)),
      );
    const revised = input.map((bar, i) => (i === 4 ? { ...bar, volume: 80 } : bar));
    const after = calculateVolumeMovingAverage(revised, 3);
    expect(after.slice(0, -1)).toEqual(full.slice(0, -1));
    expect(after.at(-1)!.value).toBe(50);
    expect(input).toEqual(snapshot);
  });
  it("rejects invalid periods and empty history", () => {
    expect(calculateVolumeMovingAverage([])).toEqual([]);
    for (const period of [0, -1, 1.5, NaN, Infinity])
      expect(calculateVolumeMovingAverage(bars([1, 2, 3]), period)).toEqual([]);
  });
});
