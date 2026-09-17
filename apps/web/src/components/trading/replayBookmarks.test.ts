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
  replayBookmarkAnchor,
  resolveReplayBookmark,
  findReplayBookmarks,
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

describe("exact replay bookmark anchors", () => {
  const bars = [
    {
      time: 1000,
      actualTime: 1000,
      barId: "tick:a",
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 2,
    },
    {
      time: 1000.000001,
      actualTime: 1000,
      barId: "tick:b",
      open: 11,
      high: 13,
      low: 10,
      close: 12,
      volume: 3,
    },
    {
      time: 1060,
      actualTime: 1060,
      barId: "tick:c",
      open: 12,
      high: 14,
      low: 11,
      close: 13,
      volume: 4,
    },
  ];
  it("saves and restores separate same-timestamp tick bars and resolves each exact bar", async () => {
    const store = useReplayBookmarks.getState();
    store.add("NQ:tick:100", "First", 1000, replayBookmarkAnchor(bars[0]!));
    store.add("NQ:tick:100", "Second", 1000, replayBookmarkAnchor(bars[1]!));
    expect(() => store.add("NQ:tick:100", "Again", 1000, replayBookmarkAnchor(bars[0]!))).toThrow(
      "already",
    );
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    useReplayBookmarks.setState(useReplayBookmarks.getInitialState(), true);
    await useReplayBookmarks.persist.rehydrate();
    const bookmarks = useReplayBookmarks.getState().bookmarks;
    expect(bookmarks).toHaveLength(2);
    expect(bookmarks.map((bookmark) => resolveReplayBookmark(bars, bookmark))).toEqual([0, 1]);
    expect(resolveReplayBookmark([{ ...bars[0]!, time: 999 }, bars[1]!], bookmarks[0]!)).toBe(0);
  });
  it("does not fall back to another tick when the exact bar is missing or corrected", () => {
    const bookmark = {
      id: "saved",
      scope: "NQ:tick:100",
      name: "First",
      time: 1000,
      anchor: replayBookmarkAnchor(bars[0]!),
    };
    expect(resolveReplayBookmark(bars.slice(1), bookmark)).toBeNull();
    expect(resolveReplayBookmark([{ ...bars[0]!, volume: 999 }, bars[1]!], bookmark)).toBeNull();
    expect(
      resolveReplayBookmark([{ ...bars[0]!, actualTime: 999 }, bars[1]!], bookmark),
    ).toBeNull();
    const { barId: _barId, ...noId } = bars[0]!;
    const withoutId = { ...bookmark, anchor: replayBookmarkAnchor(noId) };
    expect(resolveReplayBookmark([noId, bars[1]!], withoutId)).toBe(0);
    expect(resolveReplayBookmark([bars[1]!], withoutId)).toBeNull();
  });
  it("preserves legacy timestamp behavior while allowing an exact replacement to coexist", () => {
    const store = useReplayBookmarks.getState();
    store.add("NQ:tick:100", "Legacy", 1000);
    store.add("NQ:tick:100", "Exact", 1000, replayBookmarkAnchor(bars[0]!));
    const bookmarks = normalizeReplayBookmarks(useReplayBookmarks.getState().bookmarks);
    expect(bookmarks).toHaveLength(2);
    expect(bookmarks.map((bookmark) => resolveReplayBookmark(bars, bookmark))).toEqual([1, 0]);
  });
  it("rejects malformed anchors without degrading into timestamp-only bookmarks", () => {
    const anchor = replayBookmarkAnchor(bars[0]!);
    const bookmark = { id: "saved", scope: "NQ:tick:100", name: "First", time: 1000, anchor };
    for (const invalid of [
      null,
      {},
      { ...anchor, id: "" },
      { ...anchor, id: "a".repeat(257) },
      { ...anchor, time: NaN },
      { ...anchor, ohlcv: [10, 12, 9, 11] },
      { ...anchor, ohlcv: [10, 12, 9, 11, Infinity] },
      { ...anchor, ohlcv: [10, 12, 9, 11, -1] },
      { ...anchor, ohlcv: [10, 8, 9, 11, 2] },
    ]) {
      expect(normalizeReplayBookmarks([{ ...bookmark, anchor: invalid }])).toEqual([]);
      expect(() =>
        useReplayBookmarks.getState().add("NQ:tick:100", "Bad", 1000, invalid as typeof anchor),
      ).toThrow("invalid");
    }
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });
  it("copies exact anchors and strips unrelated metadata before saving", () => {
    const anchor = replayBookmarkAnchor(bars[0]!);
    useReplayBookmarks.getState().add("NQ:tick:100", "First", 1000, anchor);
    anchor.ohlcv[0] = 0;
    const saved = useReplayBookmarks.getState().bookmarks[0]!;
    expect(saved.anchor!.ohlcv[0]).toBe(10);
    const normalized = normalizeReplayBookmarks([
      { ...saved, anchor: { ...saved.anchor, credentials: "ignored" } },
    ]);
    expect(normalized[0]!.anchor).not.toHaveProperty("credentials");
    normalized[0]!.anchor!.ohlcv[0] = 1;
    expect(saved.anchor!.ohlcv[0]).toBe(10);
  });
});

