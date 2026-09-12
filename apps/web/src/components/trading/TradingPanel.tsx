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
  const [view, setView] = useState<"chart" | "news">("chart");
  const activeView = expanded ? "chart" : view;
  const [contracts, setContracts] = useState<FuturesContract[]>([]);
  const selected = settings.selectedSymbol;
  const [errors, setErrors] = useState<Partial<Record<"MGC" | "NQ", string>>>({});
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const request = useRef<AbortController | null>(null);
  const loadContracts = useCallback(async (signal: AbortSignal) => {
    const results = await Promise.allSettled(
      (["MGC", "NQ"] as const).map(async (root) => {
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
              item.name.startsWith(root),
          )
          .map((item) => ({ ...item, root }));
        if (!valid.length) throw Error("No contracts available.");
        return valid;
      }),
    );
    if (signal.aborted) return;
    const nextErrors: Partial<Record<"MGC" | "NQ", string>> = {};
    const nextContracts: FuturesContract[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") nextContracts.push(...result.value);
      else
        nextErrors[index === 0 ? "MGC" : "NQ"] =
          result.reason instanceof Error ? result.reason.message : "Contract lookup failed.";
    });
    setContracts(nextContracts);
    setErrors(nextErrors);
    setLoading(false);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    request.current = abort;
    // State changes occur only after both network requests settle.
    // eslint-disable-next-line react/set-state-in-effect
    void loadContracts(abort.signal);
    return () => request.current?.abort();
  }, [loadContracts]);
  const symbol =
    contracts.find((contract) => contract.root === settings.root && contract.name === selected)
      ?.name ??
    contracts.find((contract) => contract.root === settings.root)?.name ??
    "";
  const alerts = useChartAlerts(symbol);
  const { observeQuote } = alerts;
  const handleQuote = useCallback(
    (next: MarketQuote | null) => {
      observeQuote(next);
      setQuote(next);
    },
    [observeQuote],
  );
  const [sideView, setSideView] = useState<"contracts" | "alerts" | null>(null);
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
  const panelActions = (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      {!settings.useTradingView
        ? [
            { name: "list-details" as const, label: "Contracts", view: "contracts" as const },
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
                <ChartIcon name={item.name} className="size-5" />
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
      {!expanded && (
        <nav
          className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1"
          aria-label="Trading views"
        >
          <button
            type="button"
            aria-pressed={activeView === "chart"}
            onClick={() => setView("chart")}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-semibold",
              activeView === "chart" ? "bg-accent" : "text-muted-foreground",
            )}
          >
            Chart
          </button>
          <button
            type="button"
            aria-pressed={activeView === "news"}
            onClick={() => setView("news")}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-semibold",
              activeView === "news" ? "bg-accent" : "text-muted-foreground",
            )}
          >
            Live Wires
          </button>
          {activeView === "news" ? (
            <div className="ml-auto flex items-center">
              {settingsControl}
              {panelActions}
            </div>
          ) : settings.useTradingView ? (
            panelActions
          ) : null}
        </nav>
      )}
      {expanded && settings.useTradingView ? (
        <div className="flex shrink-0 items-center justify-end border-b border-border px-2 py-1">
          {panelActions}
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
        className={cn(
          "relative min-h-0 min-w-0 flex-1",
          activeView === "chart" ? "flex" : "hidden",
        )}
      >
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {settings.useTradingView ? (
            <TradingViewEmbedPanel expanded={expanded} settingsControl={settingsControl} />
          ) : (
            <TradovateChart
              key={`${symbol}:${settings.interval}`}
              symbol={symbol}
              interval={settings.interval}
              onQuote={handleQuote}
              root={settings.root}
              onSelectSymbol={() => setPickerOpen(true)}
              onIntervalChange={settings.setInterval}
              panelActions={panelActions}
              settingsControl={settingsControl}
            />
          )}
        </div>
        {sideView && !settings.useTradingView ? (
          <aside
            aria-label={sideView === "alerts" ? "Chart alerts sidebar" : "Chart contracts sidebar"}
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
              <>
                <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
                  <h2 className="text-xs font-semibold">Contracts</h2>
                  <button
                    type="button"
                    aria-label="Close contracts"
                    onClick={() => setSideView(null)}
                    className="rounded px-2 py-1 text-muted-foreground hover:bg-accent"
                  >
                    ×
                  </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-1">
                  {contracts.map((contract) => (
                    <button
                      key={contract.id}
                      type="button"
                      aria-pressed={symbol === contract.name}
                      onClick={() => {
                        settings.setRoot(contract.root);
                        settings.setSelectedSymbol(contract.name);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded px-3 py-2.5 text-sm",
                        symbol === contract.name
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent/50",
                      )}
                    >
                      <span className="font-medium">{contract.name}</span>
                      <span className="text-xs">
                        {contract.root === "MGC" ? "Micro Gold" : "Nasdaq 100"}
                      </span>
                    </button>
                  ))}
                  {!contracts.length ? (
                    <p className="p-3 text-xs text-muted-foreground">
                      {loading ? "Loading contracts…" : "No contracts available."}
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </aside>
        ) : null}
      </div>
      {activeView === "news" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <LiveWires root={settings.root} projectId={projectId} />
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
