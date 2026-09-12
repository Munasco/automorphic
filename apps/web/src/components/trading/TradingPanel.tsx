import { chartIntervalKey } from "./tradingIntervals";
import { ChartViewMenu, type ChartView } from "./ChartViewMenu";
import {
  INSTRUMENTS,
  INSTRUMENT_ROOTS,
  rootFromSymbol,
  type InstrumentRoot,
} from "./tradingInstruments";
import { AlertIcon } from "./AlertIcon";
import { WatchlistPanel } from "./WatchlistPanel";
import { tradingFetch } from "./tradingTransport";
import { ChartAlerts, useChartAlerts } from "./ChartAlertsPanel";
import { ChartIcon } from "./ChartIcon";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "../ui/button";
import { useTradingPreferences } from "./tradingPreferences";
import { TradovateChart } from "./TradovateChart";
import { TradingViewEmbedPanel } from "./TradingViewEmbedPanel";
import { LiveWires } from "./LiveWires";
import { InstrumentHeader, type MarketQuote } from "./InstrumentHeader";
import { SymbolPicker, type FuturesContract } from "./SymbolPicker";
import { SolarSettingsIcon } from "./SolarSettingsIcon";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { tradingWorkspaceStorage, useTradingWorkspace } from "./workspaceStorage";

