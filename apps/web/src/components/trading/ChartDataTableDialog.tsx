import { useMemo, useReducer, useState, useSyncExternalStore } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import type { Candle } from "./chartIndicators";
import {
  createChartDataTableRows,
  sortChartDataTableRows,
  readChartDataTableSort,
  writeChartDataTableSort,
  type ChartDataTableSort,
} from "./chartDataTable";
import { tradingWorkspaceStorage } from "./workspaceStorage";

export interface ChartTableSource {
  bars: ReadonlyMap<number, Candle>;
  subscribeBars: (listener: () => void) => () => void;
  getBarRevision: () => number;
}
const columns = ["time", "open", "high", "low", "close", "volume"] as const;
const pageSize = 100;
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 });
const readSort = () => JSON.stringify(readChartDataTableSort(tradingWorkspaceStorage));

export function ChartDataTableDialog({
  source,
  symbol,
  intervalLabel,
  timeZone,
  formatPrice,
  onClose,
}: {
  source: ChartTableSource;
  symbol: string;
  intervalLabel: string;
  timeZone: string;
  formatPrice: (price: number) => string;
  onClose: () => void;
}) {
  useSyncExternalStore(source.subscribeBars, source.getBarRevision);
  useSyncExternalStore(tradingWorkspaceStorage.subscribe, readSort);
  const [, refreshSort] = useReducer((value: number) => value + 1, 0);
  const sort = readChartDataTableSort(tradingWorkspaceStorage);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const rows = sortChartDataTableRows(createChartDataTableRows([...source.bars.values()]), sort);
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    [timeZone],
  );
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * pageSize;
  function changeSort(field: ChartDataTableSort["field"]) {
    const next: ChartDataTableSort = {
      field,
      direction: sort.field === field && sort.direction === "desc" ? "asc" : "desc",
    };
    try {
      writeChartDataTableSort(tradingWorkspaceStorage, next);
      refreshSort();
      setPage(0);
      setError("");
    } catch {
      setError("Couldn't save the table order. Try again.");
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
        className="flex w-[820px] max-w-none flex-col overflow-hidden rounded-md border border-zinc-700 bg-[#1f1f1f] p-0 text-zinc-200"
        backdropStyle={{ background: "transparent", backdropFilter: "none", transition: "none" }}
        bottomStickOnMobile={false}
      >
        <header className="shrink-0 border-b border-zinc-700 px-5 py-4 pr-12">
          <DialogTitle className="text-lg">Table view · {symbol}</DialogTitle>
          <p className="mt-1 text-xs text-zinc-400">
            Market data · {intervalLabel} · {timeZone}
          </p>
        </header>
        <div className="min-h-0 overflow-auto">
          <table
            className="w-full border-collapse text-right text-xs tabular-nums"
            aria-label={`${symbol} market data`}
          >
            <thead className="sticky top-0 z-10 bg-[#292929] text-zinc-300">
              <tr>
                {columns.map((field) => (
                  <th
                    key={field}
                    scope="col"
                    aria-sort={
                      sort.field === field
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="border-b border-zinc-600 px-3 py-2 first:text-left"
                  >
                    <button
                      type="button"
                      onClick={() => changeSort(field)}
                      className="inline-flex items-center gap-1 rounded py-1 capitalize hover:text-white focus-visible:outline focus-visible:outline-blue-400"
                    >
                      {field === "time" ? "Time" : field}
                      <span className="inline-flex size-3">
                        {sort.field === field ? (
                          sort.direction === "asc" ? (
                            <ArrowUpIcon className="size-3" />
                          ) : (
                            <ArrowDownIcon className="size-3" />
                          )
                        ) : null}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(start, start + pageSize).map((row) => (
                <tr key={row.chartTime} className="border-b border-white/5 hover:bg-white/5">
                  <td className="whitespace-nowrap px-3 py-2 text-left">
                    {dateFormat.format(row.time * 1000)}
                  </td>
                  {columns.slice(1).map((field) => (
                    <td key={field} className="whitespace-nowrap px-3 py-2">
                      {typeof row[field] === "number" && Number.isFinite(row[field])
                        ? field === "volume"
                          ? numberFormat.format(row[field]!)
                          : formatPrice(row[field]!)
                        : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? (
            <p className="p-6 text-center text-sm text-zinc-400">No bars loaded.</p>
          ) : null}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-zinc-700 px-4 py-3 text-xs">
          <span className="mr-auto text-zinc-400">
            {rows.length
              ? `${start + 1}–${Math.min(start + pageSize, rows.length)} of ${rows.length.toLocaleString()} bars`
              : "0 bars"}
          </span>
          <button
            type="button"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
            className="rounded border border-zinc-600 px-2 py-1 hover:bg-white/5 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={currentPage === lastPage}
            onClick={() => setPage(currentPage + 1)}
            className="rounded border border-zinc-600 px-2 py-1 hover:bg-white/5 disabled:opacity-40"
          >
            Next
          </button>
          {error ? (
            <p role="alert" className="w-full text-red-400">
              {error}
            </p>
          ) : null}
        </footer>
      </DialogPopup>
    </Dialog>
  );
}
