import { useCallback, useEffect, useRef, useState } from "react";
import { randomUUID } from "../../lib/utils";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import {
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
  hitDrawingHandle,
  isVariableDrawingTool,
  isFreehandDrawingTool,
  maximumDrawingAnchors,
  parseChartDrawings,
  validDrawingAnchors,
  type ChartDrawing,
  type DrawingAnchor,
  type DrawingKind,
  type DrawingPoint,
} from "./drawingGeometry";
import { createDrawingPrimitive, drawingProjection } from "./drawingPrimitive";
export type ChartDrawingTool = "cursor" | DrawingKind;
export type DrawingMagnetMode = "off" | "weak" | "strong";
export type DrawingState = {
  tool: ChartDrawingTool;
  count: number;
  objects: readonly ChartDrawing[];
  pending: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hidden: boolean;
  magnet: boolean;
  magnetMode: DrawingMagnetMode;
  keepDrawing: boolean;
  selected: ChartDrawing | null;
  instruction: string;
};
type DrawingPatch = Partial<
  Pick<ChartDrawing, "color" | "width" | "text" | "lineStyle" | "locked" | "hidden" | "name">
>;
type DrawingStorage = Pick<Storage, "getItem" | "setItem">;
const EMPTY: DrawingState = {
  tool: "cursor",
  count: 0,
  objects: [],
  pending: false,
  canUndo: false,
  canRedo: false,
  hidden: false,
  magnet: false,
  magnetMode: "off",
  keepDrawing: false,
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
  let hidden = false;
  const controlSettingsKey = "automorphic:drawing-controls:v1";
  let magnetMode: DrawingMagnetMode = "off";
  let lastMagnetMode: Exclude<DrawingMagnetMode, "off"> = "weak";
  let keepDrawing = false;
  try {
    const settings: unknown = JSON.parse(storage?.getItem(controlSettingsKey) ?? "null");
    if (settings && typeof settings === "object") {
      if (
        "magnetMode" in settings &&
        (settings.magnetMode === "weak" || settings.magnetMode === "strong")
      )
        magnetMode = settings.magnetMode;
      if (
        "lastMagnetMode" in settings &&
        (settings.lastMagnetMode === "weak" || settings.lastMagnetMode === "strong")
      )
        lastMagnetMode = settings.lastMagnetMode;
      if (magnetMode !== "off") lastMagnetMode = magnetMode;
      keepDrawing = "keepDrawing" in settings && settings.keepDrawing === true;
    }
  } catch {
    /* Ignore unavailable storage or invalid preferences. */
  }
  const persistControls = () => {
    try {
      storage?.setItem(
        controlSettingsKey,
        JSON.stringify({ magnetMode, lastMagnetMode, keepDrawing }),
      );
    } catch {
      /* Keep controls usable without storage. */
    }
  };
  let strokeLastPoint: DrawingPoint | null = null;
  let preview: ChartDrawing | null = null;
  let drag: {
    drawing: ChartDrawing;
    origin: DrawingPoint;
    points: DrawingPoint[];
    handle: number;
    moved: boolean;
  } | null = null;
  const history: ChartDrawing[][] = [];
  const future: ChartDrawing[][] = [];
  const removers: Array<() => void> = [];
  const primitive = createDrawingPrimitive(chart, series, () => ({
    drawings,
    selected: selectedId,
    preview,
    hidden,
  }));
  series.attachPrimitive(primitive.primitive);
  const emit = () => {
    const selected = drawings.find((drawing) => drawing.id === selectedId) ?? null;
    const remaining = tool === "cursor" ? 0 : DRAWING_ANCHORS[tool] - anchors.length;
    const instruction =
      tool === "cursor"
        ? drag
          ? "Drag drawing · Esc to cancel"
          : selected
            ? selected.locked
              ? "Drawing locked"
              : "Drag to move · Drag handles to resize"
            : ""
        : isFreehandDrawingTool(tool)
          ? "Drag to draw · Release to finish · Esc to cancel"
          : isVariableDrawingTool(tool)
            ? "Click to add points · Double-click or Enter to finish · Esc to cancel"
            : remaining === 1
              ? tool === "channel"
                ? "Set channel width · Esc to cancel"
                : "Place point · Esc to cancel"
              : `Place ${anchors.length ? "next" : "first"} point · Esc to cancel`;
    onChange({
      tool,
      count: drawings.length,
      objects: drawings,
      pending: anchors.length > 0,
      canUndo: !!(anchors.length || history.length || drawings.length || replacingId),
      canRedo: future.length > 0,
      hidden,
      magnet: magnetMode !== "off",
      magnetMode,
      keepDrawing,
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
    future.length = 0;
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
    if (hidden) {
      primitive.redraw();
      return;
    }
    for (const drawing of drawings) {
      if (drawing.hidden) continue;
      if (drawing.kind === "horizontal") {
        const line = series.createPriceLine({
          price: drawing.anchors[0]!.price,
          color: drawing.color,
          lineWidth: drawing.width as 1 | 2 | 3 | 4,
          lineStyle:
            drawing.lineStyle === "dashed"
              ? LineStyle.Dashed
              : drawing.lineStyle === "dotted"
                ? LineStyle.Dotted
                : LineStyle.Solid,
          axisLabelVisible: true,
          title: "",
        });
        removers.push(() => series.removePriceLine(line));
      }
    }
    primitive.redraw();
  };
  const setTool = (next: ChartDrawingTool) => {
    if (disposed) return;
    endDrag(false);
    tool = next;
    anchors = [];
    preview = null;
    replacingId = null;
    if (next !== "cursor" && hidden) {
      hidden = false;
      render();
    }
    emit();
  };
  const changed = () => {
    persist();
    render();
    emit();
  };
  const geometry = (drawing: ChartDrawing) => {
    const projection = drawingProjection(chart, series);
    return buildDrawingGeometry(
      drawing,
      projection.project,
      projection.priceY,
      projection.width,
      projection.height,
    );
  };
  const hit = (point: DrawingPoint) =>
    hidden
      ? undefined
      : drawings.toReversed().find((drawing) => hitDrawingGeometry(geometry(drawing), point));
  const beginDrag = (point: DrawingPoint) => {
    if (disposed || hidden) return false;
    if (tool !== "cursor" && isFreehandDrawingTool(tool)) {
      const anchor = drawingProjection(chart, series).unproject(point);
      if (!anchor) return false;
      anchors = [snapAnchor(anchor, point)];
      strokeLastPoint = point;
      updatePreview(anchors);
      emit();
      return true;
    }
    if (tool !== "cursor") return false;
    const selected = drawings.find((drawing) => drawing.id === selectedId);
    const handle = selected ? hitDrawingHandle(geometry(selected), point) : -1;
    const drawing = handle >= 0 ? selected : hit(point);
    if (!drawing) return false;
    selectedId = drawing.id;
    emit();
    if (drawing.locked) return false;
    const points = drawing.anchors.map((anchor) =>
      drawingProjection(chart, series).project(anchor),
    );
    if (points.some((p) => p === null)) return false;
    drag = {
      drawing,
      origin: point,
      points: points as DrawingPoint[],
      handle: drawing === selected ? handle : -1,
      moved: false,
    };
    return true;
  };
  const snapAnchor = (anchor: DrawingAnchor, point: DrawingPoint): DrawingAnchor => {
    if (magnetMode === "off") return anchor;
    const logical = chart.timeScale().coordinateToLogical(point.x);
    if (logical === null) return anchor;
    const candle = series.dataByIndex(Math.round(logical));
    if (!candle || !("open" in candle)) return anchor;
    let distance = magnetMode === "strong" ? Infinity : 12;
    let snapped = anchor;
    for (const price of [candle.open, candle.high, candle.low, candle.close]) {
      const y = series.priceToCoordinate(price);
      if (y === null || !Number.isFinite(price)) continue;
      const delta = Math.abs(point.y - y);
      if (delta <= distance) {
        distance = delta;
        snapped = { time: candle.time, price };
      }
    }
    return snapped;
  };
  const dragTo = (point: DrawingPoint) => {
    if (disposed) return;
    if (strokeLastPoint && tool !== "cursor" && isFreehandDrawingTool(tool)) {
      if (Math.hypot(point.x - strokeLastPoint.x, point.y - strokeLastPoint.y) < 3) return;
      const anchor = drawingProjection(chart, series).unproject(point);
      if (!anchor || anchors.length >= maximumDrawingAnchors(tool)) return;
      strokeLastPoint = point;
      const next = snapAnchor(anchor, point);
      if (sameAnchor(anchors.at(-1), next)) return;
      anchors = [...anchors, next];
      updatePreview(anchors);
      primitive.redraw();
      return;
    }
    if (!drag) return;
    const activeDrag = drag;
    let dx = point.x - activeDrag.origin.x,
      dy = point.y - activeDrag.origin.y;
    if (!activeDrag.moved && Math.hypot(dx, dy) < 3) return;
    const projection = drawingProjection(chart, series);
    // Snap one reference point, then translate the entire shape by that same offset.
    const reference = activeDrag.points[Math.max(0, activeDrag.handle)]!;
    const candidate = {
      x: activeDrag.drawing.kind === "horizontal" ? point.x : reference.x + dx,
      y: reference.y + dy,
    };
    const candidateAnchor = magnetMode !== "off" ? projection.unproject(candidate) : null;
    if (candidateAnchor) {
      const snapped = snapAnchor(candidateAnchor, candidate);
      if (snapped !== candidateAnchor) {
        const projected = projection.project(snapped);
        if (projected) {
          dx += projected.x - candidate.x;
          dy += projected.y - candidate.y;
        }
      }
    }
    const moved = activeDrag.drawing.anchors.map((anchor, index) => {
      if (activeDrag.handle >= 0 && index !== activeDrag.handle) return anchor;
      const old = activeDrag.points[index]!;
      if (activeDrag.drawing.kind === "horizontal") {
        const price = series.coordinateToPrice(old.y + dy);
        return price === null ? null : { ...anchor, price };
      }
      const moved = projection.unproject({ x: old.x + dx, y: old.y + dy });
      return moved && Math.abs(dx) < 1 ? { ...moved, time: anchor.time } : moved;
    });
    if (
      moved.some((anchor) => anchor === null) ||
      !validDrawingAnchors(drag.drawing.kind, moved as DrawingAnchor[])
    )
      return;
    const next = { ...drag.drawing, anchors: moved as DrawingAnchor[] };
    drawings = drawings.map((item) => (item.id === next.id ? next : item));
    drag.moved = true;
    if (drag.drawing.kind === "horizontal") render();
    emit();
  };
  const endDrag = (commit = true) => {
    if (strokeLastPoint) {
      strokeLastPoint = null;
      if (commit && commitDrawing()) return;
      anchors = [];
      preview = null;
      emit();
      return;
    }
    if (!drag) return;
    const original = drag;
    drag = null;
    if (original.moved && commit) {
      future.length = 0;
      history.push(
        drawings.map((item) => (item.id === original.drawing.id ? original.drawing : item)),
      );
      if (history.length > 50) history.shift();
      persist();
    } else {
      drawings = drawings.map((item) =>
        item.id === original.drawing.id ? original.drawing : item,
      );
    }
    render();
    emit();
  };
  const sameAnchor = (a: DrawingAnchor | undefined, b: DrawingAnchor) =>
    a !== undefined && drawingTimeValue(a.time) === drawingTimeValue(b.time) && a.price === b.price;
  const updatePreview = (points: DrawingAnchor[]) => {
    if (tool === "cursor") return;
    const previous = drawings.find((drawing) => drawing.id === replacingId);
    preview = {
      id: "preview",
      kind: tool,
      anchors: points,
      color: previous?.color ?? "#729bff",
      width: previous?.width ?? 2,
      lineStyle: isFreehandDrawingTool(tool) ? "solid" : "dashed",
      text: previous?.text ?? "Text",
    };
  };
  const commitDrawing = () => {
    if (disposed || tool === "cursor" || !validDrawingAnchors(tool, anchors)) return false;
    remember();
    const previous = drawings.find((drawing) => drawing.id === replacingId);
    const drawing: ChartDrawing = {
      ...previous,
      id: previous?.id ?? randomUUID(),
      kind: tool,
      anchors,
      color: previous?.color ?? "#729bff",
      width: previous?.width ?? 2,
      ...(previous?.lineStyle ? { lineStyle: previous.lineStyle } : {}),
      ...(tool === "text" ? { text: previous?.text ?? "Text" } : {}),
    };
    drawings = replacingId
      ? drawings.map((item) => (item.id === replacingId ? drawing : item))
      : [...drawings, drawing].slice(-100);
    selectedId = drawing.id;
    anchors = [];
    if (!keepDrawing || replacingId) tool = "cursor";
    replacingId = null;
    preview = null;
    changed();
    return true;
  };
  const finishDrawing = () => {
    if (tool === "cursor" || !isVariableDrawingTool(tool) || isFreehandDrawingTool(tool))
      return false;
    return commitDrawing();
  };
  const move = (event: MouseEventParams<Time>) => {
    if (disposed || tool === "cursor" || hidden || strokeLastPoint) return;
    preview = null;
    if (
      event.point &&
      !isFreehandDrawingTool(tool) &&
      (event.paneIndex === undefined || event.paneIndex === series.getPane().paneIndex())
    ) {
      const price = series.coordinateToPrice(event.point.y);
      const anchor =
        price === null
          ? null
          : event.time !== undefined
            ? { time: event.time, price }
            : tool === "horizontal"
              ? { time: 0 as Time, price }
              : drawingProjection(chart, series).unproject(event.point);
      if (anchor) {
        const next = snapAnchor(anchor, event.point);
        updatePreview(sameAnchor(anchors.at(-1), next) ? anchors : [...anchors, next]);
      }
    }
    primitive.redraw();
  };
  const click = (event: MouseEventParams<Time>) => {
    if (
      disposed ||
      !event.point ||
      (event.paneIndex !== undefined && event.paneIndex !== series.getPane().paneIndex())
    )
      return;
    if (tool === "cursor") {
      selectedId = hit(event.point)?.id ?? null;
      emit();
      return;
    }
    if (isFreehandDrawingTool(tool)) return;
    const price = series.coordinateToPrice(event.point.y);
    if (price === null || !Number.isFinite(price)) return;
    const fallback =
      event.time === undefined && tool !== "horizontal"
        ? drawingProjection(chart, series).unproject(event.point)
        : null;
    const time = event.time ?? fallback?.time ?? (tool === "horizontal" ? (0 as Time) : undefined);
    if (time === undefined || drawingTimeValue(time) === null) return;
    const anchor = snapAnchor({ time, price }, event.point);
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
    if (sameAnchor(anchors.at(-1), anchor) || anchors.length >= maximumDrawingAnchors(tool)) return;
    const next = [...anchors, anchor];
    const variable = isVariableDrawingTool(tool);
    if (!variable && next.length === DRAWING_ANCHORS[tool] && !validDrawingAnchors(tool, next))
      return;
    anchors = next;
    if (!variable && anchors.length === DRAWING_ANCHORS[tool]) {
      commitDrawing();
    } else {
      updatePreview(anchors);
      emit();
    }
  };
  const updateDrawing = (id: string, patch: DrawingPatch) => {
    if (disposed || !drawings.some((drawing) => drawing.id === id)) return;
    if (patch.color !== undefined && !/^#[a-f\d]{6}$/i.test(patch.color)) return;
    if (patch.width !== undefined && ![1, 2, 3, 4].includes(patch.width)) return;
    if (patch.lineStyle !== undefined && !["solid", "dashed", "dotted"].includes(patch.lineStyle))
      return;
    endDrag(false);
    const normalized = {
      ...patch,
      ...(patch.text !== undefined ? { text: patch.text.slice(0, 140) } : {}),
      ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 80) } : {}),
    };
    const current = drawings.find((drawing) => drawing.id === id)!;
    if (
      Object.entries(normalized).every(
        ([key, value]) => current[key as keyof ChartDrawing] === value,
      )
    )
      return;
    remember();
    drawings = drawings.map((drawing) =>
      drawing.id === id ? { ...drawing, ...normalized } : drawing,
    );
    changed();
  };
  const deleteDrawing = (id: string) => {
    if (disposed || !drawings.some((drawing) => drawing.id === id)) return;
    setTool("cursor");
    remember();
    drawings = drawings.filter((drawing) => drawing.id !== id);
    if (selectedId === id) selectedId = null;
    changed();
  };
  chart.subscribeClick(click);
  chart.subscribeCrosshairMove(move);
  render();
  emit();
  return {
    setTool,
    beginDrag,
    dragTo,
    endDrag,
    finishDrawing,
    cancel: () => setTool("cursor"),
    undo: () => {
      if (disposed) return;
      if (drag || strokeLastPoint) {
        endDrag(false);
        return;
      }
      if (anchors.length || replacingId) {
        setTool("cursor");
        return;
      }
      if (!drawings.length && !history.length) return;
      future.push(drawings.slice());
      drawings = history.pop() ?? drawings.slice(0, -1);
      selectedId = null;
      changed();
    },
    redo: () => {
      if (disposed || !future.length) return;
      setTool("cursor");
      history.push(drawings.slice());
      drawings = future.pop()!;
      selectedId = null;
      changed();
    },
    setMagnetMode: (mode: DrawingMagnetMode) => {
      if (disposed || !["off", "weak", "strong"].includes(mode)) return;
      magnetMode = mode;
      if (mode !== "off") lastMagnetMode = mode;
      persistControls();
      if (!strokeLastPoint) preview = null;
      emit();
    },
    toggleMagnet: () => {
      if (disposed) return;
      magnetMode = magnetMode === "off" ? lastMagnetMode : "off";
      persistControls();
      if (!strokeLastPoint) preview = null;
      emit();
    },
    setKeepDrawing: (enabled: boolean) => {
      if (disposed) return;
      keepDrawing = enabled;
      persistControls();
      emit();
    },
    toggleHidden: () => {
      if (disposed) return;
      endDrag(false);
      hidden = !hidden;
      preview = null;
      tool = "cursor";
      anchors = [];
      replacingId = null;
      render();
      emit();
    },
    clear: () => {
      if (disposed) return;
      endDrag(false);
      remember();
      drawings = [];
      anchors = [];
      selectedId = null;
      replacingId = null;
      tool = "cursor";
      preview = null;
      changed();
    },
    selectDrawing: (id: string) => {
      if (disposed || !drawings.some((drawing) => drawing.id === id)) return;
      setTool("cursor");
      selectedId = id;
      emit();
    },
    updateDrawing,
    deleteDrawing,
    duplicateDrawing: (id: string) => {
      if (disposed || drawings.length >= 100) return;
      setTool("cursor");
      const original = drawings.find((drawing) => drawing.id === id);
      if (!original) return;
      remember();
      const copy = {
        ...original,
        id: randomUUID(),
        name: `${original.name || original.text || original.kind} copy`.slice(0, 80),
        anchors: original.anchors.map((anchor) => ({ ...anchor })),
        locked: false,
      };
      drawings = [...drawings, copy];
      selectedId = copy.id;
      changed();
    },
    deleteSelected: () => {
      if (selectedId) deleteDrawing(selectedId);
    },
    redrawSelected: () => {
      const selected = drawings.find((drawing) => drawing.id === selectedId);
      if (!selected || selected.locked || disposed) return;
      tool = selected.kind;
      replacingId = selected.id;
      anchors = [];
      emit();
    },
    updateSelected: (patch: DrawingPatch) => {
      if (selectedId) updateDrawing(selectedId, patch);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        chart.unsubscribeClick(click);
        chart.unsubscribeCrosshairMove(move);
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
    const element = chart.chartElement();
    const originalTabIndex = element.getAttribute("tabindex");
    element.tabIndex = 0;
    let pointerId: number | null = null;
    const pointFor = (event: PointerEvent) => {
      const pane = series.getPane().getHTMLElement();
      if (!pane) return null;
      const rect = pane.getBoundingClientRect();
      return {
        x:
          event.clientX -
          rect.left -
          chart.priceScale("left", series.getPane().paneIndex()).width(),
        y: event.clientY - rect.top,
      };
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      const point = pointFor(event);
      if (
        !point ||
        point.x < 0 ||
        point.x > chart.timeScale().width() ||
        point.y < 0 ||
        point.y > series.getPane().getHeight()
      )
        return;
      element.focus({ preventScroll: true });
      if (!current.beginDrag(point)) return;
      pointerId = event.pointerId;
      element.setPointerCapture(pointerId);
      event.preventDefault();
      event.stopPropagation();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const point = pointFor(event);
      if (point) current.dragTo(point);
      event.preventDefault();
      event.stopPropagation();
    };
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const point = pointFor(event);
      if (point && event.type === "pointerup") current.dragTo(point);
      current.endDrag(event.type === "pointerup");
      pointerId = null;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };
    const doubleClick = (event: MouseEvent) => {
      if (!current.finishDrawing()) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const stopTouchPan = (event: TouchEvent) => {
      if (pointerId === null) return;
      event.preventDefault();
      event.stopPropagation();
    };
    element.addEventListener("dblclick", doubleClick, true);
    element.addEventListener("pointerdown", down, true);
    element.addEventListener("pointermove", move, true);
    element.addEventListener("pointerup", finish, true);
    element.addEventListener("pointercancel", finish, true);
    element.addEventListener("lostpointercapture", finish, true);
    element.addEventListener("touchstart", stopTouchPan, { capture: true, passive: false });
    element.addEventListener("touchmove", stopTouchPan, { capture: true, passive: false });
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      if (event.key === "Escape") current.cancel();
      if (!element.contains(document.activeElement)) return;
      if (event.key === "Enter" && current.finishDrawing()) event.preventDefault();
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        current.deleteSelected();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) current.redo();
        else current.undo();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("keydown", keyboard);
      element.removeEventListener("dblclick", doubleClick, true);
      element.removeEventListener("pointerdown", down, true);
      element.removeEventListener("pointermove", move, true);
      element.removeEventListener("pointerup", finish, true);
      element.removeEventListener("pointercancel", finish, true);
      element.removeEventListener("lostpointercapture", finish, true);
      element.removeEventListener("touchstart", stopTouchPan, true);
      element.removeEventListener("touchmove", stopTouchPan, true);
      if (originalTabIndex === null) element.removeAttribute("tabindex");
      else element.setAttribute("tabindex", originalTabIndex);
      current.dispose();
      if (session.current === current) session.current = null;
    };
  }, [chart, series, symbol]);
  const setTool = useCallback((tool: ChartDrawingTool) => session.current?.setTool(tool), []);
  const undo = useCallback(() => session.current?.undo(), []);
  const redo = useCallback(() => session.current?.redo(), []);
  const finishDrawing = useCallback(() => session.current?.finishDrawing(), []);
  const setMagnetMode = useCallback(
    (mode: DrawingMagnetMode) => session.current?.setMagnetMode(mode),
    [],
  );
  const setKeepDrawing = useCallback(
    (enabled: boolean) => session.current?.setKeepDrawing(enabled),
    [],
  );
  const toggleMagnet = useCallback(() => session.current?.toggleMagnet(), []);
  const toggleHidden = useCallback(() => session.current?.toggleHidden(), []);
  const clear = useCallback(() => session.current?.clear(), []);
  const deleteSelected = useCallback(() => session.current?.deleteSelected(), []);
  const redrawSelected = useCallback(() => session.current?.redrawSelected(), []);
  const selectDrawing = useCallback((id: string) => session.current?.selectDrawing(id), []);
  const updateDrawing = useCallback(
    (id: string, patch: DrawingPatch) => session.current?.updateDrawing(id, patch),
    [],
  );
  const deleteDrawing = useCallback((id: string) => session.current?.deleteDrawing(id), []);
  const duplicateDrawing = useCallback((id: string) => session.current?.duplicateDrawing(id), []);
  const updateSelected = useCallback(
    (patch: DrawingPatch) => session.current?.updateSelected(patch),
    [],
  );
  return {
    ...state,
    selectDrawing,
    updateDrawing,
    deleteDrawing,
    duplicateDrawing,
    setTool,
    finishDrawing,
    setMagnetMode,
    setKeepDrawing,
    undo,
    redo,
    toggleMagnet,
    toggleHidden,
    clear,
    deleteSelected,
    redrawSelected,
    updateSelected,
  };
}
export type ChartDrawingsController = ReturnType<typeof useChartDrawings>;
