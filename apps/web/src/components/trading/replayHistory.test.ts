import { describe, expect, it } from "vite-plus/test";
import {
  createReplayHistory,
  replayIndexAt,
  replayMinuteHistory,
  replayPrefix,
} from "./replayHistory";
import { calculateSMA, type Candle } from "./chartIndicators";
const bars = (count: number): Candle[] =>
  Array.from({ length: count }, (_, i) => ({
    time: 1000 + i * 60,
    open: i + 1,
    high: i + 2,
    low: i,
    close: i + 1,
    volume: 10,
  }));

describe("replay history", () => {
  it("freezes history independently of incoming updates and excludes the forming bar", () => {
    const live = bars(5);
    const history = createReplayHistory(live);
    live[0]!.close = 999;
    live.push(...bars(1));
    expect(history).toHaveLength(4);
    expect(history[0]!.close).toBe(1);
    expect(history.at(-1)!.time).toBe(1180);
  });
  it("deduplicates/sorts chart keys before dropping the final bar", () => {
    const live = bars(3);
    expect(
      createReplayHistory([live[2]!, live[0]!, { ...live[0]!, close: 5 }, live[1]!]).map(
        (b) => b.close,
      ),
    ).toEqual([5, 2]);
  });
  it("reveals only past candles, so indicators cannot include future closes", () => {
    const live = bars(8);
    live[5]!.close = 10000;
    const prefix = replayPrefix(createReplayHistory(live), 3);
    expect(prefix).toHaveLength(4);
    expect(calculateSMA(prefix, 3).at(-1)?.value).toBe(3);
    expect(replayPrefix(live, -100)).toHaveLength(1);
    expect(replayPrefix(live, 100)).toHaveLength(8);
    expect(replayPrefix([], 0)).toEqual([]);
  });
  it("selects at/before real timestamps and rejects unavailable dates", () => {
    const history = bars(4).map((bar, i) => ({ ...bar, time: i + 1, actualTime: bar.time }));
    expect(replayIndexAt(history, 1080)).toBe(1);
    expect(replayIndexAt(history, 1180)).toBe(3);
    expect(replayIndexAt(history, 999)).toBeNull();
    expect(replayIndexAt(history, 1200)).toBeNull();
    expect(replayIndexAt(history, NaN)).toBeNull();
  });
  it("excludes unclosed auxiliary minute bars from initial balance", () => {
    expect(replayMinuteHistory(bars(4), 1120).map((b) => b.time)).toEqual([1000, 1060]);
    expect(replayMinuteHistory([{ ...bars(1)[0]!, actualEndTime: 1100 }], 1099)).toEqual([]);
  });
});
