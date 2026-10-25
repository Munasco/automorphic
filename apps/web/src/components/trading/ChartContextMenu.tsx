import { ChartOrderIcon } from "./ChartOrderIcon";
import { chartOrderType, type ChartOrderDraft } from "./chartOrderEntry";
import { attachLockedChartCursor } from "./lockedChartCursor";
import { ResetChartPaneSizes } from "./ResetChartPaneSizes";
import { ChartPriceScaleMenu } from "./ChartPriceScaleMenu";
import { chartContextTarget } from "./chartContextTarget";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";
import { MenuCheckboxItem, MenuItem, MenuPopup, MenuSeparator, MenuShortcut } from "../ui/menu";
import { toastManager } from "../ui/toast";
import { isMacPlatform } from "../../lib/utils";
import {
  drawingContextMenuStyle,
  drawingContextMenuPopupClass,
  drawingContextMenuItemClass as itemClass,
} from "./drawingContextMenuStyles";
import { ChartTemplateSubmenu } from "./ChartTemplatesMenu";
import { ChartIcon } from "./ChartIcon";
import type { ChartDrawingsController } from "./useChartDrawings";

type MenuPoint = {
  chart: IChartApi;
  x: number;
  y: number;
  price: number | null;
  priceLabel: string | null;
  target: "price-axis" | "chart";
  time: Time | null;
  market: number | null;
};

