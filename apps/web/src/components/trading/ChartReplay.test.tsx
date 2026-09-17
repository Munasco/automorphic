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
