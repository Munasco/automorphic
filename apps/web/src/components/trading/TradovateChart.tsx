import {
  applyChartBarBatch,
  createChartTimeFormatters,
  tickHistoryNotice,
  type TickHistoryQuality,
} from "./tickChartData";
import { useInitialBalanceHistory } from "./useInitialBalanceHistory";
import {
  chartIntervalKey,
  chartIntervalMinutes,
  formatChartInterval,
  type ChartInterval,
} from "./tradingIntervals";
import { ChartTechnicals } from "./ChartTechnicals";
import { chartTechnicalsMarketState } from "./chartTechnicalsMarket";
import type { InstrumentRoot } from "./tradingInstruments";
import { hashKey, useQuery, useQueryClient } from "@tanstack/react-query";
import { chartMarketQueryOptions, type ChartMarketSnapshot } from "./chartMarketQuery";
import { tradingQueryScope } from "./tradingQueries";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import { cancelInactiveTradingStream } from "./tradingStreamIterable";
import { ChartIcon } from "./ChartIcon";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  createChart,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  PriceScaleMode,
  LineStyle,
  type UTCTimestamp,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type SeriesType,
} from "lightweight-charts";
import type { MarketQuote } from "./InstrumentHeader";
import { INSTRUMENTS } from "./InstrumentHeader";
import { TradingSelect } from "./TradingSelect";
import { ChartToolbar, PRICE_SCALE_OPTIONS } from "./ChartToolbar";
import {
  useChartPreferences,
  type ChartStyle,
  type ChartPriceScaleMode,
  type IndicatorKey,
  type ChartIndicators,
} from "./chartPreferences";
import type { Candle } from "./chartIndicators";
import { hollowCandleColors } from "./hollowCandles";
import { calculateHeikinAshi, heikinAshiBar } from "./heikinAshi";
import { INDICATOR_CATALOG, getIndicatorDefinition, getIndicatorLabel } from "./indicatorCatalog";
import { getChartIndicatorInstances, MAX_CHART_INDICATORS } from "./chartIndicatorInstances";
import {
  createIndicatorRenderer,
  oscillatorInstancePaneCount,
  type IndicatorReadings,
} from "./chartIndicatorRenderer";
import { useChartDrawings } from "./useChartDrawings";
import { IndicatorLegend } from "./IndicatorLegend";
import { IndicatorSettingsContent } from "./IndicatorSettingsContent";
import { InitialBalanceDashboard } from "./InitialBalanceDashboard";
import type { InitialBalanceStats } from "./initialBalance";
import { DrawingTools, FavoriteDrawingToolbar } from "./DrawingTools";
import { DrawingSelectionOverlay } from "./DrawingSelectionOverlay";
import { DrawingAlertDialog } from "./DrawingAlertDialog";
import { useDrawingAlerts, type DrawingAlertsController } from "./useDrawingAlerts";
import type { ChartDrawing } from "./drawingGeometry";
import { DrawingInlineTextEditor } from "./DrawingInlineTextEditor";
import { ChartContextMenu } from "./ChartContextMenu";
import { DrawingObjectTree } from "./DrawingObjectTree";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { ObjectTreeIcon } from "./ObjectTreeIcon";
import { ChartReplayControls, useChartReplay } from "./ChartReplay";
import { replayMinuteHistory } from "./replayHistory";

