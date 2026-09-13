import { applyDrawingChanges, mergeDrawingChanges } from "./drawingChanges";
import { createDrawingDefaults, drawingAppearanceChanged } from "./drawingDefaults";
import { createDrawingPaneExtensions, drawingPaneTimeAtCoordinate } from "./drawingPaneExtensions";
import type { ChartInterval } from "./tradingIntervals";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ClipboardEvent as ReactClipboardEvent,
} from "react";
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
  type Coordinate,
} from "lightweight-charts";
import {
  DRAWING_ANCHORS,
  defaultDrawingLevels,
  defaultRegressionDrawingSettings,
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
  drawingTimeCoordinate,
  supportsInlineDrawingText,
} from "./drawingPrimitive";
import {
  isDrawingVisibleAtInterval,
  sanitizeDrawingVisibility,
  type DrawingVisibility,
} from "./drawingVisibility";
import { applyDrawingTemplate } from "./drawingTemplates";
import { DEFAULT_DRAWING_TEXT_WRAP_WIDTH } from "./drawingTextLayout";
import {
  parseDrawingsClipboard,
  serializeDrawingClipboard,
  serializeDrawingsClipboard,
} from "./drawingClipboard";
export type ChartDrawingTool = "cursor" | DrawingKind;
type DrawingPointerModifiers = { shiftKey?: boolean };
const supportsShiftLineAlignment = (kind: ChartDrawingTool) =>
  ["trend", "ray", "extended-line", "info-line", "trend-angle", "arrow"].includes(kind);

/** Axis constraints retain the pointer's dominant coordinate; diagonals retain its radius. */
function alignDrawingPoint(origin: DrawingPoint, point: DrawingPoint): DrawingPoint {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  if (octant % 4 === 0) return { x: point.x, y: origin.y };
  if (octant % 2 === 0) return { x: origin.x, y: point.y };
  const component = Math.hypot(dx, dy) / Math.SQRT2;
  return { x: origin.x + Math.sign(dx) * component, y: origin.y + Math.sign(dy) * component };
}
export type DrawingOrderDirection = "front" | "forward" | "backward" | "back";
export type DrawingMagnetMode = "off" | "weak" | "strong";
export type DrawingSelectionRect = { x: number; y: number; width: number; height: number };
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
  selectedIds: readonly string[];
  selectedObjects: readonly ChartDrawing[];
  selectionRect: DrawingSelectionRect | null;
  hovered: ChartDrawing | null;
  instruction: string;
  settingsOpen: boolean;
  textEditing: boolean;
  contextPoint: DrawingPoint | null;
};
export type DrawingPatch = Partial<Omit<ChartDrawing, "id" | "kind">>;
export type DrawingSettingsOptions = { replace?: boolean };
export type DrawingVisibilityPatch = {
  [K in keyof DrawingVisibility]?: DrawingVisibility[K] extends boolean
    ? boolean
    : Partial<DrawingVisibility[K]>;
};
export type DrawingDisplacement = { bars: number; price: number; priceMultiplier?: number };
type DrawingStorage = Pick<Storage, "getItem" | "setItem">;
type DrawingPeer = (before: ChartDrawing[], after: ChartDrawing[]) => void;
const drawingPeers = new WeakMap<DrawingStorage, Map<string, Set<DrawingPeer>>>();
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
  selectedIds: [],
  selectedObjects: [],
  selectionRect: null,
  hovered: null,
  instruction: "",
  settingsOpen: false,
  textEditing: false,
  contextPoint: null,
};

function isDrawingTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest("input,textarea,select,[role=textbox]"))
  );
}

function drawingHistoryShortcut(event: KeyboardEvent): "undo" | "redo" | null {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.altKey ||
    !(event.metaKey || event.ctrlKey) ||
    event.key.toLowerCase() !== "z"
  )
    return null;
  if (isDrawingTextTarget(event.target)) return null;
  return event.shiftKey ? "redo" : "undo";
}

