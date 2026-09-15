import { useState, useSyncExternalStore } from "react";
import { BookmarkIcon, Trash2Icon, PencilIcon, CheckIcon, XIcon } from "lucide-react";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import { useReplayBookmarks, replayBookmarkAnchor, resolveReplayBookmark } from "./replayBookmarks";
import type { Candle } from "./chartIndicators";

export function ReplayBookmarks({
  scope,
  bar,
  timeZone,
  bars,
  onPause,
  onSeek,
}: {
  scope: string;
  bar: Candle;
  timeZone: string;
  bars: readonly Candle[];
  onPause: () => void;
  onSeek: (index: number) => void;
}) {
  const store = useReplayBookmarks();
  const time = bar.actualTime ?? bar.time;
  const workspace = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    tradingWorkspaceStorage.getSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<{
    id: string;
    name: string;
    scope: string;
    projectId: string | null;
  } | null>(null);
  const activeEdit =
    edit?.scope === scope && edit.projectId === workspace.projectId && workspace.ready
      ? edit
      : null;
  const bookmarks = store.bookmarks.filter((bookmark) => bookmark.scope === scope);
  const dateLabel = (value: number) =>
    new Date(value * 1000).toLocaleString([], {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    });
  function run(action: () => void) {
    try {
      action();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the bookmark.");
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setEdit(null);
        if (next) {
          onPause();
          setError("");
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={<PopoverTrigger />}
          aria-label="Replay bookmarks"
          className="flex size-7 shrink-0 items-center justify-center rounded hover:bg-white/10 data-popup-open:text-blue-400"
        >
          <BookmarkIcon className="size-4" />
        </TooltipTrigger>
        <TooltipPopup>Replay bookmarks</TooltipPopup>
      </Tooltip>
      <PopoverPopup
        align="end"
        className="w-72"
        positionerClassName="h-auto"
        viewportClassName="p-3"
      >
        <PopoverTitle className="mb-3 text-sm">Replay bookmarks</PopoverTitle>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => {
              store.add(scope, name, time, replayBookmarkAnchor(bar));
              setName("");
            });
          }}
        >
          <input
            aria-label="Bookmark name"
            placeholder="Name this moment"
            maxLength={80}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
            className="h-8 w-full rounded border border-zinc-600 bg-transparent px-2 text-xs outline-none focus:border-blue-400"
          />
          <div className="text-[11px] text-zinc-400">{dateLabel(time)}</div>
          <button
            type="submit"
            disabled={!workspace.ready || !name.trim()}
            className="h-8 rounded border border-zinc-600 px-2 text-xs hover:bg-white/10 disabled:opacity-40"
          >
            Save current bar
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-400">
            {error}
          </p>
        )}
        <div className="mt-3 max-h-60 overflow-y-auto overscroll-contain border-t border-white/10 pt-2">
          {bookmarks.length ? (
            bookmarks.map((bookmark) => (
              <div key={bookmark.id} className="flex items-center gap-1 rounded hover:bg-white/5">
                {activeEdit?.id === bookmark.id ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-1 py-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(() => {
                        if (!store.rename(bookmark.id, activeEdit.name))
                          throw Error("This bookmark no longer exists.");
                        setEdit(null);
                      });
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="New bookmark name"
                      maxLength={80}
                      value={activeEdit.name}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => {
                        setEdit({ ...activeEdit, name: event.target.value });
                        setError("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          event.stopPropagation();
                          setEdit(null);
                          setError("");
                        }
                      }}
                      className="h-8 min-w-0 flex-1 rounded border border-zinc-600 bg-transparent px-2 text-xs outline-none focus:border-blue-400"
                    />
                    <button
                      type="submit"
                      aria-label="Save bookmark name"
                      disabled={!activeEdit.name.trim()}
                      className="flex size-7 shrink-0 items-center justify-center rounded hover:bg-white/10 disabled:opacity-40"
                    >
                      <CheckIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Cancel bookmark rename"
                      onClick={() => {
                        setEdit(null);
                        setError("");
                      }}
                      className="flex size-7 shrink-0 items-center justify-center rounded hover:bg-white/10"
                    >
                      <XIcon className="size-4" />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={`Go to bookmark ${bookmark.name}`}
                      disabled={!workspace.ready}
                      onClick={() =>
                        run(() => {
                          const index = resolveReplayBookmark(bars, bookmark);
                          if (index === null)
                            throw Error(
                              "The bookmarked bar is unavailable or has changed in the loaded history.",
                            );
                          onSeek(index);
                          setOpen(false);
                        })
                      }
                      className="min-w-0 flex-1 rounded px-1 py-2 text-left disabled:opacity-40"
                    >
                      <span className="block truncate text-xs">{bookmark.name}</span>
                      <span className="block text-[11px] text-zinc-400">
                        {dateLabel(bookmark.time)}
                      </span>
                    </button>
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        aria-label={`Rename bookmark ${bookmark.name}`}
                        disabled={!workspace.ready}
                        onClick={() => {
                          setEdit({
                            id: bookmark.id,
                            name: bookmark.name,
                            scope,
                            projectId: workspace.projectId,
                          });
                          setError("");
                        }}
                        className="flex size-7 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
                      >
                        <PencilIcon className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipPopup>Rename bookmark</TooltipPopup>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        aria-label={`Delete bookmark ${bookmark.name}`}
                        disabled={!workspace.ready}
                        onClick={() =>
                          run(() => {
                            store.remove(bookmark.id);
                          })
                        }
                        className="flex size-7 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
                      >
                        <Trash2Icon className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipPopup>Delete bookmark</TooltipPopup>
                    </Tooltip>
                  </>
                )}
              </div>
            ))
          ) : (
            <p className="py-2 text-xs text-zinc-400">No bookmarks for this chart yet.</p>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
