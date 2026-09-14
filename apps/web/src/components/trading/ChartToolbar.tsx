import { PRICE_SOURCES, type PriceSource } from "./chartIndicators";
import { TradingSelect } from "./TradingSelect";
import type {
  ChartCrosshairMode,
  ChartCrosshairLineStyle,
  ChartCrosshairLineWidth,
  ChartGridMode,
  ChartGridLineStyle,
  ChartPriceScaleMode,
  ChartLineWidth,
  ChartLineShape,
  ChartLineMarkerRadius,
} from "./chartPreferences";

import {
  CHART_INTERVALS,
  chartIntervalKey,
  chartIntervalFromKey,
  formatChartInterval,
  type ChartInterval,
} from "./tradingIntervals";
import { rootFromSymbol } from "./tradingInstruments";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
  SelectGroup,
  SelectGroupLabel,
} from "../ui/select";
import { MarketInstrumentIcon } from "./MarketInstrumentIcon";
import { ChartIcon } from "./ChartIcon";
import { useId, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Dialog, DialogPopup, DialogTitle, DialogTrigger } from "../ui/dialog";
import { PlusIcon } from "lucide-react";
import { Checkbox } from "../ui/checkbox";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

import {
  INDICATOR_CATEGORIES,
  findIndicators,
  type ChartStyle,
  type IndicatorKey,
} from "./indicatorCatalog";
export type {
  ChartStyle,
  IndicatorKey,
  ChartIndicators,
  InitialBalanceSettings,
} from "./indicatorCatalog";
export type ChartToolbarProps = {
  displaySettingsOpen?: boolean;
  onDisplaySettingsOpenChange?: (open: boolean) => void;
  symbol: string;
  onSelectSymbol: () => void;
  interval: ChartInterval;
  onIntervalChange: (value: ChartInterval) => void;
  style: ChartStyle;
  onStyleChange: (value: ChartStyle) => void;
  indicatorCounts: Partial<Record<IndicatorKey, number>>;
  onAddIndicator: (key: IndicatorKey) => void;
  favoriteIndicators: readonly IndicatorKey[];
  onToggleFavoriteIndicator: (key: IndicatorKey) => void;
  indicatorLimitReached?: boolean;
  gridMode: ChartGridMode;
  gridLineStyle: ChartGridLineStyle;
  onGridLineStyleChange: (value: ChartGridLineStyle) => void;
  gridColor: string;
  onGridColorChange: (value: string) => void;
  onGridModeChange: (value: ChartGridMode) => void;
  thinBars: boolean;
  onToggleThinBars: () => void;
  showBarOpen: boolean;
  onToggleBarOpen: () => void;
  showCandleWicks: boolean;
  showCandleBorders: boolean;
  showLineMarkers: boolean;
  onToggleLineMarkers: () => void;
  lineMarkerRadius: ChartLineMarkerRadius;
  onLineMarkerRadiusChange: (radius: ChartLineMarkerRadius) => void;
  lineChartShape: ChartLineShape;
  onLineChartShapeChange: (shape: ChartLineShape) => void;
  lineChartSource: PriceSource;
  onLineChartSourceChange: (source: PriceSource) => void;
  lineChartColor: string;
  lineChartWidth: ChartLineWidth;
  onLineChartColorChange: (color: string) => void;
  onLineChartWidthChange: (width: ChartLineWidth) => void;
  onToggleCandleWicks: () => void;
  onToggleCandleBorders: () => void;
  showPriceLine: boolean;
  onTogglePriceLine: () => void;
  showPriceLabel: boolean;
  onTogglePriceLabel: () => void;
  crosshairMode: ChartCrosshairMode;
  onCrosshairModeChange: (value: ChartCrosshairMode) => void;
  crosshairColor: string;
  onCrosshairColorChange: (value: string) => void;
  crosshairLineStyle: ChartCrosshairLineStyle;
  onCrosshairLineStyleChange: (value: ChartCrosshairLineStyle) => void;
  crosshairLineWidth: ChartCrosshairLineWidth;
  onCrosshairLineWidthChange: (value: ChartCrosshairLineWidth) => void;
  priceScaleMode: ChartPriceScaleMode;
  onPriceScaleModeChange: (value: ChartPriceScaleMode) => void;
  invertScale: boolean;
  onToggleInvertScale: () => void;
  onScreenshot: () => void;
  panelActions?: ReactNode;
  navigationControl?: ReactNode;
  replayControl?: ReactNode;
  historyControls?: ReactNode;
};
export const PRICE_SCALE_OPTIONS = [
  ["normal", "Normal"],
  ["logarithmic", "Logarithmic"],
  ["percentage", "Percentage"],
  ["indexedTo100", "Indexed to 100"],
] as const;
const NO_FAVORITES: readonly IndicatorKey[] = [];
const control =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded px-2.5 text-[13px] text-zinc-400 outline-none hover:bg-white/5 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-400/70 data-popup-open:bg-white/5 data-popup-open:text-zinc-100 [&>svg]:size-[18px]";