function ReadyTradingPanel({
  projectId,
  expanded,
  onToggleExpand,
  aiOpen,
  onToggleAi,
}: {
  projectId: string | null;
  expanded: boolean;
  onToggleExpand?: (() => void) | undefined;
  aiOpen?: boolean | undefined;
  onToggleAi?: (() => void) | undefined;
}) {
  const settings = useTradingPreferences();
  const [view, setView] = useState<ChartView>("chart");
  const [technicalSource, setTechnicalSource] = useState<string | null>(null);
  const [contracts, setContracts] = useState<FuturesContract[]>([]);
  const [errors, setErrors] = useState<Partial<Record<InstrumentRoot, string>>>({});
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const request = useRef<AbortController | null>(null);
  const loadContracts = useCallback(async (signal: AbortSignal) => {
    const results = await Promise.allSettled(
      INSTRUMENT_ROOTS.map(async (root) => {
        const response = await tradingFetch(`/api/trading/contracts?root=${root}`, {
          signal,
          credentials: "same-origin",
        });
        if (!response.ok)
          throw Error("Could not load Tradovate contracts. Check the server session.");
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw Error("Invalid contract response.");
        const valid = data
          .filter(
            (item): item is { id: number; name: string } =>
              typeof item === "object" &&
              item !== null &&
              typeof item.id === "number" &&
              typeof item.name === "string" &&
              rootFromSymbol(item.name) === root,
          )
          .map((item) => ({ ...item, root }));
        if (!valid.length) throw Error("No contracts available.");
        return valid;
      }),
    );
    if (signal.aborted) return;
    const nextErrors: Partial<Record<InstrumentRoot, string>> = {};
    const nextContracts: FuturesContract[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") nextContracts.push(...result.value);
      else
        nextErrors[INSTRUMENT_ROOTS[index]!] =
          result.reason instanceof Error ? result.reason.message : "Contract lookup failed.";
    });
    // A temporary refresh failure must not tear down an already loaded chart.
    setContracts((previous) => [
      ...nextContracts,
      ...previous.filter((contract) => nextErrors[contract.root]),
    ]);
    setErrors(nextErrors);
    setLoading(false);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    request.current = abort;
    // State changes occur only after both network requests settle.
    // eslint-disable-next-line react/set-state-in-effect
    void loadContracts(abort.signal);
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      request.current?.abort();
      request.current = new AbortController();
      void loadContracts(request.current.signal);
    };
    const timer = window.setInterval(refresh, 15 * 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      request.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [loadContracts]);
  const symbol =
    contracts.find(
      (contract) => contract.root === settings.root && contract.name === settings.selectedSymbol,
    )?.name ??
    contracts.find((contract) => contract.root === settings.root)?.name ??
    "";
  const technicalsAvailable =
    !settings.useTradingView &&
    technicalSource === `${symbol}:${chartIntervalKey(settings.interval)}`;
  const activeView = view === "technicals" && !technicalsAvailable ? "chart" : view;
  const handleTechnicalsAvailability = useCallback(
    (available: boolean) =>
      setTechnicalSource(available ? `${symbol}:${chartIntervalKey(settings.interval)}` : null),
    [symbol, settings.interval],
  );
  const alerts = useChartAlerts(symbol);
  const { observeQuote } = alerts;
  const handleQuote = useCallback(
    (next: MarketQuote | null) => {
      observeQuote(next);
      setQuote(next);
    },
    [observeQuote],
  );
  const [sideView, setSideView] = useState<"watchlist" | "alerts" | null>(null);
  const error = errors[settings.root];
  const settingsControl = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to="/settings/trading"
            aria-label="Trading settings"
            className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          />
        }
      >
        <SolarSettingsIcon className="size-[17px]" />
      </TooltipTrigger>
      <TooltipPopup>Trading settings</TooltipPopup>
    </Tooltip>
  );
  const navigationControl = (
    <ChartViewMenu
      view={activeView}
      technicalsAvailable={technicalsAvailable}
      onChange={(next) => {
        setView(next);
        if (next !== "chart") setSideView(null);
      }}
    />
  );
  const panelActions = (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      {!settings.useTradingView
        ? [
            { name: "list-details" as const, label: "Watchlist", view: "watchlist" as const },
            { name: "bell" as const, label: "Price alerts", view: "alerts" as const },
          ].map((item) => (
            <Tooltip key={item.view}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={item.label}
                    aria-pressed={sideView === item.view}
                    onClick={() => {
                      setView("chart");
                      setSideView(sideView === item.view ? null : item.view);
                    }}
                    className={cn(
                      "relative flex size-7 items-center justify-center rounded hover:bg-accent",
                      sideView === item.view ? "text-blue-400 bg-accent" : "text-muted-foreground",
                    )}
                  />
                }
              >
                {item.view === "alerts" ? (
                  <AlertIcon name="alarm" size={22} />
                ) : (
                  <ChartIcon name={item.name} className="size-5" />
                )}
                {item.view === "alerts" && alerts.activeCount > 0 ? (
                  <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-blue-400" />
                ) : null}
              </TooltipTrigger>
              <TooltipPopup>{item.label}</TooltipPopup>
            </Tooltip>
          ))
        : null}
      {expanded && onToggleAi ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Toggle AI chat"
                aria-pressed={aiOpen}
                onClick={onToggleAi}
                className={cn(
                  "flex size-7 items-center justify-center rounded hover:bg-accent",
                  aiOpen ? "text-blue-400 bg-accent" : "text-muted-foreground",
                )}
              />
            }
          >
            <ChartIcon name="message-chatbot" className="size-5" />
          </TooltipTrigger>
          <TooltipPopup>AI chat</TooltipPopup>
        </Tooltip>
      ) : null}
      {onToggleExpand && !expanded ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={onToggleExpand}
                aria-label="Expand chart"
                className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              />
            }
          >
            <ChartIcon name="maximize" className="size-5" />
          </TooltipTrigger>
          <TooltipPopup>Expand chart</TooltipPopup>
        </Tooltip>
      ) : null}
    </div>
  );
  return (
    <section
      aria-label="Trading panel"
      className="trading-surface @container flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
    >
      {!expanded && !settings.useTradingView ? (
        <InstrumentHeader
          root={settings.root}
          symbol={symbol}
          quote={quote}
          onSelect={() => setPickerOpen(true)}
        />
      ) : null}
      <SymbolPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        contracts={contracts}
        selected={symbol}
        loading={loading}
        onSelect={(contract) => {
          settings.setRoot(contract.root);
          settings.setSelectedSymbol(contract.name);
        }}
      />
      {activeView === "news" ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
          {navigationControl}
          <span className="text-xs text-muted-foreground">News</span>
          <div className="ml-auto flex items-center">
            {settingsControl}
            {panelActions}
          </div>
        </div>
      ) : null}
      {error && !settings.useTradingView ? (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-border p-3 text-xs text-amber-400"
        >
          <p className="flex-1">{error}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => {
              request.current?.abort();
              request.current = new AbortController();
              setLoading(true);
              void loadContracts(request.current.signal);
            }}
          >
            {loading ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : null}
      <div
        className={cn("relative min-h-0 min-w-0 flex-1", activeView !== "news" ? "flex" : "hidden")}
      >
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {settings.useTradingView ? (
            <TradingViewEmbedPanel
              expanded={expanded}
              settingsControl={settingsControl}
              navigationControl={navigationControl}
              panelActions={panelActions}
            />
          ) : (
            <TradovateChart
              key={`${symbol}:${chartIntervalKey(settings.interval)}`}
              symbol={symbol}
              interval={settings.interval}
              onQuote={handleQuote}
              root={settings.root}
              onSelectSymbol={() => setPickerOpen(true)}
              onIntervalChange={settings.setInterval}
              panelActions={panelActions}
              navigationControl={navigationControl}
              technicals={activeView === "technicals"}
              onTechnicalsAvailabilityChange={handleTechnicalsAvailability}
              settingsControl={settingsControl}
            />
          )}
        </div>
        {sideView && !settings.useTradingView ? (
          <aside
            aria-label={sideView === "alerts" ? "Chart alerts sidebar" : "Chart watchlist sidebar"}
            className="absolute inset-y-0 right-0 z-20 flex w-[min(300px,100%)] flex-col overflow-hidden border-l border-border bg-background shadow-xl @min-[800px]:static @min-[800px]:h-full @min-[800px]:shrink-0 @min-[800px]:shadow-none"
          >
            {sideView === "alerts" ? (
              <ChartAlerts
                key={symbol}
                controller={alerts}
                symbol={symbol}
                lastPrice={quote?.last}
                onClose={() => setSideView(null)}
              />
            ) : (
              <WatchlistPanel
                contracts={contracts}
                selected={symbol}
                onClose={() => setSideView(null)}
                onSelect={(contract) => {
                  setContracts((current) => [
                    ...current.filter((item) => item.root !== contract.root),
                    contract,
                  ]);
                  settings.setRoot(contract.root);
                  settings.setSelectedSymbol(contract.name);
                }}
              />
            )}
          </aside>
        ) : null}
      </div>
      {activeView === "news" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <LiveWires
            root={INSTRUMENTS[settings.root].family === "gold" ? "MGC" : "NQ"}
            projectId={projectId}
          />
        </div>
      ) : null}
    </section>
  );
}

export function TradingPanel(props: {
  projectId: string | null;
  expanded: boolean;
  onToggleExpand?: (() => void) | undefined;
  aiOpen?: boolean | undefined;
  onToggleAi?: (() => void) | undefined;
}) {
  const workspace = useTradingWorkspace(props.projectId);
  if (!workspace.ready)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-sm text-muted-foreground">
        <p role={workspace.error ? "alert" : "status"}>
          {workspace.error ?? "Opening trading workspace…"}
        </p>
        {workspace.error ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void tradingWorkspaceStorage.initialize()}
          >
            Retry
          </Button>
        ) : null}
      </div>
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      {workspace.error ? (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-amber-400"
        >
          <span className="flex-1">{workspace.error}</span>
          <Button variant="outline" size="sm" onClick={() => void tradingWorkspaceStorage.flush()}>
            Retry
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ReadyTradingPanel key={props.projectId ?? "default"} {...props} />
      </div>
    </div>
  );
}