type ChartEngine = {
  symbol: string;
  interval: ChartInterval;
  chart: IChartApi;
  prices: Record<ChartStyle, ISeriesApi<SeriesType>>;
  marketPriceLine: IPriceLine;
  volume: ISeriesApi<"Histogram">;
  indicators: ReturnType<typeof createIndicatorRenderer>;
  bars: Map<number, Candle>;
  heikinAshiBars: Map<number, Candle>;
  refreshIndicators: () => void;
  showReplay: (bars: readonly Candle[] | null) => void;
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

/** A separate observer shares matching chart queries without rerendering the canvas per quote. */
function TechnicalsMarket({
  symbol,
  name,
  interval,
  onIntervalChange,
  onBack,
  environmentBase,
  projectId,
  ready,
}: {
  symbol: string;
  name: string;
  interval: ChartInterval;
  onIntervalChange: (interval: ChartInterval) => void;
  onBack: () => void;
  environmentBase: string;
  projectId: string | null;
  ready: boolean;
}) {
  const client = useQueryClient();
  const options = useMemo(
    () => chartMarketQueryOptions(["trading", environmentBase], projectId ?? "", symbol, interval),
    [environmentBase, projectId, symbol, interval],
  );
  const active = ready && !!projectId && !!symbol;
  const query = useQuery({ ...options, enabled: active });
  useEffect(() => {
    if (!active) void cancelInactiveTradingStream(client, options.queryKey);
  }, [active, client, options]);
  const market = chartTechnicalsMarketState(
    active ? query.data : undefined,
    active ? query.error : null,
  );
  const unavailable = !symbol
    ? "Select a contract to load its technicals."
    : ready && !projectId
      ? "Select a workspace to load technicals."
      : null;
  return (
    <ChartTechnicals
      symbol={symbol}
      name={name}
      interval={interval}
      onIntervalChange={onIntervalChange}
      onBack={onBack}
      candles={market.candles}
      loading={!unavailable && market.loading}
      error={unavailable ?? market.error}
      {...(active
        ? {
            onRetry: () => {
              void query.refetch();
            },
          }
        : {})}
    />
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
  navigationControl,
  technicals = false,
  technicalInterval,
  onTechnicalIntervalChange,
  onBackFromTechnicals,
  onDrawingAlertsChange,
}: {
  symbol: string;
  interval: ChartInterval;
  root: InstrumentRoot;
  onQuote?: ((quote: MarketQuote | null) => void) | undefined;
  onSelectSymbol: () => void;
  onIntervalChange: (interval: ChartInterval) => void;
  panelActions?: ReactNode;
  settingsControl?: ReactNode;
  navigationControl?: ReactNode;
  technicals?: boolean;
  technicalInterval: ChartInterval;
  onTechnicalIntervalChange: (interval: ChartInterval) => void;
  onBackFromTechnicals: () => void;
  onDrawingAlertsChange?: ((controller: DrawingAlertsController | null) => void) | undefined;
}) {
  const host = useRef<HTMLDivElement>(null);
  const settings = useChartPreferences();
  const queryClient = useQueryClient();
  const workspace = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    tradingWorkspaceStorage.getSnapshot,
  );
  const environmentBase = tradingQueryScope()[1];
  const replay = useChartReplay(
    `${environmentBase}:${workspace.projectId}:${symbol}:${chartIntervalKey(interval)}:${technicals}`,
  );
  const marketOptions = useMemo(
    () =>
      chartMarketQueryOptions(
        ["trading", environmentBase],
        workspace.projectId ?? "",
        symbol,
        interval,
      ),
    [environmentBase, workspace.projectId, symbol, interval],
  );
  // Query owns the shared stream. Canvas updates subscribe imperatively below, without a React render per packet.
  const marketActive = workspace.ready && !!workspace.projectId && !!symbol;
  useQuery({ ...marketOptions, enabled: marketActive, notifyOnChangeProps: [] });
  useEffect(() => {
    if (!marketActive) void cancelInactiveTradingStream(queryClient, marketOptions.queryKey);
  }, [marketActive, queryClient, marketOptions]);
  const intraday =
    interval.unit === "minute" || interval.unit === "second" || interval.unit === "tick";
  const indicatorInstances = useMemo(
    () =>
      getChartIndicatorInstances({
        indicators: settings.indicators,
        hiddenIndicators: settings.hiddenIndicators,
        appearance: settings.appearance,
        indicatorInputs: settings.indicatorInputs,
        initialBalance: settings.initialBalance,
        volumeColors: settings.volumeColors,
        extraIndicators: settings.extraIndicators,
      }),
    [
      settings.indicators,
      settings.hiddenIndicators,
      settings.appearance,
      settings.indicatorInputs,
      settings.initialBalance,
      settings.volumeColors,
      settings.extraIndicators,
    ],
  );
  const visibleInstances = useMemo(
    () =>
      indicatorInstances.filter(
        (instance) => !instance.hidden && (instance.key !== "ib" || intraday),
      ),
    [indicatorInstances, intraday],
  );
  const firstInitialBalance = visibleInstances.find((instance) => instance.key === "ib");
  const indicatorCounts = useMemo(() => {
    const counts: Partial<Record<IndicatorKey, number>> = {};
    for (const instance of indicatorInstances)
      counts[instance.key] = (counts[instance.key] ?? 0) + 1;
    return counts;
  }, [indicatorInstances]);
  const visibleIndicators = useMemo(
    () =>
      Object.fromEntries(
        INDICATOR_CATALOG.map(({ key }) => [
          key,
          settings.indicators[key] && !settings.hiddenIndicators[key] && (key !== "ib" || intraday),
        ]),
      ) as ChartIndicators,
    [settings.indicators, settings.hiddenIndicators, intraday],
  );
  const auxiliaryHistory = useInitialBalanceHistory(
    symbol,
    !!firstInitialBalance && interval.unit !== "minute",
  );
  const auxiliaryHistoryRef = useRef(auxiliaryHistory);
  const indicatorSettings = useRef(visibleIndicators);
  const instanceSettings = useRef(visibleInstances);
  const appearanceSettings = useRef(settings.appearance);
  const inputSettings = useRef(settings.indicatorInputs);
  const volumeColors = useRef(settings.volumeColors);
  const initialBalanceSettings = useRef(settings.initialBalance);
  const [initialBalanceStatus, setInitialBalanceStatus] = useState("");
  const [initialBalanceStatuses, setInitialBalanceStatuses] = useState<Record<string, string>>({});
  const [initialBalanceStats, setInitialBalanceStats] = useState<InitialBalanceStats | null>(null);
  const paneCount = oscillatorInstancePaneCount(visibleInstances);
  const [engine, setEngine] = useState<ChartEngine | null>(null);
  const [status, setStatus] = useState("Connecting to Tradovate…");
  const [tickHistory, setTickHistory] = useState<TickHistoryQuality | null>(null);
  const historyNotice =
    interval.unit === "tick" && tickHistory ? tickHistoryNotice(tickHistory) : null;
  const [last, setLast] = useState<Candle | null>(null);
  const [hovered, setHovered] = useState<Candle | null>(null);
  const [notice, setNotice] = useState("");
  const [objectTreeOpen, setObjectTreeOpen] = useState(false);
  const [alertDrawing, setAlertDrawing] = useState<ChartDrawing | null>(null);
  const [readings, setReadings] = useState<IndicatorReadings>({});
  const [hoverReadings, setHoverReadings] = useState<IndicatorReadings | null>(null);
  const activeEngine =
    engine?.symbol === symbol &&
    chartIntervalKey(engine.interval) === chartIntervalKey(interval) &&
    !engine.disposed
      ? engine
      : null;
  const drawings = useChartDrawings(
    activeEngine?.chart ?? null,
    activeEngine?.prices[settings.style] ?? null,
    symbol,
    interval,
    activeEngine?.prices.candles,
  );
  const drawingAlerts = useDrawingAlerts({
    chart: activeEngine?.chart ?? null,
    series: activeEngine?.prices[settings.style] ?? null,
    symbol,
    interval,
    drawings,
    logScale: settings.priceScaleMode === "logarithmic",
  });
  const drawingAlertsRef = useRef(drawingAlerts);
  useEffect(() => {
    drawingAlertsRef.current = drawingAlerts;
  }, [drawingAlerts]);
  useEffect(() => {
    onDrawingAlertsChange?.(drawingAlerts);
  }, [drawingAlerts, onDrawingAlertsChange]);
  useEffect(() => () => onDrawingAlertsChange?.(null), [onDrawingAlertsChange]);
  const rawShown = hovered ?? last;
  const shown =
    settings.style === "heikin-ashi" && rawShown
      ? (activeEngine?.heikinAshiBars.get(rawShown.time) ?? null)
      : rawShown;

  useEffect(() => {
    if (!activeEngine) return;
    drawingAlertsRef.current.reset();
    activeEngine.showReplay(replay.visible);
  }, [activeEngine, replay.visible]);

  useEffect(() => {
    auxiliaryHistoryRef.current = auxiliaryHistory;
    indicatorSettings.current = visibleIndicators;
    instanceSettings.current = visibleInstances;
    appearanceSettings.current = settings.appearance;
    inputSettings.current = settings.indicatorInputs;
    volumeColors.current = settings.volumeColors;
    initialBalanceSettings.current = settings.initialBalance;
    if (engine && !engine.disposed) engine.refreshIndicators();
  }, [
    engine,
    visibleIndicators,
    visibleInstances,
    auxiliaryHistory,
    settings.initialBalance,
    settings.appearance,
    settings.indicatorInputs,
    settings.volumeColors,
  ]);

  useEffect(() => {
    if (!host.current || !symbol) return;
    onQuote?.(null);
    setTickHistory(null);
    let receivedQuote = false;
    const bars = new Map<number, Candle>();
    const heikinAshiBars = new Map<number, Candle>();
    const timeFormatters = createChartTimeFormatters((time) => bars.get(time));
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
      ...(interval.unit === "tick"
        ? { localization: { timeFormatter: timeFormatters.timeFormatter } }
        : {}),
      timeScale: {
        ...(interval.unit === "tick"
          ? { tickMarkFormatter: timeFormatters.tickMarkFormatter }
          : {}),
        timeVisible: intraday,
        secondsVisible: interval.unit === "second" || interval.unit === "tick",
        borderColor: "#242730",
        rightOffset: 5,
      },
      rightPriceScale: { borderColor: "#242730", scaleMargins: { top: 0.08, bottom: 0.2 } },
      crosshair: { mode: 0 },
    });
    const priceFormat = {
      type: "price" as const,
      precision: 2,
      minMove: root === "MGC" || root === "GC" ? 0.1 : 0.25,
    };
    const prices = {
      candles: chart.addSeries(CandlestickSeries, {
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderUpColor: "#26a69a",
        borderDownColor: "#ef5350",
        borderVisible: true,
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        priceFormat,
      }),
      hollow: chart.addSeries(CandlestickSeries, {
        upColor: "transparent",
        downColor: "#ef5350",
        borderVisible: true,
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        visible: false,
        priceFormat,
      }),
      "heikin-ashi": chart.addSeries(CandlestickSeries, {
        title: "HA",
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderUpColor: "#26a69a",
        borderDownColor: "#ef5350",
        borderVisible: true,
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        visible: false,
        // Averaged OHLC can fall between exchange ticks; display its actual two-decimal value.
        priceFormat: { ...priceFormat, minMove: 0.01 },
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
    // Keep the actual closing price distinct from the averaged candle value.
    const marketPriceLine = prices["heikin-ashi"].createPriceLine({
      price: 0,
      color: "#9299a7",
      lineWidth: 1,
      lineStyle: 2,
      lineVisible: false,
      axisLabelVisible: false,
      title: "Price",
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
    const indicators = createIndicatorRenderer(chart, priceFormat.minMove);
    let appliedVolumeColors = "";
    let replaying = false;
    const state: ChartEngine = {
      symbol,
      interval,
      chart,
      prices,
      marketPriceLine,
      volume,
      indicators,
      bars,
      heikinAshiBars,
      disposed: false,
      showReplay: (history) => {
        if (state.disposed) return;
        if (!history && !replaying) return;
        replaying = history !== null;
        if (render !== undefined) cancelAnimationFrame(render);
        render = undefined;
        pending.clear();
        setHovered(null);
        setHoverReadings(null);
        replaceHistory = true;
        renderedTime = -Infinity;
        fitted = false;
        if (history) {
          applyChartBarBatch(bars, pending, history, true);
          renderBars();
        } else {
          revision = null;
          previousQuote = null;
          syncCache();
        }
      },
      refreshIndicators: () => {
        if (state.disposed) return;
        const sorted = [...bars.values()].sort((a, b) => a.time - b.time);
        const enabled = indicatorSettings.current;
        const result = indicators.update(
          sorted,
          enabled,
          initialBalanceSettings.current,
          chartIntervalMinutes(interval) ?? 0,
          appearanceSettings.current,
          inputSettings.current,
          interval.unit !== "minute"
            ? replaying && auxiliaryHistoryRef.current
              ? {
                  ...auxiliaryHistoryRef.current,
                  bars: replayMinuteHistory(
                    auxiliaryHistoryRef.current.bars,
                    sorted.at(-1)?.actualEndTime ??
                      (sorted.at(-1)?.actualTime ?? sorted.at(-1)?.time ?? -Infinity) +
                        (chartIntervalMinutes(interval) ?? 0) * 60,
                  ),
                }
              : auxiliaryHistoryRef.current
            : undefined,
          instanceSettings.current,
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
        setInitialBalanceStatuses(result.initialBalanceStatuses);
        setInitialBalanceStats(result.initialBalanceStats);
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
    let render: number | undefined;
    let fitted = false;
    let renderedTime = -Infinity;
    let hollowPrevious: Candle | undefined;
    let hollowLatest: Candle | undefined;
    let heikinPrevious: Candle | undefined;
    let heikinLatest: Candle | undefined;
    let hollowPriceColor = "";
    const hollowPoint = (bar: Candle, previous?: Candle) => ({
      ...bar,
      time: bar.time as UTCTimestamp,
      ...hollowCandleColors(bar, previous),
    });
    let replaceHistory = true;
    const pending = new Map<number, Candle>();
    const volumePoint = (b: Candle) => ({
      time: b.time as UTCTimestamp,
      value: b.volume,
      color: `${b.close >= b.open ? volumeColors.current.up : volumeColors.current.down}45`,
    });
    let alertSnapshot: ChartMarketSnapshot | null = null;
    const renderBars = () => {
      render = undefined;
      if (state.disposed) return;
      const changes = [...pending.values()].sort((a, b) => a.time - b.time);
      pending.clear();
      if (replaceHistory || changes.some((b) => b.time < renderedTime) || bars.size > 1300) {
        const sorted = [...bars.values()].sort((a, b) => a.time - b.time).slice(-1200);
        if (replaceHistory && interval.unit === "tick") {
          const formatters = createChartTimeFormatters((time) => bars.get(time));
          chart.applyOptions({
            localization: { timeFormatter: formatters.timeFormatter },
            timeScale: { tickMarkFormatter: formatters.tickMarkFormatter },
          });
        }
        bars.clear();
        for (const bar of sorted) bars.set(bar.time, bar);
        const ohlc = sorted.map((b) => ({ ...b, time: b.time as UTCTimestamp }));
        const closes = sorted.map((b) => ({ time: b.time as UTCTimestamp, value: b.close }));
        prices.candles.setData(ohlc);
        prices.hollow.setData(sorted.map((bar, index) => hollowPoint(bar, sorted[index - 1])));
        const averaged = calculateHeikinAshi(sorted);
        heikinAshiBars.clear();
        for (const bar of averaged) heikinAshiBars.set(bar.time, bar);
        prices["heikin-ashi"].setData(
          averaged.map((bar) => ({ ...bar, time: bar.time as UTCTimestamp })),
        );
        heikinLatest = averaged.at(-1);
        heikinPrevious = averaged.at(-2);
        hollowLatest = sorted.at(-1);
        hollowPrevious = sorted.at(-2);
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
          // Same-bar revisions still compare against the preceding candle, never
          // the previous tick. Corrections to earlier history use the rebuild above.
          if (!hollowLatest || bar.time > hollowLatest.time) hollowPrevious = hollowLatest;
          hollowLatest = bar;
          prices.hollow.update(hollowPoint(bar, hollowPrevious));
          if (!heikinLatest || bar.time > heikinLatest.time) heikinPrevious = heikinLatest;
          heikinLatest = heikinAshiBar(bar, heikinPrevious);
          heikinAshiBars.set(bar.time, heikinLatest);
          prices["heikin-ashi"].update({ ...heikinLatest, time: bar.time as UTCTimestamp });
          prices.bars.update(ohlc);
          prices.line.update(close);
          prices.area.update(close);
          volume.update(volumePoint(bar));
          renderedTime = bar.time;
        }
      }
      const directionColor = hollowLatest
        ? hollowCandleColors(hollowLatest, hollowPrevious).borderColor
        : "";
      if (directionColor !== hollowPriceColor) {
        // Hollow bodies are transparent; their price label and line still use the direction color.
        prices.hollow.applyOptions({ priceLineColor: directionColor });
        hollowPriceColor = directionColor;
      }
      state.refreshIndicators();
      if (!fitted && bars.size) {
        chart
          .timeScale()
          .setVisibleLogicalRange({ from: Math.max(0, bars.size - 100), to: bars.size + 5 });
        fitted = true;
      }
      const latest = bars.get(renderedTime) ?? null;
      if (latest) marketPriceLine.applyOptions({ price: latest.close });
      setLast(latest);
      if (alertSnapshot && !replaying) drawingAlertsRef.current.consume(alertSnapshot);
      if (latest && (replaying || !receivedQuote))
        onQuote?.({
          symbol,
          last: latest.close,
          open: latest.open,
          high: latest.high,
          low: latest.low,
          volume: latest.volume,
          timestamp: new Date(
            (latest.actualEndTime ?? latest.actualTime ?? latest.time) * 1000,
          ).toISOString(),
          source: "bar",
        });
    };
    let revision: number | null = null;
    let previousQuote: MarketQuote | null = null;
    const syncCache = () => {
      const snapshot = queryClient.getQueryData<ChartMarketSnapshot>(marketOptions.queryKey);
      if (!snapshot || state.disposed) return;
      // Keep the live cache running, but never merge it into the frozen replay
      // timeline or evaluate its alerts against historical chart geometry.
      if (replaying) return;
      alertSnapshot = snapshot;
      setStatus(snapshot.status);
      setTickHistory(snapshot.tickHistory);
      receivedQuote = snapshot.quote !== null;
      if (snapshot.quote !== previousQuote) {
        previousQuote = snapshot.quote;
        onQuote?.(snapshot.quote);
      }
      if (snapshot.revision === revision) {
        if (render === undefined) drawingAlertsRef.current.consume(snapshot);
        return;
      }
      const replace = revision === null || snapshot.replace || snapshot.revision !== revision + 1;
      revision = snapshot.revision;
      if (replace) {
        replaceHistory = true;
        // Canvas replacement also happens for live calendar snapshots and history
        // trimming. The alert feed tracks actual stream epochs independently.
        renderedTime = -Infinity;
        setHovered(null);
        setHoverReadings(null);
      }
      applyChartBarBatch(bars, pending, replace ? snapshot.bars : snapshot.updates, replace);
      if (render === undefined) render = requestAnimationFrame(renderBars);
    };
    const queryHash = hashKey(marketOptions.queryKey);
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.queryHash === queryHash) syncCache();
    });
    syncCache();
    return () => {
      document.fonts.removeEventListener("loadingdone", syncFont);
      fontObserver.disconnect();
      state.disposed = true;
      unsubscribe();
      if (render !== undefined) cancelAnimationFrame(render);
      chart.remove();
    };
  }, [symbol, interval, intraday, onQuote, root, queryClient, marketOptions]);

  useEffect(() => {
    if (!engine || engine.disposed) return;
    for (const style of ["candles", "hollow", "heikin-ashi", "bars", "line", "area"] as const)
      engine.prices[style].applyOptions({
        visible: style === settings.style,
        priceLineVisible: settings.showPriceLine,
        lastValueVisible: settings.showPriceLabel,
        title: style === "heikin-ashi" && settings.showPriceLabel ? "HA" : "",
      });
    for (const style of ["candles", "hollow", "heikin-ashi"] as const)
      engine.prices[style].applyOptions({
        wickVisible: settings.showCandleWicks,
        borderVisible: settings.showCandleBorders,
      });
    engine.prices.line.applyOptions({
      color: settings.lineChartColor,
      lineWidth: settings.lineChartWidth,
    });
    engine.prices.area.applyOptions({
      lineColor: settings.lineChartColor,
      topColor: `${settings.lineChartColor}55`,
      bottomColor: `${settings.lineChartColor}00`,
      lineWidth: settings.lineChartWidth,
    });
    engine.prices.bars.applyOptions({
      thinBars: settings.thinBars,
      openVisible: settings.showBarOpen,
    });
    // The shared scale takes its formatter from the first series, including hidden ones.
    engine.prices[settings.style].setSeriesOrder(0);
    const gridStyle =
      settings.gridLineStyle === "dotted"
        ? LineStyle.Dotted
        : settings.gridLineStyle === "dashed"
          ? LineStyle.Dashed
          : LineStyle.Solid;
    const crosshairLine = {
      color: settings.crosshairColor,
      width: settings.crosshairLineWidth,
      style: {
        solid: LineStyle.Solid,
        dotted: LineStyle.Dotted,
        dashed: LineStyle.Dashed,
        largeDashed: LineStyle.LargeDashed,
      }[settings.crosshairLineStyle],
    };
    engine.chart.applyOptions({
      crosshair: {
        vertLine: crosshairLine,
        horzLine: crosshairLine,
        mode:
          settings.crosshairMode === "magnet"
            ? CrosshairMode.Magnet
            : settings.crosshairMode === "ohlc"
              ? CrosshairMode.MagnetOHLC
              : settings.crosshairMode === "hidden"
                ? CrosshairMode.Hidden
                : CrosshairMode.Normal,
      },
      grid: {
        vertLines: {
          visible: settings.gridMode === "both" || settings.gridMode === "vertical",
          color: settings.gridColor,
          style: gridStyle,
        },
        horzLines: {
          visible: settings.gridMode === "both" || settings.gridMode === "horizontal",
          color: settings.gridColor,
          style: gridStyle,
        },
      },
    });
    engine.chart.priceScale("right", 0).applyOptions({
      mode: {
        normal: PriceScaleMode.Normal,
        logarithmic: PriceScaleMode.Logarithmic,
        percentage: PriceScaleMode.Percentage,
        indexedTo100: PriceScaleMode.IndexedTo100,
      }[settings.priceScaleMode],
      invertScale: settings.invertScale,
    });
  }, [
    engine,
    settings.style,
    settings.gridMode,
    settings.gridLineStyle,
    settings.gridColor,
    settings.priceScaleMode,
    settings.invertScale,
    settings.crosshairMode,
    settings.crosshairColor,
    settings.crosshairLineStyle,
    settings.crosshairLineWidth,
    settings.thinBars,
    settings.showBarOpen,
    settings.showCandleWicks,
    settings.showCandleBorders,
    settings.lineChartColor,
    settings.lineChartWidth,
    settings.showPriceLine,
    settings.showPriceLabel,
  ]);

  useEffect(() => {
    if (!engine || engine.disposed) return;
    const hasPrice = last !== null && engine.bars.size > 0;
    engine.marketPriceLine.applyOptions({
      lineVisible: hasPrice && settings.showPriceLine,
      axisLabelVisible: hasPrice && settings.showPriceLabel,
    });
  }, [engine, last, settings.showPriceLine, settings.showPriceLabel]);

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
      link.download = `${symbol}-${formatChartInterval(interval)}-chart.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Chart image downloaded.");
    });
  };
  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#0b0d12]"
      aria-label={`${symbol} Tradovate chart`}
      onKeyDown={drawings.onHistoryKeyDown}
      onCopy={drawings.onCopy}
      onPaste={drawings.onPaste}
    >
      <ChartToolbar
        symbol={symbol}
        onSelectSymbol={onSelectSymbol}
        interval={interval}
        onIntervalChange={onIntervalChange}
        style={settings.style}
        onStyleChange={settings.setStyle}
        indicatorCounts={indicatorCounts}
        onAddIndicator={settings.addIndicator}
        favoriteIndicators={settings.favoriteIndicators}
        onToggleFavoriteIndicator={settings.toggleFavoriteIndicator}
        indicatorLimitReached={indicatorInstances.length >= MAX_CHART_INDICATORS}
        gridMode={settings.gridMode}
        gridLineStyle={settings.gridLineStyle}
        onGridLineStyleChange={settings.setGridLineStyle}
        gridColor={settings.gridColor}
        onGridColorChange={settings.setGridColor}
        onGridModeChange={settings.setGridMode}
        thinBars={settings.thinBars}
        onToggleThinBars={settings.toggleThinBars}
        showBarOpen={settings.showBarOpen}
        onToggleBarOpen={settings.toggleBarOpen}
        showCandleWicks={settings.showCandleWicks}
        showCandleBorders={settings.showCandleBorders}
        lineChartColor={settings.lineChartColor}
        lineChartWidth={settings.lineChartWidth}
        onLineChartColorChange={settings.setLineChartColor}
        onLineChartWidthChange={settings.setLineChartWidth}
        onToggleCandleWicks={settings.toggleCandleWicks}
        onToggleCandleBorders={settings.toggleCandleBorders}
        showPriceLine={settings.showPriceLine}
        onTogglePriceLine={settings.togglePriceLine}
        showPriceLabel={settings.showPriceLabel}
        onTogglePriceLabel={settings.togglePriceLabel}
        crosshairMode={settings.crosshairMode}
        onCrosshairModeChange={settings.setCrosshairMode}
        crosshairColor={settings.crosshairColor}
        onCrosshairColorChange={settings.setCrosshairColor}
        crosshairLineStyle={settings.crosshairLineStyle}
        onCrosshairLineStyleChange={settings.setCrosshairLineStyle}
        crosshairLineWidth={settings.crosshairLineWidth}
        onCrosshairLineWidthChange={settings.setCrosshairLineWidth}
        priceScaleMode={settings.priceScaleMode}
        onPriceScaleModeChange={settings.setPriceScaleMode}
        invertScale={settings.invertScale}
        onToggleInvertScale={settings.toggleInvertScale}
        onScreenshot={screenshot}
        historyControls={
          <div className="flex shrink-0 items-center">
            <ChartAction
              label="Undo drawing edit"
              disabled={!drawings.canUndo}
              onClick={drawings.undo}
            >
              <ChartIcon name="arrow-back-up" className="size-[18px]" />
            </ChartAction>
            <ChartAction
              label="Redo drawing edit"
              disabled={!drawings.canRedo}
              onClick={drawings.redo}
            >
              <ChartIcon name="arrow-back-up" className="size-[18px] -scale-x-100" />
            </ChartAction>
          </div>
        }
        replayControl={
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-label={replay.session ? "Exit bar replay" : "Start bar replay"}
              aria-pressed={!!replay.session}
              disabled={!last || technicals}
              onClick={() => {
                if (replay.session) replay.exit();
                else {
                  const snapshot = queryClient.getQueryData<ChartMarketSnapshot>(
                    marketOptions.queryKey,
                  );
                  if (!replay.start(snapshot?.bars ?? [...(activeEngine?.bars.values() ?? [])]))
                    setNotice(
                      "Replay needs at least two completed candles. Wait for chart history to load.",
                    );
                }
              }}
              className={cn(
                "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded px-2.5 text-[13px] text-zinc-400 hover:bg-white/5 disabled:opacity-30",
                replay.session && "bg-blue-400/10 text-blue-400",
              )}
            >
              <svg className="size-[18px]" viewBox="5 5 19 19" fill="none" aria-hidden="true">
                <path stroke="currentColor" d="M13.5 20V9l-6 5.5 6 5.5zM21.5 20V9l-6 5.5 6 5.5z" />
              </svg>
            </TooltipTrigger>
            <TooltipPopup>Replay loaded historical candles</TooltipPopup>
          </Tooltip>
        }
        panelActions={
          <>
            <ChartAction
              label="Object tree"
              active={objectTreeOpen}
              onClick={() => setObjectTreeOpen((open) => !open)}
            >
              <ObjectTreeIcon className="size-[18px]" />
            </ChartAction>
            {panelActions}
          </>
        }
        navigationControl={navigationControl}
      />
      <ChartReplayControls replay={replay} />
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <DrawingSelectionOverlay
          drawings={drawings}
          onOpenObjectTree={() => setObjectTreeOpen(true)}
          onCreateAlert={setAlertDrawing}
        />
        {alertDrawing ? (
          <DrawingAlertDialog
            key={`${symbol}:${chartIntervalKey(interval)}:${alertDrawing.id}`}
            drawing={alertDrawing}
            symbol={symbol}
            intervalLabel={formatChartInterval(interval)}
            onClose={() => setAlertDrawing(null)}
            onSubmit={drawingAlerts.create}
          />
        ) : null}
        <div
          role="toolbar"
          aria-label="Drawing tools"
          className="flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-white/10 py-1"
        >
          <DrawingTools
            drawings={drawings}
            indicatorControls={{
              count: indicatorInstances.length,
              hidden: indicatorInstances.every((instance) => instance.hidden),
              setHidden: settings.setIndicatorsHidden,
              remove: settings.removeAllIndicators,
            }}
          />
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
          <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="relative h-full" style={{ minHeight: 240 + paneCount * 110 }}>
              <div ref={host} className="absolute inset-0" />

              <DrawingInlineTextEditor
                chart={activeEngine?.chart ?? null}
                series={activeEngine?.prices[settings.style] ?? null}
                drawings={drawings}
              />
              <ChartContextMenu
                chart={activeEngine?.chart ?? null}
                series={activeEngine?.prices[settings.style] ?? null}
                drawings={drawings}
              />
              <FavoriteDrawingToolbar drawings={drawings} />
              <div
                aria-label="Chart legend"
                className="pointer-events-none absolute left-2.5 right-20 top-2 z-10 text-xs"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Tooltip>
                    <TooltipTrigger
                      onClick={onSelectSymbol}
                      className="pointer-events-auto trading-heading truncate font-medium text-zinc-200 hover:text-white"
                    >
                      {INSTRUMENTS[root].name} · {formatChartInterval(interval)} ·{" "}
                      {INSTRUMENTS[root].exchange}
                      {settings.style === "heikin-ashi" ? " · Heikin Ashi" : null}
                    </TooltipTrigger>
                    <TooltipPopup>
                      {settings.style === "heikin-ashi"
                        ? "Averaged candles; indicators and alerts use market prices."
                        : "Select contract"}
                    </TooltipPopup>
                  </Tooltip>
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
                  </div>
                ) : null}
                <IndicatorLegend
                  settings={settings}
                  readings={hoverReadings ?? readings}
                  initialBalanceStatus={initialBalanceStatus}
                  initialBalanceStatuses={initialBalanceStatuses}
                />
              </div>
              {firstInitialBalance &&
              firstInitialBalance.initialBalance?.showDashboard !== false &&
              initialBalanceStats &&
              activeEngine ? (
                <InitialBalanceDashboard
                  chart={activeEngine.chart}
                  hostRef={host}
                  stats={initialBalanceStats}
                />
              ) : null}
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
        {objectTreeOpen && !technicals ? (
          <DrawingObjectTree
            drawings={drawings}
            symbol={symbol}
            onClose={() => setObjectTreeOpen(false)}
            indicators={indicatorInstances.map((instance, index) => {
              const label = getIndicatorLabel(instance.key, { [instance.key]: instance.inputs });
              const ordinal = indicatorInstances
                .slice(0, index + 1)
                .filter((item) => item.key === instance.key).length;
              const accessible = (text: string) =>
                (indicatorCounts[instance.key] ?? 0) > 1 ? `${text}, instance ${ordinal}` : text;
              return {
                key: instance.id,
                label,
                hidden: instance.hidden,
                settingsLabel: accessible(`${label} settings`),
                settingsContent: (
                  <IndicatorSettingsContent
                    instance={instance}
                    settings={settings}
                    accessible={accessible}
                    description={
                      instance.key === "ib"
                        ? (initialBalanceStatuses[instance.id] ?? initialBalanceStatus)
                        : getIndicatorDefinition(instance.key).detail
                    }
                  />
                ),
                onToggleHidden: () => settings.toggleIndicatorInstanceVisibility(instance.id),
                onRemove: () => settings.removeIndicatorInstance(instance.id),
              };
            })}
          />
        ) : null}
        {technicals ? (
          <TechnicalsMarket
            symbol={symbol}
            name={INSTRUMENTS[root].name}
            interval={technicalInterval}
            onIntervalChange={onTechnicalIntervalChange}
            onBack={onBackFromTechnicals}
            environmentBase={environmentBase}
            projectId={workspace.projectId}
            ready={workspace.ready}
          />
        ) : null}
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
        {historyNotice ? (
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-label={historyNotice.label}
              className="rounded px-2 py-1 text-[10px] text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              {historyNotice.label}
            </TooltipTrigger>
            <TooltipPopup className="max-w-72">{historyNotice.description}</TooltipPopup>
          </Tooltip>
        ) : null}
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
            {last
              ? `${status} · Last bar ${new Date((last.actualEndTime ?? last.actualTime ?? last.time) * 1000).toLocaleString()}`
              : status}
          </TooltipPopup>
        </Tooltip>
        <TradingSelect
          label="Price scale"
          value={settings.priceScaleMode}
          options={PRICE_SCALE_OPTIONS}
          onChange={(value) => settings.setPriceScaleMode(value as ChartPriceScaleMode)}
          variant="ghost"
          className="h-7 w-36 text-[11px]"
        />
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
