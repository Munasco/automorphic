import { describe, expect, it, vi } from "vite-plus/test";
import {
  chartNavigationIndex,
  centerChartNavigationRange,
  CHART_DATE_NAVIGATION_KEY,
  readChartNavigationTime,
  writeChartNavigationTime,
} from "./chartDateNavigation";
const bar = (time: number, actualTime?: number) => ({
  time,
  open: 1,
  high: 2,
  low: 0,
  close: 1,
  volume: 1,
  ...(actualTime === undefined ? {} : { actualTime }),
});

describe("chart date navigation", () => {
  it("selects the bar at or before a target across gaps and rejects unloaded/replay-future dates", () => {
    const bars = [bar(100), bar(200), bar(500)];
    expect(chartNavigationIndex(bars, 100)).toBe(0);
    expect(chartNavigationIndex(bars, 199)).toBe(0);
    expect(chartNavigationIndex(bars, 200)).toBe(1);
    expect(chartNavigationIndex(bars, 499)).toBe(1);
    expect(chartNavigationIndex(bars, 500)).toBe(2);
    expect(chartNavigationIndex(bars, 99)).toBeNull();
    expect(chartNavigationIndex(bars, 501)).toBeNull();
    expect(chartNavigationIndex(bars.slice(0, 2), 500)).toBeNull();
    expect(chartNavigationIndex([], 100)).toBeNull();
  });
  it("uses exchange timestamps for tick candles and the last logical bar for matching timestamps", () => {
    const bars = [bar(3, 1000), bar(1, 900), bar(2, 1000), bar(4, 1100)];
    const before = structuredClone(bars);
    expect(chartNavigationIndex(bars, 1000)).toBe(2);
    expect(chartNavigationIndex(bars, 1050)).toBe(2);
    expect(chartNavigationIndex(bars, 4)).toBeNull();
    expect(chartNavigationIndex(bars, 1100)).toBe(3);
    expect(bars).toEqual(before);
  });
  it("sorts unique chart keys and handles corrected bars and nonmonotonic exchange times", () => {
    expect(chartNavigationIndex([bar(30), bar(10), bar(20)], 20)).toBe(1);
    expect(chartNavigationIndex([bar(10, 100), bar(20, 300), bar(30, 200)], 250)).toBe(2);
    expect(chartNavigationIndex([bar(10, 100), bar(20, 200), bar(10, 150)], 175)).toBe(0);
    expect(chartNavigationIndex([bar(10), bar(NaN), bar(20)], 20)).toBe(1);
    expect(chartNavigationIndex([bar(10, NaN), bar(20)], 10)).toBeNull();
  });
  it("supports fractional and pre-epoch timestamps but rejects unsafe targets", () => {
    expect(chartNavigationIndex([bar(-1), bar(0), bar(0.125)], 0.125)).toBe(2);
    for (const target of [NaN, Infinity, -Infinity, 8.64e12 + 1, -8.64e12 - 1])
      expect(chartNavigationIndex([bar(0)], target)).toBeNull();
  });
  it("centers without changing the visible span or clamping away the selected center", () => {
    expect(centerChartNavigationRange(10, { from: -5, to: 75 })).toEqual({ from: -30, to: 50 });
    expect(centerChartNavigationRange(0, { from: 2.5, to: 23 })).toEqual({
      from: -10.25,
      to: 10.25,
    });
    expect(centerChartNavigationRange(200, null)).toEqual({ from: 150, to: 250 });
    for (const current of [
      { from: 2, to: 1 },
      { from: 1, to: 1 },
      { from: NaN, to: 10 },
    ])
      expect(centerChartNavigationRange(50, current)).toEqual({ from: 0, to: 100 });
    for (const index of [-1, NaN, Infinity, 1.5])
      expect(centerChartNavigationRange(index, null)).toBeNull();
  });
});
function storage(raw: string | null = null) {
  let saved = raw;
  return {
    getItem: vi.fn(() => saved),
    setItem: vi.fn((_key: string, value: string) => {
      saved = value;
    }),
  };
}
describe("remembered chart navigation dates", () => {
  it("preserves per-symbol dates and independent workspace stores, skipping unchanged writes", () => {
    const first = storage(),
      second = storage();
    writeChartNavigationTime(first, "NQU6", 100.125);
    writeChartNavigationTime(first, "SIU6", 200);
    expect(readChartNavigationTime(first, "NQU6")).toBe(100.125);
    expect(readChartNavigationTime(first, "SIU6")).toBe(200);
    expect(readChartNavigationTime(second, "NQU6")).toBeNull();
    writeChartNavigationTime(first, "NQU6", 100.125);
    expect(first.setItem).toHaveBeenCalledTimes(2);
    expect(first.setItem.mock.calls[0]![0]).toBe(CHART_DATE_NAVIGATION_KEY);
    expect(readChartNavigationTime(storage(first.setItem.mock.calls.at(-1)![1]), "NQU6")).toBe(
      100.125,
    );
  });
  it("evicts the oldest remembered symbol after 100 entries and retains updated ones", () => {
    const saved = storage();
    for (let i = 0; i < 100; i++) writeChartNavigationTime(saved, `S${i}`, i);
    writeChartNavigationTime(saved, "S0", 1000);
    writeChartNavigationTime(saved, "S100", 100);
    expect(readChartNavigationTime(saved, "S0")).toBe(1000);
    expect(readChartNavigationTime(saved, "S1")).toBeNull();
    expect(readChartNavigationTime(saved, "S100")).toBe(100);
    expect(Object.keys(JSON.parse(saved.setItem.mock.calls.at(-1)![1]).times)).toHaveLength(100);
  });
  it("rejects invalid symbols/epochs and tolerates corrupt storage", () => {
    for (const raw of [null, "{", "null", "[]", '{"times":[]}', '{"times":{"NQ":"100"}}'])
      expect(readChartNavigationTime(storage(raw), "NQ")).toBeNull();
    const saved = storage('{"times":{"NQ":100,"bad":10,"SI":200}}');
    expect(readChartNavigationTime(saved, "NQ")).toBe(100);
    for (const symbol of ["", "bad", "NQ:TEST", "A".repeat(81)])
      writeChartNavigationTime(saved, symbol, 1);
    for (const time of [NaN, Infinity, 8.64e12 + 1]) writeChartNavigationTime(saved, "NQ", time);
    expect(saved.setItem).not.toHaveBeenCalled();
    expect(
      readChartNavigationTime(
        {
          getItem: () => {
            throw Error("Unavailable");
          },
        },
        "NQ",
      ),
    ).toBeNull();
  });
});
