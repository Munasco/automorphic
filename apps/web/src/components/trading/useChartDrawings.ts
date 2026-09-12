import { createDrawingDefaults, drawingAppearanceChanged } from "./drawingDefaults";
import type { ChartInterval } from "./tradingIntervals";
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
  type Logical,
} from "lightweight-charts";
import {
  DRAWING_ANCHORS,
  drawingTimeValue,
  isVariableDrawingTool,
  isSpecialChannelDrawing,
  isFreehandDrawingTool,
  maximumDrawingAnchors,
  parseChartDrawings,
  validDrawingAnchors,
  sanitizeDrawingSettings,
  type ChartDrawing,
  type DrawingAnchor,
  type DrawingKind,
  type DrawingPoint,
} from "./drawingGeometry";
import {
  createDrawingPrimitive,
  drawingProjection,
  supportsInlineDrawingText,
} from "./drawingPrimitive";
import { isDrawingVisibleAtInterval } from "./drawingVisibility";
import { applyDrawingTemplate } from "./drawingTemplates";
export type ChartDrawingTool = "cursor" | DrawingKind;
export type DrawingOrderDirection = "front" | "forward" | "backward" | "back";
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
  allLocked: boolean;
  alwaysRemoveLocked: boolean;
  selected: ChartDrawing | null;
  hovered: ChartDrawing | null;
  instruction: string;
  settingsOpen: boolean;
  textEditing: boolean;
  contextPoint: DrawingPoint | null;
};
export type DrawingPatch = Partial<Omit<ChartDrawing, "id" | "kind">>;
export type DrawingSettingsOptions = { replace?: boolean };
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
  allLocked: false,
  alwaysRemoveLocked: false,
  selected: null,
  hovered: null,
  instruction: "",
  settingsOpen: false,
  textEditing: false,
  contextPoint: null,
};