/** Drawing hits own their context menu; this handles the rest of the chart and axes. */
export function ChartContextMenu({
  symbol,
  chart,
  series,
  priceStep,
  drawings,
  indicators,
  onAddAlert,
  onAddOrder,
  getMarketPrice,
  onOpenSettings,
  onOpenObjectTree,
  onGoToDate,
  onReplayFrom,
  onSaveTemplate,
  onManageTemplates,
}: {
  symbol?: string;
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  priceStep: number;
  drawings: ChartDrawingsController;
  indicators: {
    count: number;
    hidden: boolean;
    setHidden: (hidden: boolean) => void;
    remove: () => void;
  };
  onAddAlert?: ((price: number) => void) | undefined;
  onAddOrder?: ((draft: ChartOrderDraft) => void) | undefined;
  getMarketPrice?: (() => number | null) | undefined;
  onOpenSettings: () => void;
  onOpenObjectTree: () => void;
  onGoToDate?: (() => void) | undefined;
  onReplayFrom?: ((time: number) => void) | undefined;
  onSaveTemplate?: (() => void) | undefined;
  onManageTemplates?: (() => void) | undefined;
}) {
  const [point, setPoint] = useState<MenuPoint | null>(null);
  const [lockedCursor, setLockedCursor] = useState<{
    chart: IChartApi;
    time: Time;
    price: number;
  } | null>(null);
  useEffect(() => {
    if (!chart || !series || lockedCursor?.chart !== chart) return;
    return attachLockedChartCursor(chart, series, lockedCursor.time, lockedCursor.price);
  }, [chart, series, lockedCursor]);
  const orderHover = useRef<{ chart: IChartApi; price: number } | null>(null);
  const { setTool } = drawings;
  useEffect(() => {
    if (!chart || !series) return;
    const element = chart.chartElement();
    const open = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const pane = series.getPane();
      const rect = pane.getHTMLElement()?.getBoundingClientRect();
      if (!rect) return;
      const y = event.clientY - rect.top;
      event.preventDefault();
      event.stopPropagation();
      setTool("cursor");
      element.focus({ preventScroll: true });
      // Only the price pane (including its axis) maps to an instrument price.
      const rawPrice = y >= 0 && y < pane.getHeight() ? series.coordinateToPrice(y) : null;
      const tick = priceStep;
      const price =
        rawPrice !== null && Number.isFinite(rawPrice)
          ? Number((Math.round(rawPrice / tick) * tick).toFixed(8))
          : null;
      setPoint({
        chart,
        time: chart.timeScale().coordinateToTime(event.clientX - rect.left),
        market: getMarketPrice?.() ?? latestPrice(series),
        target: chartContextTarget(event.clientX, event.clientY, rect, series.priceScale().width()),
        x: event.clientX,
        y: event.clientY,
        price: price !== null && Number.isFinite(price) ? price : null,
        priceLabel:
          price !== null && Number.isFinite(price) ? series.priceFormatter().format(price) : null,
      });
    };
    // useChartDrawings stops a drawing hit in capture before this listener runs.
    element.addEventListener("contextmenu", open);
    return () => element.removeEventListener("contextmenu", open);
  }, [chart, series, priceStep, setTool, getMarketPrice]);
  useEffect(() => {
    if (!chart || !series || !onAddOrder) return;
    const move = (event: import("lightweight-charts").MouseEventParams) => {
      const price =
        event.point && (event.paneIndex ?? 0) === series.getPane().paneIndex()
          ? series.coordinateToPrice(event.point.y)
          : null;
      orderHover.current = price !== null && Number.isFinite(price) ? { chart, price } : null;
    };
    const keydown = (event: KeyboardEvent) => {
      const price = orderHover.current?.chart === chart ? orderHover.current.price : null;
      if (
        event.repeat ||
        !event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.code !== "KeyT" ||
        price === null
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')
      )
        return;
      event.preventDefault();
      const rounded = Number((Math.round(price / priceStep) * priceStep).toFixed(8));
      onAddOrder({
        side: "Buy",
        type: chartOrderType("Buy", rounded, getMarketPrice?.() ?? latestPrice(series) ?? rounded),
        price: rounded,
      });
    };
    chart.subscribeCrosshairMove(move);
    chart.chartElement().addEventListener("keydown", keydown);
    return () => {
      chart.unsubscribeCrosshairMove(move);
      chart.chartElement().removeEventListener("keydown", keydown);
    };
  }, [chart, series, priceStep, onAddOrder, getMarketPrice]);
  if (!chart || !series || point?.chart !== chart) return null;
  const close = () => setPoint(null);
  const paste = async () => {
    close();
    chart.chartElement().focus({ preventScroll: true });
    try {
      const text = await navigator.clipboard.readText();
      if (!drawings.pasteDrawing(text)) {
        toastManager.add({
          type: "error",
          title: "Couldn't paste drawing",
          description:
            drawings.count >= 100
              ? "Remove a drawing before adding another."
              : "Copy a drawing and wait for chart data to load, then try again.",
        });
      }
    } catch {
      toastManager.add({
        type: "error",
        title: "Couldn't read clipboard",
        description: "Use the paste keyboard shortcut while the chart is focused.",
      });
    }
  };
  const copyPrice = async () => {
    close();
    if (point.price === null) return;
    try {
      await navigator.clipboard.writeText(point.priceLabel!);
    } catch {
      toastManager.add({ type: "error", title: "Couldn't copy price" });
    }
  };
  const run = (action: () => void) => {
    close();
    action();
  };
  const mac = typeof navigator !== "undefined" && isMacPlatform(navigator.platform);
  return (
    <ContextMenu.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <MenuPopup
        aria-label={point.target === "price-axis" ? "Price scale menu" : "Chart context menu"}
        className={drawingContextMenuPopupClass}
        style={drawingContextMenuStyle}
        align="start"
        sideOffset={0}
        anchor={{ getBoundingClientRect: () => new DOMRect(point.x, point.y, 0, 0) }}
        onPaste={(event) => {
          if (!drawings.pasteDrawing(event.clipboardData.getData("text/plain"))) return;
          event.preventDefault();
          event.stopPropagation();
          close();
          chart.chartElement().focus({ preventScroll: true });
        }}
        onMouseUpCapture={(event) => {
          if (
            event.button === 2 &&
            Math.abs(event.clientX - point.x) <= 1 &&
            Math.abs(event.clientY - point.y) <= 1
          ) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {point.target === "price-axis" ? (
          <ChartPriceScaleMenu
            chart={chart}
            series={series}
            onClose={close}
            onOpenSettings={onOpenSettings}
          />
        ) : (
          <>
            <MenuItem
              className={itemClass}
              onClick={() => {
                close();
                chart.timeScale().fitContent();
                series.priceScale().applyOptions({ autoScale: true });
              }}
            >
              <ChartIcon name="maximize" className="size-4.5" />
              Reset chart view
            </MenuItem>
            <ResetChartPaneSizes menu onReset={close} />
            <MenuItem
              className={itemClass}
              onClick={() => run(() => chart.timeScale().scrollToRealTime())}
            >
              <ChartIcon name="arrow-bar-to-right" />
              Go to latest bar
            </MenuItem>
            {onGoToDate ? (
              <MenuItem className={itemClass} onClick={() => run(onGoToDate)}>
                <span aria-hidden="true" className="size-4.5 shrink-0" />
                Go to date…
                <MenuShortcut className="tracking-normal">{mac ? "⌥" : "Alt"} G</MenuShortcut>
              </MenuItem>
            ) : null}
            {onReplayFrom && typeof point.time === "number" && Number.isFinite(point.time) ? (
              <MenuItem
                className={itemClass}
                onClick={() => run(() => onReplayFrom(point.time as number))}
              >
                <svg
                  className="size-4.5 shrink-0"
                  viewBox="5 5 19 19"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    stroke="currentColor"
                    d="M13.5 20V9l-6 5.5 6 5.5zM21.5 20V9l-6 5.5 6 5.5z"
                  />
                </svg>
                Replay from here
              </MenuItem>
            ) : null}
            <MenuSeparator />
            {point.price !== null ? (
              <MenuItem className={itemClass} onClick={() => void copyPrice()}>
                <span aria-hidden="true" className="size-4.5 shrink-0" />
                Copy price {point.priceLabel}
              </MenuItem>
            ) : null}
            <MenuItem className={itemClass} onClick={() => void paste()}>
              <span aria-hidden="true" className="size-4.5 shrink-0" />
              Paste
              <MenuShortcut className="tracking-normal">{mac ? "⌘" : "Ctrl"} V</MenuShortcut>
            </MenuItem>
            <MenuSeparator />
            {point.price !== null && onAddAlert ? (
              <MenuItem className={itemClass} onClick={() => run(() => onAddAlert(point.price!))}>
                <ChartIcon name="bell" />
                Add alert{symbol ? ` on ${symbol}` : ""} at {point.priceLabel}…
                <MenuShortcut className="tracking-normal">{mac ? "⌥" : "Alt"} A</MenuShortcut>
              </MenuItem>
            ) : null}
            {point.price !== null && onAddOrder ? (
              <>
                {(point.market !== null && point.price < point.market
                  ? (["Buy", "Sell"] as const)
                  : (["Sell", "Buy"] as const)
                ).map((side) => {
                  const type = chartOrderType(side, point.price!, point.market ?? point.price!);
                  return (
                    <MenuItem
                      key={side}
                      className={itemClass}
                      onClick={() => run(() => onAddOrder({ side, type, price: point.price! }))}
                    >
                      <ChartOrderIcon side={side} />
                      {side} 1 {symbol} @ {point.priceLabel} {type.toLowerCase()}
                    </MenuItem>
                  );
                })}
                <MenuItem
                  className={itemClass}
                  onClick={() =>
                    run(() =>
                      onAddOrder({
                        side: "Buy",
                        type: chartOrderType("Buy", point.price!, point.market ?? point.price!),
                        price: point.price!,
                      }),
                    )
                  }
                >
                  <ChartOrderIcon /> Add order{symbol ? ` on ${symbol}` : ""} at {point.priceLabel}…
                  <MenuShortcut className="tracking-normal">⇧ T</MenuShortcut>
                </MenuItem>
              </>
            ) : null}
            <MenuSeparator />
            <MenuCheckboxItem
              className={itemClass}
              checked={lockedCursor?.chart === chart}
              disabled={!lockedCursor && (point.time === null || point.price === null)}
              onCheckedChange={(checked) =>
                run(() =>
                  setLockedCursor(
                    checked && point.time !== null && point.price !== null
                      ? { chart, time: point.time, price: point.price }
                      : null,
                  ),
                )
              }
            >
              Lock vertical cursor line by time
            </MenuCheckboxItem>
            <MenuSeparator />
            <MenuItem className={itemClass} onClick={() => run(onOpenObjectTree)}>
              <ChartIcon name="stack" />
              Object tree
            </MenuItem>
            {onSaveTemplate && onManageTemplates ? (
              <ChartTemplateSubmenu
                onSave={onSaveTemplate}
                onManage={onManageTemplates}
                onAction={run}
              />
            ) : null}
            <MenuItem
              className={itemClass}
              disabled={!drawings.count}
              onClick={() => run(drawings.toggleHidden)}
            >
              {drawings.hidden ? <EyeIcon /> : <EyeOffIcon />}
              {drawings.hidden ? "Show drawings" : "Hide drawings"}
            </MenuItem>
            <MenuItem
              className={itemClass}
              disabled={!indicators.count}
              onClick={() => run(() => indicators.setHidden(!indicators.hidden))}
            >
              {indicators.hidden ? <EyeIcon /> : <EyeOffIcon />}
              {indicators.hidden ? "Show indicators" : "Hide indicators"}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              className={itemClass}
              disabled={!drawings.count}
              onClick={() => run(() => drawings.removeDrawings())}
            >
              <ChartIcon name="trash" />
              Remove {drawings.count} {drawings.count === 1 ? "drawing" : "drawings"}
            </MenuItem>
            <MenuItem
              className={itemClass}
              disabled={!indicators.count}
              onClick={() => run(indicators.remove)}
            >
              <ChartIcon name="trash" />
              Remove {indicators.count} {indicators.count === 1 ? "indicator" : "indicators"}
            </MenuItem>
            <MenuSeparator />
            <MenuItem className={itemClass} onClick={() => run(onOpenSettings)}>
              <ChartIcon name="adjustments-horizontal" />
              Chart settings
            </MenuItem>
          </>
        )}
      </MenuPopup>
    </ContextMenu.Root>
  );
}

function latestPrice(series: ISeriesApi<SeriesType>): number | null {
  const bar = series.data().at(-1);
  const price = bar && ("close" in bar ? bar.close : "value" in bar ? bar.value : null);
  return typeof price === "number" && Number.isFinite(price) ? price : null;
}
