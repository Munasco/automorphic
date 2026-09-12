import { ChartIcon } from "./ChartIcon";
import { useId, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Checkbox } from "../ui/checkbox";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export type ChartStyle = "candles" | "bars" | "line" | "area";
export type IndicatorKey = "sma" | "ema" | "vwap" | "rsi" | "volume";
export type ChartIndicators = Record<IndicatorKey, boolean>;
export type ChartToolbarProps = {
  symbol: string;
  onSelectSymbol: () => void;
  interval: number;
  onIntervalChange: (value: number) => void;
  style: ChartStyle;
  onStyleChange: (value: ChartStyle) => void;
  indicators: ChartIndicators;
  onToggleIndicator: (key: IndicatorKey) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  logScale: boolean;
  onToggleLogScale: () => void;
  onScreenshot: () => void;
  panelActions?: ReactNode;
};
const INDICATORS: ReadonlyArray<{ key: IndicatorKey; label: string; detail: string }> = [
  { key: "sma", label: "SMA 20", detail: "Simple moving average" },
  { key: "ema", label: "EMA 20", detail: "Exponential moving average" },
  { key: "vwap", label: "Session VWAP", detail: "Volume-weighted average price" },
  { key: "rsi", label: "RSI 14", detail: "Relative strength index" },
  { key: "volume", label: "Volume", detail: "Traded volume per bar" },
];
const control =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded px-2 text-xs text-zinc-400 outline-none hover:bg-white/5 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-400/70 data-popup-open:bg-white/5 data-popup-open:text-zinc-100";
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
  showGrid,
  onToggleGrid,
  logScale,
  onToggleLogScale,
  onScreenshot,
  panelActions,
}: ChartToolbarProps) {
  const id = useId();
  const activeCount = INDICATORS.filter((indicator) => indicators[indicator.key]).length;
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
            <ChartIcon name="search" className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{symbol || "Symbol"}</span>
          </TooltipTrigger>
          <TooltipPopup>Select symbol</TooltipPopup>
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
        <Popover>
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
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
            <TooltipPopup>Add or remove chart indicators</TooltipPopup>
          </Tooltip>
          <PopoverPopup align="start" className="w-64" viewportClassName="px-3 py-3">
            <PopoverTitle className="px-1 pb-2 text-xs">Indicators</PopoverTitle>
            <div className="space-y-0.5">
              {INDICATORS.map((indicator) => (
                <label
                  key={indicator.key}
                  htmlFor={`${id}-${indicator.key}`}
                  className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 hover:bg-white/5"
                >
                  <Checkbox
                    id={`${id}-${indicator.key}`}
                    checked={indicators[indicator.key]}
                    onCheckedChange={() => onToggleIndicator(indicator.key)}
                    aria-label={indicator.label}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs text-foreground">{indicator.label}</span>
                    <span className="block pt-0.5 text-[10px] text-muted-foreground">
                      {indicator.detail}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </PopoverPopup>
        </Popover>
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
              <ChartIcon name="adjustments-horizontal" className="size-4" aria-hidden="true" />
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
            <ChartIcon name="camera" className="size-4" aria-hidden="true" />
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
