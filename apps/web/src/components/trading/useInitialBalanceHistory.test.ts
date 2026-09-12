import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  initialBalanceChartPoints,
  subscribeInitialBalanceHistory,
  type InitialBalanceHistory,
} from "./useInitialBalanceHistory";
import type { openTradingStream } from "./tradingTransport";
const candle = (time: number, close = 100) => ({
  time,
  open: 100,
  high: 110,
  low: 90,
  close,
  volume: 1,
});
afterEach(() => vi.useRealTimers());
describe("auxiliary initial balance history", () => {
  it("uses same-contract minute history, batches updates, reconnects and ignores disposed events", () => {
    vi.useFakeTimers();
    const callbacks: Parameters<typeof openTradingStream>[1][] = [];
    const close = vi.fn();
    const open = vi.fn<typeof openTradingStream>((_url, cb) => {
      callbacks.push(cb);
      return { close };
    });
    const updates: InitialBalanceHistory[] = [];
    const dispose = subscribeInitialBalanceHistory("NQZ6", (value) => updates.push(value), open);
    expect(open.mock.calls[0]?.[0]).toContain("symbol=NQZ6&interval=1&intervalUnit=minute");
    callbacks[0]!.onMessage(
      JSON.stringify({ type: "bars", intervalKey: "second:1", bars: [candle(20)] }),
    );
    callbacks[0]!.onMessage(
      JSON.stringify({
        type: "bars",
        intervalKey: "minute:1",
        bars: [candle(60), candle(0), { time: 90 }],
      }),
    );
    callbacks[0]!.onMessage(
      JSON.stringify({ type: "bars", intervalKey: "minute:1", bars: [candle(60, 105)] }),
    );
    vi.advanceTimersByTime(16);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      symbol: "NQZ6",
      status: "",
      bars: [candle(0), candle(60, 105)],
    });
    callbacks[0]!.onMessage(
      JSON.stringify({ type: "bars", intervalKey: "minute:1", bars: [candle(60, 105)] }),
    );
    vi.advanceTimersByTime(16);
    expect(updates).toHaveLength(1);
    callbacks[0]!.onError();
    vi.advanceTimersByTime(5000);
    expect(open).toHaveBeenCalledTimes(2);
    expect(updates.at(-1)?.status).toContain("Reconnecting");
    callbacks[1]!.onMessage(
      JSON.stringify({ type: "bars", intervalKey: "minute:1", bars: [candle(120)] }),
    );
    dispose();
    callbacks[1]!.onError();
    callbacks[1]!.onMessage(
      JSON.stringify({ type: "bars", intervalKey: "minute:1", bars: [candle(180)] }),
    );
    vi.runAllTimers();
    expect(updates).toHaveLength(2);
    expect(open).toHaveBeenCalledTimes(2);
  });
  it("maps study values only onto actual chart times", () => {
    const points = [
      { time: 60, value: 10 },
      { time: 120, value: 20 },
      { time: 180, value: 30 },
    ];
    const bars = [30, 65.125, 70.25, 125.5, 181, 240].map((time) => candle(time));
    expect(initialBalanceChartPoints(points, bars, 200)).toEqual([
      { time: 65.125, value: 10 },
      { time: 70.25, value: 10 },
      { time: 125.5, value: 20 },
      { time: 181, value: 30 },
    ]);
    expect(initialBalanceChartPoints([], bars, 200)).toEqual([]);
    expect(
      initialBalanceChartPoints(
        points,
        [
          { ...candle(1000), actualTime: 65 },
          { ...candle(1000.1), actualTime: 125 },
          { ...candle(1000.2), actualTime: 240 },
        ],
        200,
      ),
    ).toEqual([
      { time: 1000, value: 10 },
      { time: 1000.1, value: 20 },
    ]);
  });
});
