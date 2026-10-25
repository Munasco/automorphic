import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    registerHydrator: vi.fn(),
  },
}));
import { useChartReplay } from "./ChartReplay";
import { useChartPreferences, type ChartReplaySpeed } from "./chartPreferences";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import type { Candle } from "./chartIndicators";
let replay: ReturnType<typeof useChartReplay>;
let renderer: ReactTestRenderer;
function Harness({ context }: { context: string }) {
  const state = useChartReplay(context);
  useEffect(() => {
    replay = state;
  });
  return null;
}
const candles: Candle[] = Array.from({ length: 105 }, (_, i) => ({
  time: 1000 + i * 60,
  open: i,
  high: i + 1,
  low: i - 1,
  close: i,
  volume: 1,
}));
beforeEach(async () => {
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(null);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { setInterval, clearInterval });
  await act(async () => {
    renderer = create(<Harness context="MGC:5m" />);
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("bar replay controls", () => {
  it("keeps the visible history stable through play, pause and speed changes", async () => {
    await act(async () => {
      replay.start(candles);
    });
    const visible = replay.visible;
    await act(async () => replay.toggle());
    expect(replay.visible).toBe(visible);
    await act(async () => replay.setSpeed(5));
    expect(replay.visible).toBe(visible);
    await act(async () => replay.pause());
    expect(replay.visible).toBe(visible);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(replay.visible).toBe(visible);
    await act(async () => replay.seek(12));
    expect(replay.session?.seekVersion).toBe(1);
    const seekVersion = replay.session?.seekVersion;
    await act(async () => replay.toggle());
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(replay.session?.index).toBe(13);
    expect(replay.session?.seekVersion).toBe(seekVersion);
  });
  it.each([0.5, 1, 2, 5, 10] as const)("advances one bar per %s× interval", async (speed) => {
    await act(async () => {
      replay.setSpeed(speed);
      replay.start(candles);
    });
    await act(async () => replay.toggle());
    const duration = 1000 / speed;
    await act(async () => {
      vi.advanceTimersByTime(duration - 1);
    });
    expect(replay.session?.index).toBe(3);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(replay.session?.index).toBe(4);
  });
  it("changes a running timer without leaving the old cadence active", async () => {
    await act(async () => {
      replay.start(candles);
    });
    await act(async () => replay.toggle());
    await act(async () => {
      vi.advanceTimersByTime(750);
    });
    await act(async () => replay.setSpeed(5));
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(replay.session?.index).toBe(5);
    await act(async () => replay.setSpeed(0 as ChartReplaySpeed));
    expect(replay.speed).toBe(5);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(replay.session?.index).toBe(6);
    await act(async () => replay.toggle());
    expect(vi.getTimerCount()).toBe(0);
  });
  it("restores the saved speed after remount without resuming a replay or timer", async () => {
    await act(async () => {
      replay.setSpeed(10);
      replay.start(candles);
    });
    await act(async () => replay.toggle());
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    await act(async () => renderer.unmount());
    expect(vi.getTimerCount()).toBe(0);
    useChartPreferences.setState(useChartPreferences.getInitialState(), true);
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    await useChartPreferences.persist.rehydrate();
    await act(async () => {
      renderer = create(<Harness context="MGC:5m" />);
    });
    expect(replay.speed).toBe(10);
    expect(replay.session).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      replay.start(candles);
    });
    expect(replay.session?.playing).toBe(false);
    await act(async () => replay.toggle());
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(replay.session?.index).toBe(4);
  });
  it("steps, seeks and exits without changing frozen source bars", async () => {
    await act(async () => {
      replay.start(candles);
    });
    expect(replay.visible).toHaveLength(4);
    await act(async () => replay.seek(9));
    expect(replay.visible).toHaveLength(10);
    await act(async () => replay.seek(2));
    expect(replay.visible).toHaveLength(3);
    expect(candles).toHaveLength(105);
    await act(async () => replay.exit());
    expect(replay.visible).toBeNull();
  });
  it("plays at the selected speed, pauses, and stops on the last complete bar", async () => {
    await act(async () => {
      replay.start(candles);
    });
    await act(async () => {
      replay.setSpeed(2);
      replay.toggle();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(replay.session?.index).toBe(5);
    await act(async () => replay.toggle());
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(replay.session?.index).toBe(5);
    await act(async () => replay.seek(102));
    await act(async () => replay.toggle());
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(replay.session?.index).toBe(103);
    expect(replay.session?.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("discards replay and its timer when instrument, interval or workspace changes", async () => {
    await act(async () => {
      replay.start(candles);
    });
    await act(async () => replay.toggle());
    await act(async () => renderer.update(<Harness context="NQ:15m" />));
    expect(replay.session).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => renderer.update(<Harness context="MGC:5m" />));
    expect(replay.session).toBeNull();
  });
  it("does not start with insufficient completed history", async () => {
    await act(async () => {
      expect(replay.start(candles.slice(0, 2))).toBe(false);
    });
    expect(replay.visible).toBeNull();
  });
});

describe("replay from a selected chart bar", () => {
  it.each([0, 47, 103])(
    "starts paused at completed bar %s with only its historical prefix visible",
    async (index) => {
      await act(async () => expect(replay.start(candles, candles[index]!.time)).toBe(true));
      expect(replay.session).toMatchObject({ index, start: index, playing: false, seekVersion: 0 });
      expect(replay.visible).toEqual(candles.slice(0, index + 1));
      expect(replay.session!.bars).toHaveLength(104);
      expect(vi.getTimerCount()).toBe(0);
      if (index === 103) {
        await act(async () => replay.toggle());
        expect(replay.session!.playing).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
      }
    },
  );

  it("restarts at the chosen origin after stepping and playing forward", async () => {
    await act(async () => expect(replay.start(candles, candles[40]!.time)).toBe(true));
    await act(async () => replay.seek(45));
    await act(async () => replay.toggle());
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(replay.session!.index).toBe(47);
    expect(replay.session!.start).toBe(40);
    await act(async () => replay.seek(replay.session!.start));
    expect(replay.session).toMatchObject({ index: 40, start: 40, playing: false, seekVersion: 2 });
    expect(replay.visible).toEqual(candles.slice(0, 41));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves exact fractional chart keys rather than shared exchange timestamps after sorting and deduplication", async () => {
    const bars = [
      { ...candles[2]!, time: 100.002, actualTime: 100, close: 2 },
      { ...candles[0]!, time: 100.0001, actualTime: 100, close: 0 },
      { ...candles[1]!, time: 100.001, actualTime: 100, close: 1 },
      { ...candles[1]!, time: 100.001, actualTime: 100, close: 11 },
      { ...candles[3]!, time: 100.003, actualTime: 100, close: 3 },
    ];
    await act(async () => expect(replay.start(bars, 100.001)).toBe(true));
    expect(replay.session).toMatchObject({ index: 1, start: 1 });
    expect(replay.visible!.map(({ time, close }) => ({ time, close }))).toEqual([
      { time: 100.0001, close: 0 },
      { time: 100.001, close: 11 },
    ]);
    const previous = replay.session;
    await act(async () => expect(replay.start(bars, 100)).toBe(false));
    expect(replay.session).toBe(previous);
    await act(async () => expect(replay.start(bars, 100.0015)).toBe(false));
    expect(replay.session).toBe(previous);
  });

  it("rejects the forming last bar, missing and nonfinite keys without disrupting an existing playback", async () => {
    await act(async () => {
      replay.start(candles, candles[10]!.time);
    });
    await act(async () => replay.toggle());
    const previous = replay.session;
    const visible = replay.visible;
    for (const fromTime of [
      candles.at(-1)!.time,
      candles[10]!.time + 1,
      -1,
      NaN,
      Infinity,
      -Infinity,
    ]) {
      await act(async () => expect(replay.start(candles, fromTime)).toBe(false));
      expect(replay.session).toBe(previous);
      expect(replay.visible).toBe(visible);
      expect(vi.getTimerCount()).toBe(1);
    }
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(replay.session!.index).toBe(11);
  });

  it("copies frozen inputs and ignores subsequent feed corrections to the captured history", async () => {
    const bars = candles.map((bar) => ({ ...bar }));
    const snapshot = structuredClone(bars);
    const immutable = Object.freeze(bars.map((bar) => Object.freeze({ ...bar })));
    await act(async () => expect(replay.start(immutable, immutable[30]!.time)).toBe(true));
    expect(immutable).toEqual(snapshot);
    expect(replay.session!.bars[30]).not.toBe(immutable[30]);
    await act(async () => expect(replay.start(bars, bars[30]!.time)).toBe(true));
    bars[30]!.close = 9999;
    bars.push({ ...bars.at(-1)!, time: 99999 });
    expect(replay.visible).toEqual(snapshot.slice(0, 31));
    expect(replay.session!.bars).toEqual(snapshot.slice(0, -1));
  });

  it("keeps the saved speed intact and clears an explicit origin when chart context changes", async () => {
    await act(async () => replay.setSpeed(5));
    const writes = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.length;
    await act(async () => {
      replay.start(candles, candles[20]!.time);
    });
    expect(replay.speed).toBe(5);
    expect(vi.mocked(tradingWorkspaceStorage.setItem).mock.calls).toHaveLength(writes);
    await act(async () => replay.toggle());
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(replay.session!.index).toBe(21);
    await act(async () => renderer.update(<Harness context="NQ:15m" />));
    expect(replay.session).toBeNull();
    expect(replay.visible).toBeNull();
    expect(replay.speed).toBe(5);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => renderer.update(<Harness context="MGC:5m" />));
    expect(replay.session).toBeNull();
    await act(async () => {
      replay.start(candles);
    });
    expect(replay.session).toMatchObject({ index: 3, start: 3, playing: false });
  });
});
