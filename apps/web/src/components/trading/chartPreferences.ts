import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { tradingWorkspaceStorage } from "./workspaceStorage";

export type ChartStyle = "candles" | "bars" | "line" | "area";
export type IndicatorKey = "sma" | "ema" | "vwap" | "rsi" | "volume";
export const useChartPreferences = create<{
  style: ChartStyle;
  indicators: Record<IndicatorKey, boolean>;
  showGrid: boolean;
  logScale: boolean;
  setStyle: (style: ChartStyle) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  toggleGrid: () => void;
  toggleLogScale: () => void;
}>()(
  persist(
    (set) => ({
      style: "candles",
      indicators: { sma: false, ema: false, vwap: false, rsi: false, volume: true },
      showGrid: true,
      logScale: false,
      setStyle: (style) => set({ style }),
      toggleIndicator: (key) =>
        set((state) => ({ indicators: { ...state.indicators, [key]: !state.indicators[key] } })),
      toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
      toggleLogScale: () => set((state) => ({ logScale: !state.logScale })),
    }),
    {
      name: "automorphic:chart:v1",
      storage: createJSONStorage(() => tradingWorkspaceStorage),
      skipHydration: true,
    },
  ),
);

tradingWorkspaceStorage.registerHydrator(() => {
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  return useChartPreferences.persist.rehydrate();
});
