import { MarketInstrumentIcon } from "./MarketInstrumentIcon";
import { ChartIcon } from "./ChartIcon";
import { useId, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Dialog, DialogPopup, DialogTitle, DialogTrigger } from "../ui/dialog";
import { CheckIcon, PlusIcon } from "lucide-react";
import { Checkbox } from "../ui/checkbox";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

import {
  INDICATOR_CATALOG,
  INDICATOR_CATEGORIES,
  INITIAL_BALANCE_TIME_ZONES,
  findIndicators,
  type ChartStyle,
  type IndicatorKey,
  type ChartIndicators,
  type InitialBalanceSettings,
} from "./indicatorCatalog";
export type {
  ChartStyle,
  IndicatorKey,
  ChartIndicators,
  InitialBalanceSettings,
} from "./indicatorCatalog";
export type ChartToolbarProps = {
  symbol: string;
  onSelectSymbol: () => void;
  interval: number;
  onIntervalChange: (value: number) => void;
  style: ChartStyle;
  onStyleChange: (value: ChartStyle) => void;
  indicators: ChartIndicators;
  onToggleIndicator: (key: IndicatorKey) => void;
  initialBalance: InitialBalanceSettings;
  onInitialBalanceChange: (settings: InitialBalanceSettings) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  logScale: boolean;
  onToggleLogScale: () => void;
  onScreenshot: () => void;
  panelActions?: ReactNode;
};
const control =
  "inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded px-2.5 text-[13px] text-zinc-400 outline-none hover:bg-white/5 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-400/70 data-popup-open:bg-white/5 data-popup-open:text-zinc-100";
const select =
  "h-8 appearance-none rounded border-0 bg-transparent pr-6 text-xs text-zinc-300 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-400/70 [&>option]:bg-zinc-900 [&>option]:text-zinc-200";

