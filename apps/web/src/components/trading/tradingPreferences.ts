import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import { isInstrumentRoot, type InstrumentRoot } from "./tradingInstruments";
import {
  normalizeChartInterval,
  DEFAULT_CHART_INTERVAL,
  type ChartInterval,
} from "./tradingIntervals";
export const useTradingPreferences = create<{
  useTradingView: boolean;
  showLiveWires: boolean;
  root: InstrumentRoot;
  interval: ChartInterval;
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;
  setTradingView: (value: boolean) => void;
  setLiveWires: (value: boolean) => void;
  setRoot: (root: InstrumentRoot) => void;
  setInterval: (interval: ChartInterval | number) => void;
}>()(
  persist(
    (set) => ({
      useTradingView: false,
      showLiveWires: true,
      root: "MGC",
      interval: DEFAULT_CHART_INTERVAL,
      selectedSymbol: "",
      setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
      setTradingView: (useTradingView) => set({ useTradingView }),
      setLiveWires: (showLiveWires) => set({ showLiveWires }),
      setRoot: (root) => set({ root }),
      setInterval: (interval) => {
        const normalized = normalizeChartInterval(interval);
        if (normalized) set({ interval: normalized });
      },
    }),
    {
      name: "automorphic:trading-settings:v1",
      storage: createJSONStorage(() => tradingWorkspaceStorage),
      skipHydration: true,
      merge: (persisted, current) => {
        const saved = persisted && typeof persisted === "object" ? persisted : {};
        return {
          ...current,
          ...saved,
          root: "root" in saved && isInstrumentRoot(saved.root) ? saved.root : "MGC",
          interval:
            ("interval" in saved && normalizeChartInterval(saved.interval)) ||
            DEFAULT_CHART_INTERVAL,
        };
      },
    },
  ),
);

tradingWorkspaceStorage.registerHydrator(() => {
  useTradingPreferences.setState(useTradingPreferences.getInitialState(), true);
  return useTradingPreferences.persist.rehydrate();
});
