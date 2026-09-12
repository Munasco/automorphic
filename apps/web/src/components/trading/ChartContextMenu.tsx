import { useEffect, useState } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { MenuItem, MenuPopup, MenuSeparator, MenuShortcut } from "../ui/menu";
import { toastManager } from "../ui/toast";
import { isMacPlatform } from "../../lib/utils";
import { ChartIcon } from "./ChartIcon";
import type { ChartDrawingsController } from "./useChartDrawings";

type MenuPoint = { chart: IChartApi; x: number; y: number; price: string | null };
const itemClass = "h-8 min-h-8 gap-3 px-3 py-0 text-sm sm:min-h-8";

/** Drawing hits own their context menu; this handles unoccupied price-pane space. */
export function ChartContextMenu({
  chart,
  series,
  drawings,
}: {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  drawings: ChartDrawingsController;
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
      const x = event.clientX - rect.left - chart.priceScale("left", pane.paneIndex()).width();
      const y = event.clientY - rect.top;
      if (x < 0 || x > chart.timeScale().width() || y < 0 || y > pane.getHeight()) return;
      event.preventDefault();
      event.stopPropagation();
      setTool("cursor");
      element.focus({ preventScroll: true });
      const price = series.coordinateToPrice(y);
      setPoint({
        chart,
        x: event.clientX,
        y: event.clientY,
        price:
          price !== null && Number.isFinite(price) ? series.priceFormatter().format(price) : null,
      });
    };
    // useChartDrawings stops a drawing hit in capture before this listener runs.
    element.addEventListener("contextmenu", open);
    return () => element.removeEventListener("contextmenu", open);
  }, [chart, series, setTool]);
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
              : "Copy a chart drawing first.",
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
      await navigator.clipboard.writeText(point.price);
    } catch {
      toastManager.add({ type: "error", title: "Couldn't copy price" });
    }
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
        className="w-[276px]"
        style={{
          background: "#1f1f1f",
          backdropFilter: "none",
          transition: "none",
          animation: "none",
        }}
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
        <MenuSeparator />
        {point.price !== null ? (
          <MenuItem className={itemClass} onClick={() => void copyPrice()}>
            <span aria-hidden="true" className="size-4.5 shrink-0" />
            Copy price {point.price}
          </MenuItem>
        ) : null}
        <MenuItem className={itemClass} onClick={() => void paste()}>
          <span aria-hidden="true" className="size-4.5 shrink-0" />
          Paste
          <MenuShortcut className="tracking-normal">{mac ? "⌘" : "Ctrl"} V</MenuShortcut>
        </MenuItem>
      </MenuPopup>
    </ContextMenu.Root>
  );
}