describe("bookmark renaming", () => {
  it("preserves exact anchors, scope, order and other bookmarks across rename and reload", async () => {
    const store = useReplayBookmarks.getState();
    const bar = {
      time: 1000.000001,
      actualTime: 1000,
      barId: "tick:two",
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 2,
    };
    const id = store.add("NQ:tick:100", "Old", 1000, replayBookmarkAnchor(bar));
    store.add("NQ:minute:5", "Same name", 1000);
    const original = useReplayBookmarks.getState().bookmarks;
    expect(store.rename(id, " Same name ")).toBe(true);
    const expected = [{ ...original[0]!, name: "Same name" }, original[1]!];
    expect(useReplayBookmarks.getState().bookmarks).toEqual(expected);
    expect(useReplayBookmarks.getState().bookmarks[1]).toBe(original[1]);
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    useReplayBookmarks.setState(useReplayBookmarks.getInitialState(), true);
    await useReplayBookmarks.persist.rehydrate();
    expect(useReplayBookmarks.getState().bookmarks).toEqual(expected);
    expect(resolveReplayBookmark([bar], useReplayBookmarks.getState().bookmarks[0]!)).toBe(0);
  });
  it("allows renaming at capacity while rejecting invalid names and skipping missing or unchanged records", () => {
    const store = useReplayBookmarks.getState();
    let id = "";
    for (let i = 0; i < MAX_REPLAY_BOOKMARKS; i++) id = store.add("NQ:5m", `Bar ${i}`, i);
    expect(store.rename(id, "Last setup")).toBe(true);
    expect(useReplayBookmarks.getState().bookmarks).toHaveLength(MAX_REPLAY_BOOKMARKS);
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    expect(store.rename(id, " Last setup ")).toBe(true);
    expect(store.rename("missing", "Name")).toBe(false);
    for (const value of ["", "  ", "a".repeat(81)])
      expect(() => store.rename(id, value)).toThrow("name");
    vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: false } as ReturnType<
      typeof tradingWorkspaceStorage.getSnapshot
    >);
    expect(() => store.rename(id, "Changed")).toThrow("loading");
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });
});

it("filters names within scope and sorts without mutating saved order or same-time anchors", () => {
  const anchor = { time: 1, ohlcv: [2, 3, 1, 2, 4] as [number, number, number, number, number] };
  const bookmarks = [
    { id: "a", scope: "NQ", name: "Retest 10", time: 200, anchor },
    { id: "b", scope: "NQ", name: "Retest 2", time: 100, anchor: { ...anchor, time: 2 } },
    { id: "c", scope: "NQ", name: "retest 2", time: 100, anchor: { ...anchor, time: 3 } },
    { id: "d", scope: "MGC", name: "Retest 2", time: 50 },
  ];
  const before = structuredClone(bookmarks);
  expect(findReplayBookmarks(bookmarks, "NQ", "", "saved").map((b) => b.id)).toEqual([
    "a",
    "b",
    "c",
  ]);
  for (const sort of ["date", "name"] as const)
    expect(findReplayBookmarks(bookmarks, "NQ", " RETEST ", sort).map((b) => b.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  expect(findReplayBookmarks(bookmarks, "NQ", "2 retest", "saved").map((b) => b.id)).toEqual([
    "b",
    "c",
  ]);
  expect(findReplayBookmarks(bookmarks, "NQ", "missing", "saved")).toEqual([]);
  expect(bookmarks).toEqual(before);
});
it.each(["saved", "date", "name"] as const)(
  "persists %s sort without altering bookmark records",
  async (sort) => {
    const store = useReplayBookmarks.getState();
    store.add("NQ", "Retest", 100);
    const original = structuredClone(useReplayBookmarks.getState().bookmarks);
    store.setSort(sort === "saved" ? "date" : "saved");
    store.setSort(sort);
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    useReplayBookmarks.setState(useReplayBookmarks.getInitialState(), true);
    await useReplayBookmarks.persist.rehydrate();
    expect(useReplayBookmarks.getState().sort).toBe(sort);
    expect(useReplayBookmarks.getState().bookmarks).toEqual(original);
  },
);
it("defaults malformed sort settings and ignores invalid/redundant writes", async () => {
  const store = useReplayBookmarks.getState();
  store.setSort("saved");
  store.setSort("bad" as "saved");
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  for (const sort of [undefined, null, "bad", 2]) {
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(JSON.stringify({ state: { sort } }));
    await useReplayBookmarks.persist.rehydrate();
    expect(useReplayBookmarks.getState().sort).toBe("saved");
  }
  vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: false } as ReturnType<
    typeof tradingWorkspaceStorage.getSnapshot
  >);
  expect(() => store.setSort("date")).toThrow("loading");
});

