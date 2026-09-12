import { describe, expect, it } from "vite-plus/test";
import { TickMarkType, type UTCTimestamp } from "lightweight-charts";
import {
  applyChartBarBatch,
  createChartTimeFormatters,
  readChartCandle,
  readTickHistoryQuality,
  tickHistoryNotice,
} from "./tickChartData";
import type { Candle } from "./chartIndicators";
const candle = (time: number, barId: string): Candle => ({
  time,
  actualTime: 1000,
  actualEndTime: 1000.25,
  barId,
  firstTradeId: 10,
  lastTradeId: 19,
  open: 100,
  high: 105,
  low: 95,
  close: 103,
  volume: 7,
});
describe("tick chart data", () => {
  it("distinguishes sampled trade history from native aggregated bars without claiming completeness", () => {
    const raw = readTickHistoryQuality({
      source: "raw-trades",
      historyCoverage: "limited-sampled-vendor-history",
      historyComplete: false,
      availableBars: 500,
      rawHistoryReceived: 500,
    });
    expect(raw).not.toBeNull();
    expect(tickHistoryNotice(raw!).description).toContain("volume totals are incomplete");
    expect(tickHistoryNotice(raw!).label).toBe("Limited history");
    const native = readTickHistoryQuality({
      source: "native-tick-bars",
      historyCoverage: "native-vendor-bars",
      historyComplete: false,
      availableBars: 1000,
      historyBarsReceived: 1000,
    });
    expect(native).not.toBeNull();
    expect(tickHistoryNotice(native!).description).toContain("native vendor aggregation");
    expect(tickHistoryNotice(native!).description).toContain("may not cover the full session");
    for (const value of [
      null,
      {},
      {
        source: "raw-trades",
        historyCoverage: "native-vendor-bars",
        historyComplete: false,
        availableBars: 2,
        rawHistoryReceived: 2,
      },
      {
        source: "raw-trades",
        historyCoverage: "limited-sampled-vendor-history",
        historyComplete: true,
        availableBars: 2,
        rawHistoryReceived: 2,
      },
    ])
      expect(readTickHistoryQuality(value)).toBeNull();
  });
  it("preserves colliding real timestamps and replaces stale snapshots including queued bars", () => {
    const bars = new Map<number, Candle>();
    const pending = new Map<number, Candle>();
    const first = candle(1000, "native:0"),
      second = candle(1000.000001, "native:1");
    expect(applyChartBarBatch(bars, pending, [first, second], false)).toBe(2);
    expect([...bars.values()]).toEqual([first, second]);
    const corrected = { ...second, close: 104, volume: 8 };
    applyChartBarBatch(bars, pending, [corrected], false);
    expect(bars.size).toBe(2);
    expect(bars.get(second.time)).toEqual(corrected);
    applyChartBarBatch(bars, pending, [candle(1001, "reconnect:0")], true);
    expect([...bars.keys()]).toEqual([1001]);
    expect([...pending.keys()]).toEqual([1001]);
    applyChartBarBatch(bars, pending, [], true);
    expect(bars.size).toBe(0);
    expect(pending.size).toBe(0);
  });
  it("rejects malformed prices and physical metadata without letting them become dates", () => {
    const input = candle(1000, "a");
    for (const value of [
      null,
      { ...input, time: NaN },
      { ...input, time: 1e20 },
      { ...input, volume: -1 },
      { ...input, high: 101 },
      { ...input, low: 101 },
      { ...input, actualTime: Infinity },
      { ...input, actualEndTime: 999 },
      { ...input, firstTradeId: 1.5 },
      { ...input, barId: {} },
      { ...input, high: 90 },
    ])
      expect(readChartCandle(value)).toBeNull();
    expect(readChartCandle({ ...input, arbitrary: "ignored" })).toEqual(input);
  });
  it("formats real exchange dates for axes and crosshair while looking up unique display keys", () => {
    const time = Date.parse("2026-09-12T00:00:00Z") / 1000;
    const actualTime = time - 1;
    const bars = new Map([
      [time, { ...candle(time, "a"), actualTime }],
      [time + 0.000001, { ...candle(time + 0.000001, "b"), actualTime }],
    ]);
    const formatter = createChartTimeFormatters((key) => bars.get(key));
    expect(
      formatter.tickMarkFormatter(time as UTCTimestamp, TickMarkType.TimeWithSeconds, "en-US"),
    ).toBe("23:59:59");
    expect(
      formatter.tickMarkFormatter(
        (time + 0.000001) as UTCTimestamp,
        TickMarkType.DayOfMonth,
        "en-US",
      ),
    ).toBe("11");
    expect(formatter.timeFormatter(time as UTCTimestamp)).toContain("Sep 11, 2026");
    expect(formatter.timeFormatter(time as UTCTimestamp)).toContain("23:59:59");
    expect(
      formatter.tickMarkFormatter((time + 60) as UTCTimestamp, TickMarkType.Time, "en-US"),
    ).toBe("00:01");
  });
});