/** Each session binds to the workspace-scoped storage and the selected contract. */
export function createChartDrawingSession(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  symbol: string,
  onChange: (state: DrawingState) => void,
  storage: DrawingStorage | undefined = tradingWorkspaceStorage,
  intervalMinutes: number | ChartInterval = 1,
  regressionSeries: ISeriesApi<SeriesType> = series,
) {
  const key = `automorphic:chart-drawings:v1:${encodeURIComponent(symbol)}`;
  const defaults = createDrawingDefaults(storage);
  let drawings: ChartDrawing[] = [];
  try {
    drawings = parseChartDrawings(storage?.getItem(key) ?? null);
  } catch {
    /* Storage may be unavailable. */
  }
  let tool: ChartDrawingTool = "cursor";
  let anchors: DrawingAnchor[] = [];
  let selectedId: string | null = null;
  let hoveredId: string | null = null;
  let settingsOpen = false;
  let textEditing = false;
  let settingsDraft: {
    original: ChartDrawing;
    drawing: ChartDrawing;
    appearanceReplaced?: boolean;
    created?: boolean;
  } | null = null;
  let contextPoint: DrawingPoint | null = null;
  let replacingId: string | null = null;
  let disposed = false;
  let hidden = false;
  const controlSettingsKey = "automorphic:drawing-controls:v1";
  let magnetMode: DrawingMagnetMode = "off";
  let lastMagnetMode: Exclude<DrawingMagnetMode, "off"> = "weak";
  let keepDrawing = false;
  let alwaysRemoveLocked = false;
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
      alwaysRemoveLocked = "alwaysRemoveLocked" in settings && settings.alwaysRemoveLocked === true;
    }
  } catch {
    /* Ignore unavailable storage or invalid preferences. */
  }
  const persistControls = () => {
    try {
      storage?.setItem(
        controlSettingsKey,
        JSON.stringify({ magnetMode, lastMagnetMode, keepDrawing, alwaysRemoveLocked }),
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
    handlePoint: DrawingPoint | undefined;
    moved: boolean;
  } | null = null;
  const history: ChartDrawing[][] = [];
  const future: ChartDrawing[][] = [];
  const removers: Array<() => void> = [];
  const displayedDrawings = () =>
    settingsDraft
      ? settingsDraft.created
        ? [...drawings, settingsDraft.drawing]
        : drawings.map((drawing) =>
            drawing.id === settingsDraft!.original.id ? settingsDraft!.drawing : drawing,
          )
      : drawings;
  const isVisible = (drawing: ChartDrawing) =>
    !hidden && !drawing.hidden && isDrawingVisibleAtInterval(drawing.visibility, intervalMinutes);
  const primitive = createDrawingPrimitive(
    chart,
    series,
    () => ({
      drawings: displayedDrawings()
        .filter(isVisible)
        .map((drawing) =>
          textEditing && drawing.id === selectedId ? { ...drawing, text: "" } : drawing,
        ),
      selected: selectedId,
      hovered: hoveredId,
      interactive: tool === "cursor" && !settingsOpen && !textEditing,
      preview,
      hidden,
    }),
    regressionSeries,
  );
  series.attachPrimitive(primitive.primitive);
  const emit = () => {
    const hovered =
      tool === "cursor" && !hidden && !settingsOpen && !textEditing && !drag
        ? (displayedDrawings().find((drawing) => drawing.id === hoveredId && isVisible(drawing)) ??
          null)
        : null;
    hoveredId = hovered?.id ?? null;
    const selected = displayedDrawings().find((drawing) => drawing.id === selectedId) ?? null;
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
      allLocked: drawings.length > 0 && drawings.every((drawing) => drawing.locked === true),
      alwaysRemoveLocked,
      selected,
      hovered,
      instruction,
      settingsOpen: settingsOpen && !!selected,
      textEditing: textEditing && !!selected,
      contextPoint: selected ? contextPoint : null,
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
    for (const drawing of displayedDrawings()) {
      if (!isVisible(drawing)) continue;
      if (drawing.kind === "horizontal") {
        const line = series.createPriceLine({
          price: drawing.anchors[0]!.price,
          color:
            drawing.lineOpacity === undefined || drawing.lineOpacity === 1
              ? drawing.color
              : `rgba(${Number.parseInt(drawing.color.slice(1, 3), 16)}, ${Number.parseInt(drawing.color.slice(3, 5), 16)}, ${Number.parseInt(drawing.color.slice(5, 7), 16)}, ${drawing.lineOpacity})`,
          axisLabelColor: drawing.color,
          lineVisible: false,
          lineWidth: drawing.width as 1 | 2 | 3 | 4,
          lineStyle:
            drawing.lineStyle === "dashed"
              ? LineStyle.Dashed
              : drawing.lineStyle === "dotted"
                ? LineStyle.Dotted
                : LineStyle.Solid,
          axisLabelVisible: drawing.showPriceLabel !== false,
          title: "",
        });
        removers.push(() => series.removePriceLine(line));
      }
    }
    primitive.redraw();
  };
  const discardSettings = () => {
    const hadDraft = settingsDraft !== null;
    if (settingsDraft?.created) selectedId = null;
    settingsDraft = null;
    settingsOpen = false;
    textEditing = false;
    if (hadDraft) render();
    return hadDraft;
  };
  const setTool = (next: ChartDrawingTool) => {
    if (disposed) return;
    endDrag(false);
    discardSettings();
    tool = next;
    settingsOpen = false;
    contextPoint = null;
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
  const hit = (point: DrawingPoint) => primitive.hitTest(point)?.drawing;
  const hover = (point: DrawingPoint | null) => {
    if (disposed) return;
    const next =
      point && tool === "cursor" && !settingsOpen && !drag ? (hit(point)?.id ?? null) : null;
    if (next === hoveredId) return;
    hoveredId = next;
    emit();
  };
  const beginDrag = (point: DrawingPoint) => {
    if (disposed || hidden) return false;
    if (discardSettings()) emit();
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
    const target = primitive.hitTest(point);
    const drawing = target?.drawing;
    const handle = target?.handle ?? -1;
    if (!drawing) return false;
    selectedId = drawing.id;
    hoveredId = null;
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
      handle,
      handlePoint: target?.handlePoint,
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
    const reference = activeDrag.handlePoint ?? activeDrag.points[Math.max(0, activeDrag.handle)]!;
    const regression = activeDrag.drawing.kind === "regression-trend";
    if (regression) dy = 0;
    const disjoint = activeDrag.drawing.kind === "disjoint-channel";
    if (disjoint && activeDrag.handle === 2) dx = 0;
    const candidate = {
      x: activeDrag.drawing.kind === "horizontal" ? point.x : reference.x + dx,
      y: reference.y + dy,
    };
    const candidateAnchor =
      magnetMode !== "off" && !regression ? projection.unproject(candidate) : null;
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
      if (regression) {
        if (activeDrag.handle >= 0 && index !== activeDrag.handle) return anchor;
        const time = projection.unproject({
          x: activeDrag.points[index]!.x + dx,
          y: activeDrag.points[index]!.y,
        })?.time;
        return time === undefined
          ? null
          : { ...anchor, time: Math.abs(dx) < 1 ? anchor.time : time };
      }
      if (disjoint && activeDrag.handle >= 0) {
        const handle = activeDrag.handle;
        const old = activeDrag.points[index]!;
        if ((handle === 3 && index === 0) || handle === index) {
          const moved = projection.unproject({
            x: old.x + (handle === 2 ? 0 : dx),
            y: old.y + (handle === 3 ? -dy : dy),
          });
          return moved && (Math.abs(dx) < 1 || handle === 2)
            ? { ...moved, time: anchor.time }
            : moved;
        }
        // Moving the upper-right corner mirrors the opposite right price so the left pair stays fixed.
        if (handle === 1 && index === 2) {
          const price = series.coordinateToPrice(old.y - dy);
          return price === null ? null : { ...anchor, price };
        }
        return anchor;
      }
      if (isSpecialChannelDrawing(activeDrag.drawing.kind) && activeDrag.handle >= 2) {
        // Flat opposite corners resize the matching timestamp and move the third price.
        const timeAnchor = activeDrag.handle === 2 ? 1 : 0;
        if (index === timeAnchor) {
          const moved = projection.unproject({
            x: activeDrag.points[index]!.x + dx,
            y: activeDrag.points[index]!.y,
          });
          return moved ? { ...anchor, time: Math.abs(dx) < 1 ? anchor.time : moved.time } : null;
        }
        if (index === 2) {
          const price = series.coordinateToPrice(activeDrag.points[2]!.y + dy);
          return price === null ? null : { ...anchor, price };
        }
        return anchor;
      }
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
    drag.moved = !moved.every((anchor, index) => sameAnchor(drag!.drawing.anchors[index], anchor!));
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
      ...(previous ?? defaults.get(tool)),
      id: "preview",
      kind: tool,
      anchors: points,
      ...(tool === "text" ? { text: previous?.text ?? "Text" } : {}),
    };
  };
  const commitDrawing = () => {
    if (disposed || tool === "cursor" || !validDrawingAnchors(tool, anchors)) return false;
    const previous = drawings.find((drawing) => drawing.id === replacingId);
    const creatingText = tool === "text" && !previous;
    const drawing: ChartDrawing = {
      ...(previous ?? defaults.get(tool)),
      id: previous?.id ?? randomUUID(),
      kind: tool,
      anchors,
      ...(tool === "text" ? { text: previous?.text ?? "" } : {}),
    };
    if (creatingText) {
      selectedId = drawing.id;
      anchors = [];
      preview = null;
      replacingId = null;
      tool = "cursor";
      settingsDraft = { original: drawing, drawing, created: true };
      textEditing = true;
      render();
      emit();
      return true;
    }
    remember();
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
    if (disposed) return;
    if (tool === "cursor") {
      hover(
        event.point &&
          (event.paneIndex === undefined || event.paneIndex === series.getPane().paneIndex())
          ? event.point
          : null,
      );
      return;
    }
    if (hidden || strokeLastPoint) return;
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
      discardSettings();
      selectedId = hit(event.point)?.id ?? null;
      contextPoint = null;
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
  const normalizePatch = (target: ChartDrawing, patch: DrawingPatch): DrawingPatch | null => {
    if (
      patch.anchors !== undefined &&
      (!Array.isArray(patch.anchors) || !validDrawingAnchors(target.kind, patch.anchors))
    )
      return null;
    if (
      patch.color !== undefined &&
      (typeof patch.color !== "string" || !/^#[a-f\d]{6}$/i.test(patch.color))
    )
      return null;
    if (patch.width !== undefined && ![1, 2, 3, 4].includes(patch.width)) return null;
    if (patch.lineStyle !== undefined && !["solid", "dashed", "dotted"].includes(patch.lineStyle))
      return null;
    if (patch.text !== undefined && typeof patch.text !== "string") return null;
    if (patch.name !== undefined && typeof patch.name !== "string") return null;
    if (patch.locked !== undefined && typeof patch.locked !== "boolean") return null;
    if (patch.hidden !== undefined && typeof patch.hidden !== "boolean") return null;
    return {
      ...sanitizeDrawingSettings(patch),
      ...(patch.anchors ? { anchors: patch.anchors.map((anchor) => ({ ...anchor })) } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.width !== undefined ? { width: patch.width } : {}),
      ...(patch.lineStyle !== undefined ? { lineStyle: patch.lineStyle } : {}),
      ...(patch.locked !== undefined ? { locked: patch.locked } : {}),
      ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
      ...(patch.text !== undefined ? { text: patch.text.slice(0, 140) } : {}),
      ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 80) } : {}),
    };
  };
  const updateDrawing = (id: string, patch: DrawingPatch) => {
    if (disposed) return;
    const target = drawings.find((drawing) => drawing.id === id);
    if (!target) return;
    const normalized = normalizePatch(target, patch);
    if (!normalized) return;
    endDrag(false);
    discardSettings();
    const current = drawings.find((drawing) => drawing.id === id)!;
    const next = { ...current, ...normalized };
    if (JSON.stringify(current) === JSON.stringify(next)) {
      emit();
      return;
    }
    remember();
    if (drawingAppearanceChanged(current, next)) defaults.remember(next);
    drawings = drawings.map((drawing) => (drawing.id === id ? next : drawing));
    changed();
  };
  const reorderSelected = (direction: DrawingOrderDirection): boolean => {
    if (
      disposed ||
      !["front", "forward", "backward", "back"].includes(direction) ||
      !drawings.some((drawing) => drawing.id === selectedId)
    )
      return false;
    // Reordering commits only object order, never provisional coordinates or settings.
    setTool("cursor");
    const from = drawings.findIndex((drawing) => drawing.id === selectedId);
    if (from < 0) return false;
    const to =
      direction === "front"
        ? drawings.length - 1
        : direction === "back"
          ? 0
          : direction === "forward"
            ? Math.min(drawings.length - 1, from + 1)
            : Math.max(0, from - 1);
    if (from === to) return false;
    remember();
    const reordered = drawings.slice();
    const [drawing] = reordered.splice(from, 1);
    reordered.splice(to, 0, drawing!);
    drawings = reordered;
    changed();
    return true;
  };
  const applySelectedTemplate = (patch: DrawingPatch) => {
    if (disposed) return false;
    const target = drawings.find((drawing) => drawing.id === selectedId);
    if (!target || applyDrawingTemplate(target, patch) === target) return false;
    // Restore any drag or draft first; templates replace appearance, never provisional placement.
    setTool("cursor");
    const current = drawings.find((drawing) => drawing.id === selectedId);
    if (!current) return false;
    const next = applyDrawingTemplate(current, patch);
    defaults.remember(next);
    // Normalize both sides so optional defaults and property order cannot create spurious undo entries.
    if (JSON.stringify(applyDrawingTemplate(current, current)) === JSON.stringify(next))
      return false;
    remember();
    drawings = drawings.map((drawing) => (drawing.id === current.id ? next : drawing));
    changed();
    return true;
  };
  const settingsResult = (
    patch: DrawingPatch,
    options: DrawingSettingsOptions,
  ): ChartDrawing | null => {
    if (!settingsDraft) return null;
    if (options.replace) {
      const next = applyDrawingTemplate(settingsDraft.drawing, patch);
      return next === settingsDraft.drawing ? null : next;
    }
    const normalized = normalizePatch(settingsDraft.original, patch);
    return normalized ? { ...settingsDraft.drawing, ...normalized } : null;
  };
  const previewSettings = (patch: DrawingPatch, options: DrawingSettingsOptions = {}) => {
    if (disposed || !settingsOpen || !settingsDraft || selectedId !== settingsDraft.original.id)
      return false;
    const next = settingsResult(patch, options);
    if (!next) return false;
    settingsDraft.drawing = next;
    if (options.replace) settingsDraft.appearanceReplaced = true;
    render();
    emit();
    return true;
  };
  const applySettings = (patch: DrawingPatch, options: DrawingSettingsOptions = {}) => {
    if (disposed || !settingsOpen || !settingsDraft || selectedId !== settingsDraft.original.id)
      return false;
    const next = settingsResult(patch, options);
    if (!next) return false;
    return finishSettingsDraft(next, options.replace);
  };
  const finishSettingsDraft = (next: ChartDrawing, forceAppearance = false) => {
    if (!settingsDraft) return false;
    const { original, created } = settingsDraft;
    if (
      !textEditing &&
      (forceAppearance ||
        settingsDraft.appearanceReplaced ||
        drawingAppearanceChanged(original, next))
    )
      defaults.remember(next);
    settingsDraft = null;
    settingsOpen = false;
    textEditing = false;
    if (created) {
      if (next.text?.trim()) {
        remember();
        drawings = [...drawings, next].slice(-100);
        if (keepDrawing) tool = "text";
        changed();
      } else {
        selectedId = null;
        render();
        emit();
      }
    } else if (JSON.stringify(original) !== JSON.stringify(next)) {
      remember();
      drawings = drawings.map((drawing) => (drawing.id === original.id ? next : drawing));
      changed();
    } else {
      render();
      emit();
    }
    return true;
  };
  const beginTextEdit = () => {
    if (disposed || tool !== "cursor" || settingsOpen || contextPoint || drag) return false;
    if (textEditing) return true;
    const original = drawings.find((drawing) => drawing.id === selectedId);
    if (!original || !isVisible(original) || !supportsInlineDrawingText(original.kind))
      return false;
    discardSettings();
    settingsDraft = { original, drawing: original };
    textEditing = true;
    emit();
    return true;
  };
  const previewText = (text: string) => {
    if (disposed || !textEditing || !settingsDraft || typeof text !== "string") return false;
    settingsDraft.drawing = { ...settingsDraft.drawing, text: text.slice(0, 140) };
    render();
    emit();
    return true;
  };
  const commitText = (text?: string, id?: string) => {
    if (
      disposed ||
      !textEditing ||
      !settingsDraft ||
      (id !== undefined && settingsDraft.original.id !== id) ||
      (text !== undefined && typeof text !== "string")
    )
      return false;
    const next = {
      ...settingsDraft.drawing,
      text: (text ?? settingsDraft.drawing.text ?? "").slice(0, 140),
    };
    if (!next.text && settingsDraft.original.text === undefined) delete (next as ChartDrawing).text;
    return finishSettingsDraft(next);
  };
  const cancelTextEdit = (id?: string) => {
    if (disposed || !textEditing || (id !== undefined && settingsDraft?.original.id !== id)) return;
    discardSettings();
    emit();
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
    hover,
    blocksChartPan: (point: DrawingPoint) => !disposed && tool === "cursor" && !!hit(point),
    dragTo,
    endDrag,
    finishDrawing,
    isVisible,
    previewSettings,
    applySettings,
    applySelectedTemplate,
    reorderSelected,
    beginTextEdit,
    previewText,
    commitText,
    cancelTextEdit,
    coordinatePrice: (price: number) => {
      const format = series.options().priceFormat;
      const precision = format && "precision" in format ? format.precision : 2;
      return Number(price.toFixed(Math.max(0, Math.min(10, precision ?? 2))));
    },
    anchorBar: (anchor: DrawingAnchor) => {
      const point = drawingProjection(chart, series).project(anchor);
      return point ? chart.timeScale().coordinateToLogical(point.x) : null;
    },
    anchorAtBar: (bar: number, price: number) => {
      const x = chart.timeScale().logicalToCoordinate(bar as Logical);
      const y = series.priceToCoordinate(price);
      return x !== null && y !== null ? drawingProjection(chart, series).unproject({ x, y }) : null;
    },
    openSettings: (point?: DrawingPoint) => {
      if (disposed || tool !== "cursor") return false;
      endDrag(false);
      discardSettings();
      if (point) selectedId = hit(point)?.id ?? null;
      const original = drawings.find((drawing) => drawing.id === selectedId);
      if (!original) {
        emit();
        return false;
      }
      settingsDraft = { original, drawing: original };
      settingsOpen = true;
      contextPoint = null;
      emit();
      return true;
    },
    closeSettings: () => {
      if (disposed) return;
      discardSettings();
      emit();
    },
    openContextMenu: (point: DrawingPoint, screenPoint: DrawingPoint) => {
      if (disposed || tool !== "cursor") return false;
      if (discardSettings()) emit();
      const drawing = hit(point);
      if (!drawing) return false;
      selectedId = drawing.id;
      contextPoint = screenPoint;
      emit();
      return true;
    },
    closeContextMenu: () => {
      contextPoint = null;
      emit();
    },
    cancel: () => setTool("cursor"),
    undo: () => {
      if (disposed) return;
      if (settingsDraft) {
        discardSettings();
        emit();
        return;
      }
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
    setAlwaysRemoveLocked: (enabled: boolean) => {
      if (disposed || typeof enabled !== "boolean") return;
      alwaysRemoveLocked = enabled;
      persistControls();
      emit();
    },
    toggleLocked: () => {
      if (disposed) return;
      setTool("cursor");
      if (!drawings.length) return;
      const locked = drawings.some((drawing) => !drawing.locked);
      remember();
      drawings = drawings.map((drawing) =>
        drawing.locked === locked ? drawing : { ...drawing, locked },
      );
      changed();
    },
    removeDrawings: (includeLocked = false) => {
      if (disposed) return;
      setTool("cursor");
      const remaining = includeLocked ? [] : drawings.filter((drawing) => drawing.locked);
      if (remaining.length === drawings.length) return;
      remember();
      drawings = remaining;
      if (!drawings.some((drawing) => drawing.id === selectedId)) selectedId = null;
      changed();
    },
    toggleHidden: () => {
      if (disposed) return;
      endDrag(false);
      discardSettings();
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
      discardSettings();
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
      if (disposed) return;
      if (discardSettings()) emit();
      const selected = drawings.find((drawing) => drawing.id === selectedId);
      if (!selected || selected.locked) return;
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
      settingsDraft = null;
      settingsOpen = false;
      textEditing = false;
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
  intervalMinutes: number | ChartInterval = 1,
  regressionSeries?: ISeriesApi<SeriesType>,
) {
  const [state, setState] = useState<DrawingState>(EMPTY);
  const session = useRef<ReturnType<typeof createChartDrawingSession> | null>(null);
  useEffect(() => {
    if (!chart || !series || !symbol) return;
    const current = createChartDrawingSession(
      chart,
      series,
      symbol,
      setState,
      tradingWorkspaceStorage,
      intervalMinutes,
      regressionSeries ?? series,
    );
    session.current = current;
    const element = chart.chartElement();
    const originalTabIndex = element.getAttribute("tabindex");
    element.tabIndex = 0;
    let pointerId: number | null = null;
    const pointFor = (event: MouseEvent) => {
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
      if (!current.beginDrag(point) && !current.blocksChartPan(point)) return;
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
      const point = pointFor(event);
      if (!current.finishDrawing() && (!point || !current.openSettings(point))) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const contextMenu = (event: MouseEvent) => {
      const point = pointFor(event);
      if (point && current.openContextMenu(point, { x: event.clientX, y: event.clientY })) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const stopTouchPan = (event: TouchEvent) => {
      if (pointerId === null) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const leave = () => {
      if (pointerId === null) current.hover(null);
    };
    element.addEventListener("pointerleave", leave);
    element.addEventListener("dblclick", doubleClick, true);
    element.addEventListener("contextmenu", contextMenu, true);
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
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("dblclick", doubleClick, true);
      element.removeEventListener("contextmenu", contextMenu, true);
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
  }, [chart, series, symbol, intervalMinutes, regressionSeries]);
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
  const toggleLocked = useCallback(() => session.current?.toggleLocked(), []);
  const removeDrawings = useCallback(
    (includeLocked = false) => session.current?.removeDrawings(includeLocked),
    [],
  );
  const setAlwaysRemoveLocked = useCallback(
    (enabled: boolean) => session.current?.setAlwaysRemoveLocked(enabled),
    [],
  );
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
  const coordinatePrice = useCallback(
    (price: number) => session.current?.coordinatePrice(price) ?? price,
    [],
  );
  const anchorBar = useCallback(
    (anchor: DrawingAnchor) => session.current?.anchorBar(anchor) ?? null,
    [],
  );
  const anchorAtBar = useCallback(
    (bar: number, price: number) => session.current?.anchorAtBar(bar, price) ?? null,
    [],
  );
  const openSettings = useCallback(() => session.current?.openSettings(), []);
  const closeSettings = useCallback(() => session.current?.closeSettings(), []);
  const previewSettings = useCallback(
    (patch: DrawingPatch, options?: DrawingSettingsOptions) =>
      session.current?.previewSettings(patch, options) ?? false,
    [],
  );
  const reorderSelected = useCallback(
    (direction: DrawingOrderDirection) => session.current?.reorderSelected(direction) ?? false,
    [],
  );
  const applySelectedTemplate = useCallback(
    (patch: DrawingPatch) => session.current?.applySelectedTemplate(patch) ?? false,
    [],
  );
  const applySettings = useCallback(
    (patch: DrawingPatch, options?: DrawingSettingsOptions) =>
      session.current?.applySettings(patch, options) ?? false,
    [],
  );
  const beginTextEdit = useCallback(() => session.current?.beginTextEdit() ?? false, []);
  const previewText = useCallback(
    (text: string) => session.current?.previewText(text) ?? false,
    [],
  );
  const commitText = useCallback(
    (text?: string, id?: string) => session.current?.commitText(text, id) ?? false,
    [],
  );
  const cancelTextEdit = useCallback((id?: string) => session.current?.cancelTextEdit(id), []);
  const isVisible = useCallback(
    (drawing: ChartDrawing) => session.current?.isVisible(drawing) ?? false,
    [],
  );
  const closeContextMenu = useCallback(() => session.current?.closeContextMenu(), []);
  const updateSelected = useCallback(
    (patch: DrawingPatch) => session.current?.updateSelected(patch),
    [],
  );
  return {
    ...state,
    coordinatePrice,
    anchorBar,
    anchorAtBar,
    openSettings,
    closeSettings,
    previewSettings,
    applySettings,
    applySelectedTemplate,
    reorderSelected,
    beginTextEdit,
    previewText,
    commitText,
    cancelTextEdit,
    isVisible,
    closeContextMenu,
    selectDrawing,
    updateDrawing,
    deleteDrawing,
    duplicateDrawing,
    setTool,
    finishDrawing,
    setMagnetMode,
    setKeepDrawing,
    setAlwaysRemoveLocked,
    undo,
    redo,
    toggleMagnet,
    toggleHidden,
    toggleLocked,
    removeDrawings,
    clear,
    deleteSelected,
    redrawSelected,
    updateSelected,
  };
}
export type ChartDrawingsController = ReturnType<typeof useChartDrawings>;