it("moves a bookmark to an exact bar while preserving identity, name, scope and saved order", async () => {
  const store = useReplayBookmarks.getState();
  const bar = {
    time: 1000,
    actualTime: 900,
    barId: "original",
    open: 1,
    high: 3,
    low: 0,
    close: 2,
    volume: 10,
  };
  const id = store.add("NQ:tick:100", "Retest", 900, replayBookmarkAnchor(bar));
  store.add("GC:minute:5", "Other chart", 950);
  const before = structuredClone(useReplayBookmarks.getState().bookmarks);
  const next = { ...bar, time: 1001, barId: "next", close: 3 };
  const anchor = replayBookmarkAnchor(next);
  expect(store.moveToBar(id, "NQ:tick:100", 900, anchor)).toBe(true);
  expect(useReplayBookmarks.getState().bookmarks).toEqual([{ ...before[0], anchor }, before[1]]);
  anchor.ohlcv[3] = 0;
  expect(resolveReplayBookmark([bar, next], useReplayBookmarks.getState().bookmarks[0]!)).toBe(1);
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
  useReplayBookmarks.setState(useReplayBookmarks.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
  await useReplayBookmarks.persist.rehydrate();
  expect(resolveReplayBookmark([bar, next], useReplayBookmarks.getState().bookmarks[0]!)).toBe(1);
  expect(useReplayBookmarks.getState().bookmarks[0]?.id).toBe(id);
});

it("rejects bookmark move collisions and invalid or foreign targets without changing state", () => {
  const store = useReplayBookmarks.getState();
  const bar = { time: 1000, open: 1, high: 3, low: 0, close: 2, volume: 10 };
  const id = store.add("NQ", "First", 1000, replayBookmarkAnchor(bar));
  store.add("NQ", "Second", 1001, replayBookmarkAnchor({ ...bar, time: 1001 }));
  const before = useReplayBookmarks.getState();
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  expect(() =>
    store.moveToBar(id, "NQ", 1001, replayBookmarkAnchor({ ...bar, time: 1001 })),
  ).toThrow("already");
  expect(store.moveToBar(id, "GC", 1002, replayBookmarkAnchor(bar))).toBe(false);
  expect(store.moveToBar("missing", "NQ", 1002, replayBookmarkAnchor(bar))).toBe(false);
  for (const time of [NaN, Infinity, -1])
    expect(() => store.moveToBar(id, "NQ", time, replayBookmarkAnchor(bar))).toThrow("invalid");
  expect(() =>
    store.moveToBar(id, "NQ", 1002, { ...replayBookmarkAnchor(bar), ohlcv: [1, 0, 3, 2, 10] }),
  ).toThrow("invalid");
  expect(store.moveToBar(id, "NQ", 1000, replayBookmarkAnchor(bar))).toBe(true);
  expect(useReplayBookmarks.getState()).toBe(before);
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: false } as ReturnType<
    typeof tradingWorkspaceStorage.getSnapshot
  >);
  expect(() => store.moveToBar(id, "NQ", 1002, replayBookmarkAnchor(bar))).toThrow("loading");
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
});

