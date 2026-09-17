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

it.each([
  ["trend", "horizontal", "after", ["fib", "horizontal", "trend", "ray"]],
  ["trend", "horizontal", "before", ["fib", "trend", "horizontal", "ray"]],
  ["ray", "fib", "before", ["trend", "ray", "fib", "horizontal"]],
  ["ray", "fib", "after", ["trend", "fib", "ray", "horizontal"]],
] as const)(
  "moves %s %s %s while retaining the other favorites and toolbar state",
  (source, target, position, expected) => {
    useDrawingFavorites.setState({
      kinds: ["trend", "fib", "horizontal", "ray"],
      visible: false,
      position: { x: 55.5, y: 99 },
    });
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    const previous = useDrawingFavorites.getState().kinds;
    const listener = vi.fn();
    const unsubscribe = useDrawingFavorites.subscribe(listener);
    try {
      useDrawingFavorites.getState().move(source, target, position);
      expect(useDrawingFavorites.getState()).toMatchObject({
        kinds: expected,
        visible: false,
        position: { x: 55.5, y: 99 },
      });
      expect(previous).toEqual(["trend", "fib", "horizontal", "ray"]);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  },
);

it("ignores missing, self, invalid and unchanged favorite moves without writes or notifications", () => {
  useDrawingFavorites.setState({ kinds: ["trend", "fib", "horizontal"] });
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  const before = useDrawingFavorites.getState();
  const listener = vi.fn();
  const unsubscribe = useDrawingFavorites.subscribe(listener);
  try {
    const { move } = before;
    move("ray", "fib", "before");
    move("trend", "ray", "after");
    move("trend", "trend", "after");
    move("trend", "fib", "before");
    move("fib", "trend", "after");
    move("horizontal", "fib", "after");
    move("trend", "fib", "invalid" as "before");
    expect(useDrawingFavorites.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
  }
});

it("moves normalized hydrated favorites and restores the saved order without duplicates", async () => {
  const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
    JSON.stringify({
      version: 0,
      state: {
        kinds: ["trend", "__proto__", "fib", "trend", "horizontal", null, "cursor"],
        visible: false,
        position: { x: 27, y: 43 },
      },
    }),
  );
  await hydrate();
  expect(useDrawingFavorites.getState().kinds).toEqual(["trend", "fib", "horizontal"]);
  useDrawingFavorites.getState().move("horizontal", "trend", "before");
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
  await hydrate();
  expect(useDrawingFavorites.getState()).toMatchObject({
    kinds: ["horizontal", "trend", "fib"],
    visible: false,
    position: { x: 27, y: 43 },
  });
  useDrawingFavorites.getState().move("horizontal", "fib", "after");
  expect(useDrawingFavorites.getState().kinds).toEqual(["trend", "fib", "horizontal"]);
});
