import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useChartReplay } from "./ChartReplay";
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
