import { tradingFetch } from "./tradingTransport";
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
}: {
  projectId: string | null;
  expanded: boolean;
  onToggleExpand?: (() => void) | undefined;
}) {
  const settings = useTradingPreferences();
  const [view, setView] = useState<"chart" | "news">("chart");
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
      {onToggleExpand ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={onToggleExpand}
                aria-label={expanded ? "Restore chat and chart" : "Expand chart"}
                className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              />
            }
          >
            {expanded ? (
              <ChartIcon name="minimize" className="size-4" />
            ) : (
              <ChartIcon name="maximize" className="size-4" />
            )}
          </TooltipTrigger>
          <TooltipPopup>{expanded ? "Restore chat and chart" : "Expand chart"}</TooltipPopup>
        </Tooltip>
      ) : null}
    </div>
  );
  return (
    <section
      aria-label="Trading panel"
      className="trading-surface @container flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
    >
      {!settings.useTradingView ? (
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
      <nav
        className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1"
        aria-label="Trading views"
      >
        <button
          type="button"
          aria-pressed={view === "chart"}
          onClick={() => setView("chart")}
          className={cn(
            "rounded px-3 py-1.5 text-xs font-semibold",
            view === "chart" ? "bg-accent" : "text-muted-foreground",
          )}
        >
          Chart
        </button>
        <button
          type="button"
          aria-pressed={view === "news"}
          onClick={() => setView("news")}
          className={cn(
            "rounded px-3 py-1.5 text-xs font-semibold",
            view === "news" ? "bg-accent" : "text-muted-foreground",
          )}
        >
          Live Wires
        </button>
        {view === "news" ? (
          <div className="ml-auto flex items-center">
            {settingsControl}
            {panelActions}
          </div>
        ) : settings.useTradingView ? (
          panelActions
        ) : null}
      </nav>
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
      <div className={cn("min-h-0 min-w-0 flex-1", view === "chart" ? "flex" : "hidden")}>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {settings.useTradingView ? (
            <TradingViewEmbedPanel expanded={expanded} settingsControl={settingsControl} />
          ) : (
            <TradovateChart
              key={`${symbol}:${settings.interval}`}
              symbol={symbol}
              interval={settings.interval}
              onQuote={setQuote}
              root={settings.root}
              onSelectSymbol={() => setPickerOpen(true)}
              onIntervalChange={settings.setInterval}
              panelActions={panelActions}
              settingsControl={settingsControl}
            />
          )}
        </div>
        {settings.showLiveWires ? (
          <aside className="hidden h-full w-[300px] shrink-0 overflow-hidden border-l border-border @min-[800px]:block">
            <LiveWires root={settings.root} projectId={projectId} />
          </aside>
        ) : null}
      </div>
      {view === "news" ? (
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
