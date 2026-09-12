import { TradingSelect } from "./TradingSelect";
import { ChartIcon } from "./ChartIcon";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { tradingWorkspaceStorage } from "./workspaceStorage";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

const MARKETS = [
  { symbol: "NASDAQ:QQQ", label: "QQQ · Nasdaq 100" },
  { symbol: "AMEX:SPY", label: "SPY · S&P 500" },
  { symbol: "AMEX:GLD", label: "GLD · Gold" },
  { symbol: "COINBASE:BTCUSD", label: "BTC · Bitcoin" },
  { symbol: "FX:EURUSD", label: "EUR/USD" },
] as const;

const VIEWS = ["Chart", "Technicals", "Calendar", "News"] as const;
type TradingView = (typeof VIEWS)[number];

const useTradingPreferences = create<{
  symbol: string;
  setSymbol: (symbol: string) => void;
}>()(
  persist((set) => ({ symbol: MARKETS[0].symbol, setSymbol: (symbol) => set({ symbol }) }), {
    name: "automorphic:trading:v1",
    storage: createJSONStorage(() => tradingWorkspaceStorage),
    skipHydration: true,
  }),
);

tradingWorkspaceStorage.registerHydrator(() => {
  useTradingPreferences.setState(useTradingPreferences.getInitialState(), true);
  return useTradingPreferences.persist.rehydrate();
});

function widgetSpec(view: TradingView, symbol: string) {
  const common = {
    width: "100%",
    height: "100%",
    colorTheme: "dark",
    locale: "en",
    isTransparent: false,
  };
  switch (view) {
    case "Chart":
      return {
        script: "embed-widget-advanced-chart.js",
        config: {
          autosize: true,
          symbol,
          interval: "60",
          timezone: "America/New_York",
          theme: "dark",
          style: "1",
          locale: "en",
          backgroundColor: "rgba(19, 23, 34, 1)",
          allow_symbol_change: false,
          hide_side_toolbar: false,
          hide_top_toolbar: false,
          save_image: true,
          calendar: false,
          support_host: "https://www.tradingview.com",
        },
      };
    case "Technicals":
      return {
        script: "embed-widget-technical-analysis.js",
        config: {
          ...common,
          symbol,
          interval: "1h",
          displayMode: "single",
          showIntervalTabs: true,
        },
      };
    case "Calendar":
      return {
        script: "embed-widget-events.js",
        config: { ...common, importanceFilter: "0,1", countryFilter: "us,ca,eu,gb,jp" },
      };
    case "News":
      return {
        script: "embed-widget-timeline.js",
        config: { ...common, feedMode: "symbol", symbol, displayMode: "regular" },
      };
  }
}

function TradingWidget({ view, symbol }: { view: TradingView; symbol: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    // A fresh owned wrapper prevents a late script from attaching to a subsequent widget.
    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container";
    wrapper.dataset.attempt = String(attempt);
    wrapper.style.cssText = "height:100%;width:100%";
    const target = document.createElement("div");
    target.className = "tradingview-widget-container__widget";
    target.style.cssText = "height:100%;width:100%";
    const spec = widgetSpec(view, symbol);
    const script = document.createElement("script");
    script.src = `https://s3.tradingview.com/external-embedding/${spec.script}`;
    script.async = true;
    script.textContent = JSON.stringify(spec.config);
    const onError = () => {
      if (wrapper.isConnected) setFailed(true);
    };
    script.addEventListener("error", onError);
    wrapper.append(target, script);
    host.append(wrapper);
    return () => {
      script.removeEventListener("error", onError);
      wrapper.remove();
    };
  }, [view, symbol, attempt]);

  return (
    <div className="relative h-full min-h-0 w-full">
      <div ref={container} className="h-full w-full" aria-label={`TradingView ${view}`} />
      {failed ? (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center text-sm"
        >
          <p>TradingView couldn’t load. Check your connection or content blocker.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function TradingViewEmbedPanel({
  expanded,
  settingsControl,
  onToggleExpand,
  navigationControl,
  panelActions,
}: {
  expanded: boolean;
  settingsControl?: ReactNode;
  navigationControl?: ReactNode;
  panelActions?: ReactNode;
  onToggleExpand?: (() => void) | undefined;
}) {
  const symbol = useTradingPreferences((state) => state.symbol);
  const setSymbol = useTradingPreferences((state) => state.setSymbol);
  const [view, setView] = useState<TradingView>("Chart");
  const selectedSymbol = MARKETS.some((market) => market.symbol === symbol)
    ? symbol
    : MARKETS[0].symbol;

  return (
    <section aria-label="Trading panel" className="flex h-full min-h-0 flex-col bg-[#131722]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2">
        {navigationControl}
        <label className="sr-only" htmlFor="trading-market">
          Market
        </label>
        <TradingSelect
          id="trading-market"
          label="Market"
          value={selectedSymbol}
          onChange={setSymbol}
          options={MARKETS.map((market) => [market.symbol, market.label] as const)}
          className="min-w-0 flex-1"
        />
        {panelActions}
        {onToggleExpand ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleExpand}
            aria-label={expanded ? "Restore chat and chart" : "Expand chart"}
          >
            {expanded ? (
              <ChartIcon name="minimize" className="size-4" />
            ) : (
              <ChartIcon name="maximize" className="size-4" />
            )}
          </Button>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <a
                aria-label="Open in TradingView"
                href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(selectedSymbol)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              />
            }
          >
            <ChartIcon name="external-link" className="size-4" />
          </TooltipTrigger>
          <TooltipPopup>Open in TradingView</TooltipPopup>
        </Tooltip>
      </div>
      <div
        className="flex gap-1 border-b border-border bg-background p-1.5"
        role="tablist"
        aria-label="Trading views"
      >
        {VIEWS.map((item, index) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`trading-tab-${item}`}
            aria-controls={`trading-view-${item}`}
            aria-selected={view === item}
            tabIndex={view === item ? 0 : -1}
            onClick={() => setView(item)}
            onKeyDown={(event) => {
              const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (!offset) return;
              event.preventDefault();
              const next = VIEWS[(index + offset + VIEWS.length) % VIEWS.length]!;
              setView(next);
              document.getElementById(`trading-tab-${next}`)?.focus();
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              view === item
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        {/* Keep the chart mounted across widget tabs so its drawings and viewport survive. */}
        <div
          id="trading-view-Chart"
          role="tabpanel"
          aria-labelledby="trading-tab-Chart"
          hidden={view !== "Chart"}
          className="h-full min-h-0"
        >
          <TradingWidget key={selectedSymbol} view="Chart" symbol={selectedSymbol} />
        </div>
        {view !== "Chart" ? (
          <div
            id={`trading-view-${view}`}
            role="tabpanel"
            aria-labelledby={`trading-tab-${view}`}
            className="h-full min-h-0"
          >
            <TradingWidget key={`${view}:${selectedSymbol}`} view={view} symbol={selectedSymbol} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1 border-t border-border bg-background px-3 py-1.5 text-[10px] text-muted-foreground">
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground"
        >
          Charts and market data by TradingView
        </a>
        <span>Data may be delayed · Broker not connected</span>
        {settingsControl}
      </div>
    </section>
  );
}
