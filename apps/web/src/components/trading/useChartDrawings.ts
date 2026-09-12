import { useCallback, useEffect, useRef, useState } from "react";
import { randomUUID } from "../../lib/utils";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import {
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import {
  DRAWING_ANCHORS,
  buildDrawingGeometry,
  drawingTimeValue,
  hitDrawingGeometry,
  parseChartDrawings,
  type ChartDrawing,
  type DrawingAnchor,
  type DrawingKind,
} from "./drawingGeometry";
import { createDrawingPrimitive, drawingProjection } from "./drawingPrimitive";
export type ChartDrawingTool = "cursor" | DrawingKind;
export type DrawingState = {
  tool: ChartDrawingTool;
  count: number;
  pending: boolean;
  canUndo: boolean;
  selected: ChartDrawing | null;
  instruction: string;
};
type DrawingStorage = Pick<Storage, "getItem" | "setItem">;
const EMPTY: DrawingState = {
  tool: "cursor",
  count: 0,
  pending: false,
  canUndo: false,
  selected: null,
  instruction: "",
};

/** Each session binds to the workspace-scoped storage and the selected contract. */
export function createChartDrawingSession(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  symbol: string,
  onChange: (state: DrawingState) => void,
  storage: DrawingStorage | undefined = tradingWorkspaceStorage,
) {
  const key = `automorphic:chart-drawings:v1:${encodeURIComponent(symbol)}`;
  let drawings: ChartDrawing[] = [];
  try {
    drawings = parseChartDrawings(storage?.getItem(key) ?? null);
  } catch {
    /* Storage may be unavailable. */
  }
  let tool: ChartDrawingTool = "cursor";
  let anchors: DrawingAnchor[] = [];
  let selectedId: string | null = null;
  let replacingId: string | null = null;
  let disposed = false;
  const history: ChartDrawing[][] = [];
  const removers: Array<() => void> = [];
  const primitive = createDrawingPrimitive(chart, series, () => ({
    drawings,
    selected: selectedId,
  }));
  series.attachPrimitive(primitive.primitive);
  const emit = () => {
    const selected = drawings.find((drawing) => drawing.id === selectedId) ?? null;
    const remaining = tool === "cursor" ? 0 : DRAWING_ANCHORS[tool] - anchors.length;
    const instruction =
      tool === "cursor"
        ? ""
        : remaining === 1
          ? tool === "channel"
            ? "Set channel width · Esc to cancel"
            : "Place point · Esc to cancel"
          : `Place ${anchors.length ? "next" : "first"} point · Esc to cancel`;
    onChange({
      tool,
      count: drawings.length,
      pending: anchors.length > 0,
      canUndo: !!(anchors.length || history.length || drawings.length || replacingId),
      selected,
      instruction,
    });
    primitive.redraw();
  };
  const persist = () => {
    try {
      storage?.setItem(key, JSON.stringify(drawings));
    } catch {
      /* Keep local edits usable. */
    }
  };
  const remember = () => {
    history.push(drawings.slice());
    if (history.length > 50) history.shift();
  };
  const removeAll = () => {
    while (removers.length) {
      try {
        removers.pop()?.();
      } catch {
        /* Parent chart may already be disposed. */
      }
    }
  };
  const render = () => {
    removeAll();
    for (const drawing of drawings) {
      if (drawing.kind === "horizontal") {
        const line = series.createPriceLine({
          price: drawing.anchors[0]!.price,
          color: drawing.color,
          lineWidth: drawing.width as 1 | 2 | 3 | 4,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "",
        });
        removers.push(() => series.removePriceLine(line));
      } else if (drawing.kind === "trend") {
        const line = chart.addSeries(
          LineSeries,
          {
            color: drawing.color,
            lineWidth: drawing.width as 1 | 2 | 3 | 4,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            autoscaleInfoProvider: () => null,
            priceScaleId: series.options().priceScaleId ?? "right",
          },
          series.getPane().paneIndex(),
        );
        line.setData(
          [...drawing.anchors]
            .sort((a, b) => drawingTimeValue(a.time)! - drawingTimeValue(b.time)!)
            .map(({ time, price }) => ({ time, value: price })),
        );
        removers.push(() => chart.removeSeries(line));
      }
    }
    primitive.redraw();
  };
  const setTool = (next: ChartDrawingTool) => {
    if (disposed) return;
    tool = next;
    anchors = [];
    replacingId = null;
    emit();
  };
  const changed = () => {
    persist();
    render();
    emit();
  };
  const click = (event: MouseEventParams<Time>) => {
    if (
      disposed ||
      !event.point ||
      (event.paneIndex !== undefined && event.paneIndex !== series.getPane().paneIndex())
    )
      return;
    if (tool === "cursor") {
      const projection = drawingProjection(chart, series);
      selectedId =
        drawings
          .toReversed()
          .find((drawing) =>
            hitDrawingGeometry(
              buildDrawingGeometry(
                drawing,
                projection.project,
                projection.priceY,
                projection.width,
                projection.height,
              ),
              event.point!,
            ),
          )?.id ?? null;
      emit();
      return;
    }
    const price = series.coordinateToPrice(event.point.y);
    if (price === null || !Number.isFinite(price)) return;
    if (
      tool !== "horizontal" &&
      (event.time === undefined || drawingTimeValue(event.time) === null)
    )
      return;
    const anchor = { time: event.time ?? (0 as Time), price };
    if (
      anchors.length === 1 &&
      ["trend", "rectangle", "fib", "channel"].includes(tool) &&
      drawingTimeValue(anchors[0]!.time) === drawingTimeValue(anchor.time)
    )
      return;
    if (
      tool === "ray" &&
      anchors.length === 1 &&
      drawingTimeValue(anchors[0]!.time) === drawingTimeValue(anchor.time) &&
      anchors[0]!.price === anchor.price
    )
      return;
    anchors.push(anchor);
    if (anchors.length < DRAWING_ANCHORS[tool]) {
      emit();
      return;
    }
    remember();
    const previous = drawings.find((drawing) => drawing.id === replacingId);
    const drawing: ChartDrawing = {
      id: previous?.id ?? randomUUID(),
      kind: tool,
      anchors,
      color: previous?.color ?? "#729bff",
      width: previous?.width ?? 2,
      ...(tool === "text" ? { text: previous?.text ?? "Text" } : {}),
    };
    drawings = replacingId
      ? drawings.map((item) => (item.id === replacingId ? drawing : item))
      : [...drawings, drawing].slice(-100);
    selectedId = drawing.id;
    anchors = [];
    tool = "cursor";
    replacingId = null;
    changed();
  };
  chart.subscribeClick(click);
  render();
  emit();
  return {
    setTool,
    cancel: () => setTool("cursor"),
    undo: () => {
      if (disposed) return;
      if (anchors.length || replacingId) {
        setTool("cursor");
        return;
      }
      if (!drawings.length && !history.length) return;
      drawings = history.pop() ?? drawings.slice(0, -1);
      selectedId = null;
      changed();
    },
    clear: () => {
      if (disposed) return;
      remember();
      drawings = [];
      anchors = [];
      selectedId = null;
      replacingId = null;
      tool = "cursor";
      changed();
    },
    deleteSelected: () => {
      if (disposed || !selectedId) return;
      remember();
      drawings = drawings.filter((drawing) => drawing.id !== selectedId);
      selectedId = null;
      changed();
    },
    redrawSelected: () => {
      const selected = drawings.find((drawing) => drawing.id === selectedId);
      if (!selected || disposed) return;
      tool = selected.kind;
      replacingId = selected.id;
      anchors = [];
      emit();
    },
    updateSelected: (patch: { color?: string; width?: number; text?: string }) => {
      if (disposed || !selectedId) return;
      if (patch.color !== undefined && !/^#[a-f\d]{6}$/i.test(patch.color)) return;
      if (patch.width !== undefined && ![1, 2, 3, 4].includes(patch.width)) return;
      remember();
      drawings = drawings.map((drawing) =>
        drawing.id === selectedId
          ? {
              ...drawing,
              ...patch,
              ...(patch.text !== undefined ? { text: patch.text.slice(0, 140) } : {}),
            }
          : drawing,
      );
      changed();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        chart.unsubscribeClick(click);
        series.detachPrimitive(primitive.primitive);
      } catch {
        /* Chart already disposed. */
      }
      removeAll();
      anchors = [];
    },
  };
}
export function useChartDrawings(
  chart: IChartApi | null,
  series: ISeriesApi<SeriesType> | null,
  symbol: string,
) {
  const [state, setState] = useState<DrawingState>(EMPTY);
  const session = useRef<ReturnType<typeof createChartDrawingSession> | null>(null);
  useEffect(() => {
    if (!chart || !series || !symbol) return;
    const current = createChartDrawingSession(chart, series, symbol, setState);
    session.current = current;
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      if (event.key === "Escape") current.cancel();
      if (event.key === "Delete" || event.key === "Backspace") current.deleteSelected();
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("keydown", keyboard);
      current.dispose();
      if (session.current === current) session.current = null;
    };
  }, [chart, series, symbol]);
  const setTool = useCallback((tool: ChartDrawingTool) => session.current?.setTool(tool), []);
  const undo = useCallback(() => session.current?.undo(), []);
  const clear = useCallback(() => session.current?.clear(), []);
  const deleteSelected = useCallback(() => session.current?.deleteSelected(), []);
  const redrawSelected = useCallback(() => session.current?.redrawSelected(), []);
  const updateSelected = useCallback(
    (patch: { color?: string; width?: number; text?: string }) =>
      session.current?.updateSelected(patch),
    [],
  );
  return { ...state, setTool, undo, clear, deleteSelected, redrawSelected, updateSelected };
}
export type ChartDrawingsController = ReturnType<typeof useChartDrawings>;
