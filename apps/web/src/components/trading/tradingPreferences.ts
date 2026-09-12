import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolveStorage } from "../../lib/storage";
export const useTradingPreferences = create<{
  useTradingView: boolean;
  showLiveWires: boolean;
  root: "MGC" | "NQ";
  interval: number;
  setTradingView: (value: boolean) => void;
  setLiveWires: (value: boolean) => void;
  setRoot: (root: "MGC" | "NQ") => void;
  setInterval: (interval: number) => void;
}>()(
  persist(
    (set) => ({
      useTradingView: false,
      showLiveWires: true,
      root: "MGC",
      interval: 5,
      setTradingView: (useTradingView) => set({ useTradingView }),
      setLiveWires: (showLiveWires) => set({ showLiveWires }),
      setRoot: (root) => set({ root }),
      setInterval: (interval) => set({ interval }),
    }),
    {
      name: "automorphic:trading-settings:v1",
      storage: createJSONStorage(() => resolveStorage(globalThis.localStorage)),
    },
  ),
);
