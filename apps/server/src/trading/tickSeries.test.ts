import { describe, expect, it } from "vite-plus/test";
import { createTickSeries, decodeTickPacket } from "./tickSeries.ts";

const base = 1_789_160_399_712;
const packet = (
  ticks: Array<{ id: number; t?: number; p?: number; s?: number }>,
  td = 20260911,
) => ({
  bt: base,
  bp: 100,
  ts: 0.25,
  td,
  tks: ticks.map((tick) => ({ t: 0, p: 0, s: 1, ...tick })),
});

describe("raw trade chart series", () => {
  it("decodes relative prices, millisecond timestamps, volume and trade IDs without conflating zero values", () => {
    expect(
      decodeTickPacket(
        packet([
          { id: 0, t: 0, p: 0, s: 0 },
          { id: 1, t: 2, p: -4, s: 3 },
        ]),
      ),
    ).toEqual({
      trades: [
        { id: 0, tradeDate: 20260911, timeMs: base, price: 25, volume: 0 },
        { id: 1, tradeDate: 20260911, timeMs: base + 2, price: 24, volume: 3 },
      ],
      invalidTrades: 0,
    });
    expect(decodeTickPacket({ ...packet([{ id: 1 }]), ts: 0 }).invalidTrades).toBe(1);
    expect(decodeTickPacket(packet([{ id: NaN }, { id: 2, s: -1 }])).invalidTrades).toBe(2);
  });

  it("buffers unsorted history and preserves identical trades with distinct IDs at the same millisecond", () => {
    const series = createTickSeries(1);
    expect(series.accept(packet([{ id: 3 }, { id: 1 }])).bars).toEqual([]);
    expect(series.accept(packet([{ id: 2 }, { id: 1 }])).bars).toEqual([]);
    const result = series.accept({ eoh: true }, true);
    expect(result.snapshot).toBe(true);
    expect(result.bars.map((bar) => bar.firstTradeId)).toEqual([1, 2, 3]);
    expect(result.bars.every((bar) => bar.actualTime === base / 1000)).toBe(true);
    expect(new Set(result.bars.map((bar) => bar.time)).size).toBe(3);
    expect(result.bars[1]!.time).toBeGreaterThan(result.bars[0]!.time);
    expect(result.bars[2]!.time).toBeGreaterThan(result.bars[1]!.time);
    expect(result.bars.map((bar) => bar.volume)).toEqual([1, 1, 1]);
    expect(result.metadata.rawHistoryReceived).toBe(3);
    expect(result.metadata.historyCoverage).toBe("limited-sampled-vendor-history");
    expect(series.accept(packet([{ id: 1 }, { id: 2 }, { id: 3 }])).bars).toEqual([]);
    const append = series.accept(packet([{ id: 4 }]));
    expect(append.bars).toHaveLength(1);
    expect(append.bars[0]!.time).toBeGreaterThan(result.bars[2]!.time);
    expect(append.bars[0]!.actualTime).toBe(base / 1000);
  });

  it("aggregates actual trades into count bars, updating an incomplete bar without changing its identity or coordinate", () => {
    const series = createTickSeries(10);
    const history = series.accept(
      packet(
        Array.from({ length: 12 }, (_, index) => ({ id: index + 1, t: index, p: index, s: 2 })),
      ),
      true,
    );
    expect(history.bars).toHaveLength(2);
    expect(history.bars[0]).toMatchObject({
      open: 25,
      high: 27.25,
      low: 25,
      close: 27.25,
      volume: 20,
      tradeCount: 10,
      complete: true,
      firstTradeId: 1,
      lastTradeId: 10,
    });
    const partial = history.bars[1]!;
    expect(partial).toMatchObject({ tradeCount: 2, complete: false, volume: 4 });
    const update = series.accept(
      packet(
        Array.from({ length: 8 }, (_, index) => ({
          id: index + 13,
          t: index + 12,
          p: index + 12,
          s: 2,
        })),
      ),
    );
    expect(update.bars).toHaveLength(1);
    expect(update.bars[0]).toMatchObject({
      barId: partial.barId,
      time: partial.time,
      firstTradeId: 11,
      lastTradeId: 20,
      volume: 20,
      tradeCount: 10,
      complete: true,
      close: 29.75,
      actualEndTime: (base + 19) / 1000,
    });
    expect(update.metadata.completeBars).toBe(2);
  });

  it("applies identified price/volume corrections in place but invalidates late unknown trades before mutation", () => {
    const series = createTickSeries(10);
    const before = series.accept(
      packet([
        { id: 1, t: 1 },
        { id: 3, t: 3 },
      ]),
      true,
    ).bars[0]!;
    const corrected = series.accept(packet([{ id: 1, t: 1, p: 8, s: 4 }]));
    expect(corrected.bars[0]).toMatchObject({
      time: before.time,
      barId: before.barId,
      open: 27,
      high: 27,
      low: 25,
      close: 25,
      volume: 5,
    });
    expect(corrected.metadata.correctedTrades).toBe(1);
    const late = series.accept(
      packet([
        { id: 4, t: 4 },
        { id: 2, t: 2 },
      ]),
    );
    expect(late).toHaveProperty("resetRequired");
    expect(late.bars).toEqual([]);
    expect(late.metadata.retainedTrades).toBe(2);
    expect(series.accept(packet([{ id: 5, t: 5 }]))).toHaveProperty("resetRequired");
  });

  it("requires an explicit reset when a known trade timestamp changes or a packet is invalid", () => {
    const corrected = createTickSeries(1);
    corrected.accept(packet([{ id: 1 }]), true);
    expect(corrected.accept(packet([{ id: 1, t: 2 }]))).toHaveProperty(
      "resetRequired",
      "A trade timestamp correction requires a fresh tick history.",
    );
    const invalid = createTickSeries(1);
    expect(invalid.accept(packet([{ id: 1 }, { id: 2, p: NaN }]), true)).toHaveProperty(
      "resetRequired",
    );
    expect(invalid.metadata().retainedTrades).toBe(0);
  });

  it("bounds retention without reassigning existing display keys and reports actual partial history depth", () => {
    const series = createTickSeries(1, { historyLimit: 4, retainedLimit: 2 });
    const history = series.accept(packet([{ id: 1 }, { id: 2 }, { id: 3 }]), true);
    expect(history.bars.map((bar) => bar.firstTradeId)).toEqual([2, 3]);
    const last = history.bars[1]!;
    const live = series.accept(packet([{ id: 4 }]));
    expect(live.metadata).toMatchObject({
      rawHistoryRequested: 4,
      rawHistoryReceived: 3,
      retainedTrades: 2,
      availableBars: 2,
      groupingFirstTradeId: 1,
    });
    expect(live.bars[0]!.time).toBeGreaterThan(last.time);
    const correction = series.accept(packet([{ id: 3, p: 1 }]));
    expect(correction.bars[0]).toMatchObject({
      time: last.time,
      barId: last.barId,
      actualTime: last.actualTime,
    });
  });

  it("starts a fresh count group at a trade-date boundary and never invents missing trades", () => {
    const series = createTickSeries(10);
    series.accept(packet([{ id: 1 }, { id: 2 }]));
    const next = { ...packet([{ id: 1 }], 20260912), bt: base + 86_400_000 };
    const result = series.accept(next, true);
    expect(result.bars.map((bar) => [bar.tradeDate, bar.tradeCount, bar.complete])).toEqual([
      [20260911, 2, false],
      [20260912, 1, false],
    ]);
    expect(result.bars[0]!.barId).not.toBe(result.bars[1]!.barId);
    expect(result.metadata.rawHistoryReceived).toBe(3);
  });
});