it("allows explicit anchor correction at capacity without silently moving changed history", () => {
  const store = useReplayBookmarks.getState();
  const bar = { time: 1000, barId: "same", open: 1, high: 3, low: 0, close: 2, volume: 10 };
  const id = store.add("NQ", "Corrected bar", 1000, replayBookmarkAnchor(bar));
  for (let i = 1; i < MAX_REPLAY_BOOKMARKS; i++) store.add("NQ", `Other ${i}`, 1000 + i);
  const corrected = { ...bar, volume: 20 };
  expect(
    resolveReplayBookmark([corrected], useReplayBookmarks.getState().bookmarks[0]!),
  ).toBeNull();
  expect(store.moveToBar(id, "NQ", 1000, replayBookmarkAnchor(corrected))).toBe(true);
  expect(resolveReplayBookmark([corrected], useReplayBookmarks.getState().bookmarks[0]!)).toBe(0);
  expect(useReplayBookmarks.getState().bookmarks).toHaveLength(MAX_REPLAY_BOOKMARKS);
});

describe("bookmark backup merge", () => {
  const first = {
    id: "backup-1",
    scope: "NQU6:minute:5",
    name: "Breakout",
    time: 100,
    anchor: { time: 100, ohlcv: [10, 12, 9, 11, 100] as [number, number, number, number, number] },
  };
  const second = { id: "backup-2", scope: "MGC:minute:5", name: "Gold open", time: 200 };
  it("atomically appends every scope, keeps exact anchors and existing names, and persists without changing sort", async () => {
    const store = useReplayBookmarks.getState();
    store.add(first.scope, "My renamed breakout", first.time, first.anchor);
    store.setSort("name");
    const existing = structuredClone(useReplayBookmarks.getState().bookmarks);
    const collidingId = { ...second, id: existing[0]!.id };
    expect(store.importBookmarks([first, collidingId])).toEqual({ imported: 1, skipped: 1 });
    const merged = useReplayBookmarks.getState().bookmarks;
    expect(merged[0]).toEqual(existing[0]);
    expect(merged[1]).toMatchObject({ scope: second.scope, name: second.name, time: second.time });
    expect(merged[1]!.id).not.toBe(existing[0]!.id);
    expect(useReplayBookmarks.getState().sort).toBe("name");
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    useReplayBookmarks.setState(useReplayBookmarks.getInitialState(), true);
    await useReplayBookmarks.persist.rehydrate();
    expect(useReplayBookmarks.getState().bookmarks).toEqual(merged);
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    expect(store.importBookmarks([first, second])).toEqual({ imported: 0, skipped: 2 });
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });
  it("preserves exact duplicate-timestamp bar identities and copies imported anchor data", () => {
    const records = [
      first,
      { ...first, id: "other", anchor: { ...first.anchor, time: 101, id: "tick-2" } },
    ];
    expect(useReplayBookmarks.getState().importBookmarks(records)).toEqual({
      imported: 2,
      skipped: 0,
    });
    const stored = structuredClone(useReplayBookmarks.getState().bookmarks);
    records[0]!.anchor.ohlcv[0] = 0;
    expect(useReplayBookmarks.getState().bookmarks).toEqual(stored);
    // Restore shared fixture after exercising reference isolation.
    first.anchor.ohlcv[0] = 10;
  });
  it("rejects malformed or duplicate input and capacity overflow without a partial write", () => {
    const store = useReplayBookmarks.getState();
    for (const input of [
      null,
      {},
      [first, { ...second, anchor: { time: 200, ohlcv: [] } }],
      [first, first],
      Array.from({ length: 101 }, () => ({ ...first })),
    ]) {
      expect(() => store.importBookmarks(input)).toThrow();
      expect(useReplayBookmarks.getState().bookmarks).toEqual([]);
    }
    useReplayBookmarks.setState({
      bookmarks: Array.from({ length: 100 }, (_, i) => ({ ...second, id: String(i), time: i })),
    });
    const before = useReplayBookmarks.getState();
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    expect(() => store.importBookmarks([first, second])).toThrow("exceed 100");
    expect(useReplayBookmarks.getState()).toBe(before);
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
    expect(store.importBookmarks([{ ...second, time: 0 }])).toEqual({ imported: 0, skipped: 1 });
  });
  it("blocks import until the workspace is ready", () => {
    vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: false } as ReturnType<
      typeof tradingWorkspaceStorage.getSnapshot
    >);
    expect(() => useReplayBookmarks.getState().importBookmarks([first])).toThrow("finish loading");
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });
});