export function ChartToolbar({
  displaySettingsOpen,
  onDisplaySettingsOpenChange,
  symbol,
  onSelectSymbol,
  interval,
  onIntervalChange,
  style,
  onStyleChange,
  indicatorCounts,
  onAddIndicator,
  favoriteIndicators = NO_FAVORITES,
  onToggleFavoriteIndicator,
  indicatorLimitReached = false,
  gridMode,
  gridLineStyle,
  onGridLineStyleChange,
  gridColor,
  onGridColorChange,
  onGridModeChange,
  thinBars,
  onToggleThinBars,
  showBarOpen,
  onToggleBarOpen,
  showCandleWicks,
  showCandleBorders,
  showLineMarkers,
  onToggleLineMarkers,
  lineMarkerRadius,
  onLineMarkerRadiusChange,
  lineChartShape,
  onLineChartShapeChange,
  lineChartSource,
  onLineChartSourceChange,
  lineChartColor,
  lineChartWidth,
  onLineChartColorChange,
  onLineChartWidthChange,
  onToggleCandleWicks,
  onToggleCandleBorders,
  showPriceLine,
  onTogglePriceLine,
  showPriceLabel,
  onTogglePriceLabel,
  crosshairMode,
  onCrosshairModeChange,
  crosshairColor,
  onCrosshairColorChange,
  crosshairLineStyle,
  onCrosshairLineStyleChange,
  crosshairLineWidth,
  onCrosshairLineWidthChange,
  priceScaleMode,
  onPriceScaleModeChange,
  invertScale,
  onToggleInvertScale,
  onScreenshot,
  panelActions,
  navigationControl,
  replayControl,
  historyControls,
}: ChartToolbarProps) {
  const id = useId();
  const intervalGroups = (
    ["Ticks", "Seconds", "Minutes", "Hours", "Days", "Weeks", "Months"] as const
  ).map((group) => ({
    group,
    items: CHART_INTERVALS.filter((item) =>
      group === "Ticks"
        ? item.unit === "tick"
        : group === "Seconds"
          ? item.unit === "second" && item.value === 30
          : group === "Days"
            ? item.unit === "day"
            : group === "Weeks"
              ? item.unit === "week"
              : group === "Months"
                ? item.unit === "month"
                : item.unit === "minute" &&
                  (group === "Minutes" ? item.value < 60 : item.value >= 60),
    ).map((item) => {
      const count = group === "Hours" ? item.value / 60 : item.value;
      return {
        key: chartIntervalKey(item),
        label: `${count} ${group.toLowerCase().slice(0, -1)}${count === 1 ? "" : "s"}`,
      };
    }),
  }));
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [indicatorCategory, setIndicatorCategory] = useState<string>("All");
  const matchingIndicators = findIndicators(indicatorSearch).filter(
    (item) =>
      indicatorCategory === "All" ||
      (indicatorCategory === "Favorites"
        ? favoriteIndicators.includes(item.key)
        : item.category === indicatorCategory),
  );
  const activeCount = Object.values(indicatorCounts).reduce(
    (total, count) => total + (count ?? 0),
    0,
  );
  return (
    <div
      role="group"
      aria-label="Chart tools"
      className="@container/chart-toolbar flex min-w-0 shrink-0 items-center border-b border-white/10 bg-[#101013] [&_svg]:block [&_svg]:shrink-0"
    >
      {navigationControl ? (
        <div className="relative flex shrink-0 self-stretch items-stretch after:absolute after:right-0 after:top-1/2 after:h-4 after:w-px after:-translate-y-1/2 after:bg-white/10 [&_button]:h-full [&_button]:w-8 [&_button]:p-0 [&_button>svg]:size-[18px]">
          {navigationControl}
        </div>
      ) : null}
      <div className="flex min-h-9 min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={onSelectSymbol}
            aria-label={`Change chart symbol${symbol ? `, currently ${symbol}` : ""}`}
            className={cn(control, "max-w-32 font-semibold text-zinc-200")}
          >
            <MarketInstrumentIcon
              root={rootFromSymbol(symbol) ?? "MGC"}
              className="size-5 shrink-0"
            />
            <span className="truncate">
              {symbol.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, "") || "Symbol"}
            </span>
          </TooltipTrigger>
          <TooltipPopup>{symbol || "Select symbol"}</TooltipPopup>
        </Tooltip>
        <span className="mx-1 h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
        <Select
          value={chartIntervalKey(interval)}
          onValueChange={(value) => {
            const next = chartIntervalFromKey(value);
            if (next) onIntervalChange(next);
          }}
        >
          <SelectTrigger
            aria-label="Chart interval"
            size="sm"
            variant="ghost"
            className="h-9 w-auto min-w-0 shrink-0 rounded-none border-transparent bg-transparent px-2 shadow-none hover:bg-white/5 dark:bg-transparent"
          >
            <SelectValue>{formatChartInterval(interval)}</SelectValue>
          </SelectTrigger>
          <SelectPopup
            align="end"
            alignOffset={-8}
            alignItemWithTrigger={false}
            sideOffset={0}
            scrollArrows={false}
            popupClassName="rounded-none"
            className="max-h-[min(var(--available-height),32rem)] rounded-none overflow-x-hidden [scrollbar-width:thin] [scrollbar-color:var(--color-zinc-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-600 [&_[data-slot=select-item]]:rounded-none"
          >
            {intervalGroups
              .filter((group) => group.items.length > 0)
              .map(({ group, items }) => (
                <SelectGroup key={group}>
                  <SelectGroupLabel>{group}</SelectGroupLabel>
                  {items.map((item) => (
                    <SelectItem hideIndicator key={item.key} value={item.key}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
          </SelectPopup>
        </Select>
        <span className="mx-1 h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
        <TradingSelect
          label="Chart style"
          variant="ghost"
          value={style}
          className="h-9 w-auto shrink-0 rounded-none border-transparent bg-transparent shadow-none hover:bg-white/5 dark:bg-transparent"
          popupClassName="rounded-none [&_[data-slot=select-item]]:rounded-none"
          options={[
            ["candles", "Candles"],
            ["hollow", "Hollow candles"],
            ["heikin-ashi", "Heikin Ashi"],
            ["bars", "Bars"],
            ["line", "Line"],
            ["area", "Area"],
          ]}
          onChange={(value) => {
            if (
              value === "candles" ||
              value === "hollow" ||
              value === "heikin-ashi" ||
              value === "bars" ||
              value === "line" ||
              value === "area"
            )
              onStyleChange(value);
          }}
        />
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
              <svg viewBox="4 3 21 22" fill="none" aria-hidden="true">
                <path
                  stroke="currentColor"
                  d="M6 12l4.8-4.8a1 1 0 0 1 1.4 0l2.7 2.7a1 1 0 0 0 1.3.1L23 5"
                />
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M19 12a1 1 0 0 0-1 1v4h-3v-1a1 1 0 0 0-1-1h-3a1 1 0 0 0-1 1v2H7a1 1 0 0 0-1 1v4h17V13a1 1 0 0 0-1-1h-3zm0 10h3v-9h-3v9zm-1 0v-4h-3v4h3zm-4-4.5V22h-3v-6h3v1.5zM10 22v-3H7v3h3z"
                />
              </svg>
              <span className="hidden @min-[900px]/chart-toolbar:inline">Indicators</span>
              {activeCount > 0 && (
                <span
                  className="hidden min-w-3 text-[9px] text-blue-400 @min-[900px]/chart-toolbar:inline"
                  aria-hidden="true"
                >
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
                {["All", "Favorites", ...INDICATOR_CATEGORIES].map((category) => (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={indicatorCategory === category}
                    onClick={() => setIndicatorCategory(category)}
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-md px-3 py-2.5 text-left text-sm",
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
                        <div
                          key={indicator.key}
                          className="group/indicator-entry flex items-center rounded-md hover:bg-accent/60"
                        >
                          <Tooltip>
                            <TooltipTrigger
                              type="button"
                              aria-label={`${favoriteIndicators.includes(indicator.key) ? "Unfavorite" : "Favorite"} ${indicator.label}`}
                              aria-pressed={favoriteIndicators.includes(indicator.key)}
                              onClick={() => onToggleFavoriteIndicator(indicator.key)}
                              className={cn(
                                "ml-1 flex size-8 shrink-0 items-center justify-center rounded outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                                favoriteIndicators.includes(indicator.key)
                                  ? "text-blue-400"
                                  : "text-muted-foreground opacity-0 group-hover/indicator-entry:opacity-100 group-focus-within/indicator-entry:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
                              )}
                            >
                              <ChartIcon
                                name="star"
                                className={cn(
                                  "size-4",
                                  favoriteIndicators.includes(indicator.key) &&
                                    "[&>path]:fill-current",
                                )}
                              />
                            </TooltipTrigger>
                            <TooltipPopup>
                              {favoriteIndicators.includes(indicator.key)
                                ? "Remove from favorites"
                                : "Add to favorites"}
                            </TooltipPopup>
                          </Tooltip>
                          <button
                            type="button"
                            disabled={indicatorLimitReached}
                            onClick={() => onAddIndicator(indicator.key)}
                            aria-label={`Add ${indicator.label}`}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium leading-5 text-foreground">
                                {indicator.label}
                              </span>
                              <span className="block pt-1 text-xs text-muted-foreground">
                                {indicator.detail}
                              </span>
                            </span>
                            {(indicatorCounts[indicator.key] ?? 0) > 0 && (
                              <span className="min-w-4 text-center text-xs tabular-nums text-blue-400">
                                {indicatorCounts[indicator.key]}
                              </span>
                            )}
                            <PlusIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </section>
                  );
                })}
                {!matchingIndicators.length ? (
                  <p className="px-2 py-5 text-center text-xs text-muted-foreground">
                    {indicatorCategory === "Favorites" &&
                    !favoriteIndicators.length &&
                    !indicatorSearch
                      ? "Star indicators to find them here."
                      : "No matching indicators."}
                  </p>
                ) : null}
              </div>
            </div>
          </DialogPopup>
        </Dialog>
        <span className="mx-1 h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
        {replayControl}
        {replayControl ? (
          <span className="mx-1 h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
        ) : null}
        {historyControls}
        {historyControls ? (
          <span className="mx-1 h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
        ) : null}
        <Popover open={displaySettingsOpen} onOpenChange={onDisplaySettingsOpenChange}>
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
            {style === "bars" && (
              <>
                <label
                  htmlFor={`${id}-thin-bars`}
                  className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
                >
                  <Checkbox
                    id={`${id}-thin-bars`}
                    checked={thinBars}
                    onCheckedChange={onToggleThinBars}
                  />
                  Thin bars
                </label>
                <label
                  htmlFor={`${id}-bar-open`}
                  className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
                >
                  <Checkbox
                    id={`${id}-bar-open`}
                    checked={showBarOpen}
                    onCheckedChange={onToggleBarOpen}
                  />
                  Open marks
                </label>
              </>
            )}
            {(style === "candles" || style === "hollow" || style === "heikin-ashi") && (
              <>
                <label
                  htmlFor={`${id}-candle-borders`}
                  className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
                >
                  <Checkbox
                    id={`${id}-candle-borders`}
                    checked={showCandleBorders}
                    onCheckedChange={onToggleCandleBorders}
                  />
                  Candle borders
                </label>
                <label
                  htmlFor={`${id}-candle-wicks`}
                  className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
                >
                  <Checkbox
                    id={`${id}-candle-wicks`}
                    checked={showCandleWicks}
                    onCheckedChange={onToggleCandleWicks}
                  />
                  Candle wicks
                </label>
              </>
            )}
            {(style === "line" || style === "area") && (
              <div className="space-y-2 px-2 py-2.5">
                <label htmlFor={`${id}-line-source`} className="text-xs text-zinc-400">
                  Price source
                </label>
                <TradingSelect
                  id={`${id}-line-source`}
                  label="Price source"
                  value={lineChartSource}
                  options={PRICE_SOURCES.map((source) => [
                    source,
                    /\d/.test(source)
                      ? source.toUpperCase()
                      : source[0]!.toUpperCase() + source.slice(1),
                  ])}
                  onChange={(value) => onLineChartSourceChange(value as PriceSource)}
                  className="w-full"
                />
                <label htmlFor={`${id}-line-shape`} className="text-xs text-zinc-400">
                  Line shape
                </label>
                <TradingSelect
                  id={`${id}-line-shape`}
                  label="Line shape"
                  value={lineChartShape}
                  options={[
                    ["straight", "Straight"],
                    ["stepped", "Stepped"],
                  ]}
                  onChange={(value) => onLineChartShapeChange(value as ChartLineShape)}
                  className="w-full"
                />
                <label htmlFor={`${id}-line-width`} className="text-xs text-zinc-400">
                  Line appearance
                </label>
                <div className="flex items-center gap-2">
                  <TradingSelect
                    id={`${id}-line-width`}
                    label="Line width"
                    value={String(lineChartWidth)}
                    options={[
                      ["1", "1 px"],
                      ["2", "2 px"],
                      ["3", "3 px"],
                      ["4", "4 px"],
                    ]}
                    onChange={(value) => onLineChartWidthChange(Number(value) as ChartLineWidth)}
                    className="min-w-0 flex-1"
                  />
                  <input
                    type="color"
                    aria-label="Line color"
                    value={lineChartColor}
                    onChange={(event) => onLineChartColorChange(event.target.value)}
                    className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent"
                  />
                </div>
                <label
                  htmlFor={`${id}-line-markers`}
                  className="flex items-center gap-2 py-1 text-xs"
                >
                  <Checkbox
                    id={`${id}-line-markers`}
                    checked={showLineMarkers}
                    onCheckedChange={onToggleLineMarkers}
                  />
                  Point markers
                </label>
                {showLineMarkers && (
                  <>
                    <label htmlFor={`${id}-marker-radius`} className="text-xs text-zinc-400">
                      Marker radius
                    </label>
                    <TradingSelect
                      id={`${id}-marker-radius`}
                      label="Marker radius"
                      value={String(lineMarkerRadius)}
                      options={[2, 3, 4, 5, 6].map((radius) => [String(radius), `${radius} px`])}
                      onChange={(value) =>
                        onLineMarkerRadiusChange(Number(value) as ChartLineMarkerRadius)
                      }
                      className="w-full"
                    />
                  </>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2 px-2 pb-2">
              <label htmlFor={`${id}-crosshair`} className="text-xs">
                Crosshair
              </label>
              <TradingSelect
                id={`${id}-crosshair`}
                label="Crosshair mode"
                value={crosshairMode}
                options={[
                  ["normal", "Free"],
                  ["magnet", "Snap to close"],
                  ["ohlc", "Snap to OHLC"],
                  ["hidden", "Hidden"],
                ]}
                onChange={(value) => onCrosshairModeChange(value as ChartCrosshairMode)}
                className="w-full"
              />
            </div>
            {crosshairMode !== "hidden" && (
              <div className="space-y-2 px-2 pb-2.5">
                <label htmlFor={`${id}-crosshair-style`} className="text-xs text-zinc-400">
                  Crosshair style
                </label>
                <div className="flex items-center gap-2">
                  <TradingSelect
                    id={`${id}-crosshair-style`}
                    label="Crosshair style"
                    value={crosshairLineStyle}
                    options={[
                      ["solid", "Solid"],
                      ["dotted", "Dotted"],
                      ["dashed", "Dashed"],
                      ["largeDashed", "Large dashed"],
                    ]}
                    onChange={(value) =>
                      onCrosshairLineStyleChange(value as ChartCrosshairLineStyle)
                    }
                    className="min-w-0 flex-1"
                  />
                  <input
                    type="color"
                    aria-label="Crosshair color"
                    value={crosshairColor}
                    onChange={(event) => onCrosshairColorChange(event.target.value)}
                    className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent"
                  />
                </div>
                <label htmlFor={`${id}-crosshair-width`} className="text-xs text-zinc-400">
                  Crosshair width
                </label>
                <TradingSelect
                  id={`${id}-crosshair-width`}
                  label="Crosshair width"
                  value={String(crosshairLineWidth)}
                  options={[
                    ["1", "1 px"],
                    ["2", "2 px"],
                    ["3", "3 px"],
                  ]}
                  onChange={(value) =>
                    onCrosshairLineWidthChange(Number(value) as ChartCrosshairLineWidth)
                  }
                  className="w-full"
                />
              </div>
            )}
            <div className="space-y-2 px-2 py-2.5">
              <label htmlFor={`${id}-grid`} className="text-xs text-zinc-400">
                Grid lines
              </label>
              <TradingSelect
                id={`${id}-grid`}
                label="Grid lines"
                value={gridMode}
                options={[
                  ["both", "Horizontal and vertical"],
                  ["horizontal", "Horizontal only"],
                  ["vertical", "Vertical only"],
                  ["none", "None"],
                ]}
                onChange={(value) => onGridModeChange(value as ChartGridMode)}
                className="w-full"
              />
            </div>
            {gridMode !== "none" && (
              <div className="space-y-2 px-2 pb-2.5">
                <label htmlFor={`${id}-grid-style`} className="text-xs text-zinc-400">
                  Grid style
                </label>
                <div className="flex items-center gap-2">
                  <TradingSelect
                    id={`${id}-grid-style`}
                    label="Grid style"
                    value={gridLineStyle}
                    options={[
                      ["solid", "Solid"],
                      ["dotted", "Dotted"],
                      ["dashed", "Dashed"],
                    ]}
                    onChange={(value) => onGridLineStyleChange(value as ChartGridLineStyle)}
                    className="min-w-0 flex-1"
                  />
                  <input
                    type="color"
                    aria-label="Grid color"
                    value={gridColor}
                    onChange={(event) => onGridColorChange(event.target.value)}
                    className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent"
                  />
                </div>
              </div>
            )}
            <label
              htmlFor={`${id}-price-line`}
              className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
            >
              <Checkbox
                id={`${id}-price-line`}
                checked={showPriceLine}
                onCheckedChange={onTogglePriceLine}
              />
              Last price line
            </label>
            <label
              htmlFor={`${id}-price-label`}
              className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
            >
              <Checkbox
                id={`${id}-price-label`}
                checked={showPriceLabel}
                onCheckedChange={onTogglePriceLabel}
              />
              Last price label
            </label>
            <div className="space-y-2 px-2 py-2.5">
              <label htmlFor={`${id}-price-scale`} className="text-xs text-zinc-400">
                Price scale
              </label>
              <TradingSelect
                id={`${id}-price-scale`}
                label="Price scale mode"
                value={priceScaleMode}
                options={PRICE_SCALE_OPTIONS}
                onChange={(value) => onPriceScaleModeChange(value as ChartPriceScaleMode)}
                className="w-full"
              />
            </div>
            <label
              htmlFor={`${id}-invert`}
              className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
            >
              <Checkbox
                id={`${id}-invert`}
                checked={invertScale}
                onCheckedChange={onToggleInvertScale}
              />
              Invert price scale
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
        <div className="flex shrink-0 self-stretch items-stretch justify-center border-l border-white/10 [&>div]:gap-0 [&_button]:h-full [&_button]:min-h-9 [&_button]:w-8 [&_button]:shrink-0 [&_button]:justify-center [&_button]:p-0 [&_button>svg]:size-[18px]">
          {panelActions}
        </div>
      )}
    </div>
  );
}
