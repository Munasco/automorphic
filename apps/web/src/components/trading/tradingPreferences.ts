import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { tradingWorkspaceStorage } from "./workspaceStorage";
export const useTradingPreferences = create<{
  useTradingView: boolean;
  showLiveWires: boolean;
  root: "MGC" | "MNQ";
  interval: number;
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;
  setTradingView: (value: boolean) => void;
  setLiveWires: (value: boolean) => void;
  setRoot: (root: "MGC" | "MNQ") => void;
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
      setInterval: (interval) => set({ interval }),
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
          // Existing Nasdaq workspaces now use the micro feed, never a renamed NQ quote.
          root: "root" in saved && (saved.root === "NQ" || saved.root === "MNQ") ? "MNQ" : "MGC",
        };
      },
    },
  ),
);

tradingWorkspaceStorage.registerHydrator(() => {
  useTradingPreferences.setState(useTradingPreferences.getInitialState(), true);
  return useTradingPreferences.persist.rehydrate();
});
