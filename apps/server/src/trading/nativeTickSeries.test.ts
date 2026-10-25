import { describe, expect, it } from "vite-plus/test";
import { createNativeTickSeries } from "./nativeTickSeries.ts";
const timestamp = "2026-09-11T20:00:00.123Z";
const bar = (count = 10, changes: Record<string, unknown> = {}) => ({
  timestamp,
  open: 100,
  high: 102,
  low: 99,
  close: 101,
  upVolume: 7,
  downVolume: 5,
  upTicks: count,
  downTicks: 0,
  ...changes,
});
const series = () => createNativeTickSeries(10, { historicalId: 11, realtimeId: 12 });
describe("native tick bar identity", () => {
  it("preserves identical historical rows and stable timestamp-tie order across packets", () => {
    const state = series();
    expect(
      state.accept({ id: 11, bars: [bar(10, { timestamp: "2026-09-11T20:01:00Z" }), bar()] }).bars,
    ).toEqual([]);
    const result = state.accept({ id: 11, bars: [bar(), bar(10, { close: 102 })], eoh: true });
    expect(result.bars).toHaveLength(4);
    expect(result.bars.map((x) => x.close)).toEqual([101, 101, 102, 101]);
    expect(new Set(result.bars.map((x) => x.barId)).size).toBe(4);
    expect(new Set(result.bars.map((x) => x.time)).size).toBe(4);
    expect(result.bars.every((x, i, a) => !i || x.time > a[i - 1]!.time)).toBe(true);
    expect(result.bars.slice(0, 3).map((x) => x.actualTime)).toEqual(
      Array(3).fill(Date.parse(timestamp) / 1000),
    );
    expect(result.metadata).toMatchObject({
      historyBarsReceived: 4,
      historicalTimestampCollisions: 2,
    });
  });
  it("keeps realtime separate until historical EOH and merges only a final partial overlap", () => {
    const state = series();
    state.accept({ id: 11, bars: [bar(3)] });
    expect(state.accept({ id: 12, bars: [bar(5, { upVolume: 9 })], eoh: true }).snapshot).toBe(
      false,
    );
    expect(state.accept({ id: 999, bars: [bar()], eoh: true }).bars).toEqual([]);
    const result = state.accept({ id: 11, eoh: true });
    expect(result.snapshot).toBe(true);
    expect(result.bars).toHaveLength(1);
    expect(result.bars[0]).toMatchObject({ tradeCount: 5, volume: 14, complete: false });
  });
  it("updates a partial bar without changing identity then resets even on identical completed replay", () => {
    const state = series();
    const first = state.accept({ id: 11, bars: [bar(3)], eoh: true }).bars[0]!;
    const update = state.accept({ id: 12, bars: [bar(10, { upVolume: 14 })] }).bars[0]!;
    expect(update).toMatchObject({ time: first.time, barId: first.barId, complete: true });
    expect(state.accept({ id: 12, bars: [bar(10, { upVolume: 14 })] })).toMatchObject({
      bars: [],
      resetRequired: expect.stringContaining("completed bar timestamp"),
    });
  });
  it("resets on completed historical/realtime overlap instead of fingerprint deduplication", () => {
    const state = series();
    state.accept({ id: 12, bars: [bar()] });
    expect(state.accept({ id: 11, bars: [bar()], eoh: true })).toMatchObject({
      bars: [],
      resetRequired: expect.any(String),
    });
  });
  it("appends later timestamps and rejects late corrections without partially applying a packet", () => {
    const state = series();
    const snapshot = state.accept({ id: 11, bars: [bar()], eoh: true });
    expect(
      state.accept({ id: 12, bars: [bar(2, { timestamp: "2026-09-11T20:01:00Z" })] }).bars,
    ).toHaveLength(1);
    expect(
      state.accept({ id: 12, bars: [bar(3, { timestamp: "2026-09-11T20:02:00Z" }), bar()] }),
    ).toMatchObject({ bars: [], resetRequired: expect.any(String) });
    expect(state.metadata().availableBars).toBe(snapshot.bars.length + 1);
  });
  it("uses EOH as the phase boundary when the vendor assigns one ID to both subscriptions", () => {
    const state = createNativeTickSeries(10, { historicalId: 42, realtimeId: 42 });
    expect(state.accept({ id: 42, bars: [bar(2)] }).bars).toEqual([]);
    expect(state.accept({ id: 42, eoh: true }).snapshot).toBe(true);
    const update = state.accept({ id: 42, bars: [bar(3)] });
    expect(update).toMatchObject({ snapshot: false, historical: false });
    expect(update.bars[0]?.tradeCount).toBe(3);
  });
  it("rejects malformed counts and declining partial volume rather than inventing completeness", () => {
    expect(series().accept({ id: 11, bars: [bar(11)], eoh: true })).toHaveProperty("resetRequired");
    const state = series();
    state.accept({ id: 11, bars: [bar(3)], eoh: true });
    expect(state.accept({ id: 12, bars: [bar(4, { upVolume: 0 })] })).toHaveProperty(
      "resetRequired",
    );
  });
});
