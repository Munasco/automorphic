import { openTradingStream } from "./tradingTransport";
import { ChartIcon } from "./ChartIcon";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createChart,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  ColorType,
  PriceScaleMode,
  type UTCTimestamp,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
} from "lightweight-charts";
import type { MarketQuote } from "./InstrumentHeader";
import { INSTRUMENTS } from "./InstrumentHeader";
import { ChartToolbar } from "./ChartToolbar";
import {
  useChartPreferences,
  type ChartStyle,
  type IndicatorKey,
  type ChartIndicators,
} from "./chartPreferences";
import type { Candle } from "./chartIndicators";
import { INDICATOR_CATALOG } from "./indicatorCatalog";
import { createIndicatorRenderer, oscillatorPaneCount } from "./chartIndicatorRenderer";
import { useChartDrawings } from "./useChartDrawings";
import { IndicatorLegend } from "./IndicatorLegend";
import { DrawingTools } from "./DrawingTools";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { cn } from "../../lib/utils";

type ChartEngine = {
  symbol: string;
  interval: number;
  chart: IChartApi;
  prices: Record<ChartStyle, ISeriesApi<SeriesType>>;
  volume: ISeriesApi<"Histogram">;
  indicators: ReturnType<typeof createIndicatorRenderer>;
  bars: Map<number, Candle>;
  refreshIndicators: () => void;
  disposed: boolean;
};

