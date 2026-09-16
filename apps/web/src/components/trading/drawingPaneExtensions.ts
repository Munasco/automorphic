import type {
  IChartApi,
  IPaneApi,
  IPanePrimitive,
  IPanePrimitivePaneView,
  ISeriesApi,
  SeriesType,
  Time,
} from "lightweight-charts";
import { drawingTimeValue, type ChartDrawing } from "./drawingGeometry";
import { drawingTimeCoordinate } from "./drawingPrimitive";

/** Time-only inverse projection for vertical drags, independent of any pane's price scale. */
export function drawingPaneTimeAtCoordinate(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  x: number,
): Time | null {
  const scale = chart.timeScale();
  const time = scale.coordinateToTime(x);
  if (time !== null) return time;
  const data = series.data();
  if (data.length < 2) return null;
  const firstX = scale.timeToCoordinate(data[0]!.time);
  const start = firstX !== null && x < firstX ? 0 : data.length - 2;
  const a = data[start]!,
    b = data[start + 1]!;
  const ax = scale.timeToCoordinate(a.time),
    bx = scale.timeToCoordinate(b.time);
  const at = drawingTimeValue(a.time),
    bt = drawingTimeValue(b.time);
  if (ax === null || bx === null || ax === bx || at === null || bt === null) return null;
  const result = at + ((x - ax) / (bx - ax)) * (bt - at);
  return Number.isFinite(result) ? (result as Time) : null;
}

/** Extend vertical strokes through existing indicator panes without creating series or price scales. */
export function createDrawingPaneExtensions(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  read: () => readonly ChartDrawing[],
) {
  let disposed = false;
  const entries = new Map<
    IPaneApi<Time>,
    { primitive: IPanePrimitive<Time>; redraw: () => void; release: () => void }
  >();
  const drawings = () =>
    read().filter(
      (drawing) =>
        drawing.kind === "vertical" &&
        drawing.extendAcrossPanes !== false &&
        !drawing.hidden &&
        drawing.anchors.length > 0,
    );
  const remove = (pane: IPaneApi<Time>) => {
    const entry = entries.get(pane);
    if (!entry) return;
    entry.release();
    entries.delete(pane);
    try {
      pane.detachPrimitive(entry.primitive);
    } catch {
      /* The pane or chart may already be removed. */
    }
  };
  const sync = () => {
    if (disposed || typeof chart.panes !== "function") return;
    let wanted: Set<IPaneApi<Time>>;
    try {
      const sourcePane = series.getPane();
      wanted = new Set(
        drawings().length ? chart.panes().filter((pane) => pane !== sourcePane) : [],
      );
    } catch {
      // Series/indicator teardown may precede the owning React effect's cleanup.
      for (const pane of entries.keys()) remove(pane);
      return;
    }
    for (const pane of entries.keys()) if (!wanted.has(pane)) remove(pane);
    for (const pane of wanted) {
      if (entries.has(pane)) continue;
      let requestUpdate: (() => void) | undefined;
      let attached = true;
      const views: IPanePrimitivePaneView[] = [
        {
          zOrder: () => "top" as const,
          renderer: () => ({
            draw(target) {
              if (!attached || disposed) return;
              target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                context.save();
                context.beginPath();
                context.rect(0, 0, mediaSize.width, mediaSize.height);
                context.clip();
                context.lineCap = "round";
                for (const drawing of drawings()) {
                  const x = drawingTimeCoordinate(chart, series, drawing.anchors[0]!.time);
                  if (x === null || !Number.isFinite(x) || x < 0 || x > mediaSize.width) continue;
                  context.strokeStyle = drawing.color;
                  context.lineWidth = drawing.width;
                  context.globalAlpha = drawing.lineOpacity ?? 1;
                  context.setLineDash(
                    drawing.lineStyle === "dashed"
                      ? [8, 5]
                      : drawing.lineStyle === "dotted"
                        ? [2, 4]
                        : [],
                  );
                  context.beginPath();
                  context.moveTo(x, 0);
                  context.lineTo(x, mediaSize.height);
                  context.stroke();
                }
                context.restore();
              });
            },
          }),
        },
      ];
      const release = () => {
        attached = false;
        requestUpdate = undefined;
      };
      const primitive: IPanePrimitive<Time> = {
        paneViews: () => views,
        attached: (parameters) => {
          requestUpdate = parameters.requestUpdate;
        },
        detached: release,
      };
      entries.set(pane, { primitive, redraw: () => requestUpdate?.(), release });
      pane.attachPrimitive(primitive);
      requestUpdate?.();
    }
  };
  // LWC exposes no pane-topology event. Pane creation/removal/reorder changes its DOM;
  // child-list observation reconciles attachments without watching every canvas/style update.
  const element = typeof chart.chartElement === "function" ? chart.chartElement() : null;
  const observer =
    element && typeof MutationObserver !== "undefined" ? new MutationObserver(sync) : null;
  observer?.observe(element!, { childList: true, subtree: true });
  sync();
  return {
    hitTest(x: number, paneIndex: number): ChartDrawing | null {
      if (disposed || !Number.isFinite(x) || x < 0 || x > chart.paneSize().width) return null;
      const pane = chart.panes?.()[paneIndex];
      if (!pane || pane === series.getPane() || !entries.has(pane)) return null;
      for (const drawing of drawings().toReversed()) {
        const coordinate = drawingTimeCoordinate(chart, series, drawing.anchors[0]!.time);
        if (coordinate !== null && Math.abs(x - coordinate) <= Math.max(6, drawing.width / 2 + 3))
          return drawing;
      }
      return null;
    },
    redraw() {
      if (disposed) return;
      sync();
      entries.forEach((entry) => entry.redraw());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      for (const pane of entries.keys()) remove(pane);
    },
  };
}
