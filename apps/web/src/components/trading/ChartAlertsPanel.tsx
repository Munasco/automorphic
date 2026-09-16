import {
  CHART_ALERT_LOG_FILTER_OPTIONS,
  isChartAlertLogFilter,
  readChartAlertLogFilter,
  writeChartAlertLogFilter,
  filterChartAlertLog,
} from "./chartAlertLogFilter";
import { CopyIcon } from "lucide-react";
import { chartAlertLogCsv } from "./chartAlertLogCsv";
import { TradingSelect } from "./TradingSelect";
import {
  CHART_ALERT_FILTER_OPTIONS,
  isChartAlertFilter,
  readChartAlertFilter,
  writeChartAlertFilter,
} from "./chartAlertFilter";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { DrawingAlertDialog } from "./DrawingAlertDialog";
import { ChartIcon } from "./ChartIcon";
import { AlertIcon } from "./AlertIcon";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import {
  CHART_ALERT_SORT_OPTIONS,
  compareChartAlerts,
  readChartAlertSort,
  writeChartAlertSort,
} from "./chartAlertSort";
import {
  createChartAlertSession,
  type AlertCondition,
  type ChartAlertState,
  type ChartPriceAlert,
} from "./chartAlerts";
import type { DrawingAlertsController } from "./useDrawingAlerts";
import type { DrawingAlertCondition, DrawingAlertTrigger } from "./drawingAlerts";
import { useAlertNotifications } from "./useAlertNotifications";
import { PriceAlertDialog } from "./PriceAlertDialog";
import { drawingAlertTargetLabel } from "./drawingAlertPresentation";

const getAlertSortSnapshot = () => readChartAlertSort(tradingWorkspaceStorage);
const getAlertLogFilterSnapshot = () => readChartAlertLogFilter(tradingWorkspaceStorage);
const getAlertFilterSnapshot = () => readChartAlertFilter(tradingWorkspaceStorage);

const EMPTY: ChartAlertState = { alerts: [], history: [] };
type PriceAlertSession = ReturnType<typeof createChartAlertSession>;
const INACTIVE_SESSION: PriceAlertSession = {
  getSnapshot: () => EMPTY,
  subscribe: () => () => {},
  add: () => {
    throw Error("Wait for the chart alert session to open.");
  },
  update: () => false,
  setEnabled: () => false,
  remove: () => false,
  clearHistory: () => false,
  observeQuote: () => {},
  checkExpiration: () => false,
  dispose: () => {},
};
const priceLabel = (price: number) => price.toLocaleString("en-US", { maximumFractionDigits: 6 });
const conditionLabel: Record<AlertCondition, string> = {
  crossing: "Crossing",
  "crossing-up": "Crossing up",
  "crossing-down": "Crossing down",
  above: "Above",
  below: "Below",
};
const drawingConditionLabel: Record<DrawingAlertCondition, string> = {
  crossing: "Crossing",
  "crossing-up": "Crossing up",
  "crossing-down": "Crossing down",
  above: "Greater than",
  below: "Less than",
};
const drawingTriggerLabel: Record<DrawingAlertTrigger, string> = {
  once: "Once",
  "once-per-bar": "Once per bar",
  "once-per-bar-close": "Once per bar close",
  "once-per-minute": "Once per minute",
};