function ChartAction({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-white/5 hover:text-zinc-100 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400",
              active && "bg-blue-400/10 text-blue-400",
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

export function TradovateChart({
  symbol,
  interval,
  root,
  onQuote,
  onSelectSymbol,
  onIntervalChange,
  panelActions,
  settingsControl,
}: {
  symbol: string;
  interval: number;
  root: "MGC" | "NQ";
  onQuote?: ((quote: MarketQuote | null) => void) | undefined;
  onSelectSymbol: () => void;
  onIntervalChange: (interval: number) => void;
  panelActions?: ReactNode;
  settingsControl?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const settings = useChartPreferences();
  const visibleIndicators = useMemo(
    () =>
      Object.fromEntries(
        INDICATOR_CATALOG.map(({ key }) => [
          key,
          settings.indicators[key] && !settings.hiddenIndicators[key],
        ]),
      ) as ChartIndicators,
    [settings.indicators, settings.hiddenIndicators],
  );
  const indicatorSettings = useRef(visibleIndicators);
  const appearanceSettings = useRef(settings.appearance);
  const volumeColors = useRef(settings.volumeColors);
  const initialBalanceSettings = useRef(settings.initialBalance);
  const [initialBalanceStatus, setInitialBalanceStatus] = useState("");
  const paneCount = oscillatorPaneCount(visibleIndicators);
  const [engine, setEngine] = useState<ChartEngine | null>(null);
  const [status, setStatus] = useState("Connecting to Tradovate…");
  const [last, setLast] = useState<Candle | null>(null);
  const [hovered, setHovered] = useState<Candle | null>(null);
  const [notice, setNotice] = useState("");
  const [readings, setReadings] = useState<Partial<Record<IndicatorKey, number>>>({});
  const [hoverReadings, setHoverReadings] = useState<Partial<Record<IndicatorKey, number>> | null>(
    null,
  );
  const activeEngine =
    engine?.symbol === symbol && engine.interval === interval && !engine.disposed ? engine : null;
  const drawings = useChartDrawings(
    activeEngine?.chart ?? null,
    activeEngine?.prices[settings.style] ?? null,
    symbol,
  );
  const shown = hovered ?? last;

  useEffect(() => {
    indicatorSettings.current = visibleIndicators;
    appearanceSettings.current = settings.appearance;
    volumeColors.current = settings.volumeColors;
    initialBalanceSettings.current = settings.initialBalance;
    if (engine && !engine.disposed) engine.refreshIndicators();
  }, [
    engine,
    visibleIndicators,
    settings.initialBalance,
    settings.appearance,
    settings.volumeColors,
  ]);

  useEffect(() => {
    if (!host.current || !symbol) return;
    onQuote?.(null);
    let receivedQuote = false;
    const chart = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0b0d12" },
        textColor: "#9299a7",
        fontFamily: getComputedStyle(host.current).fontFamily,
        fontSize: 12,
        panes: { separatorColor: "#242730", separatorHoverColor: "#454b59", enableResize: true },
      },
      grid: { vertLines: { color: "#171a23" }, horzLines: { color: "#171a23" } },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#242730",
        rightOffset: 5,
      },
      rightPriceScale: { borderColor: "#242730", scaleMargins: { top: 0.08, bottom: 0.2 } },
      crosshair: { mode: 0 },
    });
    const priceFormat = {
      type: "price" as const,
      precision: 2,
      minMove: root === "MGC" ? 0.1 : 0.25,
    };
    const prices = {
      candles: chart.addSeries(CandlestickSeries, {
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderVisible: false,
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        priceFormat,
      }),
      bars: chart.addSeries(BarSeries, {
        upColor: "#26a69a",
        downColor: "#ef5350",
        visible: false,
        priceFormat,
      }),
      line: chart.addSeries(LineSeries, {
        color: "#6097ee",
        lineWidth: 2,
        visible: false,
        priceFormat,
      }),
      area: chart.addSeries(AreaSeries, {
        lineColor: "#6097ee",
        topColor: "#6097ee55",
        bottomColor: "#6097ee00",
        lineWidth: 2,
        visible: false,
        priceFormat,
      }),
    };
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
    const bars = new Map<number, Candle>();
    const indicators = createIndicatorRenderer(chart, priceFormat.minMove);
    let appliedVolumeColors = "";
    const state: ChartEngine = {
      symbol,
      interval,
      chart,
      prices,
      volume,
      indicators,
      bars,
      disposed: false,
      refreshIndicators: () => {
        if (state.disposed) return;
        const sorted = [...bars.values()].sort((a, b) => a.time - b.time);
        const enabled = indicatorSettings.current;
        const result = indicators.update(
          sorted,
          enabled,
          initialBalanceSettings.current,
          interval,
          appearanceSettings.current,
        );
        const latestVolume = sorted.at(-1)?.volume;
        if (latestVolume !== undefined) result.readings.volume = latestVolume;
        volume.applyOptions({ visible: enabled.volume });
        const colorSignature = `${volumeColors.current.up}:${volumeColors.current.down}`;
        if (colorSignature !== appliedVolumeColors) {
          volume.setData(sorted.map(volumePoint));
          appliedVolumeColors = colorSignature;
        }
        chart
          .priceScale("right", 0)
          .applyOptions({ scaleMargins: { top: 0.08, bottom: enabled.volume ? 0.2 : 0.06 } });
        setReadings(result.readings);
        setInitialBalanceStatus(result.initialBalanceStatus);
      },
    };
    // The imperative chart lifetime is scoped to this mounted contract/interval.
    setEngine(state);
    const syncFont = () => {
      if (!state.disposed && host.current)
        chart.applyOptions({ layout: { fontFamily: getComputedStyle(host.current).fontFamily } });
    };
    document.fonts.addEventListener("loadingdone", syncFont);
    const fontObserver = new MutationObserver(syncFont);
    fontObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    chart.subscribeCrosshairMove((event) => {
      setHovered(typeof event.time === "number" ? (bars.get(event.time) ?? null) : null);
      if (event.time === undefined) {
        setHoverReadings(null);
        return;
      }
      const values = indicators.readCrosshair(event);
      const volumeData = event.seriesData.get(volume);
      if (volumeData && "value" in volumeData) values.volume = volumeData.value;
      setHoverReadings(values);
    });
    let source: ReturnType<typeof openTradingStream> | undefined;
    let retry: ReturnType<typeof setTimeout>;
    let render: number | undefined;
    let fitted = false;
    let renderedTime = -Infinity;
    let replaceHistory = true;
    const pending = new Map<number, Candle>();
    const volumePoint = (b: Candle) => ({
      time: b.time as UTCTimestamp,
      value: b.volume,
      color: `${b.close >= b.open ? volumeColors.current.up : volumeColors.current.down}45`,
    });
    const renderBars = () => {
      render = undefined;
      if (state.disposed) return;
      const changes = [...pending.values()].sort((a, b) => a.time - b.time);
      pending.clear();
      if (replaceHistory || changes.some((b) => b.time < renderedTime) || bars.size > 1300) {
        const sorted = [...bars.values()].sort((a, b) => a.time - b.time).slice(-1200);
        bars.clear();
        for (const bar of sorted) bars.set(bar.time, bar);
        const ohlc = sorted.map((b) => ({ ...b, time: b.time as UTCTimestamp }));
        const closes = sorted.map((b) => ({ time: b.time as UTCTimestamp, value: b.close }));
        prices.candles.setData(ohlc);
        prices.bars.setData(ohlc);
        prices.line.setData(closes);
        prices.area.setData(closes);
        volume.setData(sorted.map(volumePoint));
        renderedTime = sorted.at(-1)?.time ?? -Infinity;
        replaceHistory = false;
      } else {
        for (const bar of changes) {
          const ohlc = { ...bar, time: bar.time as UTCTimestamp };
          const close = { time: bar.time as UTCTimestamp, value: bar.close };
          prices.candles.update(ohlc);
          prices.bars.update(ohlc);
          prices.line.update(close);
          prices.area.update(close);
          volume.update(volumePoint(bar));
          renderedTime = bar.time;
        }
      }
      state.refreshIndicators();
      if (!fitted && bars.size) {
        chart
          .timeScale()
          .setVisibleLogicalRange({ from: Math.max(0, bars.size - 100), to: bars.size + 5 });
        fitted = true;
      }
      const latest = bars.get(renderedTime) ?? null;
      setLast(latest);
      if (latest && !receivedQuote)
        onQuote?.({
          symbol,
          last: latest.close,
          open: latest.open,
          high: latest.high,
          low: latest.low,
          volume: latest.volume,
          timestamp: new Date(latest.time * 1000).toISOString(),
          source: "bar",
        });
    };
    const connect = () => {
      if (state.disposed) return;
      source = openTradingStream(
        `/api/trading/stream?${new URLSearchParams({ symbol, interval: String(interval) })}`,
        {
          onMessage: (data) => {
            let message;
            try {
              message = JSON.parse(data);
            } catch {
              return;
            }
            if (message.type === "status") {
              setStatus(message.message);
              return;
            }
            if (
              message.type === "quote" &&
              message.quote?.symbol === symbol &&
              Number.isFinite(message.quote.last)
            ) {
              receivedQuote = true;
              onQuote?.(message.quote);
              return;
            }
            if (message.type === "bars" && Array.isArray(message.bars)) {
              for (const bar of message.bars)
                if (
                  [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume].every(
                    Number.isFinite,
                  )
                ) {
                  bars.set(bar.time, bar);
                  pending.set(bar.time, bar);
                }
              setStatus("Tradovate connected");
              if (render === undefined) render = requestAnimationFrame(renderBars);
            }
          },
          onError: () => {
            source?.close();
            if (!state.disposed) {
              setStatus("Reconnecting to Tradovate…");
              retry = setTimeout(connect, 5000);
            }
          },
        },
      );
    };
    connect();
    return () => {
      document.fonts.removeEventListener("loadingdone", syncFont);
      fontObserver.disconnect();
      state.disposed = true;
      source?.close();
      clearTimeout(retry);
      if (render !== undefined) cancelAnimationFrame(render);
      chart.remove();
    };
  }, [symbol, interval, onQuote, root]);

  useEffect(() => {
    if (!engine || engine.disposed) return;
    for (const style of ["candles", "bars", "line", "area"] as const)
      engine.prices[style].applyOptions({ visible: style === settings.style });
    engine.chart.applyOptions({
      grid: {
        vertLines: { visible: settings.showGrid },
        horzLines: { visible: settings.showGrid },
      },
    });
    engine.chart.priceScale("right", 0).applyOptions({
      mode: settings.logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
  }, [engine, settings.style, settings.showGrid, settings.logScale]);

  const zoom = (factor: number) => {
    const scale = engine?.chart.timeScale();
    const range = scale?.getVisibleLogicalRange();
    if (scale && range) {
      const middle = (range.from + range.to) / 2;
      const half = Math.max(5, ((range.to - range.from) * factor) / 2);
      scale.setVisibleLogicalRange({ from: middle - half, to: middle + half });
    }
  };
  const range = (days: number | null) => {
    if (!engine || !last) return;
    const times = [...engine.bars.keys()].sort((a, b) => a - b);
    if (days === null) engine.chart.timeScale().fitContent();
    else
      engine.chart.timeScale().setVisibleRange({
        from: Math.max(times[0] ?? last.time, last.time - days * 86400) as UTCTimestamp,
        to: last.time as UTCTimestamp,
      });
  };
  const screenshot = () => {
    if (!engine) return;
    engine.chart.takeScreenshot().toBlob((blob) => {
      if (!blob) {
        setNotice("Could not export the chart.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${symbol}-${interval}m-chart.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Chart image downloaded.");
    });
  };
  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#0b0d12]"
      aria-label={`${symbol} Tradovate chart`}
    >
      <ChartToolbar
        symbol={symbol}
        onSelectSymbol={onSelectSymbol}
        interval={interval}
        onIntervalChange={onIntervalChange}
        style={settings.style}
        onStyleChange={settings.setStyle}
        indicators={settings.indicators}
        onToggleIndicator={settings.toggleIndicator}
        initialBalance={settings.initialBalance}
        onInitialBalanceChange={settings.setInitialBalance}
        showGrid={settings.showGrid}
        onToggleGrid={settings.toggleGrid}
        logScale={settings.logScale}
        onToggleLogScale={settings.toggleLogScale}
        onScreenshot={screenshot}
        panelActions={panelActions}
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        <div
          role="toolbar"
          aria-label="Drawing tools"
          className="flex w-10 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-white/10 py-1"
        >
          <DrawingTools drawings={drawings} />
          <div className="my-1 w-5 border-t border-white/10" />
          <ChartAction label="Zoom in" onClick={() => zoom(0.7)}>
            <ChartIcon name="zoom-in" className="size-[18px]" />
          </ChartAction>
          <ChartAction label="Zoom out" onClick={() => zoom(1.4)}>
            <ChartIcon name="zoom-out" className="size-[18px]" />
          </ChartAction>
          <ChartAction
            label="Fit chart"
            onClick={() => {
              engine?.chart.timeScale().fitContent();
              engine?.chart.priceScale("right", 0).applyOptions({ autoScale: true });
            }}
          >
            <ChartIcon name="maximize" className="size-[18px]" />
          </ChartAction>
          <ChartAction
            label="Go to latest bar"
            onClick={() => engine?.chart.timeScale().scrollToRealTime()}
          >
            <ChartIcon name="arrow-bar-to-right" className="size-[18px]" />
          </ChartAction>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 px-2.5 pt-2 pb-1 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                onClick={onSelectSymbol}
                className="trading-heading truncate font-medium text-zinc-200 hover:text-white"
              >
                {INSTRUMENTS[root].name} · {interval === 60 ? "1h" : `${interval}m`} ·{" "}
                {INSTRUMENTS[root].exchange}
              </button>
            </div>
            {shown ? (
              <div
                className={cn(
                  "mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums",
                  shown.close >= shown.open ? "text-emerald-400" : "text-red-400",
                )}
                aria-label="Candle values"
              >
                <span>O {shown.open.toFixed(2)}</span>
                <span>H {shown.high.toFixed(2)}</span>
                <span>L {shown.low.toFixed(2)}</span>
                <span>C {shown.close.toFixed(2)}</span>
                <span className="text-zinc-500">
                  {hovered ? new Date(shown.time * 1000).toLocaleString() : ""}
                </span>
              </div>
            ) : null}
            <IndicatorLegend
              settings={settings}
              readings={hoverReadings ?? readings}
              initialBalanceStatus={initialBalanceStatus}
            />
          </div>
          <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="relative h-full" style={{ minHeight: 240 + paneCount * 110 }}>
              <div ref={host} className="absolute inset-0" />
              {!last ? (
                <div className="pointer-events-none absolute inset-x-0 top-12 flex items-center justify-center p-6 text-center text-xs text-zinc-400">
                  {symbol ? status : "Select a contract to load its chart."}
                </div>
              ) : null}
              {drawings.instruction ? (
                <div className="pointer-events-none absolute bottom-9 left-2 rounded bg-zinc-900/95 px-2 py-1 text-xs text-zinc-200">
                  {drawings.instruction}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-white/10 px-2 py-1 text-[11px] text-zinc-400">
        {([1, 5, null] as const).map((days) => (
          <Tooltip key={days ?? "all"}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => range(days)}
                  className="rounded px-2 py-1 hover:bg-white/5 hover:text-white"
                />
              }
            >
              {days ? `${days}D` : "All"}
            </TooltipTrigger>
            <TooltipPopup>Range within loaded history</TooltipPopup>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger
            aria-label={status}
            className="ml-auto inline-flex size-6 items-center justify-center rounded hover:bg-white/5"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                status === "Tradovate connected" ? "bg-emerald-400" : "bg-amber-400",
              )}
            />
          </TooltipTrigger>
          <TooltipPopup>
            {last ? `${status} · Last bar ${new Date(last.time * 1000).toLocaleString()}` : status}
          </TooltipPopup>
        </Tooltip>
        <button
          type="button"
          aria-label="Toggle logarithmic scale"
          aria-pressed={settings.logScale}
          onClick={settings.toggleLogScale}
          className={cn(
            "rounded px-1.5 py-1 hover:bg-white/5",
            settings.logScale && "text-blue-400",
          )}
        >
          log
        </button>
        <button
          type="button"
          aria-label="Auto fit price scale"
          onClick={() => engine?.chart.priceScale("right", 0).applyOptions({ autoScale: true })}
          className="rounded px-1.5 py-1 hover:bg-white/5"
        >
          auto
        </button>
        <span className="px-1 text-zinc-500">UTC</span>
        {settingsControl}
      </div>
      {notice ? (
        <button
          type="button"
          onClick={() => setNotice("")}
          className="absolute bottom-10 right-3 rounded border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-200"
          role="status"
        >
          {notice}
        </button>
      ) : null}
    </div>
  );
}
