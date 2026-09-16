import { ChartAreaFillControls } from "./ChartAreaFillControls";
import { ResetChartPaneSizes } from "./ResetChartPaneSizes";
import { ChartRightMarginControl } from "./ChartRightMarginControl";
import { ChartWatermarkAppearance } from "./ChartWatermarkAppearance";
import { ChartFontSizeControl } from "./ChartFontSizeControl";
import { PRICE_SOURCES, type PriceSource } from "./chartIndicators";
import { TradingSelect } from "./TradingSelect";
import type {
  CandleDetailColorKey,
  ChartCrosshairMode,
  ChartCrosshairLineStyle,
  ChartCrosshairLineWidth,
  ChartGridMode,
  ChartGridLineStyle,
  ChartPriceScaleMode,
  ChartPriceScaleMargins,
  ChartLineWidth,
  ChartLineShape,
  ChartLineMarkerRadius,
} from "./chartPreferences";

import type { ChartInterval } from "./tradingIntervals";
import { ChartIntervalMenu } from "./ChartIntervalMenu";
import { rootFromSymbol } from "./tradingInstruments";
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
  candleDetailColors: Record<CandleDetailColorKey, string | null>;
  onCandleDetailColorChange: (key: CandleDetailColorKey, color: string | null) => void;
  candleUpColor: string;
  candleDownColor: string;
  onCandleUpColorChange: (color: string) => void;
  onCandleDownColorChange: (color: string) => void;
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
  showBarCountdown: boolean;
  onToggleBarCountdown: () => void;
  showPriceLabel: boolean;
  onTogglePriceLabel: () => void;
  chartBackgroundColor: string;
  chartTextColor: string;
  onChartBackgroundColorChange: (color: string) => void;
  onChartTextColorChange: (color: string) => void;
  lockVisibleTimeRangeOnResize: boolean;
  onLockVisibleTimeRangeOnResizeChange: (lock: boolean) => void;
  showSymbolWatermark: boolean;
  onShowSymbolWatermarkChange: (show: boolean) => void;
  showChartTitle: boolean;
  showCandleValues: boolean;
  indicatorLegendCollapsed: boolean;
  onShowChartTitleChange: (show: boolean) => void;
  onShowCandleValuesChange: (show: boolean) => void;
  onIndicatorLegendCollapsedChange: (collapsed: boolean) => void;
  crosshairMode: ChartCrosshairMode;
  showCrosshairHorizontalLine: boolean;
  showCrosshairVerticalLine: boolean;
  onShowCrosshairHorizontalLineChange: (show: boolean) => void;
  onShowCrosshairVerticalLineChange: (show: boolean) => void;
  showCrosshairPriceLabel: boolean;
  showCrosshairTimeLabel: boolean;
  onShowCrosshairPriceLabelChange: (show: boolean) => void;
  onShowCrosshairTimeLabelChange: (show: boolean) => void;
  onCrosshairModeChange: (value: ChartCrosshairMode) => void;
  crosshairColor: string;
  onCrosshairColorChange: (value: string) => void;
  crosshairLineStyle: ChartCrosshairLineStyle;
  onCrosshairLineStyleChange: (value: ChartCrosshairLineStyle) => void;
  crosshairLineWidth: ChartCrosshairLineWidth;
  onCrosshairLineWidthChange: (value: ChartCrosshairLineWidth) => void;
  priceScaleMargins: ChartPriceScaleMargins;
  customPriceScaleMargins: boolean;
  onPriceScaleMarginsChange: (value: ChartPriceScaleMargins | null) => void;
  priceScaleMode: ChartPriceScaleMode;
  onPriceScaleModeChange: (value: ChartPriceScaleMode) => void;
  invertScale: boolean;
  showTimeScale: boolean;
  onShowTimeScaleChange: (show: boolean) => void;
  showPriceScale: boolean;
  onShowPriceScaleChange: (show: boolean) => void;
  showPriceScaleTicks: boolean;
  onShowPriceScaleTicksChange: (show: boolean) => void;
  onToggleInvertScale: () => void;
  onScreenshot: () => void;
  panelActions?: ReactNode;
  navigationControl?: ReactNode;
  replayControl?: ReactNode;
  alertControl?: ReactNode;
  templateControl?: ReactNode;
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
  candleDetailColors,
  onCandleDetailColorChange,
  candleUpColor,
  candleDownColor,
  onCandleUpColorChange,
  onCandleDownColorChange,
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
  showBarCountdown,
  onToggleBarCountdown,
  showPriceLabel,
  onTogglePriceLabel,
  chartBackgroundColor,
  chartTextColor,
  onChartBackgroundColorChange,
  onChartTextColorChange,
  lockVisibleTimeRangeOnResize,
  onLockVisibleTimeRangeOnResizeChange,
  showSymbolWatermark,
  onShowSymbolWatermarkChange,
  showChartTitle,
  showCandleValues,
  indicatorLegendCollapsed,
  onShowChartTitleChange,
  onShowCandleValuesChange,
  onIndicatorLegendCollapsedChange,
  crosshairMode,
  onCrosshairModeChange,
  showCrosshairHorizontalLine,
  showCrosshairVerticalLine,
  onShowCrosshairHorizontalLineChange,
  onShowCrosshairVerticalLineChange,
  showCrosshairPriceLabel,
  showCrosshairTimeLabel,
  onShowCrosshairPriceLabelChange,
  onShowCrosshairTimeLabelChange,
  crosshairColor,
  onCrosshairColorChange,
  crosshairLineStyle,
  onCrosshairLineStyleChange,
  crosshairLineWidth,
  onCrosshairLineWidthChange,
  priceScaleMargins,
  customPriceScaleMargins,
  onPriceScaleMarginsChange,
  priceScaleMode,
  onPriceScaleModeChange,
  invertScale,
  showTimeScale,
  onShowTimeScaleChange,
  showPriceScale,
  onShowPriceScaleChange,
  showPriceScaleTicks,
  onShowPriceScaleTicksChange,
  onToggleInvertScale,
  onScreenshot,
  panelActions,
  navigationControl,
  replayControl,
  alertControl,
  templateControl,
  historyControls,
}: ChartToolbarProps) {
  const id = useId();
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
        <ChartIntervalMenu interval={interval} onChange={onIntervalChange} />
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
        {templateControl}
        {alertControl}
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
          <PopoverPopup
            align="end"
            className="w-56"
            viewportClassName="px-3 py-3"
            positionerClassName="h-auto"
          >
            <PopoverTitle className="px-1 pb-2 text-xs">Chart display</PopoverTitle>
            <div className="px-2 pb-2">
              <ResetChartPaneSizes />
            </div>
            {style !== "line" && style !== "area" && (
              <fieldset className="space-y-2 px-2 py-2.5">
                <legend className="text-xs text-zinc-400">
                  {style === "bars" ? "Bar colors" : "Candle colors"}
                </legend>
                <div className="flex items-center gap-4">
                  {[
                    { label: "Up", value: candleUpColor, onChange: onCandleUpColorChange },
                    { label: "Down", value: candleDownColor, onChange: onCandleDownColorChange },
                  ].map(({ label, value, onChange }) => (
                    <label key={label} className="flex items-center gap-2 text-xs">
                      <input
                        type="color"
                        aria-label={`${label} candle and bar color`}
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
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
              <div className="space-y-2 px-2 py-2">
                {(
                  [
                    {
                      part: "border",
                      label: "Borders",
                      checked: showCandleBorders,
                      toggle: onToggleCandleBorders,
                      up: "candleBorderUpColor",
                      down: "candleBorderDownColor",
                    },
                    {
                      part: "wick",
                      label: "Wicks",
                      checked: showCandleWicks,
                      toggle: onToggleCandleWicks,
                      up: "candleWickUpColor",
                      down: "candleWickDownColor",
                    },
                  ] as const
                ).map(({ part, label, checked, toggle, up, down }) => (
                  <div key={part}>
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor={`${id}-candle-${part}s`}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs"
                      >
                        <Checkbox
                          id={`${id}-candle-${part}s`}
                          checked={checked}
                          onCheckedChange={toggle}
                        />
                        {label}
                      </label>
                      {(
                        [
                          { direction: "Up", key: up, fallback: candleUpColor },
                          { direction: "Down", key: down, fallback: candleDownColor },
                        ] as const
                      ).map(({ direction, key, fallback }) => (
                        <input
                          key={key}
                          type="color"
                          aria-label={`${direction} candle ${part} color`}
                          disabled={!checked}
                          value={candleDetailColors[key] ?? fallback}
                          onChange={(event) => onCandleDetailColorChange(key, event.target.value)}
                          className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent disabled:cursor-default disabled:opacity-40"
                        />
                      ))}
                    </div>
                    {(candleDetailColors[up] !== null || candleDetailColors[down] !== null) && (
                      <button
                        type="button"
                        aria-label={`Use body colors for ${part}s`}
                        onClick={() => {
                          onCandleDetailColorChange(up, null);
                          onCandleDetailColorChange(down, null);
                        }}
                        className="mt-1 rounded text-[11px] text-zinc-400 underline-offset-2 hover:text-zinc-100 hover:underline focus-visible:outline focus-visible:outline-blue-400"
                      >
                        Use body colors
                      </button>
                    )}
                  </div>
                ))}
              </div>
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
                {style === "area" && <ChartAreaFillControls />}
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
            <fieldset className="space-y-2 border-t border-white/10 px-2 py-2.5">
              <legend className="text-xs text-zinc-400">Chart canvas</legend>
              {[
                {
                  label: "Background",
                  value: chartBackgroundColor,
                  onChange: onChartBackgroundColorChange,
                },
                { label: "Text", value: chartTextColor, onChange: onChartTextColorChange },
              ].map(({ label, value, onChange }) => (
                <label key={label} className="flex items-center justify-between text-xs">
                  {label}
                  <input
                    type="color"
                    aria-label={`Chart ${label.toLowerCase()} color`}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent"
                  />
                </label>
              ))}
              <button
                type="button"
                className="text-xs text-zinc-400 hover:text-white"
                onClick={() => {
                  onChartBackgroundColorChange("#0b0d12");
                  onChartTextColorChange("#9299a7");
                }}
              >
                Reset canvas colors
              </button>
              <ChartFontSizeControl />
            </fieldset>
            <fieldset className="space-y-2 border-t border-white/10 px-2 py-2.5">
              <legend className="text-xs text-zinc-400">Time scale</legend>
              <label htmlFor={`${id}-resize-range`} className="flex items-center gap-2 text-xs">
                <Checkbox
                  id={`${id}-resize-range`}
                  checked={lockVisibleTimeRangeOnResize}
                  onCheckedChange={onLockVisibleTimeRangeOnResizeChange}
                />
                Keep visible range on resize
              </label>
            </fieldset>
            <fieldset className="space-y-1 border-t border-white/10 px-2 py-2.5">
              <legend className="text-xs text-zinc-400">Watermark</legend>
              <label htmlFor={`${id}-watermark`} className="flex items-center gap-3 py-2 text-xs">
                <Checkbox
                  id={`${id}-watermark`}
                  checked={showSymbolWatermark}
                  onCheckedChange={onShowSymbolWatermarkChange}
                />
                Symbol watermark
              </label>
              {showSymbolWatermark && <ChartWatermarkAppearance />}
            </fieldset>
            <fieldset className="space-y-1 border-y border-white/10 px-2 py-2.5">
              <legend className="text-xs text-zinc-400">Legend</legend>
              {[
                {
                  key: "title",
                  label: "Chart title",
                  checked: showChartTitle,
                  onChange: onShowChartTitleChange,
                },
                {
                  key: "ohlc",
                  label: "OHLC values",
                  checked: showCandleValues,
                  onChange: onShowCandleValuesChange,
                },
                {
                  key: "indicators",
                  label: "Indicator titles and values",
                  checked: !indicatorLegendCollapsed,
                  onChange: (show: boolean) => onIndicatorLegendCollapsedChange(!show),
                },
              ].map(({ key, label, checked, onChange }) => (
                <label
                  key={key}
                  htmlFor={`${id}-legend-${key}`}
                  className="flex cursor-pointer items-center gap-3 rounded py-2 text-xs hover:bg-white/5"
                >
                  <Checkbox
                    id={`${id}-legend-${key}`}
                    checked={checked}
                    onCheckedChange={onChange}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
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
                {(
                  [
                    [
                      "horizontal",
                      "Horizontal crosshair line",
                      showCrosshairHorizontalLine,
                      onShowCrosshairHorizontalLineChange,
                    ],
                    [
                      "vertical",
                      "Vertical crosshair line",
                      showCrosshairVerticalLine,
                      onShowCrosshairVerticalLineChange,
                    ],
                    [
                      "price",
                      "Crosshair price label",
                      showCrosshairPriceLabel,
                      onShowCrosshairPriceLabelChange,
                    ],
                    [
                      "time",
                      "Crosshair time label",
                      showCrosshairTimeLabel,
                      onShowCrosshairTimeLabelChange,
                    ],
                  ] as const
                ).map(([key, label, checked, onChange]) => (
                  <label
                    key={key}
                    htmlFor={`${id}-crosshair-${key}-label`}
                    className="flex cursor-pointer items-center gap-2 py-1 text-xs"
                  >
                    <Checkbox
                      id={`${id}-crosshair-${key}-label`}
                      checked={checked}
                      onCheckedChange={onChange}
                    />
                    {label}
                  </label>
                ))}
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
            <label
              htmlFor={`${id}-bar-countdown`}
              className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
            >
              <Checkbox
                id={`${id}-bar-countdown`}
                checked={showBarCountdown}
                onCheckedChange={onToggleBarCountdown}
              />
              Countdown to bar close
            </label>
            <fieldset className="space-y-2 border-t border-white/10 px-2 py-2.5">
              <legend className="text-xs text-zinc-400">Chart margins</legend>
              <label
                htmlFor={`${id}-custom-margins`}
                className="flex cursor-pointer items-center gap-2 text-xs"
              >
                <Checkbox
                  id={`${id}-custom-margins`}
                  checked={customPriceScaleMargins}
                  onCheckedChange={(checked) =>
                    onPriceScaleMarginsChange(checked ? priceScaleMargins : null)
                  }
                />
                Custom margins
              </label>
              {customPriceScaleMargins &&
                (["top", "bottom"] as const).map((side) => (
                  <div key={side} className="space-y-1">
                    <label
                      htmlFor={`${id}-${side}-margin`}
                      className="flex justify-between text-xs"
                    >
                      <span>{side === "top" ? "Top" : "Bottom"}</span>
                      <span className="tabular-nums text-zinc-400">
                        {Math.round(priceScaleMargins[side] * 100)}%
                      </span>
                    </label>
                    <input
                      id={`${id}-${side}-margin`}
                      type="range"
                      aria-label={`${side === "top" ? "Top" : "Bottom"} chart margin`}
                      min={0}
                      max={45}
                      step={1}
                      value={Math.round(priceScaleMargins[side] * 100)}
                      onChange={(event) =>
                        onPriceScaleMarginsChange({
                          ...priceScaleMargins,
                          [side]: Number(event.target.value) / 100,
                        })
                      }
                      className="h-5 w-full cursor-pointer accent-blue-500"
                    />
                  </div>
                ))}
            </fieldset>
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
              htmlFor={`${id}-time-scale-visible`}
              className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
            >
              <Checkbox
                id={`${id}-time-scale-visible`}
                checked={showTimeScale}
                onCheckedChange={onShowTimeScaleChange}
              />
              Show time scale
            </label>
            <ChartRightMarginControl />
            <label
              htmlFor={`${id}-scale-visible`}
              className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
            >
              <Checkbox
                id={`${id}-scale-visible`}
                checked={showPriceScale}
                onCheckedChange={onShowPriceScaleChange}
              />
              Show price scale
            </label>
            <label
              htmlFor={`${id}-scale-ticks`}
              className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
            >
              <Checkbox
                id={`${id}-scale-ticks`}
                checked={showPriceScaleTicks}
                onCheckedChange={onShowPriceScaleTicksChange}
              />
              Price scale ticks
            </label>
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
