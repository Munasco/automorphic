import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    registerHydrator: vi.fn(),
  },
}));

import { useTradingPreferences } from "./tradingPreferences";
import { INSTRUMENT_ROOTS, rootFromSymbol } from "./tradingInstruments";
import { CHART_INTERVALS } from "./tradingIntervals";
import { tradingWorkspaceStorage } from "./workspaceStorage";

beforeEach(() => {
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(null);
  useTradingPreferences.setState(useTradingPreferences.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
});

describe("futures instrument selection", () => {
  it("persists supported minute intervals and rejects unsupported feed sizes", async () => {
    for (const interval of CHART_INTERVALS) {
      useTradingPreferences.getState().setInterval(interval);
      const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      useTradingPreferences.setState(useTradingPreferences.getInitialState(), true);
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
      await useTradingPreferences.persist.rehydrate();
      expect(useTradingPreferences.getState().interval).toBe(interval);
    }
    for (const interval of [0, 0.5, 7, 1440, NaN, Infinity]) {
      useTradingPreferences.getState().setInterval(interval);
      expect(useTradingPreferences.getState().interval).toBe(240);
    }
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
      JSON.stringify({ state: { interval: 0.5 }, version: 0 }),
    );
    await useTradingPreferences.persist.rehydrate();
    expect(useTradingPreferences.getState().interval).toBe(5);
  });
  it.each(INSTRUMENT_ROOTS)(
    "restores %s and its exact selected expiry without substituting contract size",
    async (root) => {
      const store = useTradingPreferences.getState();
      store.setRoot(root);
      store.setSelectedSymbol(`${root}Z6`);
      const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      useTradingPreferences.setState(useTradingPreferences.getInitialState(), true);
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
      await useTradingPreferences.persist.rehydrate();
      expect(useTradingPreferences.getState()).toMatchObject({ root, selectedSymbol: `${root}Z6` });
      expect(rootFromSymbol(`${root}Z6`)).toBe(root);
      expect(rootFromSymbol(root)).toBe(root);
    },
  );

  it("rejects unsupported persisted roots and malformed or foreign symbols", async () => {
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
      JSON.stringify({ state: { root: "__proto__" }, version: 0 }),
    );
    await useTradingPreferences.persist.rehydrate();
    expect(useTradingPreferences.getState().root).toBe("MGC");
    for (const symbol of ["ESZ6", "MGCNQZ6", "GC1!", "NQbad", "mgcz6", ""]) {
      expect(rootFromSymbol(symbol)).toBeUndefined();
    }
  });
});
