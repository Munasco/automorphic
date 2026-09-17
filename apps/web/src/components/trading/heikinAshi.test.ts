import { describe, expect, it } from "vite-plus/test";
import type { Candle } from "./chartIndicators";
import { calculateHeikinAshi, heikinAshiBar } from "./heikinAshi";

const bar = (time: number, open: number, high: number, low: number, close: number): Candle => ({
  time,
  open,
  high,
  low,
  close,
  volume: 100,
});
const raw = [
  bar(1, 10, 16, 9, 14),
  bar(2, 14, 20, 13, 19),
  bar(3, 19, 21, 11, 12),
  bar(4, 12, 13, 5, 6),
];

describe("Heikin Ashi display candles", () => {
  it("seeds the first open from raw open/close and averages all four prices for its close", () => {
    expect(heikinAshiBar(raw[0]!)).toEqual({
      ...raw[0],
      open: 12,
      high: 16,
      low: 9,
      close: 12.25,
    });
  });

  it("recurses through rising and falling bars and includes synthetic opens in the wick range", () => {
    expect(calculateHeikinAshi(raw)).toEqual([
      { ...raw[0], open: 12, high: 16, low: 9, close: 12.25 },
      { ...raw[1], open: 12.125, high: 20, low: 12.125, close: 16.5 },
      { ...raw[2], open: 14.3125, high: 21, low: 11, close: 15.75 },
      { ...raw[3], open: 15.03125, high: 15.03125, low: 5, close: 9 },
    ]);
  });

  it("preserves raw quotes, volume, fractional chart keys and exchange metadata without mutation", () => {
    const input = Object.freeze({
      ...raw[0]!,
      time: 1.001,
      actualTime: 1,
      actualEndTime: 1.5,
      barId: "tick-1",
      firstTradeId: 12,
      lastTradeId: 15,
      volume: 42,
    });
    const snapshot = { ...input };
    const result = calculateHeikinAshi(Object.freeze([input]));
    expect(input).toEqual(snapshot);
    expect(result[0]).not.toBe(input);
    expect(result[0]).toMatchObject({
      time: 1.001,
      actualTime: 1,
      actualEndTime: 1.5,
      barId: "tick-1",
      firstTradeId: 12,
      lastTradeId: 15,
      volume: 42,
    });
    expect(input.close).toBe(14);
    expect(result[0]!.close).toBe(12.25);
  });

  it("revises the forming last bar repeatedly without changing its recursive open or accumulating drift", () => {
    const history = calculateHeikinAshi(raw.slice(0, 3));
    const preceding = history.at(-1)!;
    const snapshot = { ...preceding };
    for (const close of [6, 7, 8, 6, 8]) {
      const revised = { ...raw[3]!, close, high: 14, volume: close * 100 };
      const actual = heikinAshiBar(revised, preceding);
      expect(actual.open).toBe(15.03125);
      expect(actual).toEqual(calculateHeikinAshi([...raw.slice(0, 3), revised]).at(-1));
      expect(actual.close).toBe((12 + 14 + 5 + close) / 4);
      expect(actual.volume).toBe(close * 100);
    }
    expect(preceding).toEqual(snapshot);
  });

  it("revises the first forming bar from raw prices rather than seeding from its earlier revision", () => {
    expect(heikinAshiBar({ ...raw[0]!, close: 16 }).open).toBe(13);
    expect(heikinAshiBar(raw[0]!).open).toBe(12);
  });

  it("appends incremental bars identically to a full transform, including across a session gap", () => {
    const inputs = [...raw, bar(86400, 40, 45, 39, 42)];
    const incremental: Candle[] = [];
    for (const next of inputs) incremental.push(heikinAshiBar(next, incremental.at(-1)));
    expect(incremental).toEqual(calculateHeikinAshi(inputs));
    expect(incremental.at(-1)!.open).toBe(12.015625);
    expect(incremental.at(-1)!.low).toBe(12.015625);
  });

  it("propagates a historical correction into later opens while retaining unaffected closes and earlier bars", () => {
    const original = calculateHeikinAshi(raw);
    const revisedRaw = raw.map((item, index) => (index === 1 ? { ...item, close: 15 } : item));
    const revised = calculateHeikinAshi(revisedRaw);
    expect(revised[0]).toEqual(original[0]);
    expect(revised[1]!.open).toBe(original[1]!.open);
    expect(revised[1]!.close).toBe(15.5);
    expect(revised[2]!.open).toBe(13.8125);
    expect(revised[3]!.open).toBe(14.78125);
    expect(revised[2]!.close).toBe(original[2]!.close);
    expect(revised[3]!.close).toBe(original[3]!.close);
    // Callers with an indexed cache can replace the corrected suffix with the bar API.
    const patched = original.slice(0, 1);
    for (const item of revisedRaw.slice(1)) patched.push(heikinAshiBar(item, patched.at(-1)));
    expect(patched).toEqual(revised);
    expect(raw[1]!.close).toBe(19);
  });

  it("handles empty series, zero and negative prices without treating zero as a missing prior price", () => {
    expect(calculateHeikinAshi([])).toEqual([]);
    const negative = [bar(1, -8, -3, -10, -4), bar(2, -4, 0, -5, 0), bar(3, 0, 0, 0, 0)];
    expect(calculateHeikinAshi(negative)).toEqual([
      { ...negative[0], open: -6, close: -6.25 },
      { ...negative[1], open: -6.125, high: 0, low: -6.125, close: -2.25 },
      { ...negative[2], open: -4.1875, high: 0, low: -4.1875, close: 0 },
    ]);
    expect(heikinAshiBar(raw[0]!, { open: 0, close: 0 }).open).toBe(0);
  });
});
