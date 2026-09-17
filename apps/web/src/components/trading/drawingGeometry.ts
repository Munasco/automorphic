import { ghostFeedGeometry } from "./ghostFeedGeometry";
import {
  normalizeBarPattern,
  barPatternGeometry,
  type DrawingBarPattern,
} from "./drawingBarPattern";
import { anchoredVwapGeometry, positionForecastGeometry } from "./drawingMarketGeometry";
import type { Candle } from "./chartIndicators";
import {
  isPositionDrawing,
  isRangeDrawing,
  projectionDrawingGeometry,
} from "./projectionDrawingGeometry";
import {
  measureDrawingText,
  DEFAULT_DRAWING_TEXT_BACKGROUND_COLOR,
  DEFAULT_DRAWING_TEXT_BACKGROUND_OPACITY,
  DEFAULT_DRAWING_TEXT_BORDER_COLOR,
  DEFAULT_DRAWING_TEXT_BORDER_OPACITY,
  type DrawingTextLayout,
  type DrawingTextMetrics,
} from "./drawingTextLayout";
import type { ChartRegression, RegressionSource } from "./chartRegression";
import { sanitizeDrawingVisibility, type DrawingVisibility } from "./drawingVisibility";
import type { Time } from "lightweight-charts";
export type DrawingKind =
  | "ghost-feed"
  | "bars-pattern"
  | "position-forecast"
  | "anchored-vwap"
  | "sector"
  | "long-position"
  | "short-position"
  | "price-range"
  | "date-range"
  | "date-price-range"
  | "horizontal"
  | "trend"
  | "info-line"
  | "extended-line"
  | "trend-angle"
  | "crossline"
  | "ray"
  | "horizontal-ray"
  | "vertical"
  | "rectangle"
  | "fib"
  | "fib-time-zone"
  | "fib-trend-time"
  | "fib-extension"
  | "fib-channel"
  | "pitchfork"
  | "schiff-pitchfork"
  | "modified-schiff-pitchfork"
  | "inside-pitchfork"
  | "regression-trend"
  | "channel"
  | "flat-channel"
  | "disjoint-channel"
  | "text"
  | "brush"
  | "highlighter"
  | "arrow-marker"
  | "arrow"
  | "arrow-up"
  | "arrow-down"
  | "rotated-rectangle"
  | "path"
  | "circle"
  | "ellipse"
  | "polyline"
  | "triangle"
  | "arc"
  | "curve"
  | "double-curve";
export type DrawingAnchor = { time: Time; price: number };
export type DrawingLevel = {
  opacity?: number;
  value: number;
  visible: boolean;
  color?: string;
  width?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
};
export type DrawingRegressionLine = {
  /** Fill opacity; boundary strokes remain opaque. */
  opacity?: number;
  visible: boolean;
  color: string;
  width: number;
  lineStyle: "solid" | "dashed" | "dotted";
};
export type DrawingLineAppearance = Pick<
  DrawingRegressionLine,
  "color" | "width" | "lineStyle" | "opacity"
>;
export type DrawingRegressionFit = { result: ChartRegression; start: Time; end: Time };
export type DrawingSettings = {
  ghostRange?: number;
  ghostVariance?: number;
  ghostBars?: number;
  lineOpacity?: number;
  textOpacity?: number;
  trendLine?: DrawingLineAppearance;
  regressionSource?: RegressionSource;
  regressionUpperDeviation?: number;
  regressionLowerDeviation?: number;
  regressionUseUpperDeviation?: boolean;
  regressionUseLowerDeviation?: boolean;
  regressionShowPearson?: boolean;
  regressionBaseLine?: DrawingRegressionLine;
  regressionUpperLine?: DrawingRegressionLine;
  regressionLowerLine?: DrawingRegressionLine;
  levels?: DrawingLevel[];
  useOneColor?: boolean;
  extendLines?: boolean;
  pitchforkStyle?: "original" | "schiff" | "modified-schiff" | "inside";
  reverse?: boolean;
  background?: boolean;
  backgroundOpacity?: number;
  backgroundColor?: string;
  showPrices?: boolean;
  showLevels?: boolean;
  showTrendLine?: boolean;
  levelLabelFormat?: "percent" | "value";
  levelLabelPosition?: "left" | "center" | "right";
  levelLabelAlignment?: "top" | "middle" | "bottom";
  visibility?: DrawingVisibility;
  showMiddlePoint?: boolean;
  stats?: Array<"price" | "percent" | "ticks" | "bars" | "datetime" | "distance" | "angle">;
  statsPosition?: "left" | "center" | "right" | "auto";
  alwaysShowStats?: boolean;
  extendLeft?: boolean;
  extendRight?: boolean;
  showPriceLabel?: boolean;
  showTimeLabel?: boolean;
  extendAcrossPanes?: boolean;
  priceLabelColor?: string;
  priceLabelFontSize?: number;
  priceLabelBold?: boolean;
  priceLabelItalic?: boolean;
  startMarker?: "normal" | "arrow";
  endMarker?: "normal" | "arrow";
  text?: string;
  textColor?: string;
  textFontSize?: number;
  textBold?: boolean;
  textItalic?: boolean;
  textBorder?: boolean;
  textBorderColor?: string;
  textBorderOpacity?: number;
  textWrap?: boolean;
  textWrapWidth?: number;
  textPosition?: "above" | "center" | "below";
  textAlignment?: "left" | "center" | "right";
  textOrientation?: "horizontal" | "vertical";
};
export type ChartDrawing = DrawingSettings & {
  pattern?: DrawingBarPattern;
  id: string;
  kind: DrawingKind;
  anchors: DrawingAnchor[];
  color: string;
  width: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  locked?: boolean;
  hidden?: boolean;
  name?: string;
};
export type DrawingPoint = { x: number; y: number };
export type DrawingLine = {
  opacity?: number;
  width?: number;
  from: DrawingPoint;
  to: DrawingPoint;
  label?: string;
  color?: string;
  lineStyle?: "solid" | "dashed" | "dotted";
  labelPoint?: DrawingPoint;
  labelAlign?: "left" | "center" | "right";
  labelBaseline?: "top" | "middle" | "bottom";
};
export type DrawingGeometry = {
  priceLabels?: Array<{ point: DrawingPoint; value: string; align: "left" | "right" }>;
  lines: DrawingLine[];
  rectangle?: { x: number; y: number; width: number; height: number };
  rectangleFill?: { color: string; opacity: number };
  text?: {
    point: DrawingPoint;
    value: string;
    align?: "left" | "center" | "right";
    baseline?: "top" | "middle" | "bottom";
    fontSize?: number;
    angle?: number;
    layout?: DrawingTextLayout;
    opacity?: number;
    background?: { color: string; opacity: number };
    border?: { color: string; opacity: number };
  };
  handles: DrawingPoint[];
  /** Original anchor indices for the visible, editable handles of dense freehand strokes. */
  handleIndices?: number[];
  handleAnchorIndices?: number[];
  polygons?: Array<{ points: DrawingPoint[]; opacity: number; color?: string; lineFill?: boolean }>;
  strokeWidth?: number;
  opacity?: number;
};
export const DRAWING_ANCHORS: Record<DrawingKind, number> = {
  "ghost-feed": 2,
  "bars-pattern": 2,
  "position-forecast": 2,
  "anchored-vwap": 1,
  sector: 3,
  "long-position": 3,
  "short-position": 3,
  "price-range": 2,
  "date-range": 2,
  "date-price-range": 2,
  horizontal: 1,
  trend: 2,
  "info-line": 2,
  "extended-line": 2,
  "trend-angle": 2,
  crossline: 1,
  ray: 2,
  "horizontal-ray": 1,
  vertical: 1,
  rectangle: 2,
  fib: 2,
  "fib-extension": 3,
  "fib-time-zone": 2,
  "fib-trend-time": 3,
  "fib-channel": 3,
  pitchfork: 3,
  "schiff-pitchfork": 3,
  "modified-schiff-pitchfork": 3,
  "inside-pitchfork": 3,
  channel: 3,
  "regression-trend": 2,
  "flat-channel": 3,
  "disjoint-channel": 3,
  text: 1,
  brush: 2,
  highlighter: 2,
  "arrow-marker": 2,
  arrow: 2,
  "arrow-up": 1,
  "arrow-down": 1,
  "rotated-rectangle": 3,
  path: 2,
  circle: 2,
  ellipse: 2,
  polyline: 2,
  triangle: 3,
  arc: 3,
  curve: 3,
  "double-curve": 4,
};
export const isVariableDrawingTool = (kind: DrawingKind) =>
  kind === "brush" ||
  kind === "highlighter" ||
  kind === "path" ||
  kind === "polyline" ||
  kind === "ghost-feed";
export const isVariableDrawingKind = isVariableDrawingTool;
export const isFreehandDrawingTool = (kind: DrawingKind) =>
  kind === "brush" || kind === "highlighter";
export const minimumDrawingAnchors = (kind: DrawingKind) => DRAWING_ANCHORS[kind];
export const maximumDrawingAnchors = (kind: DrawingKind) =>
  kind === "ghost-feed" ? 20 : isVariableDrawingTool(kind) ? 1000 : DRAWING_ANCHORS[kind];
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export const isPitchforkDrawingTool = (kind: DrawingKind) =>
  ["pitchfork", "schiff-pitchfork", "modified-schiff-pitchfork", "inside-pitchfork"].includes(kind);
export const isFibTimeDrawing = (kind: DrawingKind) =>
  kind === "fib-time-zone" || kind === "fib-trend-time";
