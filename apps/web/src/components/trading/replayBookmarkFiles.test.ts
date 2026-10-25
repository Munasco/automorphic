import { beforeEach, expect, it, vi } from "vite-plus/test";
vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    registerHydrator: vi.fn(),
    getSnapshot: vi.fn(() => ({ ready: true })),
    capture: vi.fn(),
  },
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: vi.fn() } }));
import { tradingWorkspaceStorage } from "./workspaceStorage";
import {
  importReplayBookmarkFile,
  serializeReplayBookmarkFile,
  MAX_REPLAY_BOOKMARK_FILE_BYTES,
} from "./replayBookmarkFiles";
import { useReplayBookmarks } from "./replayBookmarks";
const destination = {} as ReturnType<typeof tradingWorkspaceStorage.capture>;
const backup = JSON.stringify({
  format: "automorphic-replay-bookmarks",
  version: 1,
  bookmarks: [{ id: "a", scope: "NQU6:minute:5", name: "Open", time: 100 }],
});
const file = (text = backup) => ({ size: text.length, text: async () => text });
beforeEach(() => {
  useReplayBookmarks.setState(useReplayBookmarks.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: true } as ReturnType<
    typeof tradingWorkspaceStorage.getSnapshot
  >);
  vi.mocked(tradingWorkspaceStorage.capture).mockReturnValue(destination);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
});
it("imports a versioned backup and ignores a second import", async () => {
  await expect(importReplayBookmarkFile(file(), destination)).resolves.toEqual({
    imported: 1,
    skipped: 0,
  });
  await expect(importReplayBookmarkFile(file(), destination)).resolves.toEqual({
    imported: 0,
    skipped: 1,
  });
});
it("rejects malformed JSON, unsupported formats and oversized files", async () => {
  for (const json of [
    "not json",
    "[]",
    "{}",
    backup.replace('"version":1', '"version":2'),
    backup.replace("automorphic-replay-bookmarks", "other"),
  ])
    await expect(importReplayBookmarkFile(file(json), destination)).rejects.toThrow();
  const text = vi.fn(async () => backup);
  await expect(
    importReplayBookmarkFile({ size: MAX_REPLAY_BOOKMARK_FILE_BYTES + 1, text }, destination),
  ).rejects.toThrow("1 MB");
  expect(text).not.toHaveBeenCalled();
  await expect(
    importReplayBookmarkFile(
      { size: 0, text: async () => " ".repeat(MAX_REPLAY_BOOKMARK_FILE_BYTES + 1) },
      destination,
    ),
  ).rejects.toThrow("1 MB");
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
});
it("rejects a workspace switch or loading state during the file read", async () => {
  for (const changed of ["workspace", "loading"]) {
    vi.mocked(tradingWorkspaceStorage.capture).mockReturnValue(destination);
    vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: true } as ReturnType<
      typeof tradingWorkspaceStorage.getSnapshot
    >);
    await expect(
      importReplayBookmarkFile(
        {
          size: backup.length,
          text: async () => {
            if (changed === "workspace")
              vi.mocked(tradingWorkspaceStorage.capture).mockReturnValue({} as typeof destination);
            else
              vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({
                ready: false,
              } as ReturnType<typeof tradingWorkspaceStorage.getSnapshot>);
            return backup;
          },
        },
        destination,
      ),
    ).rejects.toThrow("workspace changed");
  }
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  expect(useReplayBookmarks.getState().bookmarks).toEqual([]);
});

it("round-trips a full backup with maximum escaped text without exceeding the file limit", async () => {
  const escaped = (length: number) => "a" + "\u0001".repeat(length - 2) + "z";
  const entries = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    scope: escaped(160),
    name: escaped(80),
    time: i,
    anchor: { time: i, id: escaped(256), ohlcv: [10, 12, 9, 11, 100] },
  }));
  useReplayBookmarks.getState().importBookmarks(entries);
  const before = structuredClone(useReplayBookmarks.getState().bookmarks);
  const json = serializeReplayBookmarkFile(before);
  const bytes = new TextEncoder().encode(json).length;
  expect(bytes).toBeGreaterThan(250_000);
  expect(bytes).toBeLessThan(MAX_REPLAY_BOOKMARK_FILE_BYTES);
  useReplayBookmarks.setState(useReplayBookmarks.getInitialState(), true);
  await expect(
    importReplayBookmarkFile({ size: bytes, text: async () => json }, destination),
  ).resolves.toEqual({ imported: 100, skipped: 0 });
  expect(
    useReplayBookmarks.getState().bookmarks.map(({ id: _id, ...bookmark }) => bookmark),
  ).toEqual(before.map(({ id: _id, ...bookmark }) => bookmark));
});
