import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { randomUUID } from "../../lib/utils";
import { tradingWorkspaceStorage } from "./workspaceStorage";

export type ReplayBookmark = { id: string; scope: string; name: string; time: number };
export const MAX_REPLAY_BOOKMARKS = 100;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
const validTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 253402300799;

export function normalizeReplayBookmarks(value: unknown): ReplayBookmark[] {
  if (!Array.isArray(value)) return [];
  const bookmarks: ReplayBookmark[] = [];
  for (const item of value.slice(0, MAX_REPLAY_BOOKMARKS)) {
    if (
      !record(item) ||
      !text(item.id, 100) ||
      !text(item.scope, 160) ||
      !text(item.name, 80) ||
      !validTime(item.time)
    )
      continue;
    const bookmark = {
      id: item.id.trim(),
      scope: item.scope.trim(),
      name: item.name.trim(),
      time: item.time,
    };
    if (
      bookmarks.some(
        (saved) =>
          saved.id === bookmark.id ||
          (saved.scope === bookmark.scope && saved.time === bookmark.time),
      )
    )
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
  add: (scope: string, name: string, time: number) => string;
  remove: (id: string) => boolean;
}>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      add: (scope, name, time) => {
        assertReady();
        if (!text(scope, 160)) throw Error("Choose a valid chart before saving a bookmark.");
        if (!text(name, 80)) throw Error("Enter a bookmark name between 1 and 80 characters.");
        if (!validTime(time)) throw Error("This bar has an invalid date.");
        const current = get().bookmarks;
        const normalizedScope = scope.trim();
        if (current.some((saved) => saved.scope === normalizedScope && saved.time === time))
          throw Error("This bar already has a bookmark.");
        if (current.length >= MAX_REPLAY_BOOKMARKS)
          throw Error("Remove a bookmark before adding another (100 per workspace).");
        const id = randomUUID();
        set({ bookmarks: [...current, { id, scope: normalizedScope, name: name.trim(), time }] });
        return id;
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