export function defaultFibTimeDrawingSettings(kind: DrawingKind): DrawingSettings {
  return isFibTimeDrawing(kind)
    ? {
        background: kind === "fib-trend-time",
        backgroundOpacity: 0.2,
        showLevels: true,
        showTrendLine: true,
        levelLabelPosition: "right",
        levelLabelAlignment: "bottom",
        trendLine: { color: "#808080", width: 2, lineStyle: "dashed", opacity: 1 },
      }
    : {};
}
export function fibTimeAppearancePatch(
  drawing: ChartDrawing,
  patch: Partial<DrawingLineAppearance>,
): DrawingSettings {
  if (!isFibTimeDrawing(drawing.kind)) return {};
  const appearance: Partial<DrawingLineAppearance> = {};
  if (typeof patch.color === "string" && /^#[a-f\d]{6}$/i.test(patch.color)) {
    appearance.color = patch.color;
    appearance.opacity = 1;
  }
  if (
    typeof patch.width === "number" &&
    Number.isInteger(patch.width) &&
    patch.width >= 1 &&
    patch.width <= 8
  )
    appearance.width = patch.width;
  if (patch.lineStyle === "solid" || patch.lineStyle === "dashed" || patch.lineStyle === "dotted")
    appearance.lineStyle = patch.lineStyle;
  if (
    typeof patch.opacity === "number" &&
    Number.isFinite(patch.opacity) &&
    patch.opacity >= 0 &&
    patch.opacity <= 1
  )
    appearance.opacity = patch.opacity;
  if (!Object.keys(appearance).length) return {};
  return {
    levels: (drawing.levels ?? defaultDrawingLevels(drawing.kind)).map((level) => ({
      ...level,
      ...appearance,
    })),
    ...(drawing.kind === "fib-trend-time"
      ? {
          trendLine: {
            ...(drawing.trendLine ?? defaultFibTimeDrawingSettings(drawing.kind).trendLine!),
            ...appearance,
          },
        }
      : {}),
  };
}
export const supportsDrawingLevels = (kind: DrawingKind) =>
  ["fib", "fib-extension", "fib-channel"].includes(kind) ||
  isPitchforkDrawingTool(kind) ||
  isFibTimeDrawing(kind);
