import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { MenuCheckboxItem, MenuItem, MenuPopup, MenuSeparator } from "../ui/menu";
import type { ChartAlertsController } from "./ChartAlertsPanel";
import type { ChartPriceAlert } from "./chartAlerts";
import { AlertIcon } from "./AlertIcon";
import {
  chartPriceAlertMarkers,
  createPriceAlertLines,
  priceAlertExpired,
} from "./chartPriceAlertMarkers";
import {
  drawingContextMenuItemClass,
  drawingContextMenuPopupClass,
  drawingContextMenuStyle,
} from "./drawingContextMenuStyles";
import { useChartOverlayLayout } from "./chartOverlayLayout";

type Placement = { id: string; x: number; y: number };
export function ChartPriceAlertsOverlay({
  chart,
  series,
  symbol,
  controller,
  onEdit,
}: {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  symbol: string;
  controller: ChartAlertsController;
  onEdit: (alert: ChartPriceAlert) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Placement[]>([]);
  const [measuredAt, setMeasuredAt] = useState(Date.now);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const layout = useChartOverlayLayout();
  const alerts = controller.alerts;
  const linesRef = useRef<ReturnType<typeof createPriceAlertLines> | null>(null);
  useEffect(() => {
    if (!series) return;
    const lines = createPriceAlertLines(series);
    linesRef.current = lines;
    return () => {
      lines.dispose();
      linesRef.current = null;
    };
  }, [series]);
  useEffect(() => {
    if (series) linesRef.current?.update(alerts, symbol, Date.now());
  }, [alerts, symbol, series]);

  const measure = useCallback(() => {
    if (!chart || !series || !root.current) return;
    const now = Date.now();
    setMeasuredAt((previous) =>
      alerts.some((alert) => priceAlertExpired(alert, previous) !== priceAlertExpired(alert, now))
        ? now
        : previous,
    );
    const bounds = root.current.getBoundingClientRect();
    const pane = series.getPane();
    const paneRect = pane.getHTMLElement()?.getBoundingClientRect();
    if (!paneRect) return;
    const left = paneRect.left - bounds.left + chart.priceScale("left", pane.paneIndex()).width();
    const top = paneRect.top - bounds.top;
    const next = chartPriceAlertMarkers(
      alerts,
      symbol,
      (price) => series.priceToCoordinate(price),
      chart.paneSize().width,
      pane.getHeight(),
    ).map(({ alert, x, y }) => ({ id: alert.id, x: left + x, y: top + y }));
    setPositions((previous) =>
      JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
    );
  }, [chart, series, alerts, symbol]);
  const measureRef = useRef(measure);
  useLayoutEffect(() => {
    measureRef.current = measure;
    measure();
  }, [measure]);
  useEffect(() => {
    if (!chart || !series) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        measureRef.current();
      });
    };
    const element = chart.chartElement();
    const scale = chart.timeScale();
    const drag = (event: PointerEvent) => {
      if (event.buttons) schedule();
    };
    scale.subscribeVisibleLogicalRangeChange(schedule);
    scale.subscribeSizeChange(schedule);
    series.subscribeDataChanged(schedule);
    element.addEventListener("pointermove", drag);
    element.addEventListener("pointerup", schedule);
    element.addEventListener("wheel", schedule, { passive: true });
    element.addEventListener("dblclick", schedule);
    // Native scale changes (including logarithmic/inverted settings) have no DOM event.
    const projectionObserver = { updateAllViews: schedule };
    series.attachPrimitive(projectionObserver);
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      series.detachPrimitive(projectionObserver);
      scale.unsubscribeVisibleLogicalRangeChange(schedule);
      scale.unsubscribeSizeChange(schedule);
      series.unsubscribeDataChanged(schedule);
      element.removeEventListener("pointermove", drag);
      element.removeEventListener("pointerup", schedule);
      element.removeEventListener("wheel", schedule);
      element.removeEventListener("dblclick", schedule);
    };
  }, [chart, series]);
  const selected = menu
    ? alerts.find((alert) => alert.id === menu.id && alert.symbol === symbol)
    : undefined;
  const close = () => setMenu(null);
  const act = (action: () => void) => {
    close();
    action();
  };
  if (!chart || !series) return null;
  return (
    <>
      <div
        ref={root}
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-label="Price alert markers"
      >
        {positions.map((position) => {
          const alert = alerts.find((item) => item.id === position.id && item.symbol === symbol);
          if (!alert) return null;
          const expired = priceAlertExpired(alert, measuredAt);
          const label = `${alert.name || "Price alert"} · ${series.priceFormatter().format(alert.price)}${expired ? " · Expired" : alert.enabled ? "" : " · Paused"}`;
          return (
            <button
              key={alert.id}
              type="button"
              aria-label={label}
              className="group pointer-events-auto absolute z-10 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border bg-zinc-950 hover:z-20 focus-visible:z-20 focus-visible:outline focus-visible:outline-blue-400"
              style={{
                left: position.x,
                top: position.y,
                color: alert.enabled && !expired ? "#60a5fa" : "#a1a1aa",
                borderColor: "currentColor",
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => {
                event.stopPropagation();
                close();
                onEdit(alert);
              }}
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                setMenu({ id: alert.id, x: rect.right, y: rect.bottom });
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenu({ id: alert.id, x: event.clientX, y: event.clientY });
              }}
            >
              <AlertIcon name="alarm" size={15} />
              <span
                className="pointer-events-none absolute right-full mr-1 hidden max-w-56 truncate rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 group-hover:block group-focus-visible:block"
                style={{ zoom: layout.scale }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
      {menu && selected ? (
        <ContextMenu.Root
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <MenuPopup
            aria-label="Price alert options"
            align="start"
            sideOffset={0}
            anchor={{ getBoundingClientRect: () => new DOMRect(menu.x, menu.y, 0, 0) }}
            className={drawingContextMenuPopupClass}
            style={{ ...drawingContextMenuStyle, ...layout.popupStyle }}
            onMouseUpCapture={(event) => {
              if (
                event.button === 2 &&
                Math.abs(event.clientX - menu.x) <= 1 &&
                Math.abs(event.clientY - menu.y) <= 1
              ) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            <MenuItem
              className={drawingContextMenuItemClass}
              onClick={() => act(() => onEdit(selected))}
            >
              Edit alert
            </MenuItem>
            <MenuItem
              className={drawingContextMenuItemClass}
              disabled={priceAlertExpired(selected, measuredAt)}
              onClick={() =>
                act(() => {
                  controller.setEnabled(selected.id, !selected.enabled);
                })
              }
            >
              {selected.enabled ? "Pause alert" : "Resume alert"}
            </MenuItem>
            <MenuCheckboxItem
              checked={selected.showLine !== false}
              onCheckedChange={(showLine) =>
                act(() => {
                  controller.update(selected.id, {
                    price: selected.price,
                    condition: selected.condition,
                    repeat: selected.repeat,
                    cooldownMs: selected.cooldownMs,
                    showLine,
                  });
                })
              }
            >
              Extend alert line
            </MenuCheckboxItem>
            <MenuSeparator />
            <MenuItem
              className={drawingContextMenuItemClass}
              variant="destructive"
              onClick={() =>
                act(() => {
                  controller.remove(selected.id);
                })
              }
            >
              Remove alert
            </MenuItem>
          </MenuPopup>
        </ContextMenu.Root>
      ) : null}
    </>
  );
}
