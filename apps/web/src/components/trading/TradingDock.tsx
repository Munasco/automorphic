import { useEffect, useId, useState } from "react";
import type { TradingAccountRow, TradingAccountSnapshot } from "@t3tools/contracts";
import { PanelBottomIcon, RefreshCw, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ACCOUNT_POLL_MS, tradingAccountCache } from "./tradingAccountCache";
import { cn } from "../../lib/utils";

const tabs = ["Positions", "Orders", "History"] as const;
type Tab = (typeof tabs)[number];
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });
const amount = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? number.format(value) : "—";
const timestamp = (value: string | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
};
const symbol = (row: TradingAccountRow) => row.symbol || `Contract ${row.contractId}`;

export function TradingDockToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={open ? "Hide bottom dock" : "Open bottom dock"}
            aria-pressed={open}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onToggle}
            className={open ? "bg-accent text-foreground" : undefined}
          />
        }
      >
        <PanelBottomIcon className="size-4" />
      </TooltipTrigger>
      <TooltipPopup>Terminal and trading</TooltipPopup>
    </Tooltip>
  );
}

export function TradingDock({ onClose, height }: { onClose?: () => void; height?: number }) {
  const id = useId();
  const [tab, setTab] = useState<Tab>("Positions");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [result, setResult] = useState<{ key: number | null; data: TradingAccountSnapshot } | null>(
    () => {
      const data = tradingAccountCache.peek(null);
      return data ? { key: null, data } : null;
    },
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ key: number | null; message: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const load = async (force: boolean) => {
      if (abort.signal.aborted || document.hidden || inFlight) return;
      inFlight = true;
      setLoading(true);
      try {
        const data = await tradingAccountCache.load(accountId, abort.signal, force);
        if (abort.signal.aborted) return;
        setResult({ key: accountId, data });
        setError(null);
      } catch (failure) {
        if (abort.signal.aborted) return;
        setError({
          key: accountId,
          message: failure instanceof Error ? failure.message : "Account unavailable.",
        });
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
          inFlight = false;
          if (!document.hidden) timer = setTimeout(() => void load(true), ACCOUNT_POLL_MS);
        }
      }
    };
    const onVisibilityChange = () => {
      clearTimeout(timer);
      if (!document.hidden) void load(false);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void load(refresh > 0);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      abort.abort();
      clearTimeout(timer);
    };
  }, [accountId, refresh]);
  const data = result?.key === accountId ? result.data : tradingAccountCache.peek(accountId);
  const accounts = data?.accounts ?? result?.data.accounts ?? [];
  const currentAccount = accountId ?? data?.accountId ?? "";
  const currentError = error?.key === accountId ? error.message : null;
  const rows = data
    ? tab === "Positions"
      ? data.positions
      : tab === "Orders"
        ? data.orders
        : data.history
    : [];
  const columns =
    tab === "Positions"
      ? ["Symbol", "Net quantity", "Average price", "Account"]
      : tab === "Orders"
        ? ["Symbol", "Side", "Quantity", "Type", "Status", "Price", "Stop", "Time"]
        : ["Symbol", "Side", "Quantity", "Fill price", "Time"];
  return (
    <section
      aria-label="Trading account dock"
      className="trading-surface flex min-h-40 shrink-0 flex-col overflow-hidden border-t border-border bg-background"
      style={{ height: height ?? 256, maxHeight: "75vh" }}
    >
      <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1">
        <div role="tablist" aria-label="Trading account views" className="flex items-center gap-1">
          {tabs.map((item, index) => (
            <Tooltip key={item}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    role="tab"
                    id={`${id}-${item}`}
                    aria-controls={`${id}-content`}
                    aria-selected={tab === item}
                    tabIndex={tab === item ? 0 : -1}
                    onClick={() => setTab(item)}
                    onKeyDown={(event) => {
                      const direction =
                        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                      if (!direction) return;
                      event.preventDefault();
                      const next = tabs[(index + direction + tabs.length) % tabs.length]!;
                      setTab(next);
                      document.getElementById(`${id}-${next}`)?.focus();
                    }}
                    className={cn(
                      "h-8 rounded px-2 text-xs font-medium",
                      tab === item
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                  />
                }
              >
                {item}
              </TooltipTrigger>
              <TooltipPopup>
                {item === "History"
                  ? "Fills available in the current broker session"
                  : item === "Orders"
                    ? "Available broker orders, including completed orders"
                    : "Open broker positions"}
              </TooltipPopup>
            </Tooltip>
          ))}
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          {data ? (
            <Tooltip>
              <TooltipTrigger
                className={cn(
                  "rounded px-1.5 py-1 text-[10px] font-medium uppercase",
                  data.environment === "live" ? "text-emerald-400" : "text-muted-foreground",
                )}
              >
                {data.environment}
              </TooltipTrigger>
              <TooltipPopup>
                {data.environment === "live"
                  ? "Live Tradovate account · read only"
                  : "Tradovate demo account · read only"}
              </TooltipPopup>
            </Tooltip>
          ) : null}
          <select
            aria-label="Trading account"
            value={currentAccount}
            disabled={!accounts.length}
            onChange={(event) => setAccountId(Number(event.target.value))}
            className="h-7 max-w-36 min-w-0 rounded border border-border bg-background px-1.5 text-xs"
          >
            {!accounts.length ? <option value="">Account</option> : null}
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Refresh trading account"
                  disabled={loading}
                  onClick={() => setRefresh((value) => value + 1)}
                />
              }
            >
              <RefreshCw className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup>
              {data ? `Updated ${timestamp(data.fetchedAt)} · refresh` : "Refresh account"}
            </TooltipPopup>
          </Tooltip>
          {onClose ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Close trading dock"
                    onClick={onClose}
                  />
                }
              >
                <XIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup>Close trading dock</TooltipPopup>
            </Tooltip>
          ) : null}
        </div>
      </header>
      {currentError ? (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-xs text-amber-400"
        >
          <span className="flex-1">
            {data ? "Showing cached data. " : ""}
            {currentError}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}
      <div
        role="tabpanel"
        id={`${id}-content`}
        aria-labelledby={`${id}-${tab}`}
        aria-busy={loading}
        className="min-h-0 flex-1 overflow-auto"
      >
        {!data ? (
          <p role="status" className="p-6 text-center text-xs text-muted-foreground">
            {loading
              ? "Loading broker account…"
              : currentError
                ? "Account data unavailable."
                : "Connecting…"}
          </p>
        ) : !rows.length ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            {!accounts.length
              ? "No trading accounts available."
              : tab === "Positions"
                ? "No open positions."
                : tab === "Orders"
                  ? "No orders available."
                  : "No fills available in this broker session."}
          </p>
        ) : (
          <table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
            <thead className="sticky top-0 bg-background text-[10px] text-muted-foreground">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="border-b border-border px-3 py-2 font-medium"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const cells =
                  tab === "Positions"
                    ? [
                        symbol(row),
                        amount(row.netPos),
                        amount(row.netPrice),
                        accounts.find((account) => account.id === row.accountId)?.name ??
                          String(row.accountId),
                      ]
                    : tab === "Orders"
                      ? [
                          symbol(row),
                          row.side ?? "—",
                          amount(row.quantity),
                          row.type ?? "—",
                          row.status ?? "—",
                          amount(row.price),
                          amount(row.stopPrice),
                          timestamp(row.timestamp),
                        ]
                      : [
                          symbol(row),
                          row.side ?? "—",
                          amount(row.quantity),
                          amount(row.fillPrice),
                          timestamp(row.timestamp),
                        ];
                return (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-accent/30">
                    {cells.map((cell, index) => (
                      <td
                        key={columns[index]}
                        className={cn(
                          "px-3 py-2",
                          index === 0 ? "font-medium text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