export function ChartToolbar({
  symbol,
  onSelectSymbol,
  interval,
  onIntervalChange,
  style,
  onStyleChange,
  indicators,
  onToggleIndicator,
  initialBalance,
  onInitialBalanceChange,
  showGrid,
  onToggleGrid,
  logScale,
  onToggleLogScale,
  onScreenshot,
  panelActions,
}: ChartToolbarProps) {
  const id = useId();
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [indicatorCategory, setIndicatorCategory] = useState<string>("All");
  const matchingIndicators = findIndicators(indicatorSearch).filter(
    (item) => indicatorCategory === "All" || item.category === indicatorCategory,
  );
  const activeCount = INDICATOR_CATALOG.filter((indicator) => indicators[indicator.key]).length;
  return (
    <div
      role="group"
      aria-label="Chart tools"
      className="flex min-w-0 shrink-0 items-center border-b border-white/10 bg-[#101013]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1.5 py-1 [scrollbar-width:thin]">
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={onSelectSymbol}
            aria-label={`Change chart symbol${symbol ? `, currently ${symbol}` : ""}`}
            className={cn(control, "max-w-32 font-semibold text-zinc-200")}
          >
            <MarketInstrumentIcon
              root={symbol.startsWith("MGC") ? "MGC" : "MNQ"}
              className="size-5 shrink-0"
            />
            <span className="truncate">
              {symbol.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, "") || "Symbol"}
            </span>
          </TooltipTrigger>
          <TooltipPopup>{symbol || "Select symbol"}</TooltipPopup>
        </Tooltip>
        <span className="mx-1 h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
        <div className="relative shrink-0">
          <select
            aria-label="Chart interval"
            value={interval}
            onChange={(event) => onIntervalChange(Number(event.target.value))}
            className={cn(select, "w-14 pl-2")}
          >
            <option value={1}>1m</option>
            <option value={5}>5m</option>
            <option value={15}>15m</option>
            <option value={60}>1h</option>
          </select>
          <ChartIcon
            name="chevron-down"
            className="pointer-events-none absolute right-1.5 top-2.5 size-3 text-zinc-600"
            aria-hidden="true"
          />
        </div>
        <div className="relative shrink-0">
          <ChartIcon
            name="chart-candle"
            className="pointer-events-none absolute left-2 top-2 size-4 text-zinc-500"
            aria-hidden="true"
          />
          <select
            aria-label="Chart style"
            value={style}
            onChange={(event) => onStyleChange(event.target.value as ChartStyle)}
            className={cn(select, "w-28 pl-7")}
          >
            <option value="candles">Candles</option>
            <option value="bars">Bars</option>
            <option value="line">Line</option>
            <option value="area">Area</option>
          </select>
          <ChartIcon
            name="chevron-down"
            className="pointer-events-none absolute right-1.5 top-2.5 size-3 text-zinc-600"
            aria-hidden="true"
          />
        </div>
        <span className="mx-1 h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
        <Dialog>
          <Tooltip>
            <TooltipTrigger
              render={
                <DialogTrigger
                  className={control}
                  aria-label={`Indicators, ${activeCount} active`}
                />
              }
            >
              <ChartIcon name="sum" className="size-4" aria-hidden="true" />
              <span>Indicators</span>
              {activeCount > 0 && (
                <span className="min-w-3 text-[9px] text-blue-400" aria-hidden="true">
                  {activeCount}
                </span>
              )}
            </TooltipTrigger>
            <TooltipPopup>Add chart indicators</TooltipPopup>
          </Tooltip>
          <DialogPopup className="trading-surface flex h-[min(36rem,85vh)] w-[min(48rem,calc(100vw-2rem))] max-w-3xl flex-col overflow-hidden p-0">
            <DialogTitle className="px-6 py-5 text-xl">Indicators</DialogTitle>
            <div className="relative border-y border-border px-4">
              <ChartIcon
                name="search"
                className="pointer-events-none absolute left-6 top-3.5 size-4 text-muted-foreground"
              />
              <input
                aria-label="Search indicators"
                type="search"
                value={indicatorSearch}
                onChange={(event) => setIndicatorSearch(event.target.value)}
                placeholder="Search indicators"
                className="h-11 w-full bg-transparent pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex min-h-0 flex-1 max-sm:flex-col">
              <nav
                aria-label="Indicator categories"
                className="flex w-40 shrink-0 flex-col gap-1 border-r border-border p-3 max-sm:w-full max-sm:flex-row max-sm:overflow-x-auto max-sm:border-r-0 max-sm:border-b"
              >
                {["All", ...INDICATOR_CATEGORIES].map((category) => (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={indicatorCategory === category}
                    onClick={() => setIndicatorCategory(category)}
                    className={cn(
                      "rounded-md px-3 py-2.5 text-left text-sm",
                      indicatorCategory === category
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    {category === "All" ? "All indicators" : category}
                  </button>
                ))}
              </nav>
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3">
                {INDICATOR_CATEGORIES.map((category) => {
                  const entries = matchingIndicators.filter((item) => item.category === category);
                  if (!entries.length) return null;
                  return (
                    <section key={category} aria-label={category} className="mb-3 last:mb-0">
                      <h3 className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {category}
                      </h3>
                      {entries.map((indicator) => (
                        <div key={indicator.key}>
                          <button
                            type="button"
                            disabled={indicators[indicator.key]}
                            onClick={() => onToggleIndicator(indicator.key)}
                            aria-label={`${indicators[indicator.key] ? "Added" : "Add"} ${indicator.label}`}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left hover:bg-accent/60 disabled:cursor-default disabled:hover:bg-transparent"
                          >
                            <ChartIcon
                              name="sum"
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium leading-5 text-foreground">
                                {indicator.label}
                              </span>
                              <span className="block pt-1 text-xs text-muted-foreground">
                                {indicator.detail}
                              </span>
                            </span>
                            {indicators[indicator.key] ? (
                              <CheckIcon className="size-4 text-blue-400" aria-hidden="true" />
                            ) : (
                              <PlusIcon
                                className="size-4 text-muted-foreground"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                          {indicator.key === "ib" && indicators.ib ? (
                            <fieldset className="mb-2 ml-8 space-y-2 rounded border border-border p-2">
                              <legend className="px-1 text-[11px] text-muted-foreground">
                                Session window
                              </legend>
                              <div className="flex items-center justify-between gap-3">
                                <label htmlFor={`${id}-ib-start`} className="text-[11px]">
                                  Start
                                </label>
                                <input
                                  id={`${id}-ib-start`}
                                  type="time"
                                  value={initialBalance.startTime}
                                  onChange={(event) =>
                                    onInitialBalanceChange({
                                      ...initialBalance,
                                      startTime: event.target.value,
                                    })
                                  }
                                  className="h-7 rounded border border-border bg-background px-1.5 text-xs"
                                />
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <label htmlFor={`${id}-ib-zone`} className="text-[11px]">
                                  Time zone
                                </label>
                                <select
                                  id={`${id}-ib-zone`}
                                  value={initialBalance.timeZone}
                                  onChange={(event) =>
                                    onInitialBalanceChange({
                                      ...initialBalance,
                                      timeZone: event.target
                                        .value as InitialBalanceSettings["timeZone"],
                                    })
                                  }
                                  className="h-7 min-w-0 rounded border border-border bg-background px-1.5 text-xs"
                                >
                                  {INITIAL_BALANCE_TIME_ZONES.map((zone) => (
                                    <option key={zone} value={zone}>
                                      {zone === "America/New_York"
                                        ? "New York"
                                        : zone === "America/Chicago"
                                          ? "Chicago"
                                          : "UTC"}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <label htmlFor={`${id}-ib-duration`} className="text-[11px]">
                                  Minutes
                                </label>
                                <input
                                  id={`${id}-ib-duration`}
                                  type="number"
                                  min={1}
                                  max={240}
                                  step={1}
                                  value={initialBalance.durationMinutes}
                                  onChange={(event) =>
                                    onInitialBalanceChange({
                                      ...initialBalance,
                                      durationMinutes: Number(event.target.value),
                                    })
                                  }
                                  className="h-7 w-20 rounded border border-border bg-background px-1.5 text-xs"
                                />
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                Weekdays · based on loaded bars
                              </p>
                            </fieldset>
                          ) : null}
                        </div>
                      ))}
                    </section>
                  );
                })}
                {!matchingIndicators.length ? (
                  <p className="px-2 py-5 text-center text-xs text-muted-foreground">
                    No matching indicators.
                  </p>
                ) : null}
              </div>
            </div>
          </DialogPopup>
        </Dialog>
        <Popover>
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
                  className={cn(control, "w-8 px-0")}
                  aria-label="Chart display settings"
                />
              }
            >
              <ChartIcon name="adjustments-horizontal" className="size-5" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipPopup>Chart display settings</TooltipPopup>
          </Tooltip>
          <PopoverPopup align="end" className="w-56" viewportClassName="px-3 py-3">
            <PopoverTitle className="px-1 pb-2 text-xs">Chart display</PopoverTitle>
            <label
              htmlFor={`${id}-grid`}
              className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
            >
              <Checkbox id={`${id}-grid`} checked={showGrid} onCheckedChange={onToggleGrid} />
              Grid lines
            </label>
            <label
              htmlFor={`${id}-log`}
              className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
            >
              <Checkbox id={`${id}-log`} checked={logScale} onCheckedChange={onToggleLogScale} />
              Logarithmic price scale
            </label>
          </PopoverPopup>
        </Popover>
        <Tooltip>
          <TooltipTrigger
            type="button"
            className={cn(control, "w-8 px-0")}
            aria-label="Download chart screenshot"
            onClick={onScreenshot}
          >
            <ChartIcon name="camera" className="size-5" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipPopup>Download chart screenshot</TooltipPopup>
        </Tooltip>
      </div>
      {panelActions && (
        <div className="flex shrink-0 items-center border-l border-white/10 px-1 py-1">
          {panelActions}
        </div>
      )}
    </div>
  );
}
