import { describe, expect, it } from "vite-plus/test";
import type { Candle } from "./chartIndicators";
import {
  calculateInitialBalance,
  getInitialBalanceStats,
  DEFAULT_INITIAL_BALANCE,
  type InitialBalancePoint,
} from "./initialBalance";

const bar = (iso: string, high: number, low: number): Candle => ({
  time: Date.parse(iso) / 1000,
  open: low,
  close: high,
  high,
  low,
  volume: 1,
});
const values = (points: InitialBalancePoint[]) =>
  points.map((point) => ("value" in point ? point.value : null));
const session = (date = "2026-09-14", utcHour = 13): Candle[] => [
  bar(`${date}T${utcHour}:30:00Z`, 102, 100),
  bar(`${date}T${utcHour}:45:00Z`, 104, 99),
  bar(`${date}T${utcHour + 1}:00:00Z`, 103, 98),
  bar(`${date}T${utcHour + 1}:15:00Z`, 105, 101),
  bar(`${date}T${utcHour + 1}:30:00Z`, 500, 1),
  bar(`${date}T${utcHour + 1}:45:00Z`, 600, 0),
];

describe("initial balance", () => {
  it.each([1, 5, 10, 15, 30, 45])(
    "uses exact %ss coverage and excludes the boundary bar from the first hour",
    (seconds) => {
      const start = Date.parse("2026-09-14T13:30:00Z") / 1000;
      const count = 3600 / seconds;
      const bars = Array.from({ length: count + 1 }, (_, index) => ({
        time: start + index * seconds,
        open: 100,
        high: index < count ? 110 : 900,
        low: index < count ? 90 : 1,
        close: 100,
        volume: 1,
      }));
      const result = calculateInitialBalance(bars, DEFAULT_INITIAL_BALANCE, seconds / 60);
      expect(result.status).toBe("complete");
      expect(result.segments[0]?.range).toMatchObject({
        high: 110,
        low: 90,
        volume: count,
        endTime: start + 3600,
      });
      const missing = calculateInitialBalance(bars.slice(1), DEFAULT_INITIAL_BALANCE, seconds / 60);
      expect(missing.status).toBe("incomplete");
    },
  );
  it("tracks the exact 5m opening hour, frozen volume, projection end and live dashboard statistics", () => {
    const start = Date.parse("2026-09-14T13:30:00Z") / 1000;
    const input = Array.from({ length: 14 }, (_, index) => ({
      time: start + index * 300,
      open: 100,
      close: index < 12 ? 105 : 120,
      high: index < 12 ? 105 + index : 500,
      low: index < 12 ? 100 - index : 0,
      volume: index < 12 ? 10 : 900,
    }));
    const forming = calculateInitialBalance(input.slice(0, 12), DEFAULT_INITIAL_BALANCE, 5);
    expect(forming.segments[0]?.range).toMatchObject({
      startTime: start,
      endTime: start + 3600,
      sessionEndTime: start + 23400,
      high: 116,
      low: 89,
      volume: 120,
      status: "developing",
    });
    expect(
      getInitialBalanceStats(forming, input.slice(0, 12), DEFAULT_INITIAL_BALANCE, 9),
    ).toMatchObject({
      status: "Forming",
      range: 27,
      rangeAtrPercent: 300,
      position: "Inside",
      nearestBoundary: "IBH",
      distance: -11,
      volume: 120,
    });
    const locked = calculateInitialBalance(input, DEFAULT_INITIAL_BALANCE, 5);
    expect(locked.segments[0]?.range).toMatchObject({
      high: 116,
      low: 89,
      volume: 120,
      status: "complete",
    });
    expect(getInitialBalanceStats(locked, input, DEFAULT_INITIAL_BALANCE, 9)).toMatchObject({
      sessionName: "New York",
      status: "Locked",
      position: "Above IBH",
      nearestBoundary: "IBH",
      distance: 4,
    });
    const below = [...input.slice(0, -1), { ...input.at(-1)!, close: 80 }];
    expect(
      getInitialBalanceStats(
        calculateInitialBalance(below, DEFAULT_INITIAL_BALANCE, 5),
        below,
        DEFAULT_INITIAL_BALANCE,
        0,
      ),
    ).toMatchObject({
      position: "Below IBL",
      nearestBoundary: "IBL",
      distance: -9,
      rangeAtrPercent: null,
    });
    expect(forming.high).toEqual(locked.high.slice(0, 12));
  });

  it("marks a broken opening range unusable for boxes and excludes unavailable volume from statistics", () => {
    const input = session();
    const missing = [input[0]!, ...input.slice(2)];
    const incomplete = calculateInitialBalance(missing, DEFAULT_INITIAL_BALANCE, 15);
    expect(incomplete.segments[0]?.range.status).toBe("incomplete");
    expect(getInitialBalanceStats(incomplete, missing, DEFAULT_INITIAL_BALANCE, 2)).toBeNull();
    const noVolume = input.map((bar, index) => ({ ...bar, volume: index === 1 ? NaN : 1 }));
    const complete = calculateInitialBalance(noVolume, DEFAULT_INITIAL_BALANCE, 15);
    expect(complete.status).toBe("complete");
    expect(
      getInitialBalanceStats(complete, noVolume, DEFAULT_INITIAL_BALANCE, null)?.volume,
    ).toBeNull();
  });

  it("develops without lookahead, then freezes high/low/mid after the opening hour", () => {
    const input = session();
    const firstTwo = calculateInitialBalance(input.slice(0, 2), DEFAULT_INITIAL_BALANCE, 15);
    expect(firstTwo.status).toBe("developing");
    expect(values(firstTwo.high)).toEqual([102, 104]);
    const result = calculateInitialBalance(input, DEFAULT_INITIAL_BALANCE, 15);
    expect(values(result.high)).toEqual([102, 104, 104, 105, 105, 105]);
    expect(values(result.low)).toEqual([100, 99, 98, 98, 98, 98]);
    expect(values(result.mid)).toEqual([101, 101.5, 101, 101.5, 101.5, 101.5]);
    expect(result.high.slice(0, 2)).toEqual(firstTwo.high);
    expect(result.status).toBe("complete");
  });
  it("does not mark the final in-window live candle complete prematurely", () => {
    const input = session().slice(0, 4);
    expect(calculateInitialBalance(input, DEFAULT_INITIAL_BALANCE, 15).status).toBe("developing");
    input[3] = { ...input[3]!, high: 110 };
    expect(values(calculateInitialBalance(input, DEFAULT_INITIAL_BALANCE, 15).high).at(-1)).toBe(
      110,
    );
  });
  it("does not project a partial historical opening window after the next local day starts", () => {
    const input = session();
    const nextDay = bar("2026-09-15T12:00:00Z", 110, 100);
    const incomplete = calculateInitialBalance([input[0]!, nextDay], DEFAULT_INITIAL_BALANCE, 15);
    expect(incomplete.segments[0]?.range.status).toBe("incomplete");
    const finished = calculateInitialBalance(
      [...input.slice(0, 4), nextDay],
      DEFAULT_INITIAL_BALANCE,
      15,
    );
    expect(finished.segments[0]?.range.status).toBe("complete");
    expect(finished.status).toBe("waiting");
  });
  it("separates dates and weekend gaps, without carrying previous levels into premarket", () => {
    const first = session("2026-09-11");
    const premarket = bar("2026-09-14T12:00:00Z", 800, 1);
    const second = session();
    const result = calculateInitialBalance(
      [...first, premarket, ...second],
      DEFAULT_INITIAL_BALANCE,
      15,
    );
    expect(result.high[first.length]).toEqual({ time: premarket.time });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[1]!.high[0]).toEqual({ time: second[0]!.time, value: 102 });
    expect(calculateInitialBalance([...first, premarket], DEFAULT_INITIAL_BALANCE, 15).status).toBe(
      "waiting",
    );
  });
  it("resolves the same New York opening clock correctly on both sides of DST", () => {
    const springBefore = session("2026-03-06", 14);
    const springAfter = session("2026-03-09", 13);
    const fallBefore = session("2026-10-30", 13);
    const fallAfter = session("2026-11-02", 14);
    for (const input of [springBefore, springAfter, fallBefore, fallAfter]) {
      const result = calculateInitialBalance(input, DEFAULT_INITIAL_BALANCE, 15);
      expect(result.status).toBe("complete");
      expect(result.segments[0]?.range.sessionEndTime).toBe(input[0]!.time + 6.5 * 3600);
      expect(values(result.high)).toEqual([102, 104, 104, 105, 105, 105]);
    }
  });
  it("rejects boundary-straddling hourly candles but accepts truly aligned hourly candles", () => {
    const misaligned = [bar("2026-09-14T13:00:00Z", 200, 1), bar("2026-09-14T14:00:00Z", 150, 2)];
    const result = calculateInitialBalance(misaligned, DEFAULT_INITIAL_BALANCE, 60);
    expect(result.status).toBe("unaligned");
    expect(result.segments).toEqual([]);
    const aligned = [bar("2026-09-14T13:30:00Z", 110, 90), bar("2026-09-14T14:30:00Z", 1000, 1)];
    expect(values(calculateInitialBalance(aligned, DEFAULT_INITIAL_BALANCE, 60).high)).toEqual([
      110, 110,
    ]);
    expect(calculateInitialBalance(aligned, DEFAULT_INITIAL_BALANCE, 60).status).toBe("complete");
  });
  it("flags missing opening history, internal gaps and invalid prices without displaying an exact range", () => {
    const input = session();
    const missingStart = calculateInitialBalance(input.slice(1), DEFAULT_INITIAL_BALANCE, 15);
    expect(missingStart.status).toBe("incomplete");
    expect(missingStart.segments).toEqual([]);
    const gap = calculateInitialBalance(
      [input[0]!, ...input.slice(2)],
      DEFAULT_INITIAL_BALANCE,
      15,
    );
    expect(gap.status).toBe("incomplete");
    expect(values(gap.high)).toEqual([102, null, null, null, null]);
    const invalid = calculateInitialBalance(
      [{ ...input[0]!, high: NaN }, ...input.slice(1)],
      DEFAULT_INITIAL_BALANCE,
      15,
    );
    expect(invalid.status).toBe("incomplete");
    expect(invalid.segments).toEqual([]);
    expect(calculateInitialBalance(input.slice(4), DEFAULT_INITIAL_BALANCE, 15).status).toBe(
      "incomplete",
    );
  });
  it("supports custom opening times, timezones and durations", () => {
    const config = { startTime: "08:00", timeZone: "Europe/London", durationMinutes: 30 };
    const input = [
      bar("2026-09-14T07:00:00Z", 20, 10),
      bar("2026-09-14T07:15:00Z", 25, 15),
      bar("2026-09-14T07:30:00Z", 100, 0),
    ];
    const result = calculateInitialBalance(input, config, 15);
    expect(result.status).toBe("complete");
    expect(values(result.high)).toEqual([20, 25, 25]);
    expect(calculateInitialBalance(input, { ...config, durationMinutes: 20 }, 15).status).toBe(
      "unaligned",
    );
  });
  it("handles invalid settings and nonexistent DST clock times without fabricated output", () => {
    expect(calculateInitialBalance([], DEFAULT_INITIAL_BALANCE, 15).status).toBe("waiting");
    for (const config of [
      { ...DEFAULT_INITIAL_BALANCE, startTime: "25:30" },
      { ...DEFAULT_INITIAL_BALANCE, startTime: "09:99" },
      { ...DEFAULT_INITIAL_BALANCE, startTime: "23:30" },
      { ...DEFAULT_INITIAL_BALANCE, timeZone: "Invalid/Zone" },
      { ...DEFAULT_INITIAL_BALANCE, durationMinutes: -1 },
    ])
      expect(calculateInitialBalance(session(), config, 15).status).toBe("invalid");
    expect(calculateInitialBalance(session(), DEFAULT_INITIAL_BALANCE, 0).status).toBe("invalid");
    const spring = [bar("2026-03-08T07:30:00Z", 20, 10)];
    expect(
      calculateInitialBalance(spring, { ...DEFAULT_INITIAL_BALANCE, startTime: "02:30" }, 15)
        .status,
    ).toBe("unaligned");
  });
});
