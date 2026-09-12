import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DRAWING_ANCHORS, type DrawingKind } from "./drawingGeometry";
import { tradingWorkspaceStorage } from "./workspaceStorage";

export function normalizeDrawingFavorites(value: unknown): DrawingKind[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (kind): kind is DrawingKind =>
          typeof kind === "string" && Object.hasOwn(DRAWING_ANCHORS, kind),
      ),
    ),
  ];
}
export const useDrawingFavorites = create<{
  kinds: DrawingKind[];
  visible: boolean;
  toggle: (kind: DrawingKind) => void;
  toggleVisible: () => void;
}>()(
  persist(
    (set) => ({
      kinds: [],
      visible: true,
      toggle: (kind) =>
        set((state) => ({
          kinds: state.kinds.includes(kind)
            ? state.kinds.filter((entry) => entry !== kind)
            : [...state.kinds, kind],
          visible: state.kinds.includes(kind) ? state.visible : true,
        })),
      toggleVisible: () => set((state) => ({ visible: !state.visible })),
    }),
    {
      name: "automorphic:drawing-favorites:v1",
      storage: createJSONStorage(() => tradingWorkspaceStorage),
      skipHydration: true,
      merge: (persisted, current) => {
        const data = persisted && typeof persisted === "object" ? persisted : {};
        return {
          ...current,
          kinds: normalizeDrawingFavorites("kinds" in data ? data.kinds : undefined),
          visible: !("visible" in data && data.visible === false),
        };
      },
    },
  ),
);
tradingWorkspaceStorage.registerHydrator(() => {
  useDrawingFavorites.setState(useDrawingFavorites.getInitialState(), true);
  return useDrawingFavorites.persist.rehydrate();
});
