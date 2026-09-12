import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { normalizeDrawingColorHex } from "./drawingColor";
import { tradingWorkspaceStorage } from "./workspaceStorage";

export const DRAWING_CUSTOM_COLORS_KEY = "automorphic:drawing-custom-colors:v1";
export const MAX_DRAWING_CUSTOM_COLORS = 40;

export function normalizeDrawingCustomColors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const colors = new Set<string>();
  for (const item of value) {
    const color = typeof item === "string" ? normalizeDrawingColorHex(item) : null;
    if (color) colors.add(color);
    if (colors.size === MAX_DRAWING_CUSTOM_COLORS) break;
  }
  return [...colors];
}

export const useDrawingCustomColors = create<{
  colors: string[];
  addColor: (color: string) => boolean;
}>()(
  persist(
    (set, get) => ({
      colors: [],
      addColor: (input) => {
        const color = typeof input === "string" ? normalizeDrawingColorHex(input) : null;
        if (!color) return false;
        const current = get().colors;
        if (current.includes(color)) return true;
        set({ colors: [...current, color].slice(-MAX_DRAWING_CUSTOM_COLORS) });
        return true;
      },
    }),
    {
      name: DRAWING_CUSTOM_COLORS_KEY,
      storage: createJSONStorage(() => tradingWorkspaceStorage),
      skipHydration: true,
      partialize: (state) => ({ colors: state.colors }),
      merge: (persisted, current) => ({
        ...current,
        colors: normalizeDrawingCustomColors(
          persisted && typeof persisted === "object" && "colors" in persisted
            ? persisted.colors
            : undefined,
        ),
      }),
    },
  ),
);

tradingWorkspaceStorage.registerHydrator(() => {
  useDrawingCustomColors.setState(useDrawingCustomColors.getInitialState(), true);
  return useDrawingCustomColors.persist.rehydrate();
});
