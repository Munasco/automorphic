import { MarketSessionBadge } from "./MarketSessionBadge";
import { ChartIcon } from "./ChartIcon";
import { cn } from "../../lib/utils";

export interface MarketQuote {
  symbol: string;
  last: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  previousClose?: number;
  timestamp?: string;
  source?: "quote" | "bar";
}

export const INSTRUMENTS = {
  MGC: { name: "Micro Gold Futures", exchange: "COMEX", badge: "XAU" },
  NQ: { name: "E-mini Nasdaq-100 Futures", exchange: "CME", badge: "NQ" },
} as const;

const price = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function InstrumentHeader({
  root,
  symbol,
  quote,
  onSelect,
}: {
  root: keyof typeof INSTRUMENTS;
  symbol: string;
  quote: MarketQuote | null;
  onSelect: () => void;
}) {
  const instrument = INSTRUMENTS[root];
  const current = quote?.symbol === symbol ? quote : null;
  const change = current?.previousClose ? current.last - current.previousClose : null;
  const dayQuote = current?.source === "quote";
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-b border-border bg-card/40 px-4 py-3">
      <div className="flex min-w-0 items-start gap-2">
        <button
          type="button"
          onClick={onSelect}
          aria-label={`Select instrument, ${symbol || root}`}
          aria-haspopup="dialog"
          className="group flex max-w-full items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
              root === "MGC"
                ? "border-amber-400/20 bg-amber-400/10 text-amber-300"
                : "border-blue-400/20 bg-blue-400/10 text-blue-300",
            )}
            aria-hidden="true"
          >
            {instrument.badge}
          </span>
          <span className="min-w-0">
            <span className="trading-heading flex items-center gap-2 text-lg font-semibold">
              <span className="truncate">{symbol || root}</span>
              <ChartIcon
                name="chevron-down"
                className="size-4 text-muted-foreground group-hover:text-foreground"
              />
            </span>
            <span className="mt-1 block truncate text-xs leading-5 text-muted-foreground">
              {instrument.name} <span className="mx-1.5 text-border">·</span> {instrument.exchange}
            </span>
          </span>
        </button>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 tabular-nums">
          <span className="text-xl font-medium">{current ? price(current.last) : "—"}</span>
          <span className="text-xs font-medium text-muted-foreground">USD</span>
          {change !== null && current?.previousClose ? (
            <span className={cn("text-xs", change >= 0 ? "text-emerald-400" : "text-red-400")}>
              {change > 0 ? "+" : ""}
              {price(change)} ({change > 0 ? "+" : ""}
              {((change / current.previousClose) * 100).toFixed(2)}%)
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {current?.timestamp && Number.isFinite(Date.parse(current.timestamp)) ? (
            <time dateTime={current.timestamp} className="text-xs leading-5 text-muted-foreground">
              {new Date(current.timestamp).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </time>
          ) : null}
        </div>
      </div>
      {dayQuote && current ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 tabular-nums @min-[850px]:ml-auto">
          {(
            [
              ["Previous", current.previousClose],
              ["Open", current.open],
              ["Volume", current.volume],
            ] as const
          ).map(([label, value]) =>
            value !== undefined ? (
              <div key={label}>
                <dd className="text-[13px] leading-5">
                  {label === "Volume"
                    ? value.toLocaleString("en-US", { notation: "compact" })
                    : price(value)}
                </dd>
                <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
              </div>
            ) : null,
          )}
          {current.low !== undefined && current.high !== undefined ? (
            <div>
              <dd className="text-[13px] leading-5">
                {price(current.low)} – {price(current.high)}
              </dd>
              <dt className="mt-1 text-xs text-muted-foreground">Day range</dt>
            </div>
          ) : null}
        </dl>
      ) : null}
      <div className="ml-auto self-end">
        <MarketSessionBadge root={root} />
      </div>
    </div>
  );
}