/** Each session binds to the workspace-scoped storage and the selected contract. */
export function createChartDrawingSession(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  symbol: string,
  onChange: (state: DrawingState) => void,
  storage: DrawingStorage | undefined = tradingWorkspaceStorage.capture(),
  intervalMinutes: number | ChartInterval = 1,
  regressionSeries: ISeriesApi<SeriesType> = series,
  directPlacement = false,
) {
  const key = `automorphic:chart-drawings:v1:${encodeURIComponent(symbol)}`;
  const defaults = createDrawingDefaults(storage);
  let drawings: ChartDrawing[] = [];
  try {
    drawings = parseChartDrawings(storage?.getItem(key) ?? null);
  } catch {
    /* Storage may be unavailable. */
  }
  let committedDrawings = drawings;
  let receivedPeerChange = false;
  let tool: ChartDrawingTool = "cursor";
  let anchors: DrawingAnchor[] = [];
  let selectedId: string | null = null;
  let selectedIds: string[] = [];
  let selectionRect: DrawingSelectionRect | null = null;
  let marquee: {
    origin: DrawingPoint;
    selectionBefore: string[];
    primaryBefore: string | null;
    additive: boolean;
    moved: boolean;
  } | null = null;
  let hoveredId: string | null = null;
  let settingsOpen = false;
  let textEditing = false;
  let settingsDraft: {
    original: ChartDrawing;
    drawing: ChartDrawing;
    appearanceReplaced?: boolean;
    created?: boolean;
  } | null = null;
  let groupSettingsDraft: { originals: ChartDrawing[]; drawings: ChartDrawing[] } | null = null;
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
  let lastPreviewEvent: MouseEventParams<Time> | null = null;
  let lastDragPoint: DrawingPoint | null = null;
  let drag: {
    drawing: ChartDrawing;
    origin: DrawingPoint;
    points: DrawingPoint[];
    handle: number;
    handlePoint: DrawingPoint | undefined;
    moved: boolean;
    clone: boolean;
    cloneId: string | null;
    before: ChartDrawing[];
    selectionBefore: string[];
    additive: boolean;
    group: Array<{ drawing: ChartDrawing; points: DrawingPoint[]; cloneId: string }>;
  } | null = null;
  const history: ChartDrawing[][] = [];
  const future: ChartDrawing[][] = [];
  const removers: Array<() => void> = [];
  const coordinatePriceStep = () => {
    const format = series.options().priceFormat;
    if (format && Number.isFinite(format.minMove) && format.minMove > 0) return format.minMove;
    const precision = format && "precision" in format ? format.precision : 2;
    return (
      10 ** -Math.max(0, Math.min(10, Number.isFinite(precision) ? Math.trunc(precision!) : 2))
    );
  };
  const normalizeCoordinatePrice = (price: number): number => {
    if (!Number.isFinite(price)) return price;
    const step = coordinatePriceStep();
    const units = price / step;
    if (!Number.isFinite(units) || Math.abs(units) > Number.MAX_SAFE_INTEGER) return price;
    const [coefficient = "", exponent = "0"] = step.toString().split("e");
    const decimals = Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent));
    const rounded = Math.round(units + Number.EPSILON * Math.abs(units)) * step;
    const normalized = Number(rounded.toFixed(Math.min(100, decimals)));
    return normalized === 0 ? 0 : normalized;
  };
  const quantizePointerAnchor = (anchor: DrawingAnchor) => {
    const price = normalizeCoordinatePrice(anchor.price);
    return price === anchor.price ? anchor : { ...anchor, price };
  };
  const displayedDrawings = () =>
    groupSettingsDraft
      ? drawings.map((drawing) =>
          mergeDrawingChanges(
            groupSettingsDraft!.originals.find((item) => item.id === drawing.id),
            groupSettingsDraft!.drawings.find((item) => item.id === drawing.id),
            drawing,
          ),
        )
      : settingsDraft
        ? settingsDraft.created
          ? [...drawings, settingsDraft.drawing]
          : drawings.map((drawing) =>
              drawing.id === settingsDraft!.original.id
                ? mergeDrawingChanges(settingsDraft!.original, settingsDraft!.drawing, drawing)
                : drawing,
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
      selectedIds,
      selectionRect,
      hovered: hoveredId,
      interactive: tool === "cursor" && !settingsOpen && !textEditing,
      preview,
      hidden,
    }),
    regressionSeries,
  );
  series.attachPrimitive(primitive.primitive);
  const paneExtensions = createDrawingPaneExtensions(chart, series, () =>
    [...displayedDrawings(), ...(preview ? [preview] : [])].filter(isVisible),
  );
  const emit = () => {
    const hovered =
      tool === "cursor" && !hidden && !settingsOpen && !textEditing && !drag && !marquee
        ? (displayedDrawings().find((drawing) => drawing.id === hoveredId && isVisible(drawing)) ??
          null)
        : null;
    hoveredId = hovered?.id ?? null;
    if (selectedId === null) selectedIds = [];
    else if (!selectedIds.includes(selectedId)) selectedIds = [selectedId];
    const selectedObjects = selectedIds.flatMap((id) => {
      const drawing = displayedDrawings().find(
        (item) =>
          item.id === id && (groupSettingsDraft || selectedIds.length === 1 || isVisible(item)),
      );
      return drawing ? [drawing] : [];
    });
    selectedIds = selectedObjects.map((drawing) => drawing.id);
    if (!selectedIds.includes(selectedId ?? "")) selectedId = selectedIds.at(-1) ?? null;
    const selected = selectedObjects.find((drawing) => drawing.id === selectedId) ?? null;
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
      canUndo: !!(
        anchors.length ||
        history.length ||
        (!receivedPeerChange && drawings.length) ||
        replacingId
      ),
      canRedo: future.length > 0,
      hidden,
      magnet: magnetMode !== "off",
      magnetMode,
      keepDrawing,
      allLocked: drawings.length > 0 && drawings.every((drawing) => drawing.locked === true),
      alwaysRemoveLocked,
      selected,
      selectedIds,
      selectedObjects,
      selectionRect,
      hovered,
      instruction,
      settingsOpen: settingsOpen && !!selected,
      textEditing: textEditing && !!selected,
      contextPoint: selected ? contextPoint : null,
    });
    primitive.redraw();
    paneExtensions.redraw();
  };
  const persist = () => {
    const before = committedDrawings;
    committedDrawings = drawings;
    try {
      storage?.setItem(key, JSON.stringify(drawings));
    } catch {
      /* Keep local edits usable. */
    }
    if (JSON.stringify(before) !== JSON.stringify(committedDrawings)) {
      for (const peer of drawingPeers.get(storage!)?.get(key) ?? []) {
        if (peer !== receiveDrawings) peer(before, committedDrawings);
      }
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
      paneExtensions.redraw();
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
    paneExtensions.redraw();
  };
  const discardSettings = () => {
    const hadDraft = settingsDraft !== null || groupSettingsDraft !== null;
    groupSettingsDraft = null;
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
    lastPreviewEvent = null;
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
  const hit = (point: DrawingPoint, paneIndex?: number) =>
    paneIndex !== undefined && paneIndex !== series.getPane().paneIndex()
      ? paneExtensions.hitTest(point.x, paneIndex)
      : primitive.hitTest(point)?.drawing;
  const hover = (point: DrawingPoint | null, paneIndex?: number) => {
    if (disposed) return;
    const next =
      point && tool === "cursor" && !settingsOpen && !drag && !marquee
        ? (hit(point, paneIndex)?.id ?? null)
        : null;
    if (next === hoveredId) return;
    hoveredId = next;
    emit();
  };
  const chooseDrawing = (id: string | null, additive = false) => {
    if (id === null) {
      if (!additive) selectedIds = [];
    } else if (additive) {
      selectedIds = selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id];
    } else if (!selectedIds.includes(id)) selectedIds = [id];
    selectedId = id && selectedIds.includes(id) ? id : (selectedIds.at(-1) ?? null);
  };
  const beginMarquee = (
    point: DrawingPoint,
    options: { additive?: boolean; paneIndex?: number } = {},
  ): boolean => {
    if (
      disposed ||
      hidden ||
      tool !== "cursor" ||
      (options.paneIndex !== undefined && options.paneIndex !== series.getPane().paneIndex())
    )
      return false;
    const { width, height } = drawingProjection(chart, series);
    if (
      ![point.x, point.y].every(Number.isFinite) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x > width ||
      point.y > height
    )
      return false;
    endDrag(false);
    discardSettings();
    marquee = {
      origin: { ...point },
      selectionBefore: selectedIds.slice(),
      primaryBefore: selectedId,
      additive: options.additive === true,
      moved: false,
    };
    selectionRect = null;
    hoveredId = null;
    contextPoint = null;
    emit();
    return true;
  };
  const updateMarquee = (point: DrawingPoint) => {
    if (disposed || !marquee || ![point.x, point.y].every(Number.isFinite)) return;
    const { width, height } = drawingProjection(chart, series);
    const x = Math.max(0, Math.min(width, point.x)),
      y = Math.max(0, Math.min(height, point.y));
    if (!marquee.moved && Math.hypot(x - marquee.origin.x, y - marquee.origin.y) < 3) return;
    marquee.moved = true;
    selectionRect = {
      x: Math.min(x, marquee.origin.x),
      y: Math.min(y, marquee.origin.y),
      width: Math.abs(x - marquee.origin.x),
      height: Math.abs(y - marquee.origin.y),
    };
    const hits = primitive.drawingsInRect(selectionRect);
    selectedIds = [...new Set([...(marquee.additive ? marquee.selectionBefore : []), ...hits])];
    selectedId = selectedIds.at(-1) ?? null;
    emit();
  };
  const endMarquee = (commit = true) => {
    if (!marquee) return;
    const previous = marquee;
    marquee = null;
    selectionRect = null;
    if (!commit || !previous.moved) {
      selectedIds = previous.selectionBefore;
      selectedId = previous.primaryBefore;
    }
    emit();
  };
  const beginDrag = (
    point: DrawingPoint,
    options?: { clone?: boolean; additive?: boolean; paneIndex?: number },
  ) => {
    if (disposed || hidden) return false;
    if (drag || marquee) endDrag(false);
    if (discardSettings()) emit();
    const foreignPane =
      options?.paneIndex !== undefined && options.paneIndex !== series.getPane().paneIndex();
    if (tool !== "cursor" && foreignPane) return false;
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
    const extension = foreignPane ? paneExtensions.hitTest(point.x, options!.paneIndex!) : null;
    const target = foreignPane
      ? extension
        ? { drawing: extension, handle: -1, handlePoint: undefined }
        : null
      : primitive.hitTest(point);
    const drawing = target?.drawing;
    if (!drawing) {
      if (!foreignPane && (options?.additive || options?.clone))
        return beginMarquee(point, { additive: true });
      chooseDrawing(null, options?.additive);
      emit();
      return false;
    }
    const selectionBefore = selectedIds.slice();
    if (!options?.additive || !selectedIds.includes(drawing.id)) chooseDrawing(drawing.id);
    const handle = selectedIds.length > 1 ? -1 : (target?.handle ?? -1);
    hoveredId = null;
    emit();
    if (drawing.locked) {
      if (options?.additive) {
        selectedIds = selectionBefore;
        chooseDrawing(drawing.id, true);
        emit();
      }
      return false;
    }
    const clone = options?.clone === true && handle < 0;
    const moving = drawings.filter((item) => selectedIds.includes(item.id) && !item.locked);
    if (clone && drawings.length + moving.length > 100) {
      if (options?.additive) {
        selectedIds = selectionBefore;
        chooseDrawing(drawing.id, true);
        emit();
      }
      return false;
    }
    const points = drawing.anchors.map((anchor) => {
      if (drawing.kind !== "vertical") return drawingProjection(chart, series).project(anchor);
      const x = drawingTimeCoordinate(chart, series, anchor.time);
      return x === null ? null : { x, y: point.y };
    });
    if (points.some((p) => p === null)) return false;
    drag = {
      drawing,
      origin: point,
      points: points as DrawingPoint[],
      handle,
      handlePoint: target?.handlePoint,
      moved: false,
      clone,
      cloneId: null,
      before: drawings.slice(),
      selectionBefore,
      additive: options?.additive === true,
      group:
        selectedIds.length > 1
          ? moving.map((item) => ({
              drawing: item,
              cloneId: randomUUID(),
              points: item.anchors.map((anchor) =>
                item.kind === "vertical"
                  ? { x: drawingTimeCoordinate(chart, series, anchor.time)!, y: point.y }
                  : drawingProjection(chart, series).project(anchor)!,
              ),
            }))
          : [],
    };
    if (
      drag.group.some((item) =>
        item.points.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)),
      )
    ) {
      drag = null;
      return false;
    }
    return true;
  };
  const snapAnchor = (anchor: DrawingAnchor, point: DrawingPoint): DrawingAnchor => {
    anchor = quantizePointerAnchor(anchor);
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
        snapped = quantizePointerAnchor({ time: candle.time, price });
      }
    }
    return snapped;
  };
  const placementAnchor = (
    anchor: DrawingAnchor,
    point: DrawingPoint,
    modifiers?: DrawingPointerModifiers,
  ): DrawingAnchor | null => {
    const snapped = snapAnchor(anchor, point);
    if (
      !modifiers?.shiftKey ||
      anchors.length !== 1 ||
      !(supportsShiftLineAlignment(tool) || tool === "channel")
    )
      return snapped;
    const projection = drawingProjection(chart, series);
    const origin = projection.project(anchors[0]!);
    const candidate = magnetMode === "off" ? point : projection.project(snapped);
    if (!origin || !candidate) return null;
    const aligned = projection.unproject(alignDrawingPoint(origin, candidate));
    return aligned ? quantizePointerAnchor(aligned) : null;
  };
  const dragTo = (point: DrawingPoint, modifiers?: DrawingPointerModifiers) => {
    if (disposed || ![point.x, point.y].every(Number.isFinite)) return;
    if (drag) lastDragPoint = point;
    if (marquee) {
      updateMarquee(point);
      return;
    }
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
    const restoreUnmovedDrag = () => {
      activeDrag.moved = false;
      activeDrag.cloneId = null;
      drawings = activeDrag.before;
      if (activeDrag.clone) {
        selectedIds = activeDrag.selectionBefore;
        selectedId = selectedIds.at(-1) ?? null;
      }
      render();
      emit();
    };
    if (activeDrag.handle < 0 && dx === 0 && dy === 0 && activeDrag.moved) {
      restoreUnmovedDrag();
      return;
    }
    if (!activeDrag.moved && Math.hypot(dx, dy) < 3) return;
    const axis =
      modifiers?.shiftKey && activeDrag.handle < 0
        ? Math.abs(dx) >= Math.abs(dy)
          ? "horizontal"
          : "vertical"
        : null;
    const lockMovementAxis = () => {
      if (axis === "horizontal") dy = 0;
      else if (axis === "vertical") dx = 0;
    };
    const translateLockedAnchor = (
      anchor: DrawingAnchor,
      old: DrawingPoint,
      kind: DrawingKind,
    ): DrawingAnchor | null => {
      // Do not round-trip the locked coordinate through the chart's scale. Log scales,
      // bar snapping and instrument ticks can otherwise move an untouched coordinate.
      if (axis === "horizontal") {
        if (kind === "horizontal" || Math.abs(dx) < 1) return anchor;
        const time = drawingPaneTimeAtCoordinate(chart, series, old.x + dx);
        return time === null ? null : { ...anchor, time };
      }
      if (kind === "vertical" || kind === "regression-trend" || dy === 0) return anchor;
      const price = series.coordinateToPrice(old.y + dy);
      return price === null ? null : quantizePointerAnchor({ ...anchor, price });
    };
    if (
      activeDrag.drawing.kind === "text" &&
      activeDrag.drawing.textWrap === true &&
      activeDrag.handle === 1 &&
      !activeDrag.group.length
    ) {
      if (!Number.isFinite(dx)) return;
      const originalWidth = activeDrag.drawing.textWrapWidth ?? DEFAULT_DRAWING_TEXT_WRAP_WIDTH;
      const width = Math.max(40, Math.min(4000, originalWidth + dx));
      activeDrag.moved = width !== originalWidth;
      const next = activeDrag.moved
        ? { ...activeDrag.drawing, textWrapWidth: width }
        : activeDrag.drawing;
      drawings = drawings.map((drawing) => (drawing.id === next.id ? next : drawing));
      emit();
      return;
    }
    const projection = drawingProjection(chart, series);
    if (activeDrag.group.length) {
      const reference = activeDrag.points[0]!;
      const destinationPoint = { x: reference.x + dx, y: reference.y + dy };
      const destination = projection.unproject(destinationPoint);
      if (destination && magnetMode !== "off") {
        const snapped = projection.project(snapAnchor(destination, destinationPoint));
        if (snapped) {
          dx = snapped.x - reference.x;
          dy = snapped.y - reference.y;
        }
      }
      lockMovementAxis();
      const translated = activeDrag.group.map(({ drawing, points, cloneId }) => {
        const anchors = drawing.anchors.map((anchor, index) => {
          const old = points[index]!;
          if (axis) return translateLockedAnchor(anchor, old, drawing.kind);
          if (drawing.kind === "horizontal") {
            const price = series.coordinateToPrice(old.y + dy);
            return price === null ? null : quantizePointerAnchor({ ...anchor, price });
          }
          const moved = projection.unproject({
            x: old.x + dx,
            y:
              old.y + (drawing.kind === "vertical" || drawing.kind === "regression-trend" ? 0 : dy),
          });
          if (!moved) return null;
          if (drawing.kind === "vertical" || drawing.kind === "regression-trend")
            return { ...anchor, time: Math.abs(dx) < 1 ? anchor.time : moved.time };
          return quantizePointerAnchor({
            ...moved,
            time: Math.abs(dx) < 1 ? anchor.time : moved.time,
          });
        });
        if (
          anchors.some((anchor) => anchor === null) ||
          !validDrawingAnchors(drawing.kind, anchors as DrawingAnchor[])
        )
          return null;
        return {
          ...drawing,
          anchors: anchors as DrawingAnchor[],
          ...(activeDrag.clone
            ? {
                id: cloneId,
                name: `${drawing.name || drawing.text || drawing.kind} copy`.slice(0, 80),
                locked: false,
              }
            : {}),
        };
      });
      if (translated.some((drawing) => drawing === null)) return;
      const next = translated as ChartDrawing[];
      activeDrag.moved = next.some((drawing, index) =>
        drawing.anchors.some(
          (anchor, i) => !sameAnchor(activeDrag.group[index]!.drawing.anchors[i], anchor),
        ),
      );
      if (activeDrag.clone && !activeDrag.moved) {
        restoreUnmovedDrag();
        return;
      }
      const byId = new Map(next.map((drawing) => [drawing.id, drawing]));
      drawings = activeDrag.clone
        ? [...activeDrag.before, ...next]
        : activeDrag.before.map((drawing) => byId.get(drawing.id) ?? drawing);
      if (activeDrag.clone) {
        selectedIds = next.map((drawing) => drawing.id);
        selectedId = selectedIds.at(-1) ?? null;
      }
      render();
      emit();
      return;
    }
    // Snap one reference point, then translate the entire shape by that same offset.
    const reference = activeDrag.handlePoint ?? activeDrag.points[Math.max(0, activeDrag.handle)]!;
    const regression = activeDrag.drawing.kind === "regression-trend";
    const vertical = activeDrag.drawing.kind === "vertical";
    if (regression || vertical) dy = 0;
    const disjoint = activeDrag.drawing.kind === "disjoint-channel";
    if (disjoint && activeDrag.handle === 2) dx = 0;
    const candidate = {
      x: activeDrag.drawing.kind === "horizontal" ? point.x : reference.x + dx,
      y: reference.y + dy,
    };
    const candidateAnchor =
      magnetMode !== "off" && !regression && !vertical ? projection.unproject(candidate) : null;
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
    lockMovementAxis();
    if (
      modifiers?.shiftKey &&
      supportsShiftLineAlignment(activeDrag.drawing.kind) &&
      (activeDrag.handle === 0 || activeDrag.handle === 1)
    ) {
      const origin = activeDrag.points[1 - activeDrag.handle];
      if (!origin) return;
      const aligned = alignDrawingPoint(origin, { x: reference.x + dx, y: reference.y + dy });
      dx = aligned.x - reference.x;
      dy = aligned.y - reference.y;
    }
    let channelPoints: DrawingPoint[] | undefined;
    if (activeDrag.drawing.kind === "channel" && activeDrag.handle >= 0) {
      const [first, second, third] = activeDrag.points;
      if (!first || !second || !third || first.x === second.x) return;
      const slope = (second.y - first.y) / (second.x - first.x);
      const offset = third.y - (first.y + slope * (third.x - first.x));
      channelPoints = activeDrag.points.map((point) => ({ ...point }));
      if (activeDrag.handle === 1 || activeDrag.handle === 4) {
        // Rail midpoints change width: the dragged parallel passes through the pointer.
        const shift = dy - slope * dx;
        if (activeDrag.handle === 1) {
          channelPoints[0]!.y += shift;
          channelPoints[1]!.y += shift;
        } else channelPoints[2]!.y += shift;
      } else {
        // Either corner of an end moves that whole end, retaining the channel width.
        const index = activeDrag.handle === 0 || activeDrag.handle === 3 ? 0 : 1;
        const movedEndpoint = projection.unproject({
          x: channelPoints[index]!.x + dx,
          y: channelPoints[index]!.y + dy,
        });
        const endpoint = movedEndpoint && projection.project(quantizePointerAnchor(movedEndpoint));
        if (!endpoint) return;
        channelPoints[index] = endpoint;
        const [a, b] = channelPoints;
        if (!a || !b || a.x === b.x) return;
        channelPoints[2]!.y = a.y + ((b.y - a.y) * (third.x - a.x)) / (b.x - a.x) + offset;
      }
    }
    const moved = activeDrag.drawing.anchors
      .map((anchor, index) => {
        if (axis)
          return translateLockedAnchor(anchor, activeDrag.points[index]!, activeDrag.drawing.kind);
        if (channelPoints) {
          const old = activeDrag.points[index]!;
          const next = channelPoints[index]!;
          if (old.x === next.x && old.y === next.y) return anchor;
          if (old.x === next.x) {
            const price = series.coordinateToPrice(next.y);
            return price === null ? null : { ...anchor, price };
          }
          return projection.unproject(next);
        }
        if (vertical) {
          const time = drawingPaneTimeAtCoordinate(chart, series, activeDrag.points[index]!.x + dx);
          return time === null ? null : { ...anchor, time: Math.abs(dx) < 1 ? anchor.time : time };
        }
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
      })
      .map((anchor, index) =>
        anchor &&
        axis !== "horizontal" &&
        !vertical &&
        !regression &&
        anchor !== activeDrag.drawing.anchors[index]
          ? quantizePointerAnchor(anchor)
          : anchor,
      );
    if (
      moved.some((anchor) => anchor === null) ||
      !validDrawingAnchors(drag.drawing.kind, moved as DrawingAnchor[])
    )
      return;
    drag.moved = !moved.every((anchor, index) => sameAnchor(drag!.drawing.anchors[index], anchor!));
    const next = { ...drag.drawing, anchors: moved as DrawingAnchor[] };
    if (drag.clone) {
      if (!drag.moved) {
        restoreUnmovedDrag();
        return;
      }
      const cloneId = drag.cloneId ?? randomUUID();
      const copy = {
        ...next,
        id: cloneId,
        name: `${next.name || next.text || next.kind} copy`.slice(0, 80),
        locked: false,
        hidden: false,
      };
      drawings = drag.cloneId
        ? drawings.map((item) => (item.id === cloneId ? copy : item))
        : [...drawings, copy];
      drag.cloneId = cloneId;
      selectedId = cloneId;
    } else drawings = drawings.map((item) => (item.id === next.id ? next : item));
    if (drag.drawing.kind === "horizontal") render();
    emit();
  };
  const endDrag = (commit = true) => {
    lastDragPoint = null;
    if (marquee) {
      endMarquee(commit);
      return;
    }
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
      history.push(original.before);
      if (history.length > 50) history.shift();
      persist();
    } else {
      drawings = original.before;
      selectedIds = original.selectionBefore;
      selectedId = selectedIds.at(-1) ?? null;
      if (commit && original.additive) chooseDrawing(original.drawing.id, true);
      else if (commit || original.clone) chooseDrawing(original.drawing.id);
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
    lastPreviewEvent = null;
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
  const move = (
    event: MouseEventParams<Time>,
    modifiers: DrawingPointerModifiers | undefined = event.sourceEvent,
  ) => {
    if (disposed) return;
    lastPreviewEvent = null;
    if (tool === "cursor") {
      hover(event.point ?? null, event.paneIndex);
      return;
    }
    if (hidden || strokeLastPoint) return;
    preview = null;
    if (
      event.point &&
      !isFreehandDrawingTool(tool) &&
      (event.paneIndex === undefined || event.paneIndex === series.getPane().paneIndex())
    ) {
      lastPreviewEvent = event;
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
        const next = placementAnchor(anchor, event.point, modifiers);
        if (next) updatePreview(sameAnchor(anchors.at(-1), next) ? anchors : [...anchors, next]);
      }
    }
    primitive.redraw();
    paneExtensions.redraw();
  };
  const click = (
    event: Pick<MouseEventParams<Time>, "point" | "time" | "paneIndex" | "sourceEvent">,
    modifiers: DrawingPointerModifiers | undefined = event.sourceEvent,
  ) => {
    if (disposed || !event.point) return;
    if (tool === "cursor") {
      discardSettings();
      chooseDrawing(hit(event.point, event.paneIndex)?.id ?? null);
      contextPoint = null;
      emit();
      return;
    }
    if (event.paneIndex !== undefined && event.paneIndex !== series.getPane().paneIndex()) return;
    if (isFreehandDrawingTool(tool)) return;
    const price = series.coordinateToPrice(event.point.y);
    if (price === null || !Number.isFinite(price)) return;
    const fallback =
      event.time === undefined && tool !== "horizontal"
        ? drawingProjection(chart, series).unproject(event.point)
        : null;
    const time = event.time ?? fallback?.time ?? (tool === "horizontal" ? (0 as Time) : undefined);
    if (time === undefined || drawingTimeValue(time) === null) return;
    const anchor = placementAnchor({ time, price }, event.point, modifiers);
    if (!anchor) return;
    if (
      anchors.length === 1 &&
      ["rectangle", "fib", "channel"].includes(tool) &&
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
      ...(patch.text !== undefined ? { text: patch.text } : {}),
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
    const ids = new Set(selectedIds);
    const selected = drawings.filter((drawing) => ids.has(drawing.id));
    const others = drawings.filter((drawing) => !ids.has(drawing.id));
    const reordered =
      direction === "front"
        ? [...others, ...selected]
        : direction === "back"
          ? [...selected, ...others]
          : drawings.slice();
    if (direction === "forward") {
      for (let i = reordered.length - 2; i >= 0; i--) {
        if (ids.has(reordered[i]!.id) && !ids.has(reordered[i + 1]!.id))
          [reordered[i], reordered[i + 1]] = [reordered[i + 1]!, reordered[i]!];
      }
    } else if (direction === "backward") {
      for (let i = 1; i < reordered.length; i++) {
        if (ids.has(reordered[i]!.id) && !ids.has(reordered[i - 1]!.id))
          [reordered[i], reordered[i - 1]] = [reordered[i - 1]!, reordered[i]!];
      }
    }
    if (reordered.every((drawing, index) => drawing === drawings[index])) return false;
    remember();
    drawings = reordered;
    changed();
    return true;
  };
  const applySelectedTemplate = (patch: DrawingPatch) => {
    if (disposed) return false;
    const targets = drawings.filter((drawing) => selectedIds.includes(drawing.id));
    if (
      !targets.length ||
      targets.every((drawing) => applyDrawingTemplate(drawing, patch) === drawing)
    )
      return false;
    setTool("cursor");
    const changes = new Map<string, ChartDrawing>();
    for (const current of drawings) {
      if (!selectedIds.includes(current.id)) continue;
      const applied = applyDrawingTemplate(current, patch);
      const next =
        selectedIds.length > 1 && current.text !== undefined
          ? { ...applied, text: current.text }
          : applied;
      defaults.remember(next);
      if (JSON.stringify(applyDrawingTemplate(current, current)) !== JSON.stringify(next))
        changes.set(current.id, next);
    }
    if (!changes.size) return false;
    remember();
    drawings = drawings.map((drawing) => changes.get(drawing.id) ?? drawing);
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
  const commonGroupPatch = (patch: DrawingPatch) => {
    const common = { ...patch };
    delete common.anchors;
    delete common.text;
    delete common.name;
    delete common.levels;
    delete common.regressionBaseLine;
    delete common.regressionUpperLine;
    delete common.regressionLowerLine;
    return common;
  };
  const normalizedGroupPatch = (drawing: ChartDrawing, common: DrawingPatch) => {
    const normalized = normalizePatch(drawing, common);
    if (!normalized) return null;
    const linePatch = {
      ...(common.color === undefined ? {} : { color: common.color }),
      ...(common.width === undefined ? {} : { width: common.width }),
      ...(common.lineStyle === undefined ? {} : { lineStyle: common.lineStyle }),
      ...(common.lineOpacity === undefined ? {} : { opacity: common.lineOpacity }),
    };
    if (!Object.keys(linePatch).length) return normalized;
    if (drawing.kind === "channel")
      normalized.levels = (drawing.levels ?? defaultDrawingLevels("channel")).map((level) => ({
        ...level,
        ...linePatch,
      }));
    if (drawing.kind === "regression-trend") {
      const settings = { ...defaultRegressionDrawingSettings(), ...drawing };
      for (const key of [
        "regressionBaseLine",
        "regressionUpperLine",
        "regressionLowerLine",
      ] as const)
        normalized[key] = { ...settings[key], ...linePatch };
    }
    return normalized;
  };
  const previewGroupSettings = (patch: DrawingPatch, options: DrawingSettingsOptions = {}) => {
    if (!groupSettingsDraft || !settingsOpen) return false;
    const common = commonGroupPatch(patch);
    const next = groupSettingsDraft.drawings.map((drawing) => {
      if (drawing.locked && common.locked !== false) return drawing;
      if (options.replace) {
        const applied = applyDrawingTemplate(drawing, patch);
        if (applied === drawing) return null;
        const next = { ...applied };
        for (const key of ["text", "name", "visibility"] as const) {
          if (drawing[key] === undefined) delete next[key];
          else Object.assign(next, { [key]: drawing[key] });
        }
        return next;
      }
      const normalized = normalizedGroupPatch(drawing, common);
      return normalized ? { ...drawing, ...normalized } : null;
    });
    if (next.some((drawing) => drawing === null)) return false;
    groupSettingsDraft.drawings = next as ChartDrawing[];
    render();
    emit();
    return true;
  };
  const previewSelectedVisibility = (patch: DrawingVisibilityPatch): boolean => {
    if (disposed || !settingsOpen || !groupSettingsDraft) return false;
    groupSettingsDraft.drawings = groupSettingsDraft.drawings.map((drawing) => {
      if (drawing.locked) return drawing;
      const visibility = sanitizeDrawingVisibility(drawing.visibility);
      for (const key of Object.keys(patch) as Array<keyof DrawingVisibility>) {
        const value = patch[key];
        if (key === "ticks" || key === "ranges") {
          if (typeof value === "boolean") visibility[key] = value;
        } else if (value && typeof value === "object")
          visibility[key] = { ...visibility[key], ...value };
      }
      return { ...drawing, visibility: sanitizeDrawingVisibility(visibility) };
    });
    render();
    emit();
    return true;
  };
  const previewSelectedDisplacement = ({
    bars,
    price,
    priceMultiplier = 1,
  }: DrawingDisplacement): boolean => {
    if (
      disposed ||
      !settingsOpen ||
      !groupSettingsDraft ||
      !Number.isSafeInteger(bars) ||
      !Number.isFinite(price) ||
      !Number.isFinite(priceMultiplier)
    )
      return false;
    const projection = drawingProjection(chart, series);
    const next = groupSettingsDraft.drawings.map((drawing, index) => {
      const original = groupSettingsDraft!.originals[index]!;
      if (original.locked) return drawing;
      const anchors = original.anchors.map((anchor) => {
        let time = anchor.time;
        if (bars !== 0 && drawing.kind !== "horizontal") {
          try {
            const x = drawingTimeCoordinate(chart, series, anchor.time);
            const logical = x === null ? null : chart.timeScale().coordinateToLogical(x);
            const shifted =
              logical === null
                ? null
                : chart.timeScale().logicalToCoordinate((logical + bars) as Logical);
            if (shifted === null || !Number.isFinite(shifted)) return null;
            const projected = projection.unproject({
              x: shifted,
              y: series.priceToCoordinate(anchor.price) ?? 0,
            });
            if (!projected) return null;
            time = projected.time;
          } catch {
            return null;
          }
        }
        const nextPrice =
          drawing.kind === "vertical" || drawing.kind === "regression-trend"
            ? anchor.price
            : anchor.price * priceMultiplier + price;
        if (!Number.isFinite(nextPrice)) return null;
        if (nextPrice === anchor.price) return time === anchor.time ? anchor : { ...anchor, time };
        return quantizePointerAnchor({ time, price: nextPrice });
      });
      return anchors.some((anchor) => anchor === null) ||
        !validDrawingAnchors(drawing.kind, anchors as DrawingAnchor[])
        ? null
        : { ...drawing, anchors: anchors as DrawingAnchor[] };
    });
    if (next.some((drawing) => drawing === null)) return false;
    groupSettingsDraft.drawings = next as ChartDrawing[];
    render();
    emit();
    return true;
  };
  const previewSettings = (patch: DrawingPatch, options: DrawingSettingsOptions = {}) => {
    if (disposed) return false;
    if (groupSettingsDraft) return previewGroupSettings(patch, options);
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
    if (disposed) return false;
    if (groupSettingsDraft) {
      if (!previewGroupSettings(patch, Object.keys(patch).length ? options : {})) return false;
      const { originals, drawings: drafts } = groupSettingsDraft;
      groupSettingsDraft = null;
      settingsOpen = false;
      if (JSON.stringify(originals) === JSON.stringify(drafts)) {
        render();
        emit();
        return true;
      }
      remember();
      const next = new Map(drafts.map((drawing) => [drawing.id, drawing]));
      drawings = drawings.map((drawing) =>
        mergeDrawingChanges(
          originals.find((item) => item.id === drawing.id),
          next.get(drawing.id),
          drawing,
        ),
      );
      changed();
      return true;
    }
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
      drawings = drawings.map((drawing) =>
        drawing.id === original.id ? mergeDrawingChanges(original, next, drawing) : drawing,
      );
      changed();
    } else {
      render();
      emit();
    }
    return true;
  };
  const beginTextEdit = () => {
    if (
      disposed ||
      tool !== "cursor" ||
      selectedIds.length > 1 ||
      settingsOpen ||
      contextPoint ||
      drag
    )
      return false;
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
    settingsDraft.drawing = { ...settingsDraft.drawing, text };
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
      text: text ?? settingsDraft.drawing.text ?? "",
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
    selectedIds = selectedIds.filter((item) => item !== id);
    if (selectedId === id) selectedId = selectedIds.at(-1) ?? null;
    changed();
  };
  const serializedDrawing = (id: string | null) => {
    if (disposed || drag || id === null) return null;
    const drawing = drawings.find((item) => item.id === id);
    return drawing ? serializeDrawingClipboard(drawing) : null;
  };
  const copySelectedSerialized = () =>
    disposed || drag
      ? null
      : serializeDrawingsClipboard(drawings.filter((drawing) => selectedIds.includes(drawing.id)));
  const copySelected = async (): Promise<boolean> => {
    const text = copySelectedSerialized();
    if (!text) return false;
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };
  const duplicateSelected = () => {
    if (disposed) return;
    const committed = drag?.before ?? drawings;
    const ids = drag ? drag.selectionBefore : selectedIds;
    const originals = committed.filter((drawing) => ids.includes(drawing.id));
    if (!originals.length || committed.length + originals.length > 100) return;
    setTool("cursor");
    const copies = originals.map((drawing) => ({
      ...structuredClone(drawing),
      id: randomUUID(),
      name: `${drawing.name || drawing.text || drawing.kind} copy`.slice(0, 80),
      locked: false,
    }));
    remember();
    drawings = [...drawings, ...copies];
    selectedIds = copies.map((drawing) => drawing.id);
    selectedId = selectedIds.at(-1) ?? null;
    changed();
  };
  const copyDrawing = async (id: string): Promise<boolean> => {
    const text = serializedDrawing(id);
    if (!text) return false;
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };
  const pasteDrawing = (text: string): boolean => {
    if (disposed) return false;
    const originals = parseDrawingsClipboard(text);
    if (!originals || (drag?.before.length ?? drawings.length) + originals.length > 100)
      return false;
    const copies: ChartDrawing[] = [];
    try {
      for (const original of originals) {
        const anchors: DrawingAnchor[] = [];
        for (const anchor of original.anchors) {
          const y = series.priceToCoordinate(anchor.price);
          if (y === null || !Number.isFinite(y)) return false;
          const price = series.coordinateToPrice(y - 40);
          if (price === null || !Number.isFinite(price)) return false;
          anchors.push({ ...anchor, price });
        }
        if (!validDrawingAnchors(original.kind, anchors)) return false;
        copies.push({
          ...original,
          anchors,
          id: randomUUID(),
          name: `${original.name || original.text || original.kind} copy`.slice(0, 80),
          locked: false,
          hidden: false,
        });
      }
    } catch {
      return false;
    }
    setTool("cursor");
    remember();
    drawings = [...drawings, ...copies];
    selectedIds = copies.map((drawing) => drawing.id);
    selectedId = selectedIds.at(-1) ?? null;
    changed();
    return true;
  };
  const channelBaselinePrice = (drawing: ChartDrawing): number | null => {
    if (disposed || drawing.kind !== "channel" || drawing.anchors.length !== 3) return null;
    const { project } = drawingProjection(chart, series);
    const points = drawing.anchors.map(project);
    if (points.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)))
      return null;
    const [first, second, third] = points as DrawingPoint[];
    if (!first || !second || !third || first.x === second.x) return null;
    // Match the rendered baseline in chart space: candle gaps and log scales are nonlinear in
    // timestamps/prices, so interpolating either directly would produce a different channel.
    const y = first.y + ((second.y - first.y) * (third.x - first.x)) / (second.x - first.x);
    const price = Number.isFinite(y) ? series.coordinateToPrice(y) : null;
    return price !== null && Number.isFinite(price) ? price : null;
  };
  const channelPriceOffset = (drawing: ChartDrawing): number | null => {
    const baseline = channelBaselinePrice(drawing);
    const third = drawing.anchors[2];
    if (baseline === null || !third) return null;
    const offset = third.price - baseline;
    return Number.isFinite(offset) ? offset : null;
  };
  const channelAnchorsAtOffset = (
    drawing: ChartDrawing,
    offset: number,
  ): DrawingAnchor[] | null => {
    if (!Number.isFinite(offset)) return null;
    const baseline = channelBaselinePrice(drawing);
    if (baseline === null) return null;
    const price = baseline + offset;
    if (!Number.isFinite(price)) return null;
    const y = series.priceToCoordinate(price);
    if (y === null || !Number.isFinite(y)) return null;
    return drawing.anchors.map((anchor, index) =>
      index === 2 ? { ...anchor, price } : { ...anchor },
    );
  };
  const channelAnchorsAtEndpoint = (
    drawing: ChartDrawing,
    index: number,
    anchor: DrawingAnchor,
  ): DrawingAnchor[] | null => {
    if (
      disposed ||
      drawing.kind !== "channel" ||
      (index !== 0 && index !== 1) ||
      !validDrawingAnchors("channel", drawing.anchors)
    )
      return null;
    const anchors = drawing.anchors.map((point, i) => ({ ...(i === index ? anchor : point) }));
    if (!validDrawingAnchors("channel", anchors)) return null;
    try {
      const offset = channelPriceOffset(drawing);
      if (offset === null) return null;
      if (sameAnchor(drawing.anchors[index], anchor)) return anchors;
      // Coordinate inputs retain their numeric Price offset, even when log scaling changes
      // the visible rail separation. Reproject the new baseline at the stored third time.
      return channelAnchorsAtOffset({ ...drawing, anchors }, offset);
    } catch {
      return null;
    }
  };
  const angleProjection = (drawing: ChartDrawing) => {
    if (
      disposed ||
      drawing.kind !== "trend-angle" ||
      !validDrawingAnchors(drawing.kind, drawing.anchors)
    )
      return null;
    try {
      const projection = drawingProjection(chart, series);
      const first = projection.project(drawing.anchors[0]!);
      const second = projection.project(drawing.anchors[1]!);
      if (!first || !second || ![first.x, first.y, second.x, second.y].every(Number.isFinite))
        return null;
      const length = Math.hypot(second.x - first.x, second.y - first.y);
      return Number.isFinite(length) && length > 0 ? { projection, first, second, length } : null;
    } catch {
      return null;
    }
  };
  const drawingAngle = (drawing: ChartDrawing): number | null => {
    const projected = angleProjection(drawing);
    if (!projected) return null;
    const { first, second } = projected;
    return (Math.atan2(first.y - second.y, second.x - first.x) * 180) / Math.PI || 0;
  };
  const continuousTimeAtCoordinate = (
    x: number,
    data: ReturnType<typeof series.data> = series.data(),
  ): Time | null => {
    if (!Number.isFinite(x)) return null;
    const scale = chart.timeScale();
    if (data.length < 2) {
      const time = drawingPaneTimeAtCoordinate(chart, series, x);
      const projected = time === null ? null : drawingTimeCoordinate(chart, series, time);
      return projected !== null && Math.abs(projected - x) < 1e-6 ? time : null;
    }
    let left = 0,
      right = data.length - 1;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      const coordinate = scale.timeToCoordinate(data[middle]!.time);
      if (coordinate === null || !Number.isFinite(coordinate)) return null;
      if (coordinate < x) left = middle + 1;
      else right = middle;
    }
    const a = data[Math.max(0, left - 1)]!;
    const b = data[Math.min(data.length - 1, Math.max(1, left))]!;
    const ax = scale.timeToCoordinate(a.time),
      bx = scale.timeToCoordinate(b.time);
    const at = drawingTimeValue(a.time),
      bt = drawingTimeValue(b.time);
    if (
      ax === null ||
      bx === null ||
      !Number.isFinite(ax) ||
      !Number.isFinite(bx) ||
      ax === bx ||
      at === null ||
      bt === null ||
      at === bt
    )
      return null;
    if (x === ax) return a.time;
    if (x === bx) return b.time;
    // Invert drawingTimeCoordinate across real candle times, including session gaps.
    // coordinateToTime rounds fractional anchors to a bar and cannot do this inversion.
    const time = at + ((x - ax) / (bx - ax)) * (bt - at);
    return Number.isFinite(time) ? (time as Time) : null;
  };
  const continuousAngleAnchor = (point: DrawingPoint): DrawingAnchor | null => {
    if (![point.x, point.y].every(Number.isFinite)) return null;
    const price = series.coordinateToPrice(point.y);
    if (price === null || !Number.isFinite(price)) return null;
    const time = continuousTimeAtCoordinate(point.x);
    return time === null ? null : { time, price };
  };
  const nudgeSelected = ({ bars, ticks }: { bars: number; ticks: number }): boolean => {
    if (
      disposed ||
      tool !== "cursor" ||
      hidden ||
      settingsOpen ||
      settingsDraft ||
      groupSettingsDraft ||
      textEditing ||
      drag ||
      marquee ||
      contextPoint ||
      anchors.length ||
      strokeLastPoint ||
      replacingId ||
      !Number.isSafeInteger(bars) ||
      !Number.isSafeInteger(ticks) ||
      (bars === 0 && ticks === 0)
    )
      return false;
    const step = coordinatePriceStep();
    const delta = step * ticks;
    if (!Number.isFinite(delta)) return false;
    const decimals = (value: number) => {
      const [coefficient = "", exponent = "0"] = value.toString().split("e");
      return Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent));
    };
    const changes = new Map<string, ChartDrawing>();
    try {
      const scale = chart.timeScale();
      const data = bars ? series.data() : [];
      for (const drawing of drawings) {
        if (!selectedIds.includes(drawing.id) || drawing.locked || !isVisible(drawing)) continue;
        const moved = drawing.anchors.map((anchor): DrawingAnchor | null => {
          let time = anchor.time;
          if (bars && drawing.kind !== "horizontal") {
            const x = drawingTimeCoordinate(chart, series, time, data);
            const logical = x === null ? null : scale.coordinateToLogical(x);
            if (logical === null || !Number.isFinite(logical)) return null;
            const target = logical + bars;
            const lower = Math.floor(target),
              upper = Math.ceil(target);
            const a = scale.logicalToCoordinate(lower as Logical);
            const b = lower === upper ? a : scale.logicalToCoordinate(upper as Logical);
            if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
            const shifted = continuousTimeAtCoordinate(a + (b - a) * (target - lower), data);
            if (shifted === null) return null;
            time = shifted;
          }
          let price = anchor.price;
          if (ticks && drawing.kind !== "vertical" && drawing.kind !== "regression-trend") {
            const precision = Math.max(decimals(price), decimals(step));
            const sum = price + delta;
            // Remove arithmetic noise without quantizing an existing off-tick coordinate.
            price = precision <= 100 ? Number(sum.toFixed(precision)) : sum;
            if (!Number.isFinite(price)) return null;
          }
          return time === anchor.time && price === anchor.price ? anchor : { time, price };
        });
        if (
          moved.some((anchor) => anchor === null) ||
          !validDrawingAnchors(drawing.kind, moved as DrawingAnchor[])
        )
          return false;
        if (moved.some((anchor, index) => !sameAnchor(drawing.anchors[index], anchor!)))
          changes.set(drawing.id, { ...drawing, anchors: moved as DrawingAnchor[] });
      }
    } catch {
      return false;
    }
    if (!changes.size) return false;
    remember();
    drawings = drawings.map((drawing) => changes.get(drawing.id) ?? drawing);
    changed();
    return true;
  };
  const anchorsAtAngle = (drawing: ChartDrawing, degrees: number): DrawingAnchor[] | null => {
    if (!Number.isFinite(degrees)) return null;
    const projected = angleProjection(drawing);
    if (!projected) return null;
    const { first, length } = projected;
    const radians = ((degrees % 360) * Math.PI) / 180;
    try {
      const second = continuousAngleAnchor({
        x: first.x + Math.cos(radians) * length,
        y: first.y - Math.sin(radians) * length,
      });
      const anchors = second ? [{ ...drawing.anchors[0]! }, second] : null;
      return anchors && validDrawingAnchors(drawing.kind, anchors) ? anchors : null;
    } catch {
      return null;
    }
  };
  const anchorsAtOrigin = (
    drawing: ChartDrawing,
    anchor: DrawingAnchor,
  ): DrawingAnchor[] | null => {
    if (drawingTimeValue(anchor.time) === null || !Number.isFinite(anchor.price)) return null;
    const projected = angleProjection(drawing);
    if (!projected) return null;
    const { projection, first, second } = projected;
    try {
      const origin = projection.project(anchor);
      if (!origin || ![origin.x, origin.y].every(Number.isFinite)) return null;
      const endpoint = continuousAngleAnchor({
        x: origin.x + second.x - first.x,
        y: origin.y + second.y - first.y,
      });
      const anchors = endpoint ? [{ ...anchor }, endpoint] : null;
      return anchors && validDrawingAnchors(drawing.kind, anchors) ? anchors : null;
    } catch {
      return null;
    }
  };
  // Rebase only externally changed fields, including into Undo/Redo. Editors keep
  // their original draft so a full settings-form submission cannot overwrite fields
  // that changed elsewhere but were untouched in this view.
  const receiveDrawings: DrawingPeer = (before, after) => {
    if (disposed) return;
    receivedPeerChange = true;
    if (drag) {
      const members = [drag.drawing, ...drag.group.map((item) => item.drawing)];
      const geometryChanged = members.some((drawing) => {
        const previous = before.find((item) => item.id === drawing.id);
        const next = after.find((item) => item.id === drawing.id);
        return (
          previous &&
          (!next ||
            next.locked ||
            JSON.stringify(previous.anchors) !== JSON.stringify(next.anchors))
        );
      });
      // A remote geometry edit invalidates the captured pointer projection. Cancel
      // that drag before applying it; never commit against obsolete anchor positions.
      if (geometryChanged) endDrag(false);
      else {
        drag.before = applyDrawingChanges(before, after, drag.before);
        drag.drawing = mergeDrawingChanges(
          before.find((item) => item.id === drag!.drawing.id),
          after.find((item) => item.id === drag!.drawing.id),
          drag.drawing,
        );
        for (const member of drag.group) {
          member.drawing = mergeDrawingChanges(
            before.find((item) => item.id === member.drawing.id),
            after.find((item) => item.id === member.drawing.id),
            member.drawing,
          );
        }
      }
    }
    committedDrawings = applyDrawingChanges(before, after, committedDrawings);
    drawings = applyDrawingChanges(before, after, drawings);
    for (const stack of [history, future]) {
      for (let index = 0; index < stack.length; index++) {
        stack[index] = applyDrawingChanges(before, after, stack[index]!);
      }
    }
    if (
      settingsDraft &&
      !settingsDraft.created &&
      !drawings.some((item) => item.id === settingsDraft!.original.id)
    ) {
      discardSettings();
    }
    if (groupSettingsDraft) {
      const existing = new Set(drawings.map((item) => item.id));
      groupSettingsDraft.originals = groupSettingsDraft.originals.filter((item) =>
        existing.has(item.id),
      );
      groupSettingsDraft.drawings = groupSettingsDraft.drawings.filter((item) =>
        existing.has(item.id),
      );
      if (!groupSettingsDraft.drawings.length) discardSettings();
    }
    render();
    emit();
  };
  if (storage) {
    let symbols = drawingPeers.get(storage);
    if (!symbols) drawingPeers.set(storage, (symbols = new Map()));
    let peers = symbols.get(key);
    if (!peers) symbols.set(key, (peers = new Set()));
    peers.add(receiveDrawings);
  }
  // The chart library suppresses a second quick click even at a different position.
  // DOM placement handles every anchor; the chart retains its cursor-selection behavior.
  const chartClick = (event: MouseEventParams<Time>) => {
    if (!directPlacement) click(event);
  };
  chart.subscribeClick(chartClick);
  const chartMove = (event: MouseEventParams<Time>) => {
    // Native placement and modifier keys share one synchronous preview stream. A delayed
    // crosshair event can otherwise restore a stale modifier after a stationary key press.
    if (!directPlacement || tool === "cursor") move(event);
  };
  chart.subscribeCrosshairMove(chartMove);
  render();
  emit();
  return {
    getCommittedDrawings: () => (disposed ? null : committedDrawings),
    setTool,
    placeAt: (point: DrawingPoint, modifiers?: DrawingPointerModifiers) => {
      if (disposed || tool === "cursor" || isFreehandDrawingTool(tool)) return false;
      click({ point: { x: point.x as Coordinate, y: point.y as Coordinate } }, modifiers);
      return true;
    },
    previewAt: (
      point: DrawingPoint | null,
      modifiers?: DrawingPointerModifiers,
      paneIndex?: number,
    ) => {
      if (disposed || tool === "cursor") return;
      const inside =
        point &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.x <= chart.timeScale().width() &&
        point.y >= 0 &&
        point.y <= series.getPane().getHeight()
          ? point
          : null;
      move(
        {
          ...(inside ? { point: { x: inside.x as Coordinate, y: inside.y as Coordinate } } : {}),
          ...(paneIndex === undefined ? {} : { paneIndex }),
          seriesData: new Map(),
        },
        modifiers,
      );
    },
    setShiftPressed: (shiftKey: boolean) => {
      if (disposed) return;
      if (drag && lastDragPoint) dragTo(lastDragPoint, { shiftKey });
      else if (lastPreviewEvent) move(lastPreviewEvent, { shiftKey });
    },
    clearPointerPreview: () => {
      lastPreviewEvent = null;
      if (tool !== "cursor") preview = null;
      hover(null);
      primitive.redraw();
    },
    nudgeSelected,
    beginDrag,
    beginMarquee,
    updateMarquee,
    endMarquee,
    copyDrawing,
    copySelected,
    duplicateSelected,
    copySelectedSerialized,
    pasteDrawing,
    hover,
    blocksChartPan: (point: DrawingPoint, paneIndex?: number) =>
      !disposed && tool === "cursor" && !!hit(point, paneIndex),
    dragTo,
    endDrag,
    finishDrawing,
    isVisible,
    previewSettings,
    previewSelectedDisplacement,
    previewSelectedVisibility,
    applySettings,
    applySelectedTemplate,
    reorderSelected,
    beginTextEdit,
    previewText,
    commitText,
    cancelTextEdit,
    channelPriceOffset,
    channelAnchorsAtOffset,
    channelAnchorsAtEndpoint,
    drawingAngle,
    anchorsAtAngle,
    anchorsAtOrigin,
    coordinatePriceStep,
    normalizeCoordinatePrice,
    coordinatePrice: (price: number) => {
      const format = series.options().priceFormat;
      const precision = format && "precision" in format ? format.precision : 2;
      return Number(price.toFixed(Math.max(0, Math.min(10, precision ?? 2))));
    },
    anchorBar: (anchor: DrawingAnchor) => {
      if (disposed) return null;
      try {
        const x = drawingTimeCoordinate(chart, series, anchor.time);
        if (x === null || !Number.isFinite(x)) return null;
        const bar = chart.timeScale().coordinateToLogical(x);
        return bar !== null && Number.isFinite(bar) ? (bar === 0 ? 0 : bar) : null;
      } catch {
        return null;
      }
    },
    anchorAtBar: (bar: number, price: number) => {
      const index = Math.round(bar);
      if (disposed || !Number.isSafeInteger(index) || !Number.isFinite(price)) return null;
      try {
        // LWC returns screen coordinate zero for fractional logical indices.
        // Coordinates edits select the nearest bar before entering that API.
        const x = chart.timeScale().logicalToCoordinate(index as Logical);
        if (x === null || !Number.isFinite(x)) return null;
        const time = drawingPaneTimeAtCoordinate(chart, series, x);
        return time !== null && drawingTimeValue(time) !== null ? { time, price } : null;
      } catch {
        return null;
      }
    },
    openSettings: (point?: DrawingPoint, paneIndex?: number) => {
      if (disposed || tool !== "cursor") return false;
      endDrag(false);
      discardSettings();
      if (point) chooseDrawing(hit(point, paneIndex)?.id ?? null);
      if (selectedIds.length > 1) {
        const originals = drawings.filter((drawing) => selectedIds.includes(drawing.id));
        groupSettingsDraft = { originals, drawings: originals.slice() };
        settingsOpen = true;
        contextPoint = null;
        emit();
        return true;
      }
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
    openContextMenu: (point: DrawingPoint, screenPoint: DrawingPoint, paneIndex?: number) => {
      if (disposed || tool !== "cursor") return false;
      if (discardSettings()) emit();
      const drawing = hit(point, paneIndex);
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
    cancel: () => {
      if (marquee) {
        endMarquee(false);
        return;
      }
      setTool("cursor");
      selectedId = null;
      selectedIds = [];
      emit();
    },
    undo: () => {
      if (disposed) return;
      if (settingsDraft || groupSettingsDraft) {
        discardSettings();
        emit();
        return;
      }
      if (drag || strokeLastPoint || marquee) {
        endDrag(false);
        return;
      }
      if (anchors.length || replacingId) {
        setTool("cursor");
        return;
      }
      if (!history.length && (receivedPeerChange || !drawings.length)) return;
      future.push(drawings.slice());
      drawings = history.pop() ?? drawings.slice(0, -1);
      changed();
    },
    redo: () => {
      if (disposed || !future.length) return;
      setTool("cursor");
      history.push(drawings.slice());
      drawings = future.pop()!;
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
      if (hidden) {
        selectedId = null;
        selectedIds = [];
      }
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
    selectDrawing: (id: string, options?: { additive?: boolean }) => {
      if (
        disposed ||
        !drawings.some((drawing) => drawing.id === id && (!options?.additive || isVisible(drawing)))
      )
        return;
      setTool("cursor");
      chooseDrawing(id, options?.additive);
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
      if (disposed) return;
      setTool("cursor");
      const ids = new Set(
        selectedIds.filter((id) =>
          drawings.some((drawing) => drawing.id === id && (!drawing.locked || alwaysRemoveLocked)),
        ),
      );
      if (!ids.size) return;
      remember();
      drawings = drawings.filter((drawing) => !ids.has(drawing.id));
      selectedIds = selectedIds.filter((id) => !ids.has(id));
      selectedId = selectedIds.at(-1) ?? null;
      changed();
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
      if (disposed) return;
      if (selectedIds.length < 2) {
        if (selectedId) updateDrawing(selectedId, patch);
        return;
      }
      endDrag(false);
      discardSettings();
      // Group edits share appearance and visibility, never coordinates or drawing-specific text.
      const common = commonGroupPatch(patch);
      const changes = new Map<string, ChartDrawing>();
      for (const drawing of drawings) {
        if (!selectedIds.includes(drawing.id) || (drawing.locked && common.locked !== false))
          continue;
        const normalized = normalizedGroupPatch(drawing, common);
        if (!normalized) return;
        const next = { ...drawing, ...normalized };
        if (JSON.stringify(next) !== JSON.stringify(drawing)) changes.set(drawing.id, next);
      }
      if (!changes.size) return;
      remember();
      drawings = drawings.map((drawing) => changes.get(drawing.id) ?? drawing);
      changed();
    },
    dispose: () => {
      if (disposed) return;
      settingsDraft = null;
      groupSettingsDraft = null;
      marquee = null;
      selectionRect = null;
      settingsOpen = false;
      textEditing = false;
      disposed = true;
      const symbols = storage && drawingPeers.get(storage);
      const peers = symbols?.get(key);
      peers?.delete(receiveDrawings);
      if (peers?.size === 0) symbols?.delete(key);
      if (storage && symbols?.size === 0) drawingPeers.delete(storage);
      lastPreviewEvent = null;
      lastDragPoint = null;
      paneExtensions.dispose();
      try {
        chart.unsubscribeClick(chartClick);
        chart.unsubscribeCrosshairMove(chartMove);
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
      tradingWorkspaceStorage.capture(),
      intervalMinutes,
      regressionSeries ?? series,
      true,
    );
    session.current = current;
    const element = chart.chartElement();
    const originalTabIndex = element.getAttribute("tabindex");
    element.tabIndex = 0;
    let pointerId: number | null = null;
    let clickOrigin: DrawingPoint | null = null;
    let dragged = false;
    let pointerPane: ReturnType<typeof series.getPane> | null = null;
    const pointFor = (event: MouseEvent) => {
      const pane =
        pointerId !== null && pointerPane
          ? pointerPane
          : chart.panes().find((candidate) => {
              const rect = candidate.getHTMLElement()?.getBoundingClientRect();
              return rect && event.clientY >= rect.top && event.clientY <= rect.bottom;
            });
      const rect = pane?.getHTMLElement()?.getBoundingClientRect();
      if (!pane || !rect) return null;
      return {
        x: event.clientX - rect.left - chart.priceScale("left", pane.paneIndex()).width(),
        y: event.clientY - rect.top,
        pane,
        paneIndex: pane.paneIndex(),
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
        point.y > point.pane.getHeight()
      )
        return;
      clickOrigin = point;
      dragged = false;
      element.focus({ preventScroll: true });
      if (
        !current.beginDrag(point, {
          clone: event.metaKey || event.ctrlKey,
          additive: event.metaKey || event.ctrlKey,
          paneIndex: point.paneIndex,
        }) &&
        !current.blocksChartPan(point, point.paneIndex)
      )
        return;
      pointerId = event.pointerId;
      pointerPane = point.pane;
      element.setPointerCapture(pointerId);
      event.preventDefault();
      event.stopPropagation();
    };
    const move = (event: PointerEvent) => {
      const point = pointFor(event);
      if (
        event.buttons &&
        point &&
        clickOrigin &&
        Math.hypot(point.x - clickOrigin.x, point.y - clickOrigin.y) >= 3
      )
        dragged = true;
      if (event.pointerId !== pointerId) {
        current.previewAt(point, { shiftKey: event.shiftKey }, point?.paneIndex);
        return;
      }
      if (point) current.dragTo(point, { shiftKey: event.shiftKey });
      event.preventDefault();
      event.stopPropagation();
    };
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const point = pointFor(event);
      if (point && event.type === "pointerup") current.dragTo(point, { shiftKey: event.shiftKey });
      current.endDrag(event.type === "pointerup");
      pointerId = null;
      pointerPane = null;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };
    const place = (event: MouseEvent) => {
      if (event.button !== 0 || dragged || !clickOrigin) return;
      const point = pointFor(event);
      if (
        !point ||
        point.x < 0 ||
        point.x > chart.timeScale().width() ||
        point.y < 0 ||
        point.y > point.pane.getHeight() ||
        point.pane !== series.getPane()
      )
        return;
      if (current.placeAt(point, { shiftKey: event.shiftKey })) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const doubleClick = (event: MouseEvent) => {
      const point = pointFor(event);
      if (!current.finishDrawing() && (!point || !current.openSettings(point, point.paneIndex)))
        return;
      event.preventDefault();
      event.stopPropagation();
    };
    const contextMenu = (event: MouseEvent) => {
      const point = pointFor(event);
      if (
        point &&
        current.openContextMenu(point, { x: event.clientX, y: event.clientY }, point.paneIndex)
      ) {
        element.focus({ preventScroll: true });
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
      if (pointerId === null) current.clearPointerPreview();
    };
    element.addEventListener("pointerleave", leave);
    element.addEventListener("click", place, true);
    element.addEventListener("dblclick", doubleClick, true);
    element.addEventListener("contextmenu", contextMenu, true);
    element.addEventListener("pointerdown", down, true);
    element.addEventListener("pointermove", move, true);
    element.addEventListener("pointerup", finish, true);
    element.addEventListener("pointercancel", finish, true);
    element.addEventListener("lostpointercapture", finish, true);
    element.addEventListener("touchstart", stopTouchPan, { capture: true, passive: false });
    element.addEventListener("touchmove", stopTouchPan, { capture: true, passive: false });
    const clipboardAllowed = (event: ClipboardEvent) => {
      return (
        !event.defaultPrevented &&
        element.contains(document.activeElement) &&
        !isDrawingTextTarget(event.target)
      );
    };
    const copy = (event: ClipboardEvent) => {
      if (!clipboardAllowed(event) || !event.clipboardData) return;
      const text = current.copySelectedSerialized();
      if (!text) return;
      event.clipboardData.setData("text/plain", text);
      event.preventDefault();
    };
    const paste = (event: ClipboardEvent) => {
      if (!clipboardAllowed(event) || !event.clipboardData) return;
      if (current.pasteDrawing(event.clipboardData.getData("text/plain"))) event.preventDefault();
    };
    element.addEventListener("copy", copy);
    element.addEventListener("paste", paste);
    const cancelPointerGesture = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pointerId === null) return;
      const capturedPointer = pointerId;
      // Clear the native gesture before releasing capture: lostpointercapture and
      // a subsequent mouseup must not recommit the cancelled clone or freehand stroke.
      pointerId = null;
      pointerPane = null;
      clickOrigin = null;
      dragged = true;
      current.cancel();
      if (element.hasPointerCapture(capturedPointer))
        element.releasePointerCapture(capturedPointer);
      event.preventDefault();
      event.stopPropagation();
    };
    // Popup Escape handlers can stop propagation before the normal window shortcut.
    // Intercept only our active captured gesture; editors and idle menus keep Escape.
    window.addEventListener("keydown", cancelPointerGesture, true);
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        element.contains(document.activeElement)
      )
        current.cancel();
      if (
        document.activeElement === element &&
        target === element &&
        !event.defaultPrevented &&
        !event.isComposing &&
        event.keyCode !== 229 &&
        !event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        const bars = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        const ticks = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
        if ((bars || ticks) && current.nudgeSelected({ bars, ticks })) event.preventDefault();
      }
      if (!element.contains(document.activeElement)) return;
      if (event.key === "Enter" && current.finishDrawing()) event.preventDefault();
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        current.deleteSelected();
      }
      const historyAction = drawingHistoryShortcut(event);
      if (historyAction) {
        event.preventDefault();
        current[historyAction]();
      }
    };
    const shiftChanged = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      current.setShiftPressed(event.type === "keydown");
    };
    window.addEventListener("keydown", shiftChanged);
    window.addEventListener("keyup", shiftChanged);
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("keydown", cancelPointerGesture, true);
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("keydown", shiftChanged);
      window.removeEventListener("keyup", shiftChanged);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("click", place, true);
      element.removeEventListener("dblclick", doubleClick, true);
      element.removeEventListener("contextmenu", contextMenu, true);
      element.removeEventListener("pointerdown", down, true);
      element.removeEventListener("pointermove", move, true);
      element.removeEventListener("pointerup", finish, true);
      element.removeEventListener("pointercancel", finish, true);
      element.removeEventListener("lostpointercapture", finish, true);
      element.removeEventListener("touchstart", stopTouchPan, true);
      element.removeEventListener("touchmove", stopTouchPan, true);
      element.removeEventListener("copy", copy);
      element.removeEventListener("paste", paste);
      if (originalTabIndex === null) element.removeAttribute("tabindex");
      else element.setAttribute("tabindex", originalTabIndex);
      current.dispose();
      if (session.current === current) session.current = null;
    };
  }, [chart, series, symbol, intervalMinutes, regressionSeries]);
  const getCommittedDrawings = useCallback(
    () => session.current?.getCommittedDrawings() ?? null,
    [],
  );
  const getChartElement = useCallback(() => {
    if (!session.current) return null;
    const element = chart?.chartElement();
    return element?.isConnected ? element : null;
  }, [chart]);
  const focusChart = useCallback(() => {
    getChartElement()?.focus({ preventScroll: true });
  }, [getChartElement]);
  const onHistoryKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const current = session.current;
      // Form controls own their native Undo; settings drafts retain their existing
      // explicit Apply/Cancel behavior. Portaled drawing menus belong to this root.
      if (!current || state.settingsOpen) return;
      const action = drawingHistoryShortcut(event.nativeEvent);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      const focused = document.activeElement;
      current[action]();
      queueMicrotask(() => {
        if (focused && !focused.isConnected && document.activeElement === document.body)
          focusChart();
      });
    },
    [focusChart, state.settingsOpen],
  );
  const onCopy = useCallback(
    (event: ReactClipboardEvent<HTMLElement>) => {
      const current = session.current;
      if (
        !current ||
        state.settingsOpen ||
        event.defaultPrevented ||
        !event.clipboardData ||
        isDrawingTextTarget(event.target)
      )
        return;
      const text = current.copySelectedSerialized();
      if (!text) return;
      event.clipboardData.setData("text/plain", text);
      event.preventDefault();
      event.stopPropagation();
    },
    [state.settingsOpen],
  );
  const onPaste = useCallback(
    (event: ReactClipboardEvent<HTMLElement>) => {
      const current = session.current;
      if (
        !current ||
        state.settingsOpen ||
        event.defaultPrevented ||
        !event.clipboardData ||
        isDrawingTextTarget(event.target)
      )
        return;
      if (!current.pasteDrawing(event.clipboardData.getData("text/plain"))) return;
      event.preventDefault();
      event.stopPropagation();
    },
    [state.settingsOpen],
  );
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
    (includeLocked = false) => {
      session.current?.removeDrawings(includeLocked);
      focusChart();
    },
    [focusChart],
  );
  const setAlwaysRemoveLocked = useCallback(
    (enabled: boolean) => session.current?.setAlwaysRemoveLocked(enabled),
    [],
  );
  const clear = useCallback(() => {
    session.current?.clear();
    focusChart();
  }, [focusChart]);
  const deleteSelected = useCallback(() => {
    session.current?.deleteSelected();
    focusChart();
  }, [focusChart]);
  const redrawSelected = useCallback(() => session.current?.redrawSelected(), []);
  const selectDrawing = useCallback(
    (id: string, options?: { additive?: boolean }) => session.current?.selectDrawing(id, options),
    [],
  );
  const updateDrawing = useCallback(
    (id: string, patch: DrawingPatch) => session.current?.updateDrawing(id, patch),
    [],
  );
  const deleteDrawing = useCallback(
    (id: string) => {
      session.current?.deleteDrawing(id);
      focusChart();
    },
    [focusChart],
  );
  const duplicateDrawing = useCallback((id: string) => session.current?.duplicateDrawing(id), []);
  const copyDrawing = useCallback(
    (id: string) => session.current?.copyDrawing(id) ?? Promise.resolve(false),
    [],
  );
  const copySelectedSerialized = useCallback(
    () => session.current?.copySelectedSerialized() ?? null,
    [],
  );
  const pasteDrawing = useCallback(
    (text: string) => session.current?.pasteDrawing(text) ?? false,
    [],
  );
  const channelPriceOffset = useCallback(
    (drawing: ChartDrawing) => session.current?.channelPriceOffset(drawing) ?? null,
    [],
  );
  const channelAnchorsAtOffset = useCallback(
    (drawing: ChartDrawing, offset: number) =>
      session.current?.channelAnchorsAtOffset(drawing, offset) ?? null,
    [],
  );
  const channelAnchorsAtEndpoint = useCallback(
    (drawing: ChartDrawing, index: number, anchor: DrawingAnchor) =>
      session.current?.channelAnchorsAtEndpoint(drawing, index, anchor) ?? null,
    [],
  );
  const drawingAngle = useCallback(
    (drawing: ChartDrawing) => session.current?.drawingAngle(drawing) ?? null,
    [],
  );
  const anchorsAtAngle = useCallback(
    (drawing: ChartDrawing, degrees: number) =>
      session.current?.anchorsAtAngle(drawing, degrees) ?? null,
    [],
  );
  const anchorsAtOrigin = useCallback(
    (drawing: ChartDrawing, anchor: DrawingAnchor) =>
      session.current?.anchorsAtOrigin(drawing, anchor) ?? null,
    [],
  );
  const coordinatePrice = useCallback(
    (price: number) => session.current?.coordinatePrice(price) ?? price,
    [],
  );
  const coordinatePriceStep = useCallback(() => session.current?.coordinatePriceStep() ?? 0.01, []);
  const normalizeCoordinatePrice = useCallback(
    (price: number) => session.current?.normalizeCoordinatePrice(price) ?? price,
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
  const previewSelectedDisplacement = useCallback(
    (offset: DrawingDisplacement) => session.current?.previewSelectedDisplacement(offset) ?? false,
    [],
  );
  const previewSelectedVisibility = useCallback(
    (patch: DrawingVisibilityPatch) => session.current?.previewSelectedVisibility(patch) ?? false,
    [],
  );
  const copySelected = useCallback(
    () => session.current?.copySelected() ?? Promise.resolve(false),
    [],
  );
  const duplicateSelected = useCallback(() => session.current?.duplicateSelected(), []);
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
    onHistoryKeyDown,
    onCopy,
    onPaste,
    getChartElement,
    getCommittedDrawings,
    interval: intervalMinutes,
    channelPriceOffset,
    channelAnchorsAtOffset,
    channelAnchorsAtEndpoint,
    drawingAngle,
    anchorsAtAngle,
    anchorsAtOrigin,
    coordinatePriceStep,
    normalizeCoordinatePrice,
    coordinatePrice,
    anchorBar,
    anchorAtBar,
    openSettings,
    closeSettings,
    previewSettings,
    previewSelectedDisplacement,
    previewSelectedVisibility,
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
    copyDrawing,
    copySelected,
    duplicateSelected,
    copySelectedSerialized,
    pasteDrawing,
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
