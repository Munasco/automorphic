import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { MenuItem, MenuPopup, MenuSeparator, MenuShortcut } from "../ui/menu";
import { toastManager } from "../ui/toast";
import { isMacPlatform } from "../../lib/utils";
import {
  drawingContextMenuStyle,
  drawingContextMenuPopupClass,
  drawingContextMenuItemClass as itemClass,
} from "./drawingContextMenuStyles";
import { ChartIcon } from "./ChartIcon";
import type { ChartDrawingsController } from "./useChartDrawings";

type MenuPoint = {
  chart: IChartApi;
  x: number;
  y: number;
  price: number | null;
  priceLabel: string | null;
};

/** Drawing hits own their context menu; this handles the rest of the chart and axes. */
export function ChartContextMenu({
  chart,
  series,
  priceStep,
  drawings,
  indicators,
  onAddAlert,
  onOpenSettings,
  onOpenObjectTree,
}: {
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
  onOpenSettings: () => void;
  onOpenObjectTree: () => void;
}) {
  const [point, setPoint] = useState<MenuPoint | null>(null);
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
  }, [chart, series, priceStep, setTool]);
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
        aria-label="Chart context menu"
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
        <MenuItem
          className={itemClass}
          onClick={() => run(() => chart.timeScale().scrollToRealTime())}
        >
          <ChartIcon name="arrow-bar-to-right" />
          Go to latest bar
        </MenuItem>
        <MenuSeparator />
        {point.price !== null && onAddAlert ? (
          <MenuItem className={itemClass} onClick={() => run(() => onAddAlert(point.price!))}>
            <ChartIcon name="bell" />
            Add alert at {point.priceLabel}
          </MenuItem>
        ) : null}
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
        <MenuItem className={itemClass} onClick={() => run(onOpenObjectTree)}>
          <ChartIcon name="stack" />
          Object tree
        </MenuItem>
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
          Remove drawings
        </MenuItem>
        <MenuItem
          className={itemClass}
          disabled={!indicators.count}
          onClick={() => run(indicators.remove)}
        >
          <ChartIcon name="trash" />
          Remove indicators
        </MenuItem>
        <MenuSeparator />
        <MenuItem className={itemClass} onClick={() => run(onOpenSettings)}>
          <ChartIcon name="adjustments-horizontal" />
          Chart settings
        </MenuItem>
      </MenuPopup>
    </ContextMenu.Root>
  );
}
