import { describe, expect, it } from "vite-plus/test";
import { createCalendarSeries } from "./calendarSeries.ts";
const day = (date: string, open: number, close: number, volume = 10) => ({
  time: Date.parse(`${date}T00:00:00Z`) / 1000,
  open,
  close,
  high: Math.max(open, close) + 1,
  low: Math.min(open, close) - 1,
  volume,
});
describe("calendar candles", () => {
  it("groups weeks from Monday, across year boundaries and missing holidays", () => {
    const result = createCalendarSeries("week", 1).accept(
      [day("2026-12-31", 10, 12), day("2027-01-04", 20, 21), day("2026-12-28", 9, 10)],
      true,
    );
    expect(result).toEqual([
      { time: day("2026-12-28", 0, 0).time, open: 9, high: 13, low: 8, close: 12, volume: 20 },
      day("2027-01-04", 20, 21),
    ]);
  });
  it("uses actual month boundaries including leap February", () => {
    const result = createCalendarSeries("month", 1).accept(
      [day("2028-02-28", 10, 11), day("2028-02-29", 11, 12), day("2028-03-01", 12, 13)],
      true,
    );
    expect(result.map(({ time, volume }) => ({ time, volume }))).toEqual([
      { time: day("2028-02-01", 0, 0).time, volume: 20 },
      { time: day("2028-03-01", 0, 0).time, volume: 10 },
    ]);
  });
  it("replaces live daily bars without double counting or older history overwriting them", () => {
    const series = createCalendarSeries("month", 1);
    series.accept([day("2026-09-01", 10, 11)], true);
    series.accept([day("2026-09-02", 11, 12, 20)], false);
    series.accept([day("2026-09-02", 11, 13, 30)], false);
    expect(series.accept([day("2026-09-02", 11, 12, 20)], true)).toEqual([
      { time: day("2026-09-01", 0, 0).time, open: 10, close: 13, high: 14, low: 9, volume: 40 },
    ]);
  });
  it("anchors quarter, half year and year periods to calendar starts", () => {
    for (const [size, start] of [
      [3, "2026-07-01"],
      [6, "2026-07-01"],
      [12, "2026-01-01"],
    ] as const) {
      expect(
        createCalendarSeries("month", size).accept([day("2026-09-11", 10, 11)], true)[0]?.time,
      ).toBe(day(start, 0, 0).time);
    }
  });
});
