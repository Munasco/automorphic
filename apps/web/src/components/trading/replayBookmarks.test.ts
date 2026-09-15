import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    registerHydrator: vi.fn(),
    getSnapshot: vi.fn(() => ({ ready: true })),
  },
}));
import { tradingWorkspaceStorage } from "./workspaceStorage";
import {
  MAX_REPLAY_BOOKMARKS,
  normalizeReplayBookmarks,
  useReplayBookmarks,
} from "./replayBookmarks";

beforeEach(() => {
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(null);
  vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: true } as ReturnType<
    typeof tradingWorkspaceStorage.getSnapshot
  >);
  useReplayBookmarks.setState(useReplayBookmarks.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
});

describe("replay bookmarks", () => {
  it("persists independent contract/interval bookmarks and deletes only the chosen item", async () => {
    const state = useReplayBookmarks.getState();
    const first = state.add(" NQU6:minute:5 ", " Retest ", 1000.5);
    const second = state.add("NQZ6:minute:5", "Retest", 1000.5);
    const third = state.add("NQU6:minute:1", "Open", 1000.5);
    const expected = structuredClone(useReplayBookmarks.getState().bookmarks);
    expect(expected[0]).toEqual({
      id: first,
      scope: "NQU6:minute:5",
      name: "Retest",
      time: 1000.5,
    });
    const [key, saved] = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
    expect(key).toBe("automorphic:replay-bookmarks:v1");
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    useReplayBookmarks.setState(useReplayBookmarks.getInitialState(), true);
    await useReplayBookmarks.persist.rehydrate();
    expect(useReplayBookmarks.getState().bookmarks).toEqual(expected);
    expect(state.remove(first)).toBe(true);
    expect(useReplayBookmarks.getState().bookmarks.map((bookmark) => bookmark.id)).toEqual([
      second,
      third,
    ]);
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    const before = useReplayBookmarks.getState();
    expect(state.remove(first)).toBe(false);
    expect(useReplayBookmarks.getState()).toBe(before);
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });
  it("rejects duplicate timestamps within a scope without overwriting the original name", () => {
    const state = useReplayBookmarks.getState();
    state.add("NQ:5m", "Original", 1000);
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    const before = useReplayBookmarks.getState();
    expect(() => state.add(" NQ:5m ", "Different", 1000)).toThrow("already");
    expect(useReplayBookmarks.getState()).toBe(before);
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -1, 253402300800])("rejects invalid dates %s without writes", (time) => {
    expect(() => useReplayBookmarks.getState().add("NQ:5m", "Name", time)).toThrow("date");
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });
  it("rejects empty/oversized labels and scopes and loading workspaces", () => {
    const state = useReplayBookmarks.getState();
    for (const name of ["", "  ", "a".repeat(81)])
      expect(() => state.add("NQ:5m", name, 1000)).toThrow("name");
    for (const scope of ["", "  ", "a".repeat(161)])
      expect(() => state.add(scope, "Name", 1000)).toThrow("chart");
    vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: false } as ReturnType<
      typeof tradingWorkspaceStorage.getSnapshot
    >);
    expect(() => state.add("NQ:5m", "Name", 1000)).toThrow("loading");
    expect(() => state.remove("missing")).toThrow("loading");
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });
  it("enforces capacity without dropping existing bookmarks", () => {
    const state = useReplayBookmarks.getState();
    for (let time = 0; time < MAX_REPLAY_BOOKMARKS; time++) state.add("NQ:5m", `Bar ${time}`, time);
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    const before = useReplayBookmarks.getState();
    expect(() => state.add("NQ:5m", "Overflow", 1000)).toThrow("100 per workspace");
    expect(useReplayBookmarks.getState()).toBe(before);
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });
  it("sanitizes persisted records, strips unknown fields and rejects duplicate IDs/times", () => {
    const valid = { id: "one", scope: "NQ:5m", name: " Name ", time: 1000 };
    expect(
      normalizeReplayBookmarks([
        null,
        {},
        { ...valid, time: "1000" },
        { ...valid, scope: [] },
        { ...valid, credentials: "private" },
        { ...valid, id: "two" },
        { ...valid, scope: "NQ:1m" },
        { ...valid, id: "three", scope: "NQ:1m" },
      ]),
    ).toEqual([
      { id: "one", scope: "NQ:5m", name: "Name", time: 1000 },
      { id: "three", scope: "NQ:1m", name: "Name", time: 1000 },
    ]);
    expect(
      normalizeReplayBookmarks(
        Array.from({ length: 200 }, (_, i) => ({ ...valid, id: `${i}`, time: i })),
      ),
    ).toHaveLength(100);
    expect(normalizeReplayBookmarks({})).toEqual([]);
  });
  it("clears prior workspace bookmarks before hydrating an empty workspace", async () => {
    useReplayBookmarks.getState().add("NQ:5m", "Name", 1000);
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls.at(-1)![0];
    await hydrate();
    expect(useReplayBookmarks.getState().bookmarks).toEqual([]);
  });
});
