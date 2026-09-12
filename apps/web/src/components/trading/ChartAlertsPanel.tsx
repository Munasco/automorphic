import { useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../ui/dialog";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { ChartIcon } from "./ChartIcon";
import { AlertIcon } from "./AlertIcon";
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
  "mt-2 h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-200 outline-none focus:border-blue-400";
const iconButtonClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded text-zinc-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40";
const primaryClass =
  "rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40";

function AlertAction({
  label,
  children,
  onClick,
  pressed,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        className={iconButtonClass}
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

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
  const [tab, setTab] = useState("alerts");
  const [creating, setCreating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "symbol">("newest");
  const [target, setTarget] = useState("");
  const [condition, setCondition] = useState<AlertCondition>("crossing");
  const [repeat, setRepeat] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(60_000);
  const [error, setError] = useState("");
  const query = search.trim().toLowerCase();
  const alerts = controller.alerts
    .filter((alert) =>
      `${alert.symbol} ${conditionLabel[alert.condition]} ${alert.price}`
        .toLowerCase()
        .includes(query),
    )
    .toSorted((a, b) =>
      sort === "symbol"
        ? a.symbol.localeCompare(b.symbol)
        : sort === "oldest"
          ? a.armedAt - b.armedAt
          : b.armedAt - a.armedAt,
    );
  const history = controller.history
    .filter((event) =>
      `${event.symbol} ${conditionLabel[event.condition]} ${event.target}`
        .toLowerCase()
        .includes(query),
    )
    .toSorted((a, b) =>
      sort === "symbol"
        ? a.symbol.localeCompare(b.symbol)
        : sort === "oldest"
          ? a.triggeredAt - b.triggeredAt
          : b.triggeredAt - a.triggeredAt,
    );
  const openCreate = () => {
    setTarget(Number.isFinite(lastPrice) ? String(lastPrice) : "");
    setError("");
    setCreating(true);
  };
  const empty = tab === "alerts" ? !alerts.length : !history.length;
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-[#101010] text-zinc-300"
      aria-label="Price alerts"
    >
      <Tabs.Root
        value={tab}
        onValueChange={(value) => setTab(String(value))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b border-zinc-700">
          <Tabs.List
            aria-label="Alerts and log"
            className="mx-4 mt-3 flex rounded-lg bg-[#292929] p-1"
          >
            <Tabs.Tab
              value="alerts"
              className="flex-1 rounded-md py-1.5 text-sm font-medium text-zinc-400 outline-none data-active:bg-[#484848] data-active:text-white data-active:shadow-sm focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              Alerts
            </Tabs.Tab>
            <Tabs.Tab
              value="log"
              className="flex-1 rounded-md py-1.5 text-sm font-medium text-zinc-400 outline-none data-active:bg-[#484848] data-active:text-white data-active:shadow-sm focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              Log
            </Tabs.Tab>
          </Tabs.List>
          <div
            className="flex items-center gap-1 px-3 py-2"
            role="toolbar"
            aria-label="Alert actions"
          >
            <AlertAction label="Create alert" onClick={openCreate}>
              <AlertIcon name="plus" size={25} />
            </AlertAction>
            <div className="flex-1" />
            <AlertAction
              label="Search alerts"
              pressed={searching}
              onClick={() => {
                setSearching(!searching);
                setSearch("");
              }}
            >
              <ChartIcon name="search" size={22} />
            </AlertAction>
            <Menu>
              <Tooltip>
                <TooltipTrigger
                  render={<MenuTrigger />}
                  className={iconButtonClass}
                  aria-label="Sort alerts"
                >
                  <AlertIcon name="sort" size={23} />
                </TooltipTrigger>
                <TooltipPopup>Sort alerts</TooltipPopup>
              </Tooltip>
              <MenuPopup align="end">
                {(
                  [
                    ["newest", "Newest first"],
                    ["oldest", "Oldest first"],
                    ["symbol", "Symbol"],
                  ] as const
                ).map(([value, label]) => (
                  <MenuItem key={value} onClick={() => setSort(value)}>
                    <span className="w-4">{sort === value ? "✓" : ""}</span>
                    {label}
                  </MenuItem>
                ))}
              </MenuPopup>
            </Menu>
            <Menu>
              <Tooltip>
                <TooltipTrigger
                  render={<MenuTrigger />}
                  className={iconButtonClass}
                  aria-label="More alert actions"
                >
                  <AlertIcon name="more" size={23} />
                </TooltipTrigger>
                <TooltipPopup>More</TooltipPopup>
              </Tooltip>
              <MenuPopup align="end">
                {tab === "alerts" ? (
                  <>
                    <MenuItem
                      disabled={!controller.alerts.some((alert) => alert.enabled)}
                      onClick={() =>
                        controller.alerts
                          .filter((alert) => alert.enabled)
                          .forEach((alert) => controller.setEnabled(alert.id, false))
                      }
                    >
                      Pause all alerts
                    </MenuItem>
                    <MenuItem
                      disabled={!controller.alerts.some((alert) => !alert.enabled)}
                      onClick={() =>
                        controller.alerts
                          .filter((alert) => !alert.enabled)
                          .forEach((alert) => controller.setEnabled(alert.id, true))
                      }
                    >
                      Enable all alerts
                    </MenuItem>
                  </>
                ) : (
                  <MenuItem disabled={!controller.history.length} onClick={controller.clearHistory}>
                    Clear log
                  </MenuItem>
                )}
                {onClose ? <MenuItem onClick={onClose}>Close alerts</MenuItem> : null}
              </MenuPopup>
            </Menu>
          </div>
          {searching ? (
            <div className="px-4 pb-3">
              <input
                autoFocus
                type="search"
                aria-label="Search alerts and log"
                placeholder="Search by symbol or price"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={fieldClass}
              />
            </div>
          ) : null}
        </div>
        {empty ? (
          <div
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-8 text-center"
            role="status"
          >
            <AlertIcon
              name={tab === "alerts" ? "alarm-add" : "alarm"}
              size={92}
              className="shrink-0 text-zinc-400"
            />
            <p className="max-w-64 text-[15px] leading-6 text-zinc-300">
              {query
                ? "No matching alerts."
                : tab === "alerts"
                  ? "Get notified when your conditions are met. Create an alert to get started."
                  : "Triggered alerts appear here."}
            </p>
            {!query && tab === "alerts" ? (
              <button type="button" className={primaryClass} onClick={openCreate}>
                Create alert
              </button>
            ) : null}
          </div>
        ) : null}
        <Tabs.Panel
          value="alerts"
          className={empty ? "hidden" : "min-h-0 flex-1 overflow-y-auto overscroll-contain"}
        >
          <ul className="divide-y divide-zinc-800">
            {alerts.map((alert) => (
              <li key={alert.id} className="group px-4 py-3 hover:bg-white/[0.025]">
                <div className="flex items-start gap-3">
                  <AlertIcon
                    name="alarm"
                    size={23}
                    className={
                      alert.enabled
                        ? "mt-0.5 shrink-0 text-zinc-200"
                        : "mt-0.5 shrink-0 text-zinc-600"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200">{alert.symbol}</p>
                    <p className="mt-1 text-[13px]">
                      {conditionLabel[alert.condition]} {priceLabel(alert.price)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {alert.enabled
                        ? alert.symbol === symbol
                          ? "Active"
                          : "Waiting for chart"
                        : alert.lastTriggeredAt !== null && !alert.repeat
                          ? "Triggered"
                          : "Paused"}{" "}
                      · {alert.repeat ? "Repeating" : "Once"}
                    </p>
                  </div>
                  <div className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                    <AlertAction
                      label={`${alert.enabled ? "Pause" : "Enable"} ${alert.symbol} alert at ${alert.price}`}
                      onClick={() => controller.setEnabled(alert.id, !alert.enabled)}
                    >
                      <AlertIcon name={alert.enabled ? "pause" : "play"} size={18} />
                    </AlertAction>
                    <AlertAction
                      label={`Delete ${alert.symbol} alert at ${alert.price}`}
                      onClick={() => controller.remove(alert.id)}
                    >
                      <ChartIcon name="trash" size={18} />
                    </AlertAction>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Tabs.Panel>
        <Tabs.Panel
          value="log"
          className={empty ? "hidden" : "min-h-0 flex-1 overflow-y-auto overscroll-contain"}
        >
          <ol className="divide-y divide-zinc-800" aria-live="polite" aria-relevant="additions">
            {history.map((event) => (
              <li key={event.id} className="px-4 py-3 text-[13px]">
                <p className="font-medium text-zinc-200">
                  {event.symbol} · {conditionLabel[event.condition]} {priceLabel(event.target)}
                </p>
                <p className="mt-1 text-zinc-400">Last {priceLabel(event.price)}</p>
                <time
                  className="mt-1 block text-xs text-zinc-500"
                  dateTime={new Date(event.triggeredAt).toISOString()}
                >
                  {new Date(event.triggeredAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        </Tabs.Panel>
      </Tabs.Root>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogPopup className="w-[min(420px,calc(100vw-32px))] bg-[#161616] p-6">
          <DialogTitle className="text-lg font-semibold">Create alert</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-zinc-400">
            {symbol || "Select a symbol to create an alert."}
          </DialogDescription>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              try {
                if (!target.trim()) throw Error("Enter a target price.");
                controller.add({ price: Number(target), condition, repeat, cooldownMs });
                setError("");
                setTab("alerts");
                setSearch("");
                setCreating(false);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Could not create the alert.");
              }
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <label htmlFor={`${formId}-condition`} className="text-sm text-zinc-400">
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
              <label htmlFor={`${formId}-price`} className="text-sm text-zinc-400">
                Price
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
                className="text-xs text-blue-400 hover:text-blue-300"
                onClick={() => setTarget(String(lastPrice))}
              >
                Use last price · {priceLabel(lastPrice!)}
              </button>
            ) : null}
            <label htmlFor={`${formId}-repeat`} className="block text-sm text-zinc-400">
              Frequency
              <select
                id={`${formId}-repeat`}
                className={fieldClass}
                value={repeat ? "repeat" : "once"}
                onChange={(event) => setRepeat(event.target.value === "repeat")}
              >
                <option value="once">Only once</option>
                <option value="repeat">Repeating</option>
              </select>
            </label>
            {repeat ? (
              <label htmlFor={`${formId}-cooldown`} className="block text-sm text-zinc-400">
                Time between alerts
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
            {error ? (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="rounded px-3 py-2 text-sm text-zinc-400 hover:text-white"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button type="submit" disabled={!symbol} className={primaryClass}>
                Create
              </button>
            </div>
          </form>
        </DialogPopup>
      </Dialog>
    </section>
  );
}
