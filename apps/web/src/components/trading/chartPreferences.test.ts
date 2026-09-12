import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    registerHydrator: vi.fn(),
  },
}));

import { useChartPreferences, normalizeChartPreferences } from "./chartPreferences";
import { DEFAULT_INITIAL_BALANCE } from "./initialBalanceSettings";
import { tradingWorkspaceStorage } from "./workspaceStorage";

beforeEach(() => {
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(null);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
});

function configure() {
  const store = useChartPreferences.getState();
  store.toggleIndicator("sma");
  store.toggleIndicator("ib");
  store.toggleIndicatorVisibility("rsi");
  store.setIndicatorInputs("sma", { period: 42 });
  store.setIndicatorAppearance("sma", { color: "#123456", lineWidth: 3 });
  store.setInitialBalance({ ...store.initialBalance, startTime: "09:45" });
  store.setVolumeColors({ up: "#123456", down: "#654321" });
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  return useChartPreferences.getState();
}

describe("global indicator actions", () => {
  it("hides and shows enabled indicators atomically while retaining disabled states and configuration", () => {
    const original = configure();
    const changes = vi.fn();
    const unsubscribe = useChartPreferences.subscribe(changes);
    try {
      original.setIndicatorsHidden(true);
      const hidden = useChartPreferences.getState();
      expect(hidden.hiddenIndicators).toMatchObject({
        volume: true,
        sma: true,
        ib: true,
        rsi: true,
        ema: false,
      });
      expect(hidden.indicators).toBe(original.indicators);
      expect(hidden.indicatorInputs).toBe(original.indicatorInputs);
      expect(hidden.appearance).toBe(original.appearance);
      expect(hidden.initialBalance).toBe(original.initialBalance);
      expect(hidden.volumeColors).toBe(original.volumeColors);
      expect(changes).toHaveBeenCalledTimes(1);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
      hidden.setIndicatorsHidden(false);
      expect(useChartPreferences.getState().hiddenIndicators).toMatchObject({
        volume: false,
        sma: false,
        ib: false,
        rsi: true,
        ema: false,
      });
      expect(changes).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
  });

  it("removes all indicators in one write, restores that state, and re-adds indicators with their configuration", async () => {
    const original = configure();
    original.setIndicatorsHidden(true);
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    const changes = vi.fn();
    const unsubscribe = useChartPreferences.subscribe(changes);
    try {
      useChartPreferences.getState().removeAllIndicators();
      const removed = useChartPreferences.getState();
      expect(Object.values(removed.indicators).every((enabled) => !enabled)).toBe(true);
      expect(Object.values(removed.hiddenIndicators).every((hidden) => !hidden)).toBe(true);
      expect(removed.indicatorInputs).toBe(original.indicatorInputs);
      expect(removed.appearance).toBe(original.appearance);
      expect(removed.initialBalance).toBe(original.initialBalance);
      expect(removed.volumeColors).toBe(original.volumeColors);
      expect(changes).toHaveBeenCalledTimes(1);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
      const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls[0]![1];
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
      await useChartPreferences.persist.rehydrate();
      const restored = useChartPreferences.getState();
      expect(Object.values(restored.indicators).every((enabled) => !enabled)).toBe(true);
      restored.toggleIndicator("sma");
      restored.toggleIndicator("ib");
      const added = useChartPreferences.getState();
      expect(added.indicators).toMatchObject({ sma: true, ib: true, volume: false });
      expect(added.hiddenIndicators).toMatchObject({ sma: false, ib: false });
      expect(added.indicatorInputs.sma).toEqual({ period: 42 });
      expect(added.appearance.sma).toEqual({ color: "#123456", lineWidth: 3 });
      expect(added.initialBalance.startTime).toBe("09:45");
    } finally {
      unsubscribe();
    }
  });
});

describe("initial balance background preferences", () => {
  it("migrates older session settings without changing their schedule or visibility", () => {
    const legacy = {
      startTime: "08:30",
      timeZone: "America/Chicago",
      durationMinutes: 60,
      showBox: false,
      showQuarters: false,
    };
    expect(normalizeChartPreferences({ initialBalance: legacy }).initialBalance).toMatchObject({
      ...legacy,
      backgroundColor: DEFAULT_INITIAL_BALANCE.backgroundColor,
      backgroundOpacity: DEFAULT_INITIAL_BALANCE.backgroundOpacity,
    });
  });
  it("persists independent background settings and restores transparent or disabled boxes", async () => {
    const store = useChartPreferences.getState();
    const appearance = store.appearance;
    store.setInitialBalance({
      ...store.initialBalance,
      backgroundColor: "#aabbcc",
      backgroundOpacity: 0,
      showBox: false,
    });
    expect(useChartPreferences.getState().appearance).toBe(appearance);
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    useChartPreferences.setState(useChartPreferences.getInitialState(), true);
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    await useChartPreferences.persist.rehydrate();
    expect(useChartPreferences.getState().initialBalance).toMatchObject({
      backgroundColor: "#aabbcc",
      backgroundOpacity: 0,
      showBox: false,
    });
  });
  it("rejects malformed background values without overwriting valid preferences", () => {
    const store = useChartPreferences.getState();
    const initial = store.initialBalance;
    for (const backgroundOpacity of [-1, 1.1, NaN, Infinity])
      store.setInitialBalance({ ...initial, backgroundOpacity });
    store.setInitialBalance({ ...initial, backgroundColor: "not-a-color" });
    expect(useChartPreferences.getState().initialBalance).toBe(initial);
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });
});
