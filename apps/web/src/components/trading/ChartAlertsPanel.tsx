import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { toastManager } from "../ui/toast";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import { createChartAlertSession, type AlertCondition, type ChartAlertState } from "./chartAlerts";

const EMPTY: ChartAlertState = { alerts: [], history: [] };
const priceLabel = (price: number) => price.toLocaleString("en-US", { maximumFractionDigits: 6 });
const conditionLabel: Record<AlertCondition, string> = {
  crossing: "Crossing",
  above: "Above",
  below: "Below",
};

/** Keep this hook mounted with the chart; the alert editor can open and close independently. */
export function useChartAlerts(symbol: string) {
  const workspace = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    tradingWorkspaceStorage.getSnapshot,
  );
  const session = useMemo(
    () =>
      createChartAlertSession(symbol, tradingWorkspaceStorage.capture(), {
        onTrigger: (event) =>
          toastManager.add({
            type: "info",
            title: `${event.symbol} price alert`,
            description: `${conditionLabel[event.condition]} ${priceLabel(event.target)} · Last ${priceLabel(event.price)}`,
          }),
      }),
    // oxlint-disable-next-line react/memo-dependencies -- A workspace switch/hydration must re-open its persisted alert session.
    [symbol, workspace.projectId, workspace.ready],
  );
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, () => EMPTY);
  return {
    ...session,
    ...state,
    activeCount: state.alerts.filter((alert) => alert.enabled && alert.symbol === symbol).length,
  };
}

export type ChartAlertsController = ReturnType<typeof useChartAlerts>;
const fieldClass =
  "mt-1 h-8 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-blue-400";
const actionClass =
  "rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400";

