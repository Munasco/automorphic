import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { randomUUID } from "../../lib/utils";
import { tradingWorkspaceStorage } from "./workspaceStorage";

import type { Candle } from "./chartIndicators";
import { replayIndexAt } from "./replayHistory";

type ReplayBookmarkAnchor = {
  time: number;
  id?: string;
  ohlcv: [number, number, number, number, number];
};
export type ReplayBookmark = {
  id: string;
  scope: string;
  name: string;
  time: number;
  anchor?: ReplayBookmarkAnchor;
};
export const MAX_REPLAY_BOOKMARKS = 100;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
const validTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 253402300799;

/** Completed-bar values detect a reused native snapshot ordinal after history changes. */
export function replayBookmarkAnchor(bar: Candle): ReplayBookmarkAnchor {
  return {
    time: bar.time,
    ...(bar.barId === undefined ? {} : { id: bar.barId }),
    ohlcv: [bar.open, bar.high, bar.low, bar.close, bar.volume],
  };
}
function validAnchor(value: unknown): value is ReplayBookmarkAnchor {
  return (
    record(value) &&
    validTime(value.time) &&
    (value.id === undefined ||
      (typeof value.id === "string" && value.id.length > 0 && value.id.length <= 256)) &&
    Array.isArray(value.ohlcv) &&
    value.ohlcv.length === 5 &&
    value.ohlcv.every((number) => typeof number === "number" && Number.isFinite(number)) &&
    value.ohlcv[4] >= 0 &&
    value.ohlcv[1] >= Math.max(value.ohlcv[0], value.ohlcv[3]) &&
    value.ohlcv[2] <= Math.min(value.ohlcv[0], value.ohlcv[3])
  );
}
function copyAnchor(anchor: ReplayBookmarkAnchor): ReplayBookmarkAnchor {
  return {
    time: anchor.time,
    ...(anchor.id === undefined ? {} : { id: anchor.id }),
    ohlcv: [...anchor.ohlcv],
  };
}
function sameBookmarkBar(a: ReplayBookmark, b: ReplayBookmark) {
  if (a.scope !== b.scope || a.time !== b.time) return false;
  if (!a.anchor || !b.anchor) return !a.anchor && !b.anchor;
  return a.anchor.id !== undefined && b.anchor.id !== undefined
    ? a.anchor.id === b.anchor.id
    : a.anchor.time === b.anchor.time;
}

/** Exact bookmarks never fall back to a different candle sharing their exchange timestamp. */
export function resolveReplayBookmark(
  bars: readonly Candle[],
  bookmark: ReplayBookmark,
): number | null {
  const anchor = bookmark.anchor;
  if (!anchor) return replayIndexAt(bars, bookmark.time);
  const index = bars.findIndex(
    (bar) =>
      (anchor.id === undefined ? bar.time === anchor.time : bar.barId === anchor.id) &&
      (bar.actualTime ?? bar.time) === bookmark.time &&
      [bar.open, bar.high, bar.low, bar.close, bar.volume].every(
        (value, i) => value === anchor.ohlcv[i],
      ),
  );
  return index < 0 ? null : index;
}

export function normalizeReplayBookmarks(value: unknown): ReplayBookmark[] {
  if (!Array.isArray(value)) return [];
  const bookmarks: ReplayBookmark[] = [];
  for (const item of value.slice(0, MAX_REPLAY_BOOKMARKS)) {
    if (
      !record(item) ||
      !text(item.id, 100) ||
      !text(item.scope, 160) ||
      !text(item.name, 80) ||
      !validTime(item.time) ||
      (item.anchor !== undefined && !validAnchor(item.anchor))
    )
      continue;
    const bookmark: ReplayBookmark = {
      id: item.id.trim(),
      scope: item.scope.trim(),
      name: item.name.trim(),
      time: item.time,
      ...(validAnchor(item.anchor) ? { anchor: copyAnchor(item.anchor) } : {}),
    };
    if (bookmarks.some((saved) => saved.id === bookmark.id || sameBookmarkBar(saved, bookmark)))
      continue;
    bookmarks.push(bookmark);
  }
  return bookmarks;
}

function assertReady() {
  if (!tradingWorkspaceStorage.getSnapshot().ready)
    throw Error("Wait for your workspace to finish loading.");
}

export const useReplayBookmarks = create<{
  bookmarks: ReplayBookmark[];
  add: (scope: string, name: string, time: number, anchor?: ReplayBookmarkAnchor) => string;
  rename: (id: string, name: string) => boolean;
  remove: (id: string) => boolean;
}>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      add: (scope, name, time, anchor) => {
        assertReady();
        if (!text(scope, 160)) throw Error("Choose a valid chart before saving a bookmark.");
        if (!text(name, 80)) throw Error("Enter a bookmark name between 1 and 80 characters.");
        if (!validTime(time)) throw Error("This bar has an invalid date.");
        if (anchor !== undefined && !validAnchor(anchor))
          throw Error("This bar has invalid bookmark data.");
        const current = get().bookmarks;
        const normalizedScope = scope.trim();
        const bookmark: ReplayBookmark = {
          id: randomUUID(),
          scope: normalizedScope,
          name: name.trim(),
          time,
          ...(anchor === undefined ? {} : { anchor: copyAnchor(anchor) }),
        };
        if (current.some((saved) => sameBookmarkBar(saved, bookmark)))
          throw Error("This bar already has a bookmark.");
        if (current.length >= MAX_REPLAY_BOOKMARKS)
          throw Error("Remove a bookmark before adding another (100 per workspace).");
        set({ bookmarks: [...current, bookmark] });
        return bookmark.id;
      },
      rename: (id, name) => {
        assertReady();
        if (!text(name, 80)) throw Error("Enter a bookmark name between 1 and 80 characters.");
        const current = get().bookmarks;
        const bookmark = current.find((saved) => saved.id === id);
        if (!bookmark) return false;
        const normalizedName = name.trim();
        if (bookmark.name === normalizedName) return true;
        set({
          bookmarks: current.map((saved) =>
            saved.id === id ? { ...saved, name: normalizedName } : saved,
          ),
        });
        return true;
      },
      remove: (id) => {
        assertReady();
        const current = get().bookmarks;
        if (!current.some((saved) => saved.id === id)) return false;
        set({ bookmarks: current.filter((saved) => saved.id !== id) });
        return true;
      },
    }),
    {
      name: "automorphic:replay-bookmarks:v1",
      storage: createJSONStorage(() => tradingWorkspaceStorage),
      skipHydration: true,
      partialize: ({ bookmarks }) => ({ bookmarks }),
      merge: (saved, current) => ({
        ...current,
        bookmarks: normalizeReplayBookmarks(record(saved) ? saved.bookmarks : undefined),
      }),
    },
  ),
);

tradingWorkspaceStorage.registerHydrator(() => {
  useReplayBookmarks.setState(useReplayBookmarks.getInitialState(), true);
  return useReplayBookmarks.persist.rehydrate();
});
