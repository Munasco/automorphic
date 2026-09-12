import { beforeEach, expect, it, vi } from "vite-plus/test";
vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    registerHydrator: vi.fn(),
  },
}));
import { normalizeDrawingFavorites, useDrawingFavorites } from "./drawingFavorites";
import { tradingWorkspaceStorage } from "./workspaceStorage";
beforeEach(() => {
  useDrawingFavorites.setState(useDrawingFavorites.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(null);
});
it("rejects invalid kinds and retains favorite order without duplicates", () => {
  expect(normalizeDrawingFavorites(["fib", "__proto__", "cursor", "trend", "fib", null])).toEqual([
    "fib",
    "trend",
  ]);
});
it("persists ordered favorites and reveals the toolbar when adding a new favorite", async () => {
  const state = useDrawingFavorites.getState;
  state().toggle("trend");
  state().toggleVisible();
  expect(state().visible).toBe(false);
  state().toggle("fib");
  expect(state().visible).toBe(true);
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
  useDrawingFavorites.setState(useDrawingFavorites.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
  await useDrawingFavorites.persist.rehydrate();
  expect(state().kinds).toEqual(["trend", "fib"]);
  state().toggle("trend");
  expect(state().kinds).toEqual(["fib"]);
});