/** Keep this hook mounted with the chart; the alert editor can open and close independently. */
export function useChartAlerts(symbol: string) {
  const workspace = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    tradingWorkspaceStorage.getSnapshot,
  );
  const identity = useMemo(
    () => ({ symbol, projectId: workspace.projectId, ready: workspace.ready }),
    [symbol, workspace.projectId, workspace.ready],
  );
  const [bundle, setBundle] = useState<{
    identity: typeof identity;
    session: PriceAlertSession;
  } | null>(null);
  const session = bundle?.identity === identity ? bundle.session : INACTIVE_SESSION;
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, () => EMPTY);
  const { prepare, deliver } = useAlertNotifications(
    state.alerts.some(
      (alert) => alert.enabled && alert.symbol === symbol && alert.notifications?.sound,
    ),
  );
  useEffect(() => {
    if (!identity.ready) return;
    const session = createChartAlertSession(identity.symbol, tradingWorkspaceStorage.capture(), {
      onTrigger: (event) =>
        deliver({
          id: event.id,
          body: `${event.message ? `${event.message} · ` : ""}${event.symbol} · ${conditionLabel[event.condition]} ${priceLabel(event.target)} · Last ${priceLabel(event.price)}`,
          ...(event.notifications ? { notifications: event.notifications } : {}),
          title: event.name || `${event.symbol} price alert`,
          description: (
            <span className="block">
              {event.message ? (
                <span className="line-clamp-4 whitespace-pre-wrap break-words">
                  {event.message}
                </span>
              ) : null}
              <span className="block">
                {event.name || event.message ? `${event.symbol} · ` : ""}
                {conditionLabel[event.condition]} {priceLabel(event.target)} · Last{" "}
                {priceLabel(event.price)}
              </span>
            </span>
          ),
        }),
    });
    // Register evaluators only for committed mounts, including Strict Mode effect remounts.
    // eslint-disable-next-line react/set-state-in-effect
    setBundle({ identity, session });
    return () => session.dispose();
  }, [identity, deliver]);
  useEffect(() => {
    const next = state.alerts.reduce(
      (earliest, alert) =>
        alert.enabled && alert.expiresAt != null ? Math.min(earliest, alert.expiresAt) : earliest,
      Infinity,
    );
    if (!Number.isFinite(next)) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const remaining = next - Date.now();
      if (remaining <= 0) {
        session.checkExpiration();
        return;
      }
      timer = setTimeout(schedule, Math.min(2_147_483_647, remaining));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [session, state.alerts]);
  return {
    ...session,
    ...state,
    prepareNotifications: prepare,
    ready: session !== INACTIVE_SESSION,
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
  disabled,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        className={iconButtonClass}
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

export function ChartAlerts({
  initialCreatePrice,
  initialEditAlert,
  controller,
  drawingController,
  symbol,
  lastPrice,
  onClose,
}: {
  initialCreatePrice?: number | undefined;
  initialEditAlert?: ChartPriceAlert | undefined;
  controller: ChartAlertsController;
  drawingController?: DrawingAlertsController | null;
  symbol: string;
  lastPrice?: number | undefined;
  onClose?: (() => void) | undefined;
}) {
  const [tab, setTab] = useState("alerts");
  const [editorOpen, setEditorOpen] = useState(
    initialEditAlert !== undefined || initialCreatePrice !== undefined,
  );
  const [createPrice, setCreatePrice] = useState(initialCreatePrice);
  const [editingPrice, setEditingPrice] = useState<{
    alert: ChartPriceAlert;
    duplicate?: boolean;
    update: ChartAlertsController["update"];
  } | null>(() =>
    initialEditAlert ? { alert: initialEditAlert, update: controller.update } : null,
  );
  const [drawingEditor, setDrawingEditor] = useState<{
    id: string;
    duplicate: boolean;
    projectId: string | null;
    symbol: string;
    intervalKey: string;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const sort = useSyncExternalStore(tradingWorkspaceStorage.subscribe, getAlertSortSnapshot);
  const logFilter = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    getAlertLogFilterSnapshot,
  );
  const statusFilter = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    getAlertFilterSnapshot,
  );
  // An in-flight workspace save may delay its subscription update. Render the local choice now.
  const [, refreshPreferences] = useReducer((revision: number) => revision + 1, 0);
  const workspace = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    tradingWorkspaceStorage.getSnapshot,
  );
  const [actionError, setActionError] = useState("");
  const currentController = useRef(controller);
  useEffect(() => {
    currentController.current = controller;
  }, [controller]);
  const [expirationClock, setExpirationClock] = useState(Date.now);
  useEffect(() => {
    // Paused alerts also need their displayed expiration to advance without a quote.
    const next = controller.alerts.reduce(
      (earliest, alert) =>
        alert.expiresAt != null && alert.expiresAt > expirationClock
          ? Math.min(earliest, alert.expiresAt)
          : earliest,
      Infinity,
    );
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(
      () => setExpirationClock(Date.now()),
      Math.min(2_147_483_647, Math.max(0, next - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [controller.alerts, expirationClock]);
  const query = search.trim().toLowerCase();
  const drawingLoading = drawingController !== undefined && !drawingController?.ready;
  const waitingForDrawings = drawingLoading && (tab !== "log" || logFilter !== "price");
  const drawings = drawingController?.symbol === symbol ? drawingController : null;
  const editingAlert =
    workspace.ready &&
    drawingEditor?.projectId === workspace.projectId &&
    drawingEditor.symbol === drawings?.symbol &&
    drawingEditor.intervalKey === drawings?.intervalKey
      ? drawings?.alerts.find((alert) => alert.id === drawingEditor.id)
      : undefined;
  const editingDrawing = editingAlert ? drawings?.drawingForAlert(editingAlert.id) : null;
  function act(action: () => unknown, message: string) {
    try {
      if (action() === false) {
        setActionError(message);
        return false;
      }
      setActionError("");
      return true;
    } catch {
      setActionError(message);
      return false;
    }
  }
  const priceEditorAvailable =
    !editingPrice ||
    (editingPrice.alert.symbol === symbol &&
      editingPrice.update === controller.update &&
      controller.alerts.some(
        (alert) => alert.id === editingPrice.alert.id && alert.symbol === symbol,
      ));
  const openPriceEdit = (alert: ChartPriceAlert, duplicate = false) => {
    setEditingPrice({ alert: structuredClone(alert), duplicate, update: controller.update });
    setEditorOpen(true);
  };
  const allAlerts = [
    ...controller.alerts.map((alert) => ({
      key: `price:${alert.id}`,
      symbol: alert.symbol,
      name: alert.name ?? "",
      message: alert.message ?? "",
      time: alert.armedAt,
      title: alert.name || alert.symbol,
      description: `${conditionLabel[alert.condition]} ${priceLabel(alert.price)}`,
      searchText: `${alert.name ?? ""} ${alert.message ?? ""} ${alert.symbol} price ${conditionLabel[alert.condition]} ${alert.price}`,
      enabled: alert.enabled,
      armedAt: alert.armedAt,
      status:
        alert.expiresAt != null && alert.expiresAt <= expirationClock
          ? "Expired"
          : alert.enabled
            ? alert.symbol === symbol
              ? "Active"
              : "Waiting for chart"
            : alert.lastTriggeredAt !== null && !alert.repeat
              ? "Triggered"
              : "Paused",
      frequency: alert.repeat ? "Repeating" : "Once",
      edit: alert.symbol === symbol ? () => openPriceEdit(alert) : null,
      duplicate: alert.symbol === symbol ? () => openPriceEdit(alert, true) : null,
      canEnable: alert.expiresAt == null || alert.expiresAt > expirationClock,
      actionLabel: `${alert.name ? `${alert.name} · ` : ""}${alert.symbol} alert at ${alert.price}`,
      toggle: () => {
        return controller.setEnabled(alert.id, !alert.enabled);
      },
      remove: () => {
        controller.remove(alert.id);
        return true;
      },
    })),
    ...(drawings?.alerts ?? []).map((alert) => ({
      key: `drawing:${alert.id}`,
      symbol: alert.symbol,
      name: alert.name ?? "",
      message: alert.message ?? "",
      time: alert.armedAt,
      title: alert.name || alert.symbol,
      description: alert.message || `${drawingConditionLabel[alert.condition]} drawing`,
      searchText: `${alert.symbol} drawing ${alert.name ?? ""} ${alert.message ?? ""} ${drawingConditionLabel[alert.condition]} ${alert.disabledReason ?? ""}`,
      enabled: alert.enabled,
      armedAt: alert.armedAt,
      status: alert.enabled
        ? drawings?.ready
          ? "Active"
          : "Waiting for chart"
        : alert.disabledReason === "expired"
          ? "Expired"
          : alert.disabledReason === "deleted"
            ? "Drawing removed"
            : alert.disabledReason === "triggered"
              ? "Triggered"
              : "Paused",
      frequency: drawingTriggerLabel[alert.trigger],
      edit:
        drawings?.ready && drawings.drawingForAlert(alert.id)
          ? () =>
              setDrawingEditor({
                id: alert.id,
                duplicate: false,
                projectId: workspace.projectId,
                symbol: drawings.symbol,
                intervalKey: drawings.intervalKey,
              })
          : null,
      duplicate:
        drawings?.ready && drawings.drawingForAlert(alert.id)
          ? () =>
              setDrawingEditor({
                id: alert.id,
                duplicate: true,
                projectId: workspace.projectId,
                symbol: drawings.symbol,
                intervalKey: drawings.intervalKey,
              })
          : null,
      canEnable:
        !!drawings?.ready &&
        alert.disabledReason !== "deleted" &&
        alert.disabledReason !== "expired",
      actionLabel: `${alert.name || alert.symbol} drawing alert`,
      toggle: () => drawings?.setEnabled(alert.id, !alert.enabled) ?? false,
      remove: () => drawings?.remove(alert.id) ?? false,
    })),
  ];
  const alerts = allAlerts
    .filter((alert) => statusFilter === "all" || alert.status === statusFilter)
    .filter((alert) => alert.searchText.toLowerCase().includes(query))
    .toSorted((a, b) => compareChartAlerts(a, b, sort));
  const allHistory = [
    ...controller.history.map((event) => ({
      ...event,
      time: event.triggeredAt,
      key: `price:${event.id}`,
      kind: "price" as const,
      title: `${event.name ? `${event.name} · ` : ""}${event.symbol} · ${conditionLabel[event.condition]} ${priceLabel(event.target)}`,
      description: `${event.message ? `${event.message}\n` : ""}Last ${priceLabel(event.price)}`,
      searchText: `${event.name ?? ""} ${event.message ?? ""} ${event.symbol} price ${conditionLabel[event.condition]} ${event.target}`,
    })),
    ...(drawings?.history ?? []).map((event) => ({
      ...event,
      time: event.triggeredAt,
      key: `drawing:${event.id}`,
      kind: "drawing" as const,
      title: `${event.symbol} · ${event.name || `${drawingConditionLabel[event.condition]} drawing`}`,
      description: `${event.message ? `${event.message} · ` : ""}Last ${priceLabel(event.price)} · ${drawingAlertTargetLabel(event)}`,
      searchText: `${event.symbol} drawing ${event.name ?? ""} ${event.message ?? ""} ${drawingConditionLabel[event.condition]} ${drawingAlertTargetLabel(event)}`,
    })),
  ];
  const history = filterChartAlertLog(allHistory, logFilter, query).toSorted((a, b) =>
    compareChartAlerts(a, b, sort),
  );
  const openCreate = () => {
    setEditingPrice(null);
    setCreatePrice(Number.isFinite(lastPrice) ? lastPrice : undefined);
    setEditorOpen(true);
  };
  const empty = tab === "alerts" ? !alerts.length : !history.length;
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-[#101010] text-zinc-300"
      aria-label="Chart alerts"
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
                  disabled={!workspace.ready}
                >
                  <AlertIcon name="sort" size={23} />
                </TooltipTrigger>
                <TooltipPopup>Sort alerts</TooltipPopup>
              </Tooltip>
              <MenuPopup align="end">
                {CHART_ALERT_SORT_OPTIONS.map(([value, label]) => (
                  <MenuItem
                    key={value}
                    onClick={() =>
                      act(() => {
                        writeChartAlertSort(tradingWorkspaceStorage, value);
                        refreshPreferences();
                      }, "Could not save alert sorting. Try again.")
                    }
                  >
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
                      disabled={!allAlerts.some((alert) => alert.enabled)}
                      onClick={() =>
                        act(() => {
                          let failed = false;
                          for (const alert of allAlerts.filter((item) => item.enabled)) {
                            try {
                              if (alert.toggle() === false) failed = true;
                            } catch {
                              failed = true;
                            }
                          }
                          return !failed;
                        }, "Some alerts could not be paused. Try again.")
                      }
                    >
                      Pause all alerts
                    </MenuItem>
                    <MenuItem
                      disabled={!allAlerts.some((alert) => !alert.enabled && alert.canEnable)}
                      onClick={() =>
                        act(() => {
                          let failed = false;
                          for (const alert of allAlerts.filter(
                            (item) => !item.enabled && item.canEnable,
                          )) {
                            try {
                              if (alert.toggle() === false) failed = true;
                            } catch {
                              failed = true;
                            }
                          }
                          return !failed;
                        }, "Some alerts could not be enabled. Check their status and try again.")
                      }
                    >
                      Enable all alerts
                    </MenuItem>
                  </>
                ) : (
                  <>
                    <MenuItem
                      disabled={!workspace.ready || !history.length}
                      onClick={() =>
                        act(() => {
                          const url = URL.createObjectURL(
                            new Blob([chartAlertLogCsv(history)], {
                              type: "text/csv;charset=utf-8",
                            }),
                          );
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = `automorphic-alert-log-${new Date().toISOString().slice(0, 10)}.csv`;
                          try {
                            link.click();
                          } finally {
                            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                          }
                        }, "Could not export the alert log. Try again.")
                      }
                    >
                      Export log CSV
                    </MenuItem>
                    <MenuItem
                      disabled={!allHistory.length}
                      onClick={() =>
                        act(() => {
                          let failed = false;
                          try {
                            controller.clearHistory();
                          } catch {
                            failed = true;
                          }
                          if (drawings?.history.length) {
                            try {
                              if (!drawings.clearHistory()) failed = true;
                            } catch {
                              failed = true;
                            }
                          }
                          return !failed;
                        }, "Some alert history could not be cleared. Try again.")
                      }
                    >
                      Clear entire log
                    </MenuItem>
                  </>
                )}
                {onClose ? <MenuItem onClick={onClose}>Close alerts</MenuItem> : null}
              </MenuPopup>
            </Menu>
          </div>
          {tab === "alerts" ? (
            <div className="px-4 pb-3">
              <TradingSelect
                label="Filter alerts by status"
                value={statusFilter}
                options={CHART_ALERT_FILTER_OPTIONS}
                disabled={!workspace.ready}
                className="w-full"
                onChange={(value) => {
                  if (isChartAlertFilter(value))
                    act(() => {
                      writeChartAlertFilter(tradingWorkspaceStorage, value);
                      refreshPreferences();
                    }, "Could not save the alert filter. Try again.");
                }}
              />
            </div>
          ) : null}
          {tab === "log" ? (
            <div className="px-4 pb-3">
              <TradingSelect
                label="Filter log by event type"
                value={logFilter}
                options={CHART_ALERT_LOG_FILTER_OPTIONS}
                disabled={!workspace.ready}
                className="w-full"
                onChange={(value) => {
                  if (isChartAlertLogFilter(value))
                    act(() => {
                      writeChartAlertLogFilter(tradingWorkspaceStorage, value);
                      refreshPreferences();
                    }, "Could not save the log filter. Try again.");
                }}
              />
            </div>
          ) : null}
          {searching ? (
            <div className="px-4 pb-3">
              <input
                autoFocus
                type="search"
                aria-label="Search alerts and log"
                placeholder="Search alerts"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={fieldClass}
              />
            </div>
          ) : null}
        </div>
        {actionError ? (
          <p role="alert" className="shrink-0 px-4 py-2 text-xs text-red-400">
            {actionError}
          </p>
        ) : null}
        {waitingForDrawings ? (
          <p role="status" className="shrink-0 px-4 py-2 text-xs text-zinc-400">
            Drawing alerts are loading…
          </p>
        ) : null}
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
              {waitingForDrawings && !query && (tab !== "alerts" || statusFilter === "all")
                ? "Waiting for chart alerts…"
                : query || (tab === "alerts" ? statusFilter !== "all" : logFilter !== "all")
                  ? "No matching alerts."
                  : tab === "alerts"
                    ? "Get notified when your conditions are met. Create an alert to get started."
                    : "Triggered alerts appear here."}
            </p>
            {!query && tab === "alerts" && statusFilter === "all" ? (
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
              <li key={alert.key} className="group px-4 py-3 hover:bg-white/[0.025]">
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
                    <p className="truncate text-sm font-medium text-zinc-200">{alert.title}</p>
                    <p className="mt-1 break-words text-[13px]">{alert.description}</p>
                    {alert.title !== alert.symbol ? (
                      <p className="mt-1 text-xs text-zinc-500">{alert.symbol}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-zinc-500">
                      {alert.status} · {alert.frequency}
                    </p>
                  </div>
                  <div className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                    {alert.edit ? (
                      <AlertAction label={`Edit ${alert.actionLabel}`} onClick={alert.edit}>
                        <ChartIcon name="adjustments-horizontal" size={18} />
                      </AlertAction>
                    ) : null}
                    {alert.duplicate ? (
                      <AlertAction
                        label={`Duplicate ${alert.actionLabel}`}
                        onClick={alert.duplicate}
                      >
                        <CopyIcon className="size-[18px]" />
                      </AlertAction>
                    ) : null}
                    <AlertAction
                      label={`${alert.enabled ? "Pause" : "Enable"} ${alert.actionLabel}`}
                      disabled={!alert.enabled && !alert.canEnable}
                      onClick={() =>
                        act(
                          alert.toggle,
                          "Could not update the alert. Check its status and try again.",
                        )
                      }
                    >
                      <AlertIcon name={alert.enabled ? "pause" : "play"} size={18} />
                    </AlertAction>
                    <AlertAction
                      label={`Delete ${alert.actionLabel}`}
                      onClick={() => act(alert.remove, "Could not delete the alert. Try again.")}
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
              <li key={event.key} className="px-4 py-3 text-[13px]">
                <p className="break-words font-medium text-zinc-200">{event.title}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-zinc-400">
                  {event.description}
                </p>
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
      {drawings?.ready && editingAlert && editingDrawing ? (
        <DrawingAlertDialog
          key={`${drawings.symbol}:${drawings.intervalKey}:${editingAlert.id}:${drawingEditor?.duplicate}`}
          alert={drawingEditor?.duplicate ? undefined : editingAlert}
          initialValues={drawingEditor?.duplicate ? editingAlert : undefined}
          drawing={editingDrawing}
          symbol={drawings.symbol}
          intervalLabel={drawings.intervalLabel}
          onSubmit={(input) =>
            drawingEditor?.duplicate
              ? drawings.create(input)
              : drawings.update(editingAlert.id, input)
          }
          onClose={() => setDrawingEditor(null)}
        />
      ) : null}
      {editorOpen ? (
        <PriceAlertDialog
          key={`${editingPrice?.alert.id ?? "create"}:${editingPrice?.duplicate ?? false}`}
          alert={editingPrice?.duplicate ? undefined : editingPrice?.alert}
          initialValues={editingPrice?.duplicate ? editingPrice.alert : undefined}
          symbol={editingPrice?.alert.symbol || symbol}
          initialPrice={createPrice}
          lastPrice={lastPrice}
          available={priceEditorAvailable && controller.ready}
          onClose={() => setEditorOpen(false)}
          onSubmit={async (input) => {
            if (!priceEditorAvailable) return "This alert is no longer available.";
            const notificationError = await controller.prepareNotifications(
              input.notifications ?? { toast: true, sound: false, desktop: false },
            );
            if (notificationError) return notificationError;
            if (
              currentController.current.add !== controller.add ||
              !currentController.current.ready
            )
              return "The workspace changed. Close this editor and try again.";
            if (editingPrice && !editingPrice.duplicate) {
              if (!priceEditorAvailable || !controller.update(editingPrice.alert.id, input))
                return "Could not save this alert. Check its settings and try again.";
            } else controller.add(input);
            setTab("alerts");
            setSearch("");
            return null;
          }}
        />
      ) : null}
    </section>
  );
}
