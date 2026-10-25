import { useState, useSyncExternalStore } from "react";
import type { IChartApi } from "lightweight-charts";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import type { ChartTableSource } from "./ChartDataTableDialog";
import { formatReplayDateTime, parseReplayDateTime } from "./replayDateTime";
import {
  chartNavigationIndex,
  centerChartNavigationRange,
  readChartNavigationTime,
  writeChartNavigationTime,
} from "./chartDateNavigation";
import { tradingWorkspaceStorage } from "./workspaceStorage";

export function ChartGoToDateDialog({
  chart,
  source,
  symbol,
  timeZone,
  onClose,
}: {
  chart: IChartApi;
  source: ChartTableSource;
  symbol: string;
  timeZone: string;
  onClose: () => void;
}) {
  useSyncExternalStore(source.subscribeBars, source.getBarRevision);
  const workspace = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    tradingWorkspaceStorage.getSnapshot,
  );
  const bars = [...source.bars.values()].sort((a, b) => a.time - b.time);
  const [date, setDate] = useState(() => {
    const range = chart.timeScale().getVisibleLogicalRange();
    const center = range ? Math.round((range.from + range.to) / 2) : bars.length - 1;
    const bar = bars[Math.max(0, Math.min(bars.length - 1, center))];
    const time =
      readChartNavigationTime(tradingWorkspaceStorage, symbol) ?? bar?.actualTime ?? bar?.time;
    return time === undefined ? "" : formatReplayDateTime(time, timeZone);
  });
  const [mode, setMode] = useState<"date" | "range">("date");
  const [error, setError] = useState("");
  const times = bars.map((bar) => bar.actualTime ?? bar.time);
  const first = times.length ? Math.min(...times) : null;
  const last = times.length ? Math.max(...times) : null;
  const firstInput = first === null ? undefined : formatReplayDateTime(first, timeZone);
  const lastInput = last === null ? undefined : formatReplayDateTime(last, timeZone);
  const [rangeStart, setRangeStart] = useState(() =>
    first === null ? "" : formatReplayDateTime(first, timeZone),
  );
  const [rangeEnd, setRangeEnd] = useState(() =>
    last === null ? "" : formatReplayDateTime(last, timeZone),
  );
  const displayDate = (time: number) => formatReplayDateTime(time, timeZone).replace("T", " ");
  function submit() {
    if (mode === "range") {
      const start = parseReplayDateTime(rangeStart, timeZone);
      const end = parseReplayDateTime(rangeEnd, timeZone);
      if (start === null || end === null || start >= end) {
        setError("Choose a valid start and end time.");
        return;
      }
      const startIndex = chartNavigationIndex([...source.bars.values()], start);
      const endIndex = chartNavigationIndex([...source.bars.values()], end);
      if (startIndex === null || endIndex === null || startIndex >= endIndex) {
        setError("Choose a range within the available chart history.");
        return;
      }
      try {
        if (!tradingWorkspaceStorage.getSnapshot().ready)
          throw Error("The workspace is still loading.");
        chart.timeScale().setVisibleLogicalRange({ from: startIndex, to: endIndex });
        writeChartNavigationTime(tradingWorkspaceStorage, symbol, start);
        onClose();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Couldn't apply that range. Try again.");
      }
      return;
    }
    const target = parseReplayDateTime(date, timeZone);
    if (target === null) {
      setError(`Choose a valid, unambiguous time in ${timeZone}.`);
      return;
    }
    const index = chartNavigationIndex([...source.bars.values()], target);
    if (index === null) {
      setError("Choose a time within the available chart history.");
      return;
    }
    const range = centerChartNavigationRange(index, chart.timeScale().getVisibleLogicalRange());
    if (!range) return;
    try {
      if (!tradingWorkspaceStorage.getSnapshot().ready)
        throw Error("The workspace is still loading.");
      chart.timeScale().setVisibleLogicalRange(range);
      writeChartNavigationTime(tradingWorkspaceStorage, symbol, target);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't go to that date. Try again.");
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup
        bottomStickOnMobile={false}
        backdropStyle={{ background: "transparent", backdropFilter: "none" }}
        className="flex w-[440px] flex-col overflow-hidden rounded-md border border-zinc-700 bg-[#1f1f1f] p-0 text-zinc-200"
      >
        <header className="shrink-0 border-b border-zinc-700 px-5 py-4 pr-12">
          <DialogTitle className="text-lg">Go to date</DialogTitle>
          <p className="mt-1 text-xs text-zinc-400">
            {symbol} · {timeZone}
          </p>
        </header>
        <form
          noValidate
          className="min-h-0 overflow-y-auto p-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="mb-5 flex items-center gap-6 border-b border-zinc-700">
            {(["date", "range"] as const).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                aria-selected={mode === nextMode}
                onClick={() => {
                  setMode(nextMode);
                  setError("");
                }}
                className={`-mb-px border-b-2 px-0 pb-2 text-sm font-medium ${mode === nextMode ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
              >
                {nextMode === "date" ? "Date" : "Custom range"}
              </button>
            ))}
          </div>
          {mode === "date" ? (
            <>
              <label className="block text-sm" htmlFor="chart-navigation-date">
                Date and time
              </label>
              <input
                id="chart-navigation-date"
                aria-label="Go to date and time"
                aria-description={`Time zone: ${timeZone}`}
                type="datetime-local"
                step="1"
                autoFocus
                min={firstInput}
                max={lastInput}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setError("");
                }}
                className="mt-2 h-10 w-full rounded border border-zinc-600 bg-[#292929] px-3 text-sm outline-none focus:border-blue-400 [color-scheme:dark]"
              />
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Start
                <input
                  aria-label="Custom range start"
                  type="datetime-local"
                  step="1"
                  min={firstInput}
                  max={rangeEnd || lastInput}
                  value={rangeStart}
                  onChange={(event) => {
                    setRangeStart(event.target.value);
                    setError("");
                  }}
                  className="mt-2 h-10 w-full rounded border border-zinc-600 bg-[#292929] px-3 text-sm outline-none focus:border-blue-400 [color-scheme:dark]"
                />
              </label>
              <label className="block text-sm">
                End
                <input
                  aria-label="Custom range end"
                  type="datetime-local"
                  step="1"
                  min={rangeStart || firstInput}
                  max={lastInput}
                  value={rangeEnd}
                  onChange={(event) => {
                    setRangeEnd(event.target.value);
                    setError("");
                  }}
                  className="mt-2 h-10 w-full rounded border border-zinc-600 bg-[#292929] px-3 text-sm outline-none focus:border-blue-400 [color-scheme:dark]"
                />
              </label>
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-zinc-400">
            {first !== null && last !== null ? (
              <>
                Available history
                <br />
                {displayDate(first)} – {displayDate(last)}
              </>
            ) : (
              "No chart history available."
            )}
          </p>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-zinc-600 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                !workspace.ready ||
                !bars.length ||
                (mode === "date" ? !date : !rangeStart || !rangeEnd)
              }
              className="rounded bg-zinc-100 px-3 py-1.5 text-sm text-zinc-950 hover:bg-white disabled:opacity-40"
            >
              Go to
            </button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
