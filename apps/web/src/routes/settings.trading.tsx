import { createFileRoute } from "@tanstack/react-router";
import { Switch } from "../components/ui/switch";
import { useTradingPreferences } from "../components/trading/tradingPreferences";
function TradingSettings() {
  const settings = useTradingPreferences();
  return (
    <div className="trading-surface mx-auto w-full max-w-3xl space-y-8 p-6 sm:p-8">
      <div>
        <h1 className="text-lg font-semibold">Trading</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chart and news preferences for this device.
        </p>
      </div>
      <section className="rounded-lg border border-border">
        <div
          id="trading-live-wires"
          className="flex items-center justify-between gap-6 border-b border-border p-5"
        >
          <div>
            <label htmlFor="wires-toggle" className="text-sm font-medium">
              Show Live Wires beside the chart
            </label>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Show the news rail when the panel is wide enough. News is always available from the
              Live Wires tab.
            </p>
          </div>
          <Switch
            id="wires-toggle"
            checked={settings.showLiveWires}
            onCheckedChange={settings.setLiveWires}
          />
        </div>
        <div id="tradingview-charts" className="flex items-center justify-between gap-6 p-5">
          <div>
            <label htmlFor="tradingview-toggle" className="text-sm font-medium">
              Use TradingView charts
            </label>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Use TradingView’s hosted widget. Turn off for Automorphic’s MGC and NQ charts with
              Tradovate data. Some futures are restricted in hosted widgets.
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
