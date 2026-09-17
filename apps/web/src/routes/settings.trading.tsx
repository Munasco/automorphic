import { createFileRoute } from "@tanstack/react-router";
import { Button } from "../components/ui/button";
import {
  tradingWorkspaceStorage,
  useTradingWorkspace,
} from "../components/trading/workspaceStorage";
import { TradingSelect } from "../components/trading/TradingSelect";
import { Switch } from "../components/ui/switch";
import { useTradingPreferences } from "../components/trading/tradingPreferences";
function TradingSettings() {
  const settings = useTradingPreferences();
  const workspace = useTradingWorkspace();
  if (!workspace.ready)
    return (
      <div className="space-y-3 p-6 text-sm text-muted-foreground">
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
    <div className="trading-surface mx-auto w-full max-w-3xl space-y-8 p-6 sm:p-8">
      <div>
        <h1 className="text-lg font-semibold">Trading</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chart and news preferences for {workspace.title}.
        </p>
      </div>
      {workspace.error ? (
        <div role="alert" className="flex items-center gap-3 text-xs text-amber-400">
          <span>{workspace.error}</span>
          <Button variant="outline" size="sm" onClick={() => void tradingWorkspaceStorage.flush()}>
            Retry
          </Button>
        </div>
      ) : null}
      <section className="rounded-lg border border-border">
        <div className="flex items-center justify-between gap-6 border-b border-border p-5">
          <div>
            <label htmlFor="trading-retention" className="text-sm font-medium">
              Temporary data
            </label>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Clean up expired news and cached data. Saved charts, drawings and preferences stay.
            </p>
          </div>
          <TradingSelect
            id="trading-retention"
            label="Temporary data"
            value={String(workspace.retentionHours)}
            onChange={(value) =>
              tradingWorkspaceStorage.setRetentionHours(value === "24" ? 24 : 168)
            }
            options={[
              ["24", "24 hours"],
              ["168", "7 days"],
            ]}
            className="w-32 shrink-0"
          />
        </div>
        <div id="tradingview-charts" className="flex items-center justify-between gap-6 p-5">
          <div>
            <label htmlFor="tradingview-toggle" className="text-sm font-medium">
              Use TradingView charts
            </label>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Use TradingView’s hosted widget. Turn off for Automorphic’s MGC, MNQ, GC, and NQ
              charts with Tradovate data. Some futures are restricted in hosted widgets.
            </p>
          </div>
          <Switch
            id="tradingview-toggle"
            checked={settings.useTradingView}
            onCheckedChange={settings.setTradingView}
          />
        </div>
      </section>
      <p className="text-xs text-muted-foreground">
        Tradovate credentials are managed by your server. Chart preferences do not enable order
        execution.
      </p>
    </div>
  );
}
export const Route = createFileRoute("/settings/trading")({ component: TradingSettings });
