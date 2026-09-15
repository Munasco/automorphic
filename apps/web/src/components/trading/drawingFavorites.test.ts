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
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
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

it("persists a detached fractional position and resets without altering favorites or visibility", async () => {
  const state = useDrawingFavorites.getState;
  state().toggle("trend");
  state().toggleVisible();
  const position = { x: 123.5, y: 72.25 };
  state().setPosition(position);
  position.x = 999;
  expect(state().position).toEqual({ x: 123.5, y: 72.25 });
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
  useDrawingFavorites.setState(useDrawingFavorites.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
  await useDrawingFavorites.persist.rehydrate();
  expect(state()).toMatchObject({
    kinds: ["trend"],
    visible: false,
    position: { x: 123.5, y: 72.25 },
  });
  state().resetPosition();
  expect(state()).toMatchObject({ kinds: ["trend"], visible: false, position: { x: 16, y: 180 } });
  const writes = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.length;
  state().resetPosition();
  expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(writes);
});

it("ignores invalid or unchanged positions without persistence or notifications", () => {
  const state = useDrawingFavorites.getState;
  const listener = vi.fn();
  const unsubscribe = useDrawingFavorites.subscribe(listener);
  try {
    for (const value of [
      null,
      undefined,
      {},
      { x: 1 },
      { x: "1", y: 1 },
      { x: -1, y: 1 },
      { x: 1, y: Infinity },
      { x: NaN, y: 1 },
      { x: 100001, y: 1 },
    ])
      state().setPosition(value as unknown as { x: number; y: number });
    state().setPosition({ x: 16, y: 180 });
    expect(listener).not.toHaveBeenCalled();
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
    state().setPosition({ x: 0, y: 100000 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(state().position).toEqual({ x: 0, y: 100000 });
  } finally {
    unsubscribe();
  }
});

it("restores workspace positions and defaults malformed or legacy saves without losing valid favorites", async () => {
  const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
  for (const [position, expected] of [
    [
      { x: 400, y: 80 },
      { x: 400, y: 80 },
    ],
    [undefined, { x: 16, y: 180 }],
    [
      { x: 1, y: -1 },
      { x: 16, y: 180 },
    ],
    [
      { x: "20", y: 30 },
      { x: 16, y: 180 },
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
  ]) {
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
      JSON.stringify({ version: 0, state: { kinds: ["fib"], visible: false, position } }),
    );
    await hydrate();
    expect(useDrawingFavorites.getState()).toMatchObject({
      kinds: ["fib"],
      visible: false,
      position: expected,
    });
  }
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(null);
  await hydrate();
  expect(useDrawingFavorites.getState()).toMatchObject({
    kinds: [],
    visible: true,
    position: { x: 16, y: 180 },
  });
});
