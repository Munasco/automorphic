import { CalendarDaysIcon } from "lucide-react";
import { ChartMeasureOverlay } from "./ChartMeasureOverlay";
import { ChartGoToDateDialog } from "./ChartGoToDateDialog";
import {
  applyChartBarBatch,
  createChartTimeFormatters,
  tickHistoryNotice,
  type TickHistoryQuality,
} from "./tickChartData";
import { supportsDrawingAlert } from "./drawingAlerts";
import { AlertIcon } from "./AlertIcon";
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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createChart,
  createTextWatermark,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  PriceScaleMode,
  LineStyle,
  LineType,
  type UTCTimestamp,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type SeriesType,
} from "lightweight-charts";
import type { MarketQuote } from "./InstrumentHeader";
import { INSTRUMENTS } from "./InstrumentHeader";
import { TradingSelect } from "./TradingSelect";
import { CHART_TIME_ZONES } from "./chartTimeZones";
import { ChartToolbar, PRICE_SCALE_OPTIONS } from "./ChartToolbar";
import {
  useChartPreferences,
  type ChartStyle,
  type ChartPriceScaleMode,
  type IndicatorKey,
  type ChartIndicators,
} from "./chartPreferences";
import { sourcePrice, type Candle } from "./chartIndicators";
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
import { ChartPriceAlertsOverlay } from "./ChartPriceAlertsOverlay";
import type { ChartAlertsController } from "./ChartAlertsPanel";
import type { ChartPriceAlert } from "./chartAlerts";
import { ChartDataTableDialog, type ChartTableSource } from "./ChartDataTableDialog";
import { ChartTemplatesControl, ChartTemplatesDialog } from "./ChartTemplatesMenu";
import { ChartContextMenu } from "./ChartContextMenu";
import { DrawingObjectTree } from "./DrawingObjectTree";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { ChartReplayControls, useChartReplay } from "./ChartReplay";
import { chartLastTrade } from "./chartLastTrade";
import { barCountdown } from "./barCountdown";
import { createBarCountdownPrimitive } from "./barCountdownPrimitive";
import { getFuturesSession } from "./marketSession";
import { replayViewport } from "./replayViewport";
import { replayMinuteHistory } from "./replayHistory";