export function ChartAlerts({
  controller,
  symbol,
  lastPrice,
  onClose,
}: {
  controller: ChartAlertsController;
  symbol: string;
  lastPrice?: number | undefined;
  onClose?: (() => void) | undefined;
}) {
  const formId = useId();
  const [target, setTarget] = useState(() => (Number.isFinite(lastPrice) ? String(lastPrice) : ""));
  const [condition, setCondition] = useState<AlertCondition>("crossing");
  const [repeat, setRepeat] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(60_000);
  const [error, setError] = useState("");
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-[#0b0d12] text-zinc-300"
      aria-label="Price alerts"
    >
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800 px-3">
        <h2 className="text-xs font-semibold">Price alerts</h2>
        {onClose ? (
          <button
            type="button"
            className={actionClass}
            onClick={onClose}
            aria-label="Close price alerts"
          >
            Close
          </button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <form
          className="space-y-3 border-b border-zinc-800 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              if (!target.trim()) throw Error("Enter a target price.");
              controller.add({ price: Number(target), condition, repeat, cooldownMs });
              setError("");
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Could not create the alert.");
            }
          }}
        >
          <p className="text-xs font-medium text-zinc-100">
            Create for {symbol || "selected contract"}
          </p>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            In-app alerts run while this chart is open and receiving live quotes for the selected
            contract. Other contracts wait until selected. No email or push delivery.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label htmlFor={`${formId}-condition`} className="text-[11px] text-zinc-400">
              Condition
              <select
                id={`${formId}-condition`}
                className={fieldClass}
                value={condition}
                onChange={(event) => setCondition(event.target.value as AlertCondition)}
              >
                <option value="crossing">Crossing</option>
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
            </label>
            <label htmlFor={`${formId}-price`} className="text-[11px] text-zinc-400">
              Target price
              <input
                id={`${formId}-price`}
                className={fieldClass}
                type="number"
                step="any"
                inputMode="decimal"
                required
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
            </label>
          </div>
          {Number.isFinite(lastPrice) ? (
            <button
              type="button"
              className="text-[11px] text-blue-400 hover:text-blue-300"
              onClick={() => setTarget(String(lastPrice))}
            >
              Use last price · {priceLabel(lastPrice!)}
            </button>
          ) : null}
          <label htmlFor={`${formId}-repeat`} className="block text-[11px] text-zinc-400">
            Frequency
            <select
              id={`${formId}-repeat`}
              className={fieldClass}
              value={repeat ? "repeat" : "once"}
              onChange={(event) => setRepeat(event.target.value === "repeat")}
            >
              <option value="once">Once, then disable</option>
              <option value="repeat">Repeating</option>
            </select>
          </label>
          {repeat ? (
            <label htmlFor={`${formId}-cooldown`} className="block text-[11px] text-zinc-400">
              Minimum time between alerts
              <select
                id={`${formId}-cooldown`}
                className={fieldClass}
                value={cooldownMs}
                onChange={(event) => setCooldownMs(Number(event.target.value))}
              >
                <option value={60_000}>1 minute</option>
                <option value={300_000}>5 minutes</option>
                <option value={900_000}>15 minutes</option>
              </select>
            </label>
          ) : null}
          <p className="text-[11px] leading-relaxed text-zinc-500">
            {condition === "crossing"
              ? "Crossing needs two new quotes after activation. Reconnecting starts a new baseline."
              : repeat
                ? "Triggers on a new qualifying quote, then again after the cooldown if price still qualifies."
                : "Triggers on the next new quote strictly above or below the target."}
          </p>
          {error ? (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!symbol}
            className="h-8 w-full rounded bg-blue-500/15 text-xs font-medium text-blue-300 hover:bg-blue-500/25 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
          >
            Create alert
          </button>
        </form>
        <div className="border-b border-zinc-800 p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Workspace alerts · {controller.alerts.length}
          </h3>
          {!controller.alerts.length ? (
            <p className="py-2 text-xs text-zinc-500">No alerts yet.</p>
          ) : null}
          <ul className="space-y-2">
            {controller.alerts.map((alert) => (
              <li key={alert.id} className="rounded border border-zinc-800 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-200">
                      {alert.symbol} · {conditionLabel[alert.condition]} {priceLabel(alert.price)}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {alert.enabled
                        ? alert.symbol === symbol
                          ? "Armed"
                          : "Waiting for chart"
                        : alert.lastTriggeredAt !== null && !alert.repeat
                          ? "Triggered"
                          : "Paused"}
                      {" · "}
                      {alert.repeat ? `Repeat, ${alert.cooldownMs / 60_000}m cooldown` : "Once"}
                    </p>
                  </div>
                </div>
                <div className="mt-1 flex justify-end gap-1">
                  <button
                    type="button"
                    className={actionClass}
                    onClick={() => controller.setEnabled(alert.id, !alert.enabled)}
                    aria-label={`${alert.enabled ? "Pause" : "Enable"} ${alert.symbol} alert at ${alert.price}`}
                  >
                    {alert.enabled ? "Pause" : "Enable"}
                  </button>
                  <button
                    type="button"
                    className={actionClass}
                    onClick={() => controller.remove(alert.id)}
                    aria-label={`Delete ${alert.symbol} alert at ${alert.price}`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Triggered history
            </h3>
            {controller.history.length ? (
              <button type="button" className={actionClass} onClick={controller.clearHistory}>
                Clear history
              </button>
            ) : null}
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
            Latest 100 triggers in this workspace. Saved with your workspace retention setting.
          </p>
          {!controller.history.length ? (
            <p className="text-xs text-zinc-500">No alerts triggered.</p>
          ) : null}
          <ol className="space-y-3" aria-live="polite" aria-relevant="additions">
            {controller.history.map((event) => (
              <li key={event.id} className="text-xs">
                <p className="text-zinc-200">
                  {event.symbol} · {conditionLabel[event.condition]} {priceLabel(event.target)}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Last {priceLabel(event.price)} ·{" "}
                  <time dateTime={new Date(event.triggeredAt).toISOString()}>
                    {new Date(event.triggeredAt).toLocaleString()}
                  </time>
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