export function defaultParallelChannelLevels(): DrawingLevel[] {
  // Sparse appearance preserves existing channels and inherits their toolbar style.
  return [0, 1, 0.5].map((value) => ({ value, visible: true }));
}
/** Seven settings rows from the official channel Style panel; legacy appearance stays sparse. */
export function parallelChannelSettingsLevels(drawing: ChartDrawing): DrawingLevel[] {
  const levels = drawing.levels ?? defaultParallelChannelLevels();
  // Once expanded, row positions identify the primary rails: their ratios are editable.
  if (levels.length >= 7)
    return levels.map((level, index) =>
      index === 1 || index === 5 ? { ...level, visible: true } : { ...level },
    );
  const remaining = levels.map((level) => ({ ...level }));
  const rows = [-0.25, 0, 0.25, 0.5, 0.75, 1, 1.25].map((value) => {
    const index = remaining.findIndex((level) => level.value === value);
    const existing = index < 0 ? undefined : remaining.splice(index, 1)[0];
    return { value, existing };
  });
  const resolved = rows.map(({ value, existing }) => {
    if (value === 0 || value === 1) return { ...existing, value, visible: true };
    return existing ?? remaining.shift() ?? { value, visible: false };
  });
  // Never silently discard settings from older records with more custom levels.
  return [...resolved, ...remaining];
}
export function defaultDrawingLevels(kind: DrawingKind): DrawingLevel[] {
  if (kind === "channel") return defaultParallelChannelLevels();
  if (kind === "fib-time-zone")
    return [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89].map((value) => ({
      value,
      visible: true,
      color: value === 0 ? "#808080" : "#2962ff",
      width: 2,
      lineStyle: "solid",
      opacity: 1,
    }));
  if (kind === "fib-trend-time") {
    const colors = [
      "#808080",
      "#f23645",
      "#81c784",
      "#4caf50",
      "#089981",
      "#00bcd4",
      "#808080",
      "#2962ff",
      "#e91e63",
      "#9c27b0",
      "#673ab7",
    ];
    return [0, 0.382, 0.5, 0.618, 1, 1.382, 1.618, 2, 2.382, 2.618, 3].map((value, index) => ({
      value,
      visible: value !== 0.5,
      color: colors[index]!,
      width: 2,
      lineStyle: "solid",
      opacity: 1,
    }));
  }
  if (kind === "fib-extension" || kind === "fib-channel") {
    const values = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236];
    const colors = [
      "#808080",
      "#f23645",
      "#ff9800",
      "#4caf50",
      "#089981",
      "#00bcd4",
      "#808080",
      "#2962ff",
      "#f23645",
      "#9c27b0",
      "#e91e63",
    ];
    return values.map((value, index) => ({ value, visible: true, color: colors[index]! }));
  }
  if (isPitchforkDrawingTool(kind))
    return [0.25, 0.382, 0.5, 0.618, 0.75, 1, 1.5, 1.75, 2].map((value) => ({
      value,
      visible: value === 0.5 || value === 1,
      color: value === 0.5 ? "#4caf50" : "#2962ff",
    }));
  if (kind === "fib") {
    // TradingView's documented FibretracementLineToolOverrides level1–level7 defaults.
    // https://www.tradingview.com/charting-library-docs/latest/api/interfaces/Charting_Library.FibretracementLineToolOverrides/
    const colors = ["#808080", "#f23645", "#ff9800", "#4caf50", "#089981", "#00bcd4", "#808080"];
    return FIB_LEVELS.map((value, index) => ({ value, visible: true, color: colors[index]! }));
  }
  return [];
}
/** Defaults for the new level tools; saved retracements retain their original appearance. */
export function defaultDrawingLevelSettings(kind: DrawingKind): DrawingSettings {
  if (kind === "fib") return { levels: defaultDrawingLevels(kind), useOneColor: false };
  if (isFibTimeDrawing(kind)) return defaultFibTimeDrawingSettings(kind);
  if (isPitchforkDrawingTool(kind))
    return { background: true, backgroundOpacity: 0.12, showLevels: false, showPrices: false };
  return kind === "fib-extension" || kind === "fib-channel"
    ? {
        extendLeft: false,
        extendRight: false,
        background: true,
        backgroundOpacity: 0.12,
        showPrices: true,
        showLevels: true,
        levelLabelFormat: "value",
        levelLabelPosition: "left",
        levelLabelAlignment: "middle",
        ...(kind === "fib-extension" ? { showTrendLine: true } : {}),
      }
    : {};
}
export function drawingTimeValue(time: unknown): number | null {
  if (typeof time === "number") return Number.isFinite(time) ? time : null;
  if (typeof time === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(time)) return null;
    const value = Date.parse(`${time}T00:00:00Z`);
    return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === time
      ? value / 1000
      : null;
  }
  if (time && typeof time === "object" && "year" in time && "month" in time && "day" in time) {
    const { year, month, day } = time;
    if (![year, month, day].every((part) => typeof part === "number" && Number.isInteger(part)))
      return null;
    return drawingTimeValue(
      `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }
  return null;
}
function isAnchor(value: unknown): value is DrawingAnchor {
  return (
    !!value &&
    typeof value === "object" &&
    "time" in value &&
    drawingTimeValue(value.time) !== null &&
    "price" in value &&
    typeof value.price === "number" &&
    Number.isFinite(value.price)
  );
}
export type RegressionDrawingSettings = Required<
  Pick<
    DrawingSettings,
    | "regressionSource"
    | "regressionUpperDeviation"
    | "regressionLowerDeviation"
    | "regressionUseUpperDeviation"
    | "regressionUseLowerDeviation"
    | "regressionShowPearson"
    | "regressionBaseLine"
    | "regressionUpperLine"
    | "regressionLowerLine"
    | "extendLines"
  >
>;
export function defaultRegressionDrawingSettings(): RegressionDrawingSettings;
export function defaultRegressionDrawingSettings(kind: DrawingKind): DrawingSettings;
export function defaultRegressionDrawingSettings(kind?: DrawingKind): DrawingSettings {
  if (kind !== undefined && kind !== "regression-trend") return {};
  return {
    regressionSource: "close",
    regressionUpperDeviation: 2,
    regressionLowerDeviation: -2,
    regressionUseUpperDeviation: true,
    regressionUseLowerDeviation: true,
    regressionShowPearson: true,
    regressionBaseLine: {
      visible: true,
      color: "#f23645",
      width: 1,
      lineStyle: "dashed",
      opacity: 0.3,
    },
    regressionUpperLine: {
      visible: true,
      color: "#2962ff",
      width: 2,
      lineStyle: "solid",
      opacity: 0.3,
    },
    regressionLowerLine: {
      visible: true,
      color: "#2962ff",
      width: 2,
      lineStyle: "solid",
      opacity: 0.3,
    },
    extendLines: false,
  };
}
export const DEFAULT_SHAPE_BACKGROUND_OPACITY = 0.12;
export const supportsShapeBackground = (kind: DrawingKind) =>
  [
    "rectangle",
    "circle",
    "ellipse",
    "triangle",
    "rotated-rectangle",
    "sector",
    "date-price-range",
  ].includes(kind);

export const isSpecialChannelDrawing = (kind: DrawingKind) =>
  kind === "flat-channel" || kind === "disjoint-channel";
export function defaultChannelDrawingSettings(kind: DrawingKind): DrawingSettings {
  if (kind === "channel")
    return { background: false, backgroundOpacity: 0.12, extendLeft: false, extendRight: false };
  return isSpecialChannelDrawing(kind)
    ? {
        background: true,
        backgroundOpacity: 0.12,
        textAlignment: "left",
        textPosition: "above",
      }
    : {};
}
export const supportsLineStatistics = (kind: DrawingKind) =>
  ["trend", "info-line", "extended-line", "trend-angle", "ray", "arrow"].includes(kind);
export const defaultDrawingStats = (kind: DrawingKind): NonNullable<DrawingSettings["stats"]> =>
  kind === "info-line"
    ? ["price", "percent", "ticks", "bars", "datetime", "distance", "angle"]
    : [];
export const supportsLineExtensions = (kind: DrawingKind) =>
  supportsDrawingLevels(kind) ||
  isSpecialChannelDrawing(kind) ||
  ["trend", "info-line", "extended-line", "trend-angle", "ray", "arrow", "channel"].includes(kind);
export function drawingLineExtensions(drawing: ChartDrawing) {
  const first = drawingTimeValue(drawing.anchors[0]?.time);
  const second = drawingTimeValue(drawing.anchors[1]?.time);
  const reversed = first !== null && second !== null && second < first;
  return {
    left:
      drawing.extendLeft ??
      (drawing.kind === "extended-line" || (drawing.kind === "ray" && reversed)),
    right:
      drawing.extendRight ??
      (drawing.kind === "extended-line" || (drawing.kind === "ray" && !reversed)),
  };
}
export function drawingLineMarkers(drawing: ChartDrawing) {
  return {
    start: drawing.startMarker ?? "normal",
    end:
      drawing.endMarker ??
      (drawing.kind === "arrow" || drawing.kind === "path" ? "arrow" : "normal"),
  } as const;
}
export const supportsLineMarkers = (kind: DrawingKind) =>
  isSpecialChannelDrawing(kind) ||
  [
    "trend",
    "info-line",
    "extended-line",
    "ray",
    "horizontal",
    "horizontal-ray",
    "vertical",
    "arrow",
    "path",
    "polyline",
    "curve",
    "double-curve",
    "arc",
  ].includes(kind);
export const supportsDrawingPriceLabels = (kind: DrawingKind) =>
  isSpecialChannelDrawing(kind) ||
  [
    "horizontal",
    "horizontal-ray",
    "crossline",
    "trend",
    "info-line",
    "extended-line",
    "trend-angle",
    "ray",
    "arrow",
    "channel",
  ].includes(kind);

export function defaultVerticalLineSettings(kind: DrawingKind): DrawingSettings {
  return kind === "vertical"
    ? {
        extendAcrossPanes: true,
        textOrientation: "vertical",
        textPosition: "center",
        textAlignment: "center",
      }
    : {};
}

export const supportsDrawingTimeLabels = (kind: DrawingKind) =>
  kind === "vertical" || kind === "crossline";
export const drawingPriceLabelVisible = (drawing: Pick<ChartDrawing, "kind" | "showPriceLabel">) =>
  supportsDrawingPriceLabels(drawing.kind) &&
  (drawing.showPriceLabel ?? ["horizontal", "horizontal-ray", "crossline"].includes(drawing.kind));
export const drawingTimeLabelVisible = (drawing: Pick<ChartDrawing, "kind" | "showTimeLabel">) =>
  supportsDrawingTimeLabels(drawing.kind) && drawing.showTimeLabel !== false;
export function defaultDrawingAxisLabelSettings(kind: DrawingKind): DrawingSettings {
  return {
    ...(["horizontal", "horizontal-ray", "crossline"].includes(kind)
      ? { showPriceLabel: true }
      : {}),
    ...(supportsDrawingTimeLabels(kind) ? { showTimeLabel: true } : {}),
  };
}

/** Persist only supported, finite settings; invalid stored options fall back to existing behavior. */
export function sanitizeDrawingSettings(value: unknown): DrawingSettings {
  if (!value || typeof value !== "object") return {};
  const source = value as DrawingSettings;
  const result: DrawingSettings = {};
  for (const key of ["ghostRange", "ghostVariance"] as const)
    if (
      typeof source[key] === "number" &&
      Number.isFinite(source[key]) &&
      source[key] >= 0 &&
      source[key] <= 1_000_000
    )
      result[key] = source[key];
  if (
    typeof source.ghostBars === "number" &&
    Number.isInteger(source.ghostBars) &&
    source.ghostBars >= 2 &&
    source.ghostBars <= 100
  )
    result.ghostBars = source.ghostBars;

  for (const key of ["lineOpacity", "textOpacity"] as const)
    if (
      typeof source[key] === "number" &&
      Number.isFinite(source[key]) &&
      source[key] >= 0 &&
      source[key] <= 1
    )
      result[key] = source[key];
  if (["original", "schiff", "modified-schiff", "inside"].includes(source.pitchforkStyle ?? ""))
    result.pitchforkStyle = source.pitchforkStyle!;
  if (source.levelLabelFormat === "percent" || source.levelLabelFormat === "value")
    result.levelLabelFormat = source.levelLabelFormat;
  if (Array.isArray(source.levels))
    result.levels = source.levels.slice(0, 64).flatMap((level) => {
      if (
        !level ||
        typeof level !== "object" ||
        typeof level.value !== "number" ||
        !Number.isFinite(level.value) ||
        Math.abs(level.value) > 100
      )
        return [];
      return [
        {
          value: level.value,
          visible: level.visible !== false,
          ...(typeof level.opacity === "number" &&
          Number.isFinite(level.opacity) &&
          level.opacity >= 0 &&
          level.opacity <= 1
            ? { opacity: level.opacity }
            : {}),
          ...(typeof level.width === "number" &&
          Number.isInteger(level.width) &&
          level.width >= 1 &&
          level.width <= 8
            ? { width: level.width }
            : {}),
          ...(["solid", "dashed", "dotted"].includes(level.lineStyle ?? "")
            ? { lineStyle: level.lineStyle! }
            : {}),
          ...(typeof level.color === "string" && /^#[a-f\d]{6}$/i.test(level.color)
            ? { color: level.color }
            : {}),
        },
      ];
    });
  const trend = source.trendLine;
  if (
    trend &&
    typeof trend === "object" &&
    typeof trend.color === "string" &&
    /^#[a-f\d]{6}$/i.test(trend.color) &&
    Number.isInteger(trend.width) &&
    trend.width >= 1 &&
    trend.width <= 8 &&
    ["solid", "dashed", "dotted"].includes(trend.lineStyle)
  )
    result.trendLine = {
      color: trend.color,
      width: trend.width,
      lineStyle: trend.lineStyle,
      ...(typeof trend.opacity === "number" &&
      Number.isFinite(trend.opacity) &&
      trend.opacity >= 0 &&
      trend.opacity <= 1
        ? { opacity: trend.opacity }
        : {}),
    };
  if (
    typeof source.backgroundOpacity === "number" &&
    Number.isFinite(source.backgroundOpacity) &&
    source.backgroundOpacity >= 0 &&
    source.backgroundOpacity <= 1
  )
    result.backgroundOpacity = source.backgroundOpacity;
  if (["left", "center", "right"].includes(source.levelLabelPosition ?? ""))
    result.levelLabelPosition = source.levelLabelPosition!;
  if (["top", "middle", "bottom"].includes(source.levelLabelAlignment ?? ""))
    result.levelLabelAlignment = source.levelLabelAlignment!;
  if (source.visibility !== undefined)
    result.visibility = sanitizeDrawingVisibility(source.visibility);
  if (Array.isArray(source.stats))
    result.stats = [
      ...new Set(
        source.stats.filter((stat) =>
          ["price", "percent", "ticks", "bars", "datetime", "distance", "angle"].includes(stat),
        ),
      ),
    ];
  if (["left", "center", "right", "auto"].includes(source.statsPosition ?? ""))
    result.statsPosition = source.statsPosition!;
  if (
    typeof source.regressionSource === "string" &&
    ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4", "hlcc4"].includes(
      String(source.regressionSource),
    )
  )
    result.regressionSource = source.regressionSource as RegressionSource;
  for (const key of ["regressionUpperDeviation", "regressionLowerDeviation"] as const)
    if (
      typeof source[key] === "number" &&
      Number.isFinite(source[key]) &&
      Math.abs(source[key]) <= 100
    )
      result[key] = source[key];
  for (const key of ["regressionBaseLine", "regressionUpperLine", "regressionLowerLine"] as const) {
    const line = source[key];
    if (
      line &&
      typeof line === "object" &&
      typeof line.visible === "boolean" &&
      typeof line.color === "string" &&
      /^#[a-f\d]{6}$/i.test(line.color) &&
      typeof line.width === "number" &&
      Number.isInteger(line.width) &&
      line.width >= 1 &&
      line.width <= 8 &&
      ["solid", "dashed", "dotted"].includes(line.lineStyle)
    )
      result[key] = {
        visible: line.visible,
        color: line.color,
        width: line.width,
        lineStyle: line.lineStyle,
        ...(typeof line.opacity === "number" &&
        Number.isFinite(line.opacity) &&
        line.opacity >= 0 &&
        line.opacity <= 1
          ? { opacity: line.opacity }
          : {}),
      };
  }
  for (const key of [
    "useOneColor",
    "extendLines",
    "regressionUseUpperDeviation",
    "regressionUseLowerDeviation",
    "regressionShowPearson",
    "reverse",
    "background",
    "showPrices",
    "showLevels",
    "showTrendLine",
    "showMiddlePoint",
    "alwaysShowStats",
    "extendLeft",
    "extendRight",
    "showPriceLabel",
    "showTimeLabel",
    "extendAcrossPanes",
    "priceLabelBold",
    "priceLabelItalic",
    "textBold",
    "textItalic",
    "textBorder",
    "textWrap",
  ] as const)
    if (typeof source[key] === "boolean") result[key] = source[key];
  for (const key of ["startMarker", "endMarker"] as const)
    if (source[key] === "normal" || source[key] === "arrow") result[key] = source[key];
  if (typeof source.backgroundColor === "string" && /^#[a-f\d]{6}$/i.test(source.backgroundColor))
    result.backgroundColor = source.backgroundColor;
  if (typeof source.priceLabelColor === "string" && /^#[a-f\d]{6}$/i.test(source.priceLabelColor))
    result.priceLabelColor = source.priceLabelColor;
  if (
    typeof source.priceLabelFontSize === "number" &&
    Number.isInteger(source.priceLabelFontSize) &&
    source.priceLabelFontSize >= 8 &&
    source.priceLabelFontSize <= 48
  )
    result.priceLabelFontSize = source.priceLabelFontSize;
  if (typeof source.textBorderColor === "string" && /^#[a-f\d]{6}$/i.test(source.textBorderColor))
    result.textBorderColor = source.textBorderColor;
  if (
    typeof source.textBorderOpacity === "number" &&
    Number.isFinite(source.textBorderOpacity) &&
    source.textBorderOpacity >= 0 &&
    source.textBorderOpacity <= 1
  )
    result.textBorderOpacity = source.textBorderOpacity;
  if (
    typeof source.textWrapWidth === "number" &&
    Number.isFinite(source.textWrapWidth) &&
    source.textWrapWidth >= 40 &&
    source.textWrapWidth <= 4000
  )
    result.textWrapWidth = source.textWrapWidth;
  if (typeof source.text === "string") result.text = source.text;
  if (typeof source.textColor === "string" && /^#[a-f\d]{6}$/i.test(source.textColor))
    result.textColor = source.textColor;
  if (
    typeof source.textFontSize === "number" &&
    Number.isInteger(source.textFontSize) &&
    source.textFontSize >= 8 &&
    source.textFontSize <= 48
  )
    result.textFontSize = source.textFontSize;
  if (source.textOrientation === "horizontal" || source.textOrientation === "vertical")
    result.textOrientation = source.textOrientation;
  if (
    source.textPosition === "above" ||
    source.textPosition === "center" ||
    source.textPosition === "below"
  )
    result.textPosition = source.textPosition;
  if (
    source.textAlignment === "left" ||
    source.textAlignment === "center" ||
    source.textAlignment === "right"
  )
    result.textAlignment = source.textAlignment;
  return result;
}

export function parseChartDrawings(value: string | null): ChartDrawing[] {
  if (!value) return [];
  try {
    const decoded: unknown = JSON.parse(value);
    if (!Array.isArray(decoded)) return [];
    return decoded
      .flatMap((record, index): ChartDrawing[] => {
        if (!record || typeof record !== "object" || !Object.hasOwn(DRAWING_ANCHORS, record.kind))
          return [];
        const kind = record.kind as DrawingKind;
        const anchors: unknown =
          record.anchors ??
          (kind === "horizontal"
            ? [{ time: 0, price: record.price }]
            : kind === "trend"
              ? [record.from, record.to]
              : []);
        if (!Array.isArray(anchors) || !validDrawingAnchors(kind, anchors)) return [];
        const pattern = kind === "bars-pattern" ? normalizeBarPattern(record.pattern) : null;
        if (kind === "bars-pattern" && !pattern) return [];
        return [
          {
            ...(pattern ? { pattern } : {}),
            id: typeof record.id === "string" ? record.id.slice(0, 100) : `legacy-${index}`,
            kind,
            anchors,
            color: /^#[a-f\d]{6}$/i.test(record.color) ? record.color : "#729bff",
            width: [1, 2, 3, 4].includes(record.width) ? record.width : 2,
            ...(["solid", "dashed", "dotted"].includes(record.lineStyle)
              ? { lineStyle: record.lineStyle as NonNullable<ChartDrawing["lineStyle"]> }
              : {}),
            ...(record.locked === true ? { locked: true } : {}),
            ...(record.hidden === true ? { hidden: true } : {}),
            ...(typeof record.name === "string" ? { name: record.name.trim().slice(0, 80) } : {}),
            ...sanitizeDrawingSettings(record),
            ...(kind === "text" && typeof record.text !== "string" ? { text: "Text" } : {}),
          },
        ];
      })
      .slice(-100);
  } catch {
    return [];
  }
}
function buildBaseDrawingGeometry(
  drawing: ChartDrawing,
  project: (anchor: DrawingAnchor) => DrawingPoint | null,
  priceY: (price: number) => number | null,
  width: number,
  height: number,
): DrawingGeometry {
  const result: DrawingGeometry = { lines: [], handles: [] };
  if (drawing.hidden) return result;
  const a = drawing.anchors[0];
  if (!a) return result;
  const ay = priceY(a.price);
  if (ay === null) return result;
  const first =
    drawing.kind === "horizontal" ? (project(a) ?? { x: width / 2, y: ay }) : project(a);
  if (!first) return result;
  result.handles.push(first);
  const shapeFill =
    supportsShapeBackground(drawing.kind) && drawing.background !== false
      ? {
          color: drawing.backgroundColor ?? drawing.color,
          opacity: drawing.backgroundOpacity ?? DEFAULT_SHAPE_BACKGROUND_OPACITY,
        }
      : undefined;
  const line = (from: DrawingPoint, to: DrawingPoint, label?: string) =>
    result.lines.push({ from, to, ...(label ? { label } : {}) });
  const path = (points: DrawingPoint[], closed = false, fillOpacity?: number) => {
    for (let index = 1; index < points.length; index++) line(points[index - 1]!, points[index]!);
    if (closed && points.length > 2) line(points.at(-1)!, points[0]!);
    if (fillOpacity !== undefined)
      (result.polygons ??= []).push({
        points,
        opacity: fillOpacity,
        ...(shapeFill ? { color: shapeFill.color } : fillOpacity === 1 ? { lineFill: true } : {}),
      });
  };
  const blockArrow = (from: DrawingPoint, to: DrawingPoint) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (!length) return;
    const ux = (to.x - from.x) / length,
      uy = (to.y - from.y) / length;
    const half = Math.min(4 + drawing.width, length / 5),
      head = Math.min(14 + drawing.width * 2, length * 0.55);
    const point = (along: number, across: number) => ({
      x: from.x + ux * along - uy * across,
      y: from.y + uy * along + ux * across,
    });
    path(
      [
        point(0, -half),
        point(length - head, -half),
        point(length - head, -half * 2),
        to,
        point(length - head, half * 2),
        point(length - head, half),
        point(0, half),
      ],
      true,
      1,
    );
  };
  if (drawing.kind === "arrow-up" || drawing.kind === "arrow-down") {
    const direction = drawing.kind === "arrow-up" ? 1 : -1;
    blockArrow({ x: first.x, y: first.y + direction * (28 + drawing.width * 2) }, first);
    return result;
  }
  if (isVariableDrawingTool(drawing.kind)) {
    const projected = drawing.anchors.map(project);
    if (projected.some((point) => point === null)) return result;
    const points = projected as DrawingPoint[];
    result.handles = points;
    path(points);
    if (isFreehandDrawingTool(drawing.kind))
      result.handleIndices = points.length > 1 ? [0, points.length - 1] : [0];
    if (drawing.kind === "highlighter") {
      result.strokeWidth = drawing.width * 8;
      result.opacity = 0.25;
    }
    return result;
  }
  if (drawing.kind === "crossline") {
    line({ x: 0, y: ay }, { x: width, y: ay });
    line({ x: first.x, y: 0 }, { x: first.x, y: height });
    return result;
  }
  if (drawing.kind === "horizontal") {
    line({ x: 0, y: ay }, { x: width, y: ay });
    return result;
  }
  if (drawing.kind === "horizontal-ray") {
    line(first, { x: width, y: ay });
    return result;
  }
  if (drawing.kind === "vertical") {
    line({ x: first.x, y: 0 }, { x: first.x, y: height });
    return result;
  }
  if (drawing.kind === "text") {
    result.text = { point: first, value: drawing.text ?? "Text" };
    return result;
  }
  const b = drawing.anchors[1];
  const second = b && project(b);
  if (!b || !second) return result;
  result.handles.push(second);
  if (drawing.kind === "arrow" || drawing.kind === "arrow-marker") {
    if (drawing.kind === "arrow-marker") blockArrow(first, second);
    else line(first, second);
    return result;
  }
  if (drawing.kind === "circle" || drawing.kind === "ellipse") {
    const circle = drawing.kind === "circle";
    const center = circle ? first : { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const rx = circle
      ? Math.hypot(second.x - first.x, second.y - first.y)
      : Math.abs(second.x - first.x) / 2;
    const ry = circle ? rx : Math.abs(second.y - first.y) / 2;
    if (!rx || !ry) {
      line(first, second);
      return result;
    }
    path(
      Array.from({ length: 96 }, (_, index) => {
        const angle = (index * Math.PI * 2) / 96;
        return { x: center.x + rx * Math.cos(angle), y: center.y + ry * Math.sin(angle) };
      }),
      true,
      shapeFill?.opacity,
    );
    return result;
  }
  if (["rotated-rectangle", "triangle", "arc", "curve", "double-curve"].includes(drawing.kind)) {
    const projected = drawing.anchors.map(project);
    if (projected.some((point) => point === null)) return result;
    const points = projected as DrawingPoint[];
    result.handles = points;
    const third = points[2];
    if (!third) {
      line(first, second);
      return result;
    }
    if (drawing.kind === "triangle") {
      path([first, second, third], true, shapeFill?.opacity);
      return result;
    }
    if (drawing.kind === "rotated-rectangle") {
      const dx = second.x - first.x,
        dy = second.y - first.y,
        length = Math.hypot(dx, dy);
      if (!length) return result;
      const nx = -dy / length,
        ny = dx / length;
      const offset = (third.x - first.x) * nx + (third.y - first.y) * ny;
      path(
        [
          first,
          second,
          { x: second.x + nx * offset, y: second.y + ny * offset },
          { x: first.x + nx * offset, y: first.y + ny * offset },
        ],
        true,
        shapeFill?.opacity,
      );
      return result;
    }
    if (drawing.kind === "arc") {
      const bx = second.x - first.x,
        by = second.y - first.y;
      const cx = third.x - first.x,
        cy = third.y - first.y;
      const determinant = 2 * (bx * cy - by * cx);
      const b2 = bx * bx + by * by,
        c2 = cx * cx + cy * cy;
      if (Math.abs(determinant) < Math.max(b2, c2, 1) * 1e-8) {
        path([first, second, third]);
        return result;
      }
      const center = {
        x: first.x + (cy * b2 - by * c2) / determinant,
        y: first.y + (bx * c2 - cx * b2) / determinant,
      };
      const radius = Math.hypot(first.x - center.x, first.y - center.y);
      const angle = (point: DrawingPoint) => Math.atan2(point.y - center.y, point.x - center.x);
      const normalize = (value: number) => (value + Math.PI * 4) % (Math.PI * 2);
      const start = angle(first),
        through = normalize(angle(second) - start),
        finish = normalize(angle(third) - start);
      const sweep = through <= finish ? finish : finish - Math.PI * 2;
      const samples = Math.max(16, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 96));
      path(
        Array.from({ length: samples + 1 }, (_, index) =>
          index === 0
            ? first
            : index === samples
              ? third
              : {
                  x: center.x + radius * Math.cos(start + (sweep * index) / samples),
                  y: center.y + radius * Math.sin(start + (sweep * index) / samples),
                },
        ),
      );
      return result;
    }
    const fourth = points[3];
    if (drawing.kind === "double-curve" && !fourth) {
      path([first, second, third]);
      return result;
    }
    path(
      Array.from({ length: 65 }, (_, index) => {
        const t = index / 64,
          u = 1 - t;
        return fourth && drawing.kind === "double-curve"
          ? {
              x:
                u ** 3 * first.x +
                3 * u * u * t * second.x +
                3 * u * t * t * third.x +
                t ** 3 * fourth.x,
              y:
                u ** 3 * first.y +
                3 * u * u * t * second.y +
                3 * u * t * t * third.y +
                t ** 3 * fourth.y,
            }
          : {
              x: u * u * first.x + 2 * u * t * second.x + t * t * third.x,
              y: u * u * first.y + 2 * u * t * second.y + t * t * third.y,
            };
      }),
    );
    return result;
  }
  if (drawing.kind === "ray") {
    const dx = second.x - first.x,
      dy = second.y - first.y;
    if (dx === 0 && dy === 0) return result;
    const tx = dx > 0 ? (width - first.x) / dx : dx < 0 ? -first.x / dx : Infinity;
    const ty = dy > 0 ? (height - first.y) / dy : dy < 0 ? -first.y / dy : Infinity;
    const scale = Math.min(tx >= 0 ? tx : Infinity, ty >= 0 ? ty : Infinity);
    if (Number.isFinite(scale)) line(first, { x: first.x + dx * scale, y: first.y + dy * scale });
    return result;
  }
  if (drawing.kind === "rectangle") {
    const x = Math.min(first.x, second.x),
      y = Math.min(first.y, second.y);
    const w = Math.abs(first.x - second.x),
      h = Math.abs(first.y - second.y);
    result.rectangle = { x, y, width: w, height: h };
    if (shapeFill) result.rectangleFill = shapeFill;
    line({ x, y }, { x: x + w, y });
    line({ x: x + w, y }, { x: x + w, y: y + h });
    line({ x: x + w, y: y + h }, { x, y: y + h });
    line({ x, y: y + h }, { x, y });
    return result;
  }
  if (isSpecialChannelDrawing(drawing.kind)) {
    const third = drawing.anchors[2];
    const y = third && priceY(third.price);
    if (y === undefined || y === null || first.x === second.x) {
      line(first, second);
      return result;
    }
    const oppositeLeft = {
      x: first.x,
      y: drawing.kind === "flat-channel" ? y : y + second.y - first.y,
    };
    const oppositeRight = { x: second.x, y };
    result.handles = [first, second, oppositeRight, oppositeLeft];
    line(first, second);
    line(oppositeLeft, oppositeRight);
    if (drawing.background !== false) {
      const left = drawing.extendLeft ? 0 : Math.min(first.x, second.x),
        right = drawing.extendRight ? width : Math.max(first.x, second.x);
      const at = (a: DrawingPoint, b: DrawingPoint, x: number) => ({
        x,
        y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x),
      });
      result.polygons = [
        {
          points: [
            at(first, second, left),
            at(first, second, right),
            at(oppositeLeft, oppositeRight, right),
            at(oppositeLeft, oppositeRight, left),
          ],
          opacity: drawing.backgroundOpacity ?? 0.12,
          color: drawing.backgroundColor ?? drawing.color,
        },
      ];
    }
    return result;
  }
  if (drawing.kind === "channel") {
    const third = drawing.anchors[2] && project(drawing.anchors[2]);
    if (!third || first.x === second.x) {
      line(first, second);
      return result;
    }
    const baselineY = first.y + (second.y - first.y) * ((third.x - first.x) / (second.x - first.x));
    const offset = third.y - baselineY;
    const middle = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    result.handles = [
      first,
      middle,
      second,
      { x: first.x, y: first.y + offset },
      { x: middle.x, y: middle.y + offset },
      { x: second.x, y: second.y + offset },
    ];
    // Ratio 0 is the original baseline; ratio 1 is the parallel through the third anchor.
    // Keep this separate from Fibonacci routing: channels have no level/price labels or reversal.
    const visibleLevels = (drawing.levels ?? defaultParallelChannelLevels()).filter(
      (level) => level.visible,
    );
    for (const level of visibleLevels) {
      const { value, visible: _visible, ...appearance } = level;
      result.lines.push({
        from: { x: first.x, y: first.y + offset * value },
        to: { x: second.x, y: second.y + offset * value },
        ...appearance,
      });
    }
    const lowerRatio = Math.min(...visibleLevels.map((level) => level.value));
    const upperRatio = Math.max(...visibleLevels.map((level) => level.value));
    if (drawing.background === true && lowerRatio < upperRatio) {
      const left = drawing.extendLeft ? 0 : Math.min(first.x, second.x),
        right = drawing.extendRight ? width : Math.max(first.x, second.x);
      const at = (x: number, ratio: number) => ({
        x,
        y: first.y + ((second.y - first.y) * (x - first.x)) / (second.x - first.x) + offset * ratio,
      });
      result.polygons = [
        {
          points: [
            at(left, lowerRatio),
            at(right, lowerRatio),
            at(right, upperRatio),
            at(left, upperRatio),
          ],
          color: drawing.backgroundColor ?? drawing.color,
          opacity: drawing.backgroundOpacity ?? 0.12,
        },
      ];
    }
  } else line(first, second);
  return result;
}
/** Linear-price Fibonacci projections and the four median constructions documented by TradingView. */
function buildLevelDrawingGeometry(
  drawing: ChartDrawing,
  project: (anchor: DrawingAnchor) => DrawingPoint | null,
  priceY: (price: number) => number | null,
  width: number,
  height: number,
  formatPrice: (price: number) => string,
  coordinatePrice?: (coordinate: number) => number | null,
): DrawingGeometry {
  const result: DrawingGeometry = { lines: [], handles: [] };
  if (drawing.hidden) return result;
  // Preserve a legacy custom overall color, but repair default-blue retracements
  // that predate per-level colors instead of retaining the old single-color bug.
  const legacyRetracementLevels =
    drawing.kind === "fib" &&
    drawing.levels === undefined &&
    !["#2962ff", "#729bff"].includes(drawing.color.toLowerCase())
      ? FIB_LEVELS.map((value) => ({ value, visible: true, color: drawing.color }))
      : undefined;
  drawing = { ...defaultDrawingLevelSettings(drawing.kind), ...drawing };
  const projected = drawing.anchors.map(project);
  if (projected.some((point) => point === null)) return result;
  const points = projected as DrawingPoint[];
  result.handles = points;
  const [a, b, c] = drawing.anchors;
  const [first, second, third] = points;
  if (!a || !b || !first || !second) return result;
  if (drawing.kind !== "fib" && (!c || !third)) {
    result.lines.push({ from: first, to: second });
    return result;
  }
  const midpoint = (a: DrawingPoint, b: DrawingPoint) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const defaultLevels = defaultDrawingLevels(drawing.kind);
  const levels = legacyRetracementLevels ?? drawing.levels ?? defaultLevels;
  const boundaries: Array<{ value: number; line: DrawingLine; color: string }> = [];
  const addLevel = (
    source: DrawingLine,
    level: DrawingLevel,
    defaults: { left: boolean; right: boolean },
    price?: number,
    backgroundSource = source,
  ) => {
    if (!level.visible) return;
    const forkExtensions =
      isPitchforkDrawingTool(drawing.kind) && drawing.extendLines !== undefined;
    const left = forkExtensions
      ? drawing.extendLines || defaults.left
      : (drawing.extendLeft ?? defaults.left);
    const right = forkExtensions
      ? drawing.extendLines || defaults.right
      : (drawing.extendRight ?? defaults.right);
    const color = drawing.useOneColor
      ? drawing.color
      : (level.color ??
        (drawing.kind === "fib"
          ? defaultLevels.find((entry) => entry.value === level.value)?.color
          : undefined) ??
        drawing.color);
    const clipped = extendDrawingLine(source, width, height, left, right);
    // Use unclipped, finite boundaries for background fills even when one level is outside the pane.
    const dx = backgroundSource.to.x - backgroundSource.from.x,
      dy = backgroundSource.to.y - backgroundSource.from.y;
    const length = Math.hypot(dx, dy);
    if (length > 0 && Number.isFinite(length)) {
      const reach =
        (2 * (width + height) +
          Math.abs(backgroundSource.from.x) +
          Math.abs(backgroundSource.from.y) +
          Math.abs(backgroundSource.to.x) +
          Math.abs(backgroundSource.to.y)) /
        length;
      const start = (dx >= 0 ? left : right) ? -reach : 0;
      const end = (dx >= 0 ? right : left) ? 1 + reach : 1;
      boundaries.push({
        value: level.value,
        color,
        line: {
          from: {
            x: backgroundSource.from.x + dx * start,
            y: backgroundSource.from.y + dy * start,
          },
          to: { x: backgroundSource.from.x + dx * end, y: backgroundSource.from.y + dy * end },
        },
      });
    }
    if (!clipped) return;
    const position = drawing.levelLabelPosition ?? "right";
    const leftPoint = clipped.from.x <= clipped.to.x ? clipped.from : clipped.to;
    const rightPoint = clipped.from.x <= clipped.to.x ? clipped.to : clipped.from;
    const point =
      position === "left"
        ? leftPoint
        : position === "right"
          ? rightPoint
          : midpoint(leftPoint, rightPoint);
    const rows: string[] = [];
    if (drawing.showLevels !== false)
      rows.push(
        isPitchforkDrawingTool(drawing.kind) && level.value === 0
          ? "Median"
          : drawing.levelLabelFormat === "value"
            ? String(level.value)
            : `${Number((level.value * 100).toFixed(3))}%`,
      );
    if (drawing.showPrices) {
      // The horizontal tools have an exact target price; sloped levels use the linear-price chart at the label point.
      const reference = points.findIndex((p) => p.y !== first.y);
      const inferred =
        reference >= 0
          ? a.price +
            ((point.y - first.y) * (drawing.anchors[reference]!.price - a.price)) /
              (points[reference]!.y - first.y)
          : a.price;
      const value = price ?? coordinatePrice?.(point.y) ?? inferred;
      if (Number.isFinite(value)) rows.push(formatPrice(value));
    }
    const vertical = drawing.levelLabelAlignment ?? "top";
    result.lines.push({
      ...clipped,
      color,
      ...(level.width === undefined ? {} : { width: level.width }),
      ...(level.lineStyle === undefined ? {} : { lineStyle: level.lineStyle }),
      ...(level.opacity === undefined ? {} : { opacity: level.opacity }),
      ...(rows.length
        ? {
            label: rows.join("  "),
            labelPoint: {
              x: point.x + (position === "left" ? 6 : position === "right" ? -6 : 0),
              y: Math.max(
                14,
                Math.min(
                  height - 4,
                  point.y + (vertical === "top" ? -4 : vertical === "bottom" ? 4 : 0),
                ),
              ),
            },
            labelAlign: position,
            labelBaseline: vertical === "top" ? "bottom" : vertical === "bottom" ? "top" : "middle",
          }
        : {}),
    });
  };
  if (drawing.kind === "fib" || drawing.kind === "fib-extension") {
    const extension = drawing.kind === "fib-extension";
    const base = extension ? c!.price : drawing.reverse ? a.price : b.price;
    const delta = extension
      ? (b.price - a.price) * (drawing.reverse ? -1 : 1)
      : (a.price - b.price) * (drawing.reverse ? -1 : 1);
    const fromX = extension ? Math.min(second.x, third!.x) : Math.min(first.x, second.x);
    const toX = extension ? Math.max(second.x, third!.x) : Math.max(first.x, second.x);
    for (const level of levels) {
      const price = base + delta * level.value,
        y = priceY(price);
      if (y !== null && Number.isFinite(y))
        addLevel(
          { from: { x: fromX, y }, to: { x: toX, y } },
          level,
          { left: false, right: extension },
          price,
        );
    }
    if (drawing.showTrendLine ?? extension) {
      result.lines.push({ from: first, to: second, lineStyle: "dashed" });
      if (extension) result.lines.push({ from: second, to: third!, lineStyle: "dashed" });
    }
  } else if (drawing.kind === "fib-channel") {
    const direction = drawing.reverse ? -1 : 1;
    const offset = { x: (third!.x - first.x) * direction, y: (third!.y - first.y) * direction };
    for (const level of levels)
      addLevel(
        {
          from: { x: first.x + offset.x * level.value, y: first.y + offset.y * level.value },
          to: { x: second.x + offset.x * level.value, y: second.y + offset.y * level.value },
        },
        level,
        { left: false, right: false },
      );
  } else {
    // Inside uses C−mid(A,B) for its direction, but starts its median at mid(B,C).
    // The outer rails originate at B/C in every variation (confirmed against native drawings).
    const style =
      drawing.pitchforkStyle ??
      (drawing.kind === "pitchfork" ? "original" : drawing.kind.replace("-pitchfork", ""));
    const center = midpoint(second, third!);
    const adjusted =
      style === "original"
        ? first
        : style === "schiff"
          ? { x: first.x, y: (first.y + second.y) / 2 }
          : midpoint(first, second);
    const origin = style === "inside" ? center : adjusted;
    const target = style === "inside" ? third! : center;
    const direction = { x: target.x - adjusted.x, y: target.y - adjusted.y };
    if (!direction.x && !direction.y) return result;
    const defaults = { left: direction.x < 0, right: direction.x >= 0 };
    const ray = (point: DrawingPoint, level: DrawingLevel, fillOrigin = point) =>
      addLevel(
        { from: point, to: { x: point.x + direction.x, y: point.y + direction.y } },
        level,
        defaults,
        undefined,
        { from: fillOrigin, to: { x: fillOrigin.x + direction.x, y: fillOrigin.y + direction.y } },
      );
    // Shading begins on B–C, even when the median starts farther back at A.
    ray(origin, { value: 0, visible: true, color: drawing.color }, center);
    for (const level of levels) {
      if (!level.visible) continue;
      for (const sign of [-1, 1]) {
        const ratio = Math.abs(level.value) * sign;
        ray(
          {
            x: center.x + ((third!.x - second.x) / 2) * ratio,
            y: center.y + ((third!.y - second.y) / 2) * ratio,
          },
          { ...level, value: ratio },
        );
      }
    }
    result.lines.push(
      { from: first, to: second, color: drawing.color },
      { from: second, to: third!, color: drawing.color },
    );
  }
  if (drawing.background) {
    boundaries.sort((a, b) => a.value - b.value);
    for (let index = 1; index < boundaries.length; index++) {
      const a = boundaries[index - 1]!,
        b = boundaries[index]!;
      (result.polygons ??= []).push({
        points: [a.line.from, a.line.to, b.line.to, b.line.from],
        color:
          isPitchforkDrawingTool(drawing.kind) && Math.abs(a.value) > Math.abs(b.value)
            ? a.color
            : b.color,
        opacity: drawing.backgroundOpacity ?? 0.12,
      });
    }
  }
  return result;
}

/** Clip an optionally extended line to the pane. Left/right refer to time direction, not anchor order. */
export function extendDrawingLine(
  source: DrawingLine,
  width: number,
  height: number,
  extendLeft: boolean,
  extendRight: boolean,
): DrawingLine | null {
  const dx = source.to.x - source.from.x,
    dy = source.to.y - source.from.y;
  if (!dx && !dy) return source;
  let minimum = (dx >= 0 ? extendLeft : extendRight) ? -Infinity : 0;
  let maximum = (dx >= 0 ? extendRight : extendLeft) ? Infinity : 1;
  for (const [origin, delta, limit] of [
    [source.from.x, dx, width],
    [source.from.y, dy, height],
  ]) {
    if (delta === 0) {
      if (origin! < 0 || origin! > limit!) return null;
      continue;
    }
    const a = -origin! / delta!,
      b = (limit! - origin!) / delta!;
    minimum = Math.max(minimum, Math.min(a, b));
    maximum = Math.min(maximum, Math.max(a, b));
  }
  if (minimum > maximum || !Number.isFinite(minimum) || !Number.isFinite(maximum)) return null;
  return {
    ...source,
    from: { x: source.from.x + dx * minimum, y: source.from.y + dy * minimum },
    to: { x: source.from.x + dx * maximum, y: source.from.y + dy * maximum },
  };
}

function buildFibTimeDrawingGeometry(
  drawing: ChartDrawing,
  project: (anchor: DrawingAnchor) => DrawingPoint | null,
  width: number,
  height: number,
): DrawingGeometry {
  const shape: DrawingGeometry = { lines: [], handles: [] };
  if (drawing.hidden) return shape;
  const settings = { ...defaultFibTimeDrawingSettings(drawing.kind), ...drawing };
  const points = drawing.anchors.map(project);
  if (points.some((point) => point === null)) return shape;
  shape.handles = points as DrawingPoint[];
  const [a, b, c] = shape.handles;
  if (!a || !b) return shape;
  const trend = settings.trendLine ?? { color: "#808080", width: 2, lineStyle: "dashed" as const };
  if (drawing.kind === "fib-time-zone" || settings.showTrendLine !== false) {
    shape.lines.push({ from: a, to: b, ...trend });
    if (c) shape.lines.push({ from: b, to: c, ...trend });
  }
  const origin = drawing.kind === "fib-time-zone" ? a : c;
  if (!origin || a.x === b.x) return shape;
  // Chart x is affine in logical bars, including market closures; never multiply elapsed timestamps.
  const boundaries = (settings.levels ?? defaultDrawingLevels(drawing.kind))
    .filter((level) => level.visible)
    .map((level) => ({ level, x: origin.x + (b.x - a.x) * level.value }))
    .filter(({ x }) => Number.isFinite(x));
  if (settings.background) {
    const ordered = boundaries.toSorted((first, second) => first.x - second.x);
    shape.polygons = [];
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1]!,
        current = ordered[index]!;
      const left = Math.max(0, previous.x),
        right = Math.min(width, current.x);
      if (right <= left) continue;
      shape.polygons.push({
        points: [
          { x: left, y: 0 },
          { x: right, y: 0 },
          { x: right, y: height },
          { x: left, y: height },
        ],
        color: current.level.color ?? drawing.color,
        opacity: settings.backgroundOpacity ?? 0.2,
      });
    }
  }
  for (const { level, x } of boundaries) {
    if (x < 0 || x > width) continue;
    const horizontal = settings.levelLabelPosition ?? "right",
      vertical = settings.levelLabelAlignment ?? "bottom";
    shape.lines.push({
      from: { x, y: 0 },
      to: { x, y: height },
      color: level.color ?? drawing.color,
      width: level.width ?? 2,
      lineStyle: level.lineStyle ?? "solid",
      ...(level.opacity === undefined ? {} : { opacity: level.opacity }),
      ...(settings.showLevels !== false
        ? {
            label: String(level.value),
            labelPoint: {
              x: x + (horizontal === "left" ? -5 : horizontal === "right" ? 5 : 0),
              y: vertical === "top" ? 5 : vertical === "middle" ? height / 2 : height - 5,
            },
            labelAlign:
              horizontal === "left"
                ? ("right" as const)
                : horizontal === "right"
                  ? ("left" as const)
                  : ("center" as const),
            labelBaseline:
              vertical === "top"
                ? ("top" as const)
                : vertical === "middle"
                  ? ("middle" as const)
                  : ("bottom" as const),
          }
        : {}),
    });
  }
  return shape;
}

function buildRegressionDrawingGeometry(
  drawing: ChartDrawing,
  fit: DrawingRegressionFit | undefined,
  project: (anchor: DrawingAnchor) => DrawingPoint | null,
  width: number,
  height: number,
): DrawingGeometry {
  const shape: DrawingGeometry = { lines: [], handles: [], handleAnchorIndices: [], polygons: [] };
  if (!fit || drawing.hidden) return shape;
  const settings = { ...defaultRegressionDrawingSettings(), ...drawing };
  const anchorOrder =
    drawingTimeValue(drawing.anchors[0]!.time)! <= drawingTimeValue(drawing.anchors[1]!.time)!
      ? [0, 1]
      : [1, 0];
  const boundaries = [
    [fit.result.base, settings.regressionBaseLine],
    [fit.result.upper, settings.regressionUpperLine],
    [fit.result.lower, settings.regressionLowerLine],
  ] as const;
  const projected = boundaries.map(([values]) => ({
    from: project({ time: fit.start, price: values.start }),
    to: project({ time: fit.end, price: values.end }),
  }));
  if (projected.some(({ from, to }) => !from || !to)) return shape;
  const lines = projected.map(({ from, to }) => ({ from: from!, to: to! }));
  const extended = lines.map((line) =>
    settings.extendLines ? extendDrawingLine(line, width, height, false, true) : line,
  );
  boundaries.forEach(([, style], index) => {
    if (!style.visible) return;
    const line = extended[index];
    if (line)
      shape.lines.push({
        ...line,
        color: style.color,
        width: style.width,
        lineStyle: style.lineStyle,
      });
    shape.handles.push(lines[index]!.from, lines[index]!.to);
    shape.handleAnchorIndices!.push(...anchorOrder);
  });
  for (const index of [1, 2]) {
    const boundary = boundaries[index]![1];
    if (!boundary.visible || !settings.regressionBaseLine.visible) continue;
    const fillStyle = index === 1 ? settings.regressionUpperLine : settings.regressionBaseLine;
    const base = lines[0]!,
      band = lines[index]!;
    const right = settings.extendLines ? width : base.to.x;
    const at = (line: typeof base) => ({
      x: right,
      y:
        line.from.y +
        ((line.to.y - line.from.y) * (right - line.from.x)) / (line.to.x - line.from.x),
    });
    shape.polygons!.push({
      points: [base.from, at(base), at(band), band.from],
      opacity: fillStyle.opacity ?? 0.3,
      color: fillStyle.color,
    });
  }
  if (settings.regressionShowPearson) {
    const lower = lines[2]!.from;
    shape.text = {
      point: { x: lower.x, y: lower.y + 6 },
      value: String(fit.result.pearsonR),
      align: "center",
      baseline: "top",
      fontSize: 12,
    };
  }
  return shape;
}

export function buildDrawingGeometry(
  drawing: ChartDrawing,
  project: (anchor: DrawingAnchor) => DrawingPoint | null,
  priceY: (price: number) => number | null,
  width: number,
  height: number,
  formatPrice: (price: number) => string = (price) => String(Number(price.toFixed(6))),
  coordinatePrice?: (coordinate: number) => number | null,
  regressionFit?: DrawingRegressionFit,
  textMetrics?: DrawingTextMetrics,
  dataBars: readonly Candle[] = [],
): DrawingGeometry {
  drawing = { ...defaultVerticalLineSettings(drawing.kind), ...drawing };
  if (isFibTimeDrawing(drawing.kind))
    return buildFibTimeDrawingGeometry(drawing, project, width, height);
  if (drawing.kind === "regression-trend")
    return buildRegressionDrawingGeometry(drawing, regressionFit, project, width, height);
  if (isSpecialChannelDrawing(drawing.kind))
    drawing = { ...defaultChannelDrawingSettings(drawing.kind), ...drawing };
  const result =
    drawing.kind === "ghost-feed"
      ? ghostFeedGeometry(drawing, project)
      : drawing.kind === "bars-pattern"
        ? barPatternGeometry(drawing, project)
        : drawing.kind === "position-forecast"
          ? positionForecastGeometry(drawing, dataBars, project, drawingTimeValue, formatPrice)
          : drawing.kind === "anchored-vwap"
            ? anchoredVwapGeometry(drawing, dataBars, project, drawingTimeValue)
            : isPositionDrawing(drawing.kind) ||
                isRangeDrawing(drawing.kind) ||
                drawing.kind === "sector"
              ? projectionDrawingGeometry(drawing, project, formatPrice, drawingTimeValue)
              : supportsDrawingLevels(drawing.kind)
                ? buildLevelDrawingGeometry(
                    drawing,
                    project,
                    priceY,
                    width,
                    height,
                    formatPrice,
                    coordinatePrice,
                  )
                : buildBaseDrawingGeometry(drawing, project, priceY, width, height);
  if (drawing.hidden || !result.handles.length) return result;
  // Markers belong to the original body endpoints, not its viewport-clipped extensions.
  // Rays already extend in their base geometry, so retain their two real anchors here.
  const markerFirst =
    drawing.kind === "ray" && result.handles[1]
      ? { from: result.handles[0]!, to: result.handles[1] }
      : result.lines[0];
  const markerLast = drawing.kind === "ray" ? markerFirst : result.lines.at(-1);
  const markerBoundaries = isSpecialChannelDrawing(drawing.kind) ? result.lines.slice(0, 2) : [];
  if (
    supportsLineExtensions(drawing.kind) &&
    !supportsDrawingLevels(drawing.kind) &&
    (drawing.kind === "extended-line" ||
      drawing.extendLeft !== undefined ||
      drawing.extendRight !== undefined)
  ) {
    const first = result.handles[0],
      second = result.handles[1];
    if (first && second) {
      if (drawing.kind === "ray") result.lines = [{ from: first, to: second }];
      const extensions = drawingLineExtensions(drawing);
      result.lines = result.lines.flatMap((line) => {
        const extended = extendDrawingLine(line, width, height, extensions.left, extensions.right);
        return extended ? [extended] : [];
      });
    }
  }
  if (isSpecialChannelDrawing(drawing.kind) && drawing.showPriceLabel && coordinatePrice) {
    const left = Math.min(...result.handles.map((point) => point.x));
    result.priceLabels = result.handles.flatMap((point) => {
      const price = coordinatePrice(point.y);
      return price === null
        ? []
        : [
            {
              point: { x: point.x + (point.x === left ? -5 : 5), y: point.y },
              value: formatPrice(price),
              align: point.x === left ? ("right" as const) : ("left" as const),
            },
          ];
    });
  }
  const bodyFirst = result.lines[0],
    bodyLast = result.lines.at(-1);
  if (supportsLineMarkers(drawing.kind) && bodyFirst && bodyLast) {
    const markers = drawingLineMarkers(drawing);
    const arrowHead = (from: DrawingPoint, to: DrawingPoint) => {
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      if (!distance) return;
      const ux = (to.x - from.x) / distance,
        uy = (to.y - from.y) / distance;
      const depth = 5 * drawing.width;
      const halfWidth = depth;
      const points = [
        to,
        { x: to.x - ux * depth - uy * halfWidth, y: to.y - uy * depth + ux * halfWidth },
        { x: to.x - ux * depth + uy * halfWidth, y: to.y - uy * depth - ux * halfWidth },
      ];
      result.lines.push({ from: points[1]!, to }, { from: to, to: points[2]! });
    };
    if (isSpecialChannelDrawing(drawing.kind)) {
      for (const boundary of markerBoundaries) {
        if (markers.start === "arrow") arrowHead(boundary.to, boundary.from);
        if (markers.end === "arrow") arrowHead(boundary.from, boundary.to);
      }
    }
    if (!isSpecialChannelDrawing(drawing.kind) && markers.start === "arrow" && markerFirst)
      arrowHead(markerFirst.to, markerFirst.from);
    if (!isSpecialChannelDrawing(drawing.kind) && markers.end === "arrow" && markerLast)
      arrowHead(markerLast.from, markerLast.to);
  }
  if (drawing.text !== undefined && drawing.text.length && drawing.kind !== "text") {
    const first =
      drawing.kind === "horizontal" ||
      drawing.kind === "horizontal-ray" ||
      drawing.kind === "vertical"
        ? bodyFirst?.from
        : result.handles[0];
    const last =
      drawing.kind === "horizontal" ||
      drawing.kind === "horizontal-ray" ||
      drawing.kind === "vertical"
        ? bodyLast?.to
        : isSpecialChannelDrawing(drawing.kind)
          ? result.handles[1]
          : result.handles.at(-1);
    if (first && last) {
      const left = first.x <= last.x ? first : last,
        right = first.x <= last.x ? last : first;
      const alignment = drawing.textAlignment ?? "center";
      const ratio = alignment === "left" ? 0 : alignment === "right" ? 1 : 0.5;
      const position = drawing.textPosition ?? "above";
      result.text = {
        point: {
          x: left.x + (right.x - left.x) * ratio,
          y:
            left.y +
            (right.y - left.y) * ratio +
            (position === "above" ? -6 : position === "below" ? 6 : 0),
        },
        value: drawing.text,
        align: alignment,
        baseline: position === "above" ? "bottom" : position === "below" ? "top" : "middle",
        fontSize: drawing.textFontSize ?? 14,
      };
    }
  } else if (result.text) {
    result.text.fontSize = drawing.textFontSize ?? 14;
    result.text.align = drawing.textAlignment ?? "left";
    result.text.baseline =
      drawing.textPosition === "center"
        ? "middle"
        : drawing.textPosition === "below"
          ? "top"
          : "bottom";
  }
  if (result.text && drawing.kind === "vertical") {
    const vertical = drawing.textOrientation !== "horizontal";
    const position = drawing.textPosition ?? "center";
    const alignment = drawing.textAlignment ?? "center";
    const sideGap = vertical ? 6 : 10;
    const x =
      result.handles[0]!.x +
      (alignment === "left" ? -sideGap : alignment === "right" ? sideGap : 0);
    const y = position === "above" ? 6 : position === "below" ? height - 6 : height / 2;
    result.text = {
      ...result.text,
      point: { x, y },
      angle: vertical ? -Math.PI / 2 : 0,
      align: vertical
        ? position === "above"
          ? "right"
          : position === "below"
            ? "left"
            : "center"
        : alignment === "left"
          ? "right"
          : alignment === "right"
            ? "left"
            : "center",
      baseline: vertical
        ? alignment === "left"
          ? "bottom"
          : alignment === "right"
            ? "top"
            : "middle"
        : position === "above"
          ? "top"
          : position === "below"
            ? "bottom"
            : "middle",
    };
  }
  if (
    result.text &&
    [
      "trend",
      "info-line",
      "extended-line",
      "trend-angle",
      "ray",
      "arrow",
      "flat-channel",
      "disjoint-channel",
    ].includes(drawing.kind)
  ) {
    const [a, b] = result.handles;
    if (a && b) {
      const first = a.x <= b.x ? a : b,
        last = a.x <= b.x ? b : a;
      const angle = Math.atan2(last.y - first.y, last.x - first.x);
      const offset =
        drawing.textPosition === "below" ? 6 : drawing.textPosition === "center" ? 0 : -6;
      result.text.point = {
        x: result.text.point.x - Math.sin(angle) * offset,
        y: result.text.point.y - offset + Math.cos(angle) * offset,
      };
      result.text.angle = angle;
    }
  }
  if (drawing.kind === "trend-angle") {
    // Trend Angle owns its numeric label; it has no independent text annotation.
    delete result.text;
    const [first, second] = result.handles;
    if (first && second) {
      const dx = second.x - first.x,
        dy = second.y - first.y;
      const length = Math.hypot(dx, dy);
      if (length > 0) {
        // The angle reflects the current chart projection, including zoom and price-scale changes.
        const radians = Math.atan2(dy, dx);
        const radius = Math.min(50, length);
        result.lines.push({
          from: first,
          to: { x: first.x + radius, y: first.y },
          width: 1,
          lineStyle: "dotted",
          label: `${Number(((-radians * 180) / Math.PI).toFixed(2))}°`,
          labelPoint: { x: first.x + radius + 10, y: first.y },
          labelBaseline: "middle",
        });
        const samples = Math.max(1, Math.ceil(Math.abs(radians) * 12));
        let previous = { x: first.x + radius, y: first.y };
        for (let index = 1; index <= samples; index++) {
          const angle = (radians * index) / samples;
          const next = {
            x: first.x + Math.cos(angle) * radius,
            y: first.y + Math.sin(angle) * radius,
          };
          result.lines.push({
            from: previous,
            to: next,
            width: 1,
            lineStyle: "dotted",
          });
          previous = next;
        }
      }
    }
  }
  if (drawing.kind === "text" && result.text) {
    const text = result.text;
    text.layout = measureDrawingText(
      drawing,
      text,
      textMetrics?.fontFamily ?? "sans-serif",
      textMetrics?.measure ?? ((value) => Array.from(value).length * (text.fontSize ?? 14) * 0.65),
    );
    text.opacity = drawing.textOpacity ?? 1;
    if (drawing.background === true)
      text.background = {
        color: drawing.backgroundColor ?? DEFAULT_DRAWING_TEXT_BACKGROUND_COLOR,
        opacity: drawing.backgroundOpacity ?? DEFAULT_DRAWING_TEXT_BACKGROUND_OPACITY,
      };
    if (drawing.textBorder === true)
      text.border = {
        color: drawing.textBorderColor ?? DEFAULT_DRAWING_TEXT_BORDER_COLOR,
        opacity: drawing.textBorderOpacity ?? DEFAULT_DRAWING_TEXT_BORDER_OPACITY,
      };
    if (drawing.textWrap === true && !drawing.locked) {
      const layout = text.layout;
      result.handles.push({
        x: text.point.x + layout.left + layout.width,
        y: text.point.y + layout.top + layout.height / 2,
      });
    }
  }

  return result;
}

function distance(point: DrawingPoint, line: DrawingLine) {
  const dx = line.to.x - line.from.x,
    dy = line.to.y - line.from.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - line.from.x) * dx + (point.y - line.from.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(point.x - line.from.x - dx * t, point.y - line.from.y - dy * t);
}
export function hitDrawingGeometry(
  geometry: DrawingGeometry,
  point: DrawingPoint,
  tolerance = 7,
): boolean {
  const strokeTolerance = Math.max(tolerance, (geometry.strokeWidth ?? 0) / 2 + 3);
  if (geometry.lines.some((line) => distance(point, line) <= strokeTolerance)) return true;
  if (
    geometry.polygons?.some(({ points }) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i]!,
          b = points[j]!;
        if (
          a.y > point.y !== b.y > point.y &&
          point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
        )
          inside = !inside;
      }
      return inside;
    })
  )
    return true;
  if (geometry.text) {
    const {
      point: anchor,
      value,
      fontSize = 14,
      align = "left",
      baseline = "bottom",
    } = geometry.text;
    const angle = geometry.text.angle ?? 0;
    const relative = { x: point.x - anchor.x, y: point.y - anchor.y };
    const local = {
      x: anchor.x + relative.x * Math.cos(angle) + relative.y * Math.sin(angle),
      y: anchor.y - relative.x * Math.sin(angle) + relative.y * Math.cos(angle),
    };
    const layout = geometry.text.layout;
    if (layout) {
      const x = local.x - anchor.x,
        y = local.y - anchor.y;
      const inBox =
        x >= layout.left - tolerance &&
        x <= layout.left + layout.width + tolerance &&
        y >= layout.top - tolerance &&
        y <= layout.top + layout.height + tolerance;
      if (
        inBox &&
        ((geometry.text.background?.opacity ?? 0) > 0 || (geometry.text.border?.opacity ?? 0) > 0)
      )
        return true;
      if (
        (geometry.text.opacity ?? 1) > 0 &&
        layout.rows.some((row, index) => {
          if (!row.trim()) return false;
          const rowWidth = layout.rowWidths[index]!;
          const rowLeft =
            align === "right"
              ? layout.left + layout.width - layout.padding - rowWidth
              : align === "center"
                ? layout.left + layout.width / 2 - rowWidth / 2
                : layout.left + layout.padding;
          const rowTop = layout.top + layout.padding + index * layout.rowHeight;
          return (
            x >= rowLeft - tolerance &&
            x <= rowLeft + rowWidth + tolerance &&
            y >= rowTop - tolerance &&
            y <= rowTop + layout.rowHeight + tolerance
          );
        })
      )
        return true;
      return hitDrawingHandle(geometry, point, tolerance) >= 0;
    }
    const lines = value.split(/\r?\n/);
    const width = Math.max(...lines.map((line) => line.length)) * fontSize * 0.65;
    const height = lines.length * fontSize * 1.2;
    const x = anchor.x - (align === "center" ? width / 2 : align === "right" ? width : 0);
    const y = anchor.y - (baseline === "middle" ? height / 2 : baseline === "bottom" ? height : 0);
    if (
      local.x >= x - 5 &&
      local.x <= x + width + 5 &&
      local.y >= y - 5 &&
      local.y <= y + height + 5
    )
      return true;
  }
  return hitDrawingHandle(geometry, point, tolerance) >= 0;
}

/** Handles take priority over the body so a selected endpoint can be resized precisely. */
export function hitDrawingHandle(geometry: DrawingGeometry, point: DrawingPoint, tolerance = 9) {
  return (
    (geometry.handleIndices ?? geometry.handles.map((_, index) => index)).find((index) => {
      const handle = geometry.handles[index];
      return handle && Math.hypot(handle.x - point.x, handle.y - point.y) <= tolerance;
    }) ?? -1
  );
}

export function validDrawingAnchors(kind: DrawingKind, anchors: DrawingAnchor[]) {
  if (
    anchors.length < minimumDrawingAnchors(kind) ||
    anchors.length > maximumDrawingAnchors(kind) ||
    !anchors.every(isAnchor)
  )
    return false;
  const [first, second, third] = anchors;
  if (!first || !second) return true;
  const same = (a: DrawingAnchor, b: DrawingAnchor) =>
    drawingTimeValue(a.time) === drawingTimeValue(b.time) && a.price === b.price;
  if (kind === "bars-pattern")
    return drawingTimeValue(first.time)! < drawingTimeValue(second.time)!;
  if (kind === "position-forecast")
    return (
      drawingTimeValue(first.time)! < drawingTimeValue(second.time)! && first.price !== second.price
    );
  if (kind === "sector") return !!third && !same(first, second) && !same(first, third);
  if (isPositionDrawing(kind)) {
    const direction = kind === "long-position" ? 1 : -1;
    return (
      !!third &&
      (second.price - first.price) * direction > 0 &&
      (first.price - third.price) * direction > 0 &&
      drawingTimeValue(first.time) !== drawingTimeValue(second.time) &&
      drawingTimeValue(first.time) !== drawingTimeValue(third.time)
    );
  }
  if (kind === "price-range") return first.price !== second.price;
  if (kind === "date-range" || kind === "date-price-range")
    return drawingTimeValue(first.time) !== drawingTimeValue(second.time);
  if (isFibTimeDrawing(kind)) return drawingTimeValue(first.time) !== drawingTimeValue(second.time);
  if (kind === "fib-extension")
    return !!third && first.price !== second.price && !same(second, third);
  if (kind === "fib-channel" || isPitchforkDrawingTool(kind)) {
    if (!third || same(first, second)) return false;
    const ax = drawingTimeValue(second.time)! - drawingTimeValue(first.time)!;
    const bx = drawingTimeValue(third.time)! - drawingTimeValue(first.time)!;
    return (
      (kind !== "fib-channel" || ax !== 0) &&
      ax * (third.price - first.price) - bx * (second.price - first.price) !== 0
    );
  }
  if (isSpecialChannelDrawing(kind))
    return (
      !!third &&
      drawingTimeValue(first.time) !== drawingTimeValue(second.time) &&
      (first.price !== second.price || third.price !== first.price)
    );
  if (["rectangle", "fib", "channel", "regression-trend"].includes(kind))
    return drawingTimeValue(first.time) !== drawingTimeValue(second.time);
  if (kind === "ellipse")
    return (
      drawingTimeValue(first.time) !== drawingTimeValue(second.time) && first.price !== second.price
    );
  if (kind === "rotated-rectangle" || kind === "triangle") {
    if (!third || same(first, second)) return false;
    const ax = drawingTimeValue(second.time)! - drawingTimeValue(first.time)!;
    const bx = drawingTimeValue(third.time)! - drawingTimeValue(first.time)!;
    return ax * (third.price - first.price) - bx * (second.price - first.price) !== 0;
  }
  return anchors.some((anchor) => !same(first, anchor));
}