type ChartEngine = ChartTableSource & {
  symbol: string;
  interval: ChartInterval;
  chart: IChartApi;
  prices: Record<ChartStyle, ISeriesApi<SeriesType>>;
  marketPriceLine: IPriceLine;
  tradePriceLines: Record<ChartStyle, IPriceLine>;
  refreshTradePrice: () => void;
  countdowns: Record<ChartStyle, ReturnType<typeof createBarCountdownPrimitive>>;
  refreshCountdown: () => void;
  volume: ISeriesApi<"Histogram">;
  indicators: ReturnType<typeof createIndicatorRenderer>;
  bars: Map<number, Candle>;
  heikinAshiBars: Map<number, Candle>;
  refreshIndicators: () => void;
  refreshLineSource: () => void;
  showReplay: (bars: readonly Candle[] | null, seekVersion: number) => void;
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
  objectTreeState,
  settingsControl,
  navigationControl,
  technicals = false,
  technicalInterval,
  onTechnicalIntervalChange,
  onBackFromTechnicals,
  onDrawingAlertsChange,
  onAddPriceAlert,
  priceAlerts,
  onEditPriceAlert,
}: {
  symbol: string;
  interval: ChartInterval;
  root: InstrumentRoot;
  onQuote?: ((quote: MarketQuote | null) => void) | undefined;
  onSelectSymbol: () => void;
  onIntervalChange: (interval: ChartInterval) => void;
  objectTreeState?: { open: boolean; onOpenChange: (open: boolean) => void };
  settingsControl?: ReactNode;
  navigationControl?: ReactNode;
  technicals?: boolean;
  technicalInterval: ChartInterval;
  onTechnicalIntervalChange: (interval: ChartInterval) => void;
  onBackFromTechnicals: () => void;
  priceAlerts?: ChartAlertsController | undefined;
  onEditPriceAlert?: ((alert: ChartPriceAlert) => void) | undefined;
  onAddPriceAlert?: ((price: number) => void) | undefined;
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
        indicatorOrder: settings.indicatorOrder,
      }),
    [
      settings.indicators,
      settings.hiddenIndicators,
      settings.appearance,
      settings.indicatorInputs,
      settings.initialBalance,
      settings.volumeColors,
      settings.extraIndicators,
      settings.indicatorOrder,
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
  const candleColors = useRef({
    up: settings.candleUpColor,
    down: settings.candleDownColor,
    wickUp: settings.candleWickUpColor ?? settings.candleUpColor,
    wickDown: settings.candleWickDownColor ?? settings.candleDownColor,
    borderUp: settings.candleBorderUpColor ?? settings.candleUpColor,
    borderDown: settings.candleBorderDownColor ?? settings.candleDownColor,
  });
  const priceDisplay = useRef({
    style: settings.style,
    line: settings.showPriceLine,
    label: settings.showPriceLabel,
    countdown: settings.showBarCountdown,
  });
  const lineChartSource = useRef(settings.lineChartSource);
  const chartTimeZone = useRef(settings.timeZone);
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
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const [localObjectTreeOpen, setLocalObjectTreeOpen] = useState(false);
  const objectTreeOpen = objectTreeState?.open ?? localObjectTreeOpen;
  const setObjectTreeOpen = objectTreeState?.onOpenChange ?? setLocalObjectTreeOpen;
  const [tableOpen, setTableOpen] = useState(false);
  const [measureEngine, setMeasureEngine] = useState<ChartEngine | null>(null);
  const [goToDateOpen, setGoToDateOpen] = useState(false);
  const [templateDialog, setTemplateDialog] = useState<"save" | "manage" | null>(null);
  const [alertDrawing, setAlertDrawing] = useState<ChartDrawing | null>(null);
  const [readings, setReadings] = useState<IndicatorReadings>({});
  const [hoverReadings, setHoverReadings] = useState<IndicatorReadings | null>(null);
  const activeEngine =
    engine?.symbol === symbol &&
    chartIntervalKey(engine.interval) === chartIntervalKey(interval) &&
    !engine.disposed
      ? engine
      : null;
  useEffect(() => {
    chartTimeZone.current = settings.timeZone;
    if (!activeEngine) return;
    const formatters = createChartTimeFormatters(
      (time) => activeEngine.bars.get(time),
      settings.timeZone,
      intraday,
      interval.unit === "second" || interval.unit === "tick",
    );
    activeEngine.chart.applyOptions({
      localization: { timeFormatter: formatters.timeFormatter },
      timeScale: { tickMarkFormatter: formatters.tickMarkFormatter },
    });
  }, [activeEngine, settings.timeZone, intraday, interval.unit]);
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
  const createAlert = useCallback(() => {
    if (
      drawings.selected &&
      drawings.selectedIds.length === 1 &&
      supportsDrawingAlert(drawings.selected)
    )
      setAlertDrawing(drawings.selected);
    else if (last && onAddPriceAlert) onAddPriceAlert(last.close);
  }, [drawings.selected, drawings.selectedIds.length, last, onAddPriceAlert]);
  useEffect(() => {
    const element = activeEngine?.chart.chartElement();
    if (!element || technicals) return;
    const shortcut = (event: KeyboardEvent) => {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.code !== "KeyA" && event.code !== "KeyG") ||
        event.defaultPrevented
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
      )
        return;
      event.preventDefault();
      if (event.code === "KeyG") setGoToDateOpen(true);
      else createAlert();
    };
    element.addEventListener("keydown", shortcut);
    return () => element.removeEventListener("keydown", shortcut);
  }, [activeEngine, technicals, createAlert]);
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
    activeEngine.showReplay(replay.visible, replay.session?.seekVersion ?? 0);
  }, [activeEngine, replay.visible, replay.session?.seekVersion]);

  useEffect(() => {
    lineChartSource.current = settings.lineChartSource;
    if (engine && !engine.disposed) engine.refreshLineSource();
  }, [engine, settings.lineChartSource]);

  useEffect(() => {
    candleColors.current = {
      up: settings.candleUpColor,
      down: settings.candleDownColor,
      wickUp: settings.candleWickUpColor ?? settings.candleUpColor,
      wickDown: settings.candleWickDownColor ?? settings.candleDownColor,
      borderUp: settings.candleBorderUpColor ?? settings.candleUpColor,
      borderDown: settings.candleBorderDownColor ?? settings.candleDownColor,
    };
    if (!engine || engine.disposed) return;
    // Hollow candles carry per-bar colors; changing series defaults alone leaves history stale.
    const bars = [...engine.bars.values()].sort((a, b) => a.time - b.time);
    engine.prices.hollow.setData(
      bars.map((bar, index) => ({
        ...bar,
        time: bar.time as UTCTimestamp,
        ...hollowCandleColors(bar, bars[index - 1], candleColors.current),
      })),
    );
    const latest = bars.at(-1);
    engine.prices.hollow.applyOptions({
      priceLineColor: latest
        ? hollowCandleColors(latest, bars.at(-2), candleColors.current).borderColor
        : "",
    });
    engine.refreshTradePrice();
  }, [
    engine,
    settings.candleUpColor,
    settings.candleDownColor,
    settings.candleWickUpColor,
    settings.candleWickDownColor,
    settings.candleBorderUpColor,
    settings.candleBorderDownColor,
  ]);

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
    const timeFormatters = createChartTimeFormatters(
      (time) => bars.get(time),
      chartTimeZone.current,
      intraday,
      interval.unit === "second" || interval.unit === "tick",
    );
    const { chartBackgroundColor, chartTextColor } = useChartPreferences.getState();
    const chart = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: chartBackgroundColor },
        textColor: chartTextColor,
        fontFamily: getComputedStyle(host.current).fontFamily,
        fontSize: 12,
        panes: { separatorColor: "#242730", separatorHoverColor: "#454b59", enableResize: true },
      },
      grid: { vertLines: { color: "#171a23" }, horzLines: { color: "#171a23" } },
      localization: { timeFormatter: timeFormatters.timeFormatter },
      timeScale: {
        tickMarkFormatter: timeFormatters.tickMarkFormatter,
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
        upColor: candleColors.current.up,
        downColor: candleColors.current.down,
        borderUpColor: candleColors.current.up,
        borderDownColor: candleColors.current.down,
        borderVisible: true,
        wickUpColor: candleColors.current.up,
        wickDownColor: candleColors.current.down,
        priceFormat,
      }),
      hollow: chart.addSeries(CandlestickSeries, {
        upColor: "transparent",
        downColor: candleColors.current.down,
        borderVisible: true,
        wickUpColor: candleColors.current.up,
        wickDownColor: candleColors.current.down,
        visible: false,
        priceFormat,
      }),
      "heikin-ashi": chart.addSeries(CandlestickSeries, {
        title: "HA",
        upColor: candleColors.current.up,
        downColor: candleColors.current.down,
        borderUpColor: candleColors.current.up,
        borderDownColor: candleColors.current.down,
        borderVisible: true,
        wickUpColor: candleColors.current.up,
        wickDownColor: candleColors.current.down,
        visible: false,
        // Averaged OHLC can fall between exchange ticks; display its actual two-decimal value.
        priceFormat: { ...priceFormat, minMove: 0.01 },
      }),
      bars: chart.addSeries(BarSeries, {
        upColor: candleColors.current.up,
        downColor: candleColors.current.down,
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
    const tradePriceLines = Object.fromEntries(
      Object.entries(prices).map(([style, series]) => [
        style,
        series.createPriceLine({
          price: 0,
          color: "#9299a7",
          lineWidth: 1,
          lineStyle: 2,
          lineVisible: false,
          axisLabelVisible: false,
          title: style === "heikin-ashi" ? "Price" : "",
        }),
      ]),
    ) as Record<ChartStyle, IPriceLine>;
    const marketPriceLine = tradePriceLines["heikin-ashi"];
    const countdowns = Object.fromEntries(
      Object.entries(prices).map(([style, series]) => {
        const countdown = createBarCountdownPrimitive(
          series,
          () => chart.options().layout.fontSize,
        );
        series.attachPrimitive(countdown.primitive);
        return [style, countdown];
      }),
    ) as Record<ChartStyle, ReturnType<typeof createBarCountdownPrimitive>>;
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
    let replayHistory: readonly Candle[] | null = null;
    let replaySeekVersion = 0;
    let liveViewport: { range: { from: number; to: number }; count: number } | null = null;
    let pendingViewport: { from: number; to: number } | null = null;
    let barRevision = 0;
    const barListeners = new Set<() => void>();
    const state: ChartEngine = {
      symbol,
      interval,
      chart,
      prices,
      marketPriceLine,
      tradePriceLines,
      countdowns,
      refreshCountdown: () => {
        if (state.disposed) return;
        const latest = bars.get(renderedTime) ?? null;
        const display = priceDisplay.current;
        const now = Date.now();
        const text = barCountdown(latest, interval, now, {
          enabled: display.countdown,
          live:
            display.countdown &&
            alertSnapshot?.status === "Tradovate connected" &&
            getFuturesSession(root, new Date(now)).status === "scheduled-open",
          replay: replaying,
        });
        const price =
          chartLastTrade(previousQuote, latest ?? undefined, symbol) ?? latest?.close ?? NaN;
        for (const style of Object.keys(countdowns) as ChartStyle[])
          countdowns[style].update(style === display.style ? text : null, price, display.label);
      },
      refreshTradePrice: () => {
        if (state.disposed) return;
        const latest = bars.get(renderedTime);
        const trade = replaying ? null : chartLastTrade(previousQuote, latest, symbol);
        const display = priceDisplay.current;
        for (const style of Object.keys(prices) as ChartStyle[]) {
          const useTrade = trade !== null && style !== "heikin-ashi";
          const showGuide =
            style === display.style && !!latest && (trade !== null || style === "heikin-ashi");
          const native = prices[style].options();
          const priceLineVisible = display.line && !useTrade;
          const lastValueVisible = display.label && !useTrade;
          if (
            native.priceLineVisible !== priceLineVisible ||
            native.lastValueVisible !== lastValueVisible
          )
            prices[style].applyOptions({ priceLineVisible, lastValueVisible });
          const guide = tradePriceLines[style].options();
          if (!showGuide && !guide.lineVisible && !guide.axisLabelVisible) continue;
          const next = {
            price: trade ?? latest?.close ?? 0,
            color:
              style === "heikin-ashi"
                ? "#9299a7"
                : (trade ?? latest?.close ?? 0) >= (latest?.open ?? 0)
                  ? candleColors.current.up
                  : candleColors.current.down,
            lineVisible: showGuide && display.line,
            axisLabelVisible: showGuide && display.label,
          };
          if (
            guide.price !== next.price ||
            guide.color !== next.color ||
            guide.lineVisible !== next.lineVisible ||
            guide.axisLabelVisible !== next.axisLabelVisible
          )
            tradePriceLines[style].applyOptions(next);
        }
        state.refreshCountdown();
      },
      volume,
      indicators,
      bars,
      heikinAshiBars,
      subscribeBars: (listener) => {
        barListeners.add(listener);
        return () => {
          barListeners.delete(listener);
        };
      },
      getBarRevision: () => barRevision,
      disposed: false,
      showReplay: (history, seekVersion) => {
        if (state.disposed || (!history && !replaying)) return;
        if (history === replayHistory && seekVersion === replaySeekVersion) return;
        const previousHistory = replayHistory;
        const wasReplaying = replaying;
        const range = chart.timeScale().getVisibleLogicalRange();
        if (!wasReplaying && range) liveViewport = { range, count: bars.size };
        const seek = !wasReplaying || seekVersion !== replaySeekVersion;
        const append =
          !!history &&
          !!previousHistory &&
          history.length > previousHistory.length &&
          history[0] === previousHistory[0] &&
          history[previousHistory.length - 1] === previousHistory.at(-1);
        replaying = history !== null;
        replayHistory = history;
        replaySeekVersion = seekVersion;
        if (render !== undefined) cancelAnimationFrame(render);
        render = undefined;
        pending.clear();
        if (!append) {
          setHovered(null);
          setHoverReadings(null);
          replaceHistory = true;
          renderedTime = -Infinity;
        }
        // Playback owns horizontal movement; data updates must never fit the chart again.
        fitted = true;
        if (history) {
          pendingViewport = replayViewport(
            range,
            previousHistory?.length ?? bars.size,
            history.length,
            seek,
          );
          applyChartBarBatch(
            bars,
            pending,
            append ? history.slice(previousHistory!.length) : history,
            !append,
          );
          renderBars();
        } else {
          const snapshot = queryClient.getQueryData<ChartMarketSnapshot>(marketOptions.queryKey);
          if (liveViewport)
            pendingViewport = replayViewport(
              liveViewport.range,
              liveViewport.count,
              snapshot?.bars.length ?? liveViewport.count,
              false,
            );
          liveViewport = null;
          revision = null;
          previousQuote = null;
          syncCache();
        }
      },
      refreshLineSource: () => {
        if (state.disposed) return;
        const points = [...bars.values()]
          .sort((a, b) => a.time - b.time)
          .map((bar) => ({
            time: bar.time as UTCTimestamp,
            value: sourcePrice(bar, lineChartSource.current),
          }));
        prices.line.setData(points);
        prices.area.setData(points);
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
    const hollowPoint = (bar: Candle, previous?: Candle) => ({
      ...bar,
      time: bar.time as UTCTimestamp,
      ...hollowCandleColors(bar, previous, candleColors.current),
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
          const formatters = createChartTimeFormatters(
            (time) => bars.get(time),
            chartTimeZone.current,
            intraday,
            true,
          );
          chart.applyOptions({
            localization: { timeFormatter: formatters.timeFormatter },
            timeScale: { tickMarkFormatter: formatters.tickMarkFormatter },
          });
        }
        bars.clear();
        for (const bar of sorted) bars.set(bar.time, bar);
        const ohlc = sorted.map((b) => ({ ...b, time: b.time as UTCTimestamp }));
        const sourcePoints = sorted.map((b) => ({
          time: b.time as UTCTimestamp,
          value: sourcePrice(b, lineChartSource.current),
        }));
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
        prices.line.setData(sourcePoints);
        prices.area.setData(sourcePoints);
        volume.setData(sorted.map(volumePoint));
        renderedTime = sorted.at(-1)?.time ?? -Infinity;
        replaceHistory = false;
      } else {
        for (const bar of changes) {
          const ohlc = { ...bar, time: bar.time as UTCTimestamp };
          const sourcePoint = {
            time: bar.time as UTCTimestamp,
            value: sourcePrice(bar, lineChartSource.current),
          };
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
          prices.line.update(sourcePoint);
          prices.area.update(sourcePoint);
          volume.update(volumePoint(bar));
          renderedTime = bar.time;
        }
      }
      const directionColor = hollowLatest
        ? hollowCandleColors(hollowLatest, hollowPrevious, candleColors.current).borderColor
        : "";
      if (directionColor !== prices.hollow.options().priceLineColor) {
        // Hollow bodies are transparent; their price label and line still use the direction color.
        prices.hollow.applyOptions({ priceLineColor: directionColor });
      }
      state.refreshIndicators();
      if (!fitted && bars.size) {
        chart
          .timeScale()
          .setVisibleLogicalRange({ from: Math.max(0, bars.size - 100), to: bars.size + 5 });
        fitted = true;
      }
      if (pendingViewport) {
        chart.timeScale().setVisibleLogicalRange(pendingViewport);
        pendingViewport = null;
      }
      const latest = bars.get(renderedTime) ?? null;
      state.refreshTradePrice();
      setLast(latest);
      barRevision++;
      for (const listener of barListeners) listener();
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
      state.refreshCountdown();
      setTickHistory(snapshot.tickHistory);
      receivedQuote = snapshot.quote !== null;
      if (snapshot.quote !== previousQuote) {
        previousQuote = snapshot.quote;
        onQuote?.(snapshot.quote);
        state.refreshTradePrice();
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
    const countdownTimer = window.setInterval(state.refreshCountdown, 1000);
    return () => {
      window.clearInterval(countdownTimer);
      document.fonts.removeEventListener("loadingdone", syncFont);
      fontObserver.disconnect();
      state.disposed = true;
      barListeners.clear();
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
        upColor: style === "hollow" ? "transparent" : settings.candleUpColor,
        downColor: settings.candleDownColor,
        borderUpColor: settings.candleBorderUpColor ?? settings.candleUpColor,
        borderDownColor: settings.candleBorderDownColor ?? settings.candleDownColor,
        wickUpColor: settings.candleWickUpColor ?? settings.candleUpColor,
        wickDownColor: settings.candleWickDownColor ?? settings.candleDownColor,
        wickVisible: settings.showCandleWicks,
        borderVisible: settings.showCandleBorders,
      });
    engine.prices.line.applyOptions({
      color: settings.lineChartColor,
      lineWidth: settings.lineChartWidth,
      pointMarkersVisible: settings.showLineMarkers,
      pointMarkersRadius: settings.lineMarkerRadius,
      lineType: settings.lineChartShape === "stepped" ? LineType.WithSteps : LineType.Simple,
    });
    engine.prices.area.applyOptions({
      lineColor: settings.lineChartColor,
      topColor: `${settings.lineChartColor}55`,
      bottomColor: `${settings.lineChartColor}00`,
      lineWidth: settings.lineChartWidth,
      pointMarkersVisible: settings.showLineMarkers,
      pointMarkersRadius: settings.lineMarkerRadius,
      lineType: settings.lineChartShape === "stepped" ? LineType.WithSteps : LineType.Simple,
    });
    engine.prices.bars.applyOptions({
      upColor: settings.candleUpColor,
      downColor: settings.candleDownColor,
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
      layout: {
        background: { type: ColorType.Solid, color: settings.chartBackgroundColor },
        textColor: settings.chartTextColor,
      },
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
    engine.refreshTradePrice();
  }, [
    engine,
    settings.style,
    settings.gridMode,
    settings.gridLineStyle,
    settings.gridColor,
    settings.chartBackgroundColor,
    settings.chartTextColor,
    settings.priceScaleMode,
    settings.invertScale,
    settings.crosshairMode,
    settings.crosshairColor,
    settings.crosshairLineStyle,
    settings.crosshairLineWidth,
    settings.thinBars,
    settings.showBarOpen,
    settings.candleUpColor,
    settings.candleDownColor,
    settings.candleWickUpColor,
    settings.candleWickDownColor,
    settings.candleBorderUpColor,
    settings.candleBorderDownColor,
    settings.showCandleWicks,
    settings.showCandleBorders,
    settings.lineChartColor,
    settings.lineChartWidth,
    settings.lineChartShape,
    settings.showLineMarkers,
    settings.lineMarkerRadius,
    settings.showPriceLine,
    settings.showPriceLabel,
  ]);

  useEffect(() => {
    if (!engine || engine.disposed || !settings.showSymbolWatermark || !symbol) return;
    const pane = engine.chart.panes()[0];
    const element = pane?.getHTMLElement();
    if (!pane || !element) return;
    const watermark = createTextWatermark(pane, {
      horzAlign: "center",
      vertAlign: "center",
    });
    let previousSize = -1;
    const resize = () => {
      if (engine.disposed) return;
      const fontSize = Math.max(
        12,
        Math.floor(Math.min(element.clientWidth / 7, element.clientHeight / 3, 120)),
      );
      if (fontSize === previousSize) return;
      previousSize = fontSize;
      watermark.applyOptions({
        lines: [
          {
            text: symbol,
            color: "rgba(146, 153, 167, 0.14)",
            fontSize,
            fontStyle: "bold",
            fontFamily: engine.chart.options().layout.fontFamily,
          },
        ],
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => {
      observer.disconnect();
      if (!engine.disposed) watermark.detach();
    };
  }, [engine, settings.showSymbolWatermark, symbol]);

  useEffect(() => {
    priceDisplay.current = {
      style: settings.style,
      line: settings.showPriceLine,
      label: settings.showPriceLabel,
      countdown: settings.showBarCountdown,
    };
    if (engine && !engine.disposed) engine.refreshTradePrice();
  }, [
    engine,
    settings.style,
    settings.showPriceLine,
    settings.showPriceLabel,
    settings.showBarCountdown,
  ]);

  const measuring =
    !!activeEngine && measureEngine === activeEngine && drawings.tool === "cursor" && !technicals;
  if (measureEngine && drawings.tool !== "cursor") setMeasureEngine(null);

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
      {goToDateOpen && activeEngine ? (
        <ChartGoToDateDialog
          key={`go-to-date:${symbol}:${chartIntervalKey(interval)}:${intraday ? settings.timeZone : "UTC"}`}
          chart={activeEngine.chart}
          source={activeEngine}
          symbol={symbol}
          timeZone={intraday ? settings.timeZone : "UTC"}
          onClose={() => setGoToDateOpen(false)}
        />
      ) : null}
      {tableOpen && activeEngine ? (
        <ChartDataTableDialog
          key={`${symbol}:${chartIntervalKey(interval)}`}
          source={activeEngine}
          symbol={symbol}
          intervalLabel={formatChartInterval(interval)}
          timeZone={intraday ? settings.timeZone : "UTC"}
          formatPrice={(price) => activeEngine.prices.candles.priceFormatter().format(price)}
          onClose={() => setTableOpen(false)}
        />
      ) : null}
      {templateDialog ? (
        <ChartTemplatesDialog
          initialMode={templateDialog}
          onClose={() => setTemplateDialog(null)}
        />
      ) : null}
      <ChartToolbar
        templateControl={
          <ChartTemplatesControl
            onSave={() => setTemplateDialog("save")}
            onManage={() => setTemplateDialog("manage")}
          />
        }
        displaySettingsOpen={displaySettingsOpen}
        onDisplaySettingsOpenChange={setDisplaySettingsOpen}
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
        candleDetailColors={{
          candleWickUpColor: settings.candleWickUpColor,
          candleWickDownColor: settings.candleWickDownColor,
          candleBorderUpColor: settings.candleBorderUpColor,
          candleBorderDownColor: settings.candleBorderDownColor,
        }}
        onCandleDetailColorChange={settings.setCandleDetailColor}
        candleUpColor={settings.candleUpColor}
        candleDownColor={settings.candleDownColor}
        onCandleUpColorChange={settings.setCandleUpColor}
        onCandleDownColorChange={settings.setCandleDownColor}
        showCandleWicks={settings.showCandleWicks}
        showCandleBorders={settings.showCandleBorders}
        showLineMarkers={settings.showLineMarkers}
        onToggleLineMarkers={settings.toggleLineMarkers}
        lineMarkerRadius={settings.lineMarkerRadius}
        onLineMarkerRadiusChange={settings.setLineMarkerRadius}
        lineChartShape={settings.lineChartShape}
        onLineChartShapeChange={settings.setLineChartShape}
        lineChartSource={settings.lineChartSource}
        onLineChartSourceChange={settings.setLineChartSource}
        lineChartColor={settings.lineChartColor}
        lineChartWidth={settings.lineChartWidth}
        onLineChartColorChange={settings.setLineChartColor}
        onLineChartWidthChange={settings.setLineChartWidth}
        onToggleCandleWicks={settings.toggleCandleWicks}
        onToggleCandleBorders={settings.toggleCandleBorders}
        showPriceLine={settings.showPriceLine}
        onTogglePriceLine={settings.togglePriceLine}
        showBarCountdown={settings.showBarCountdown}
        onToggleBarCountdown={settings.toggleBarCountdown}
        showPriceLabel={settings.showPriceLabel}
        onTogglePriceLabel={settings.togglePriceLabel}
        chartBackgroundColor={settings.chartBackgroundColor}
        chartTextColor={settings.chartTextColor}
        onChartBackgroundColorChange={settings.setChartBackgroundColor}
        onChartTextColorChange={settings.setChartTextColor}
        showSymbolWatermark={settings.showSymbolWatermark}
        onShowSymbolWatermarkChange={settings.setShowSymbolWatermark}
        showChartTitle={settings.showChartTitle}
        showCandleValues={settings.showCandleValues}
        indicatorLegendCollapsed={settings.indicatorLegendCollapsed}
        onShowChartTitleChange={settings.setShowChartTitle}
        onShowCandleValuesChange={settings.setShowCandleValues}
        onIndicatorLegendCollapsedChange={settings.setIndicatorLegendCollapsed}
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
        alertControl={
          <ChartAction
            label="Create alert (Alt+A)"
            disabled={technicals || (!drawings.selected && (!last || !onAddPriceAlert))}
            onClick={createAlert}
          >
            <AlertIcon name="alarm-add" size={22} />
          </ChartAction>
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
        navigationControl={navigationControl}
      />
      <ChartReplayControls
        key={`${symbol}:${chartIntervalKey(interval)}:${intraday ? settings.timeZone : "UTC"}`}
        replay={replay}
        timeZone={intraday ? settings.timeZone : "UTC"}
      />
      <div className="relative flex min-h-0 min-w-0 flex-1">
        {!measuring && (
          <DrawingSelectionOverlay
            drawings={drawings}
            onOpenObjectTree={() => setObjectTreeOpen(true)}
            onCreateAlert={setAlertDrawing}
          />
        )}
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
            measure={{
              active: measuring,
              disabled: !activeEngine || !last || technicals,
              toggle: () => {
                drawings.setTool("cursor");
                setMeasureEngine(measuring ? null : activeEngine);
              },
              close: () => setMeasureEngine(null),
            }}
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
              {measuring && activeEngine && (
                <ChartMeasureOverlay
                  key={`${settings.style}:${!!replay.session}`}
                  chart={activeEngine.chart}
                  series={activeEngine.prices[settings.style]}
                  source={activeEngine}
                  magnetMode={drawings.magnetMode}
                  onClose={() => setMeasureEngine(null)}
                />
              )}

              <DrawingInlineTextEditor
                chart={activeEngine?.chart ?? null}
                series={activeEngine?.prices[settings.style] ?? null}
                drawings={drawings}
              />
              {priceAlerts && onEditPriceAlert ? (
                <ChartPriceAlertsOverlay
                  chart={activeEngine?.chart ?? null}
                  series={activeEngine?.prices[settings.style] ?? null}
                  symbol={symbol}
                  controller={priceAlerts}
                  onEdit={onEditPriceAlert}
                />
              ) : null}
              <ChartContextMenu
                symbol={symbol}
                priceStep={activeEngine?.prices.candles.options().priceFormat.minMove ?? 0.01}
                onAddAlert={onAddPriceAlert}
                onOpenSettings={() => setDisplaySettingsOpen(true)}
                onOpenObjectTree={() => setObjectTreeOpen(true)}
                onOpenTable={() => setTableOpen(true)}
                onGoToDate={() => setGoToDateOpen(true)}
                onSaveTemplate={() => setTemplateDialog("save")}
                onManageTemplates={() => setTemplateDialog("manage")}
                indicators={{
                  count: indicatorInstances.length,
                  hidden: indicatorInstances.every((instance) => instance.hidden),
                  setHidden: settings.setIndicatorsHidden,
                  remove: settings.removeAllIndicators,
                }}
                chart={activeEngine?.chart ?? null}
                series={activeEngine?.prices[settings.style] ?? null}
                drawings={drawings}
              />
              <FavoriteDrawingToolbar drawings={drawings} />
              <div
                aria-label="Chart legend"
                className="pointer-events-none absolute left-2.5 right-20 top-2 z-10 text-xs"
              >
                {settings.showChartTitle && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Tooltip>
                      <TooltipTrigger
                        onClick={onSelectSymbol}
                        className="pointer-events-auto trading-heading truncate font-medium"
                        style={{ color: settings.chartTextColor }}
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
                )}
                {settings.showCandleValues && shown ? (
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
                canMoveUp: index > 0,
                canMoveDown: index < indicatorInstances.length - 1,
                onMove: (direction: "up" | "down") =>
                  settings.moveIndicatorInstance(instance.id, direction),
                onDrop: (sourceId: string, position: "before" | "after") =>
                  settings.moveIndicatorInstanceTo(sourceId, instance.id, position),
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
        <Tooltip>
          <TooltipTrigger
            type="button"
            aria-label="Go to date (Alt+G)"
            disabled={!last || technicals}
            onClick={() => setGoToDateOpen(true)}
            className="flex size-7 items-center justify-center rounded border-l border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-30"
          >
            <CalendarDaysIcon className="size-4" />
          </TooltipTrigger>
          <TooltipPopup>Go to date · Alt+G</TooltipPopup>
        </Tooltip>
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
        <TradingSelect
          label="Chart time zone"
          value={settings.timeZone}
          options={CHART_TIME_ZONES.map(({ value, label }) => [value, label] as const)}
          onChange={settings.setTimeZone}
          variant="ghost"
          className="h-7 w-28 text-[11px]"
        />
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
