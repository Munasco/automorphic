import { toastManager } from "../ui/toast";
import { useReplayBookmarks, type ReplayBookmark } from "./replayBookmarks";
import { tradingWorkspaceStorage } from "./workspaceStorage";

export const MAX_REPLAY_BOOKMARK_FILE_BYTES = 1_000_000;
const format = "automorphic-replay-bookmarks";
const failure = (error: unknown) =>
  toastManager.add({
    type: "error",
    title: "Couldn't transfer replay bookmarks",
    description: error instanceof Error ? error.message : "Try again.",
  });

/** The 1 MB transfer limit accommodates 100 normalized entries, including escaped text. */
export function serializeReplayBookmarkFile(bookmarks: readonly ReplayBookmark[]) {
  return JSON.stringify({ format, version: 1, bookmarks }, null, 2);
}

export function exportReplayBookmarks() {
  try {
    if (!tradingWorkspaceStorage.getSnapshot().ready)
      throw Error("Wait for your workspace to finish loading.");
    const bookmarks = useReplayBookmarks.getState().bookmarks;
    const json = serializeReplayBookmarkFile(bookmarks);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = "automorphic-replay-bookmarks.json";
      link.click();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) {
    failure(error);
  }
}

export async function importReplayBookmarkFile(
  file: Pick<File, "size" | "text">,
  destination: ReturnType<typeof tradingWorkspaceStorage.capture>,
) {
  if (file.size > MAX_REPLAY_BOOKMARK_FILE_BYTES)
    throw Error("Choose a bookmark file smaller than 1 MB.");
  const json = await file.text();
  if (new TextEncoder().encode(json).length > MAX_REPLAY_BOOKMARK_FILE_BYTES)
    throw Error("Choose a bookmark file smaller than 1 MB.");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw Error("Choose a valid replay bookmark JSON file.");
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("format" in value) ||
    value.format !== format ||
    !("version" in value) ||
    value.version !== 1 ||
    !("bookmarks" in value)
  )
    throw Error("This is not a supported replay bookmark file.");
  if (
    !tradingWorkspaceStorage.getSnapshot().ready ||
    tradingWorkspaceStorage.capture() !== destination
  )
    throw Error("The workspace changed. Import again in the intended workspace.");
  return useReplayBookmarks.getState().importBookmarks(value.bookmarks);
}

/** Capture before opening the picker so a workspace switch cannot redirect the import. */
export function chooseReplayBookmarkFile() {
  if (!tradingWorkspaceStorage.getSnapshot().ready) {
    failure(Error("Wait for your workspace to finish loading."));
    return;
  }
  const destination = tradingWorkspaceStorage.capture();
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.hidden = true;
  input.addEventListener("cancel", () => input.remove(), { once: true });
  input.addEventListener(
    "change",
    () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      void importReplayBookmarkFile(file, destination)
        .then(({ imported, skipped }) =>
          toastManager.add({
            type: "success",
            title: `${imported} bookmark${imported === 1 ? "" : "s"} imported`,
            description: skipped
              ? `${skipped} already saved. Existing bookmarks were kept.`
              : "Saved to this workspace.",
          }),
        )
        .catch(failure);
    },
    { once: true },
  );
  document.body.append(input);
  try {
    input.click();
  } catch (error) {
    input.remove();
    failure(error);
  }
}
