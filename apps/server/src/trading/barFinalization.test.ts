import { describe, expect, it } from "vite-plus/test";
import { chartProvenance, createBarFinalizer, quoteBarTime } from "./barFinalization.ts";
import type { Candle } from "./marketData.ts";
const bar = (time: number, close = 101): Candle => ({
  time,
  open: 100,
  high: 105,
  low: 95,
  close,
  volume: 2,
});

describe("feed-proven drawing closes", () => {
  it("ignores history and warmup, then arms the first live snapshot without replaying it", () => {
    const stream = createBarFinalizer();
    expect(stream.accept([bar(1), bar(2)], "historical")).toEqual([]);
    expect(stream.accept([bar(3)], "warmup")).toEqual([]);
    expect(stream.accept([bar(1), bar(2), bar(3)], "live")).toEqual([]);
    expect(stream.accept([bar(4)], "live")).toEqual([
      { bar: { ...bar(3), complete: true }, closedAt: 4000 },
    ]);
  });
  it("uses the last live update, publishes forward closes once and ignores old corrections", () => {
    const stream = createBarFinalizer();
    stream.accept([bar(10)], "live");
    stream.accept([bar(10, 104)], "live");
    stream.accept([bar(10, 98)], "historical");
    expect(stream.accept([bar(11), bar(12)], "live")).toEqual([
      { bar: { ...bar(10, 104), complete: true }, closedAt: 11000 },
      { bar: { ...bar(11), complete: true }, closedAt: 12000 },
    ]);
    expect(stream.accept([bar(10), bar(11), bar(12)], "live")).toEqual([]);
    expect(stream.accept([], "live")).toEqual([]);
  });
  it("uses actual tick timestamps instead of synthetic chart coordinates", () => {
    const stream = createBarFinalizer();
    stream.accept([{ ...bar(500.000001), actualTime: 500, complete: true }], "live");
    expect(stream.accept([{ ...bar(500.000002), actualTime: 500 }], "live")[0]?.closedAt).toBe(
      500000,
    );
  });
  it("does not finalize historical bars when a new connection starts", () => {
    const restarted = createBarFinalizer();
    restarted.accept([bar(10)], "historical");
    expect(restarted.accept([bar(50)], "live")).toEqual([]);
  });
});

describe("subscription provenance", () => {
  it("keeps late history separate and rejects realtime warmup before EOH", () => {
    expect(chartProvenance(31, 31, 32, false)).toBe("historical");
    expect(chartProvenance(32, 31, 32, false)).toBe("warmup");
    expect(chartProvenance(31, 31, 32, true)).toBe("historical");
    expect(chartProvenance(32, 31, 32, true)).toBe("live");
    expect(chartProvenance(999, 31, 32, true)).toBe("warmup");
  });
  it("uses EOH for streams with a shared subscription ID", () => {
    expect(chartProvenance(31, 31, 31, false)).toBe("historical");
    expect(chartProvenance(31, 31, 31, true)).toBe("live");
  });
});

describe("quote bar association", () => {
  it("requires an observed live bucket and rejects missing timestamps, boundaries and gaps", () => {
    const start = Date.parse("2026-01-02T12:00:00Z") / 1000;
    expect(quoteBarTime("2026-01-02T12:04:59Z", bar(start), "minute", 5)).toBe(start);
    expect(quoteBarTime("2026-01-02T12:05:00Z", bar(start), "minute", 5)).toBeUndefined();
    expect(quoteBarTime("2026-01-03T12:00:00Z", bar(start), "minute", 5)).toBeUndefined();
    expect(quoteBarTime(undefined, bar(start), "minute", 5)).toBeUndefined();
    expect(quoteBarTime("invalid", bar(start), "minute", 5)).toBeUndefined();
    expect(quoteBarTime("2026-01-02T12:04:59Z", undefined, "minute", 5)).toBeUndefined();
  });
  it("maps calendar periods without guessing a tick bar from its timestamp", () => {
    const start = Date.parse("2025-12-29T00:00:00Z") / 1000;
    expect(quoteBarTime("2026-01-02T12:04:59Z", bar(start), "week", 1)).toBe(start);
    expect(quoteBarTime("2026-01-05T00:00:00Z", bar(start), "week", 1)).toBeUndefined();
    expect(
      quoteBarTime("2025-12-29T00:00:00Z", { ...bar(start), actualTime: start }, "tick", 1),
    ).toBeUndefined();
  });
});
