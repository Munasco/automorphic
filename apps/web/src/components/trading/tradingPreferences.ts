import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import { isInstrumentRoot, type InstrumentRoot } from "./tradingInstruments";
import { isChartInterval, type ChartInterval } from "./tradingIntervals";
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
  setInterval: (interval: number) => void;
}>()(
  persist(
    (set) => ({
      useTradingView: false,
      showLiveWires: true,
      root: "MGC",
      interval: 5,
      selectedSymbol: "",
      setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
      setTradingView: (useTradingView) => set({ useTradingView }),
      setLiveWires: (showLiveWires) => set({ showLiveWires }),
      setRoot: (root) => set({ root }),
      setInterval: (interval) => {
        if (isChartInterval(interval)) set({ interval });
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
          interval: "interval" in saved && isChartInterval(saved.interval) ? saved.interval : 5,
        };
      },
    },
  ),
);

tradingWorkspaceStorage.registerHydrator(() => {
  useTradingPreferences.setState(useTradingPreferences.getInitialState(), true);
  return useTradingPreferences.persist.rehydrate();
});
