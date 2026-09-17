import type { IChartApi } from "lightweight-charts";
import { equalChartPaneSizes, type ChartPaneSizes } from "./chartPaneSizes";

/** Native separators update during movement; persist once on release, never on chart pan. */
export function trackChartPaneResize(
  chart: IChartApi,
  read: () => ChartPaneSizes,
  save: (sizes: ChartPaneSizes) => void,
  isCurrent: () => boolean,
) {
  const host = chart.chartElement();
  const document = host.ownerDocument;
  let gesture: {
    touchId: number | null;
    panes: (HTMLElement | null)[];
    sizes: ChartPaneSizes;
  } | null = null;
  const start = (touchId: number | null) => {
    gesture = isCurrent()
      ? {
          touchId,
          panes: chart.panes().map((pane) => pane.getHTMLElement()),
          sizes: read(),
        }
      : null;
  };
  const finish = () => {
    const started = gesture;
    gesture = null;
    if (!started || !isCurrent()) return;
    const panes = chart.panes();
    if (
      panes.length !== started.panes.length ||
      panes.some((pane, i) => pane.getHTMLElement() !== started.panes[i])
    )
      return;
    const sizes = read();
    if (!equalChartPaneSizes(started.sizes, sizes)) save(sizes);
  };
  const mouseDown = (event: MouseEvent) => {
    if (event.button === 0) start(null);
  };
  const mouseUp = (event: MouseEvent) => {
    if (event.button === 0 && gesture?.touchId === null) finish();
  };
  const touchStart = (event: TouchEvent) => {
    if (event.touches.length === 1) start(event.touches[0]!.identifier);
    else gesture = null;
  };
  const touchEnd = (event: TouchEvent) => {
    if (Array.from(event.changedTouches).some((touch) => touch.identifier === gesture?.touchId))
      finish();
  };
  const cancel = () => {
    gesture = null;
  };
  host.addEventListener("mousedown", mouseDown, true);
  host.addEventListener("touchstart", touchStart, { capture: true, passive: true });
  document.addEventListener("mouseup", mouseUp, true);
  document.addEventListener("touchend", touchEnd, true);
  document.addEventListener("touchcancel", cancel, true);
  document.defaultView?.addEventListener("blur", cancel);
  return () => {
    cancel();
    host.removeEventListener("mousedown", mouseDown, true);
    host.removeEventListener("touchstart", touchStart, true);
    document.removeEventListener("mouseup", mouseUp, true);
    document.removeEventListener("touchend", touchEnd, true);
    document.removeEventListener("touchcancel", cancel, true);
    document.defaultView?.removeEventListener("blur", cancel);
  };
}
