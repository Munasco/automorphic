import { MarketInstrumentIcon } from "./MarketInstrumentIcon";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { MarketSessionBadge } from "./MarketSessionBadge";
import { ChartIcon } from "./ChartIcon";
import { cn } from "../../lib/utils";
import { INSTRUMENTS } from "./tradingInstruments";
export { INSTRUMENTS } from "./tradingInstruments";

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
    <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/5 bg-linear-to-b from-background via-[#0d0d10] to-[#101013] px-4 py-3">
      <div className="flex min-w-0 items-start gap-2">
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={onSelect}
            aria-label={`Select instrument, ${symbol || root}`}
            aria-haspopup="dialog"
            className="group flex max-w-full items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MarketInstrumentIcon root={root} className="size-9 shrink-0" />
            <span className="min-w-0">
              <span className="trading-heading flex items-center gap-2 text-lg font-semibold">
                <span className="truncate">{root}</span>
                <ChartIcon
                  name="chevron-down"
                  className="size-4 text-muted-foreground group-hover:text-foreground"
                />
              </span>
              <span className="mt-1 block truncate text-xs leading-5 text-muted-foreground">
                {instrument.name} <span className="mx-1.5 text-border">·</span>{" "}
                {instrument.exchange}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipPopup>{symbol || root}</TooltipPopup>
        </Tooltip>
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
