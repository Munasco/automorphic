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
export type DrawingFavoritesPosition = { x: number; y: number };
const DEFAULT_POSITION: DrawingFavoritesPosition = { x: 16, y: 180 };
function validPosition(value: unknown): value is DrawingFavoritesPosition {
  if (!value || typeof value !== "object" || !("x" in value) || !("y" in value)) return false;
  return [value.x, value.y].every(
    (coordinate) =>
      typeof coordinate === "number" &&
      Number.isFinite(coordinate) &&
      coordinate >= 0 &&
      coordinate <= 100_000,
  );
}

export const useDrawingFavorites = create<{
  kinds: DrawingKind[];
  visible: boolean;
  position: DrawingFavoritesPosition;
  setPosition: (position: DrawingFavoritesPosition) => void;
  resetPosition: () => void;
  toggle: (kind: DrawingKind) => void;
  move: (source: DrawingKind, target: DrawingKind, position: "before" | "after") => void;
  toggleVisible: () => void;
}>()(
  persist(
    (set, get) => ({
      kinds: [],
      visible: true,
      position: { ...DEFAULT_POSITION },
      setPosition: (position) => {
        if (!validPosition(position)) return;
        const current = get().position;
        if (current.x !== position.x || current.y !== position.y)
          set({ position: { x: position.x, y: position.y } });
      },
      resetPosition: () => get().setPosition(DEFAULT_POSITION),
      move: (source, target, position) => {
        const kinds = get().kinds;
        if (
          source === target ||
          !kinds.includes(source) ||
          !kinds.includes(target) ||
          (position !== "before" && position !== "after")
        )
          return;
        const reordered = kinds.filter((kind) => kind !== source);
        const targetIndex = reordered.indexOf(target);
        reordered.splice(targetIndex + (position === "after" ? 1 : 0), 0, source);
        if (reordered.every((kind, index) => kind === kinds[index])) return;
        set({ kinds: reordered });
      },
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
          position:
            "position" in data && validPosition(data.position)
              ? { x: data.position.x, y: data.position.y }
              : { ...DEFAULT_POSITION },
        };
      },
    },
  ),
);
tradingWorkspaceStorage.registerHydrator(() => {
  useDrawingFavorites.setState(useDrawingFavorites.getInitialState(), true);
  return useDrawingFavorites.persist.rehydrate();
});
