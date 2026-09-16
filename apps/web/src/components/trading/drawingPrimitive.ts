import { measureDrawingText } from "./drawingTextLayout";
import { drawingIntersectsRect } from "./drawingSelectionGeometry";
import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  ISeriesPrimitiveAxisView,
  SeriesType,
  Time,
} from "lightweight-charts";
import {
  buildDrawingGeometry,
  drawingTimeValue,
  hitDrawingGeometry,
  hitDrawingHandle,
  defaultDrawingStats,
  supportsLineStatistics,
  drawingPriceLabelVisible,
  drawingTimeLabelVisible,
  isSpecialChannelDrawing,
  isFibTimeDrawing,
  isPitchforkDrawingTool,
  type ChartDrawing,
  type DrawingAnchor,
  type DrawingKind,
  type DrawingPoint,
  type DrawingRegressionFit,
  defaultRegressionDrawingSettings,
} from "./drawingGeometry";
import { calculateDrawingStats, formatInfoLineStats } from "./drawingStats";

import { calculateChartRegression } from "./chartRegression";

const SELECTION_COLOR = "#2962ff";

const supportsLineTextGap = (kind: DrawingKind) =>
  [
    "trend",
    "info-line",
    "extended-line",
    "ray",
    "arrow",
    "horizontal",
    "horizontal-ray",
    "vertical",
  ].includes(kind);

export function drawingTimeCoordinate(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  time: Time,
  suppliedData?: ReturnType<typeof series.data>,
): number | null {
  const scale = chart.timeScale();
  let x: number | null = scale.timeToCoordinate(time);
  if (x === null) {
    // Keep absolute timestamps when changing intervals; interpolate between the new candle anchors.
    const target = drawingTimeValue(time);
    const data = suppliedData ?? series.data();
    if (target !== null && data.length) {
      let left = 0,
        right = data.length - 1;
      while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (drawingTimeValue(data[mid]!.time)! < target) left = mid + 1;
        else right = mid;
      }
      const upper = data[Math.min(data.length - 1, Math.max(1, left))]!,
        lower = data[Math.max(0, left - 1)]!;
      const ux = scale.timeToCoordinate(upper.time),
        lx = scale.timeToCoordinate(lower.time);
      const ut = drawingTimeValue(upper.time)!,
        lt = drawingTimeValue(lower.time)!;
      if (ux !== null && lx !== null)
        x = ut === lt ? ux : lx + ((ux - lx) * (target - lt)) / (ut - lt);
    }
  }
  return x;
}

export function drawingProjection(chart: IChartApi, series: ISeriesApi<SeriesType>) {
  const scale = chart.timeScale();
  const width = chart.paneSize().width;
  const height = series.getPane().getHeight();
  const priceY = (price: number) => series.priceToCoordinate(price);
  const project = (anchor: DrawingAnchor) => {
    const y = priceY(anchor.price);
    const x = drawingTimeCoordinate(chart, series, anchor.time);
    return x === null || y === null ? null : { x, y };
  };
  const unproject = (point: DrawingPoint): DrawingAnchor | null => {
    const price = series.coordinateToPrice(point.y);
    if (price === null || !Number.isFinite(price)) return null;
    const time = scale.coordinateToTime(point.x);
    if (time !== null) return { time, price };
    // The chart returns null in empty future space; extend the nearest candle interval.
    const data = series.data();
    if (data.length < 2) return null;
    const firstX = scale.timeToCoordinate(data[0]!.time);
    const start = firstX !== null && point.x < firstX ? 0 : data.length - 2;
    const a = data[start]!,
      b = data[start + 1]!;
    const ax = scale.timeToCoordinate(a.time),
      bx = scale.timeToCoordinate(b.time);
    const at = drawingTimeValue(a.time),
      bt = drawingTimeValue(b.time);
    if (ax === null || bx === null || ax === bx || at === null || bt === null) return null;
    const value = at + ((point.x - ax) / (bx - ax)) * (bt - at);
    return { time: value as Time, price };
  };
  return { width, height, priceY, project, unproject };
}

export const supportsInlineDrawingText = (kind: DrawingKind) =>
  [
    "text",
    "trend",
    "info-line",
    "extended-line",
    "ray",
    "arrow",
    "horizontal",
    "horizontal-ray",
    "vertical",
  ].includes(kind);

/** The same placement used by canvas text, suitable for positioning an inline text editor. */
export function drawingTextPlacement(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  drawing: ChartDrawing,
) {
  const projection = drawingProjection(chart, series);
  return (
    buildDrawingGeometry(
      { ...drawing, text: drawing.text || " " },
      projection.project,
      projection.priceY,
      projection.width,
      projection.height,
    ).text ?? null
  );
}

export type DrawingPrimitiveHit = {
  drawing: ChartDrawing;
  handle: number;
  handlePoint?: DrawingPoint;
  textBoxWidth?: number;
  distance: number;
  hitTestPriority: 0 | 1 | 2;
  cursorStyle: "default" | "pointer" | "ew-resize";
};

export function createDrawingPrimitive(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  read: () => {
    drawings: ChartDrawing[];
    selected: string | null;
    selectedIds?: readonly string[];
    selectionRect?: { x: number; y: number; width: number; height: number } | null;
    preview?: ChartDrawing | null;
    hidden?: boolean;
    hovered?: string | null;
    interactive?: boolean;
  },
  regressionSeries: ISeriesApi<SeriesType> = series,
) {
  let requestUpdate = () => {};
  let textMeasureContext: CanvasRenderingContext2D | null | undefined;
  const textMetrics = () => ({
    fontFamily: chart.options().layout.fontFamily,
    measure: (text: string, font: string) => {
      if (textMeasureContext === undefined)
        textMeasureContext =
          typeof document === "undefined"
            ? null
            : document.createElement("canvas").getContext("2d");
      if (!textMeasureContext) return NaN;
      textMeasureContext.font = font;
      return textMeasureContext.measureText(text).width;
    },
  });
  let regressionData: ReturnType<typeof regressionSeries.data> | undefined;
  const regressionCache = new Map<string, { key: string; fit: DrawingRegressionFit | undefined }>();
  const invalidateRegression = () => {
    regressionData = undefined;
    regressionCache.clear();
    requestUpdate();
  };
  const regressionFit = (drawing: ChartDrawing): DrawingRegressionFit | undefined => {
    if (drawing.kind !== "regression-trend" || drawing.anchors.length !== 2) return undefined;
    const defaults = defaultRegressionDrawingSettings();
    const options = {
      source: drawing.regressionSource ?? defaults.regressionSource,
      upperDeviation: drawing.regressionUpperDeviation ?? defaults.regressionUpperDeviation,
      lowerDeviation: drawing.regressionLowerDeviation ?? defaults.regressionLowerDeviation,
      useUpperDeviation:
        drawing.regressionUseUpperDeviation ?? defaults.regressionUseUpperDeviation,
      useLowerDeviation:
        drawing.regressionUseLowerDeviation ?? defaults.regressionUseLowerDeviation,
    };
    const times = drawing.anchors.map((anchor) => drawingTimeValue(anchor.time)!);
    const start = Math.min(...times),
      end = Math.max(...times);
    const key = JSON.stringify([start, end, options]);
    const cached = regressionCache.get(drawing.id);
    if (cached?.key === key) return cached.fit;
    regressionData ??= regressionSeries.data();
    if (
      !regressionData.length ||
      start < drawingTimeValue(regressionData[0]!.time)! ||
      end > drawingTimeValue(regressionData.at(-1)!.time)!
    ) {
      regressionCache.set(drawing.id, { key, fit: undefined });
      return undefined;
    }
    const bound = (time: number, inclusive: boolean) => {
      let lo = 0,
        hi = regressionData!.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1,
          value = drawingTimeValue(regressionData![mid]!.time)!;
        if (value < time || (inclusive && value === time)) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    const bars = regressionData.slice(bound(start, false), bound(end, true));
    const result = calculateChartRegression(
      bars.map((bar) => ("open" in bar ? bar : undefined)),
      options,
    );
    const fit = result ? { result, start: bars[0]!.time, end: bars.at(-1)!.time } : undefined;
    regressionCache.set(drawing.id, { key, fit });
    return fit;
  };
  const hitTest = (point: DrawingPoint): DrawingPrimitiveHit | null => {
    const state = read();
    if (state.hidden || state.interactive === false) return null;
    const projection = drawingProjection(chart, series);
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x > projection.width ||
      point.y > projection.height
    )
      return null;
    let best: DrawingPrimitiveHit | null = null;
    for (const drawing of state.drawings.toReversed()) {
      if (drawing.hidden) continue;
      const geometry = buildDrawingGeometry(
        drawing,
        projection.project,
        projection.priceY,
        projection.width,
        projection.height,
        undefined,
        undefined,
        regressionFit(drawing),
        textMetrics(),
      );
      if (
        drawing.kind === "text" &&
        ((state.selectedIds?.length ?? 0) > 1 ||
          !(drawing.id === state.selected || state.selectedIds?.includes(drawing.id)))
      )
        geometry.handleIndices = [0];
      const handle = hitDrawingHandle(geometry, point);
      let candidate: DrawingPrimitiveHit;
      if (handle >= 0) {
        const anchor = geometry.handles[handle]!;
        candidate = {
          drawing,
          handle:
            drawing.locked ||
            ((state.selectedIds?.length ?? 0) > 1 && state.selectedIds?.includes(drawing.id))
              ? -1
              : (geometry.handleAnchorIndices?.[handle] ?? handle),
          handlePoint: anchor,
          ...(drawing.kind === "text" && handle === 1 && geometry.text?.layout
            ? { textBoxWidth: geometry.text.layout.width }
            : {}),
          cursorStyle: drawing.kind === "text" && handle === 1 ? "ew-resize" : "default",
          distance: Math.hypot(point.x - anchor.x, point.y - anchor.y),
          hitTestPriority: 2,
        };
      } else {
        if (!hitDrawingGeometry(geometry, point)) continue;
        let distance = Infinity;
        for (const line of geometry.lines) {
          const dx = line.to.x - line.from.x,
            dy = line.to.y - line.from.y;
          const ratio = Math.max(
            0,
            Math.min(
              1,
              ((point.x - line.from.x) * dx + (point.y - line.from.y) * dy) /
                (dx * dx + dy * dy || 1),
            ),
          );
          distance = Math.min(
            distance,
            Math.hypot(point.x - line.from.x - ratio * dx, point.y - line.from.y - ratio * dy),
          );
        }
        const stroke = distance <= Math.max(7, (geometry.strokeWidth ?? drawing.width) / 2 + 3);
        candidate = {
          drawing,
          handle: -1,
          cursorStyle: "pointer",
          distance: stroke ? distance : 0,
          hitTestPriority: stroke ? 1 : 0,
        };
      }
      if (
        !best ||
        (candidate.hitTestPriority === 2 && best.hitTestPriority !== 2) ||
        ((candidate.hitTestPriority === 2) === (best.hitTestPriority === 2) &&
          candidate.distance < best.distance)
      )
        best = candidate;
    }
    return best;
  };
  const drawingsInRect = (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): string[] => {
    const state = read();
    if (state.hidden || state.interactive === false) return [];
    const projection = drawingProjection(chart, series);
    return state.drawings.flatMap((drawing) => {
      if (drawing.hidden) return [];
      const geometry = buildDrawingGeometry(
        drawing,
        projection.project,
        projection.priceY,
        projection.width,
        projection.height,
        (price) => series.priceFormatter().format(price),
        (coordinate) => series.coordinateToPrice(coordinate),
        regressionFit(drawing),
        textMetrics(),
      );
      const lineOpacity =
        drawing.kind === "regression-trend" || isFibTimeDrawing(drawing.kind)
          ? 1
          : (drawing.lineOpacity ?? 1);
      const visibleGeometry = {
        ...geometry,
        strokeWidth: geometry.strokeWidth ?? drawing.width,
        opacity: (geometry.opacity ?? 1) * lineOpacity,
        ...(geometry.polygons
          ? {
              polygons: geometry.polygons.map((polygon) => ({
                ...polygon,
                opacity: polygon.opacity * (polygon.lineFill ? lineOpacity : 1),
              })),
            }
          : {}),
      };
      if (drawing.kind !== "text" && (drawing.textOpacity ?? 1) <= 0) delete visibleGeometry.text;
      return drawingIntersectsRect(visibleGeometry, rect) ? [drawing.id] : [];
    });
  };
  const renderer: IPrimitivePaneRenderer = {
    draw(target) {
      const { width, height, priceY, project } = drawingProjection(chart, series);
      const state = read();
      if (state.hidden) return;
      target.useMediaCoordinateSpace(({ context: ctx }) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.clip();
        for (const drawing of [...state.drawings, ...(state.preview ? [state.preview] : [])]) {
          if (drawing.hidden) continue;
          const geometry = buildDrawingGeometry(
            drawing,
            project,
            priceY,
            width,
            height,
            (price) => series.priceFormatter().format(price),
            (coordinate) => series.coordinateToPrice(coordinate),
            regressionFit(drawing),
            {
              fontFamily: chart.options().layout.fontFamily,
              measure: (text, font) => {
                ctx.font = font;
                return ctx.measureText?.(text).width ?? NaN;
              },
            },
          );
          const textLayout = geometry.text
            ? (geometry.text.layout ??
              measureDrawingText(
                drawing,
                geometry.text,
                chart.options().layout.fontFamily,
                (text, font) => {
                  ctx.font = font;
                  return ctx.measureText?.(text).width ?? NaN;
                },
              ))
            : undefined;
          const genericLineOpacity =
            drawing.kind === "regression-trend" || isFibTimeDrawing(drawing.kind)
              ? 1
              : (drawing.lineOpacity ?? 1);
          const lineAlpha = genericLineOpacity * (geometry.opacity ?? 1);
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          ctx.strokeStyle = drawing.color;
          ctx.fillStyle = drawing.color;
          ctx.lineWidth = geometry.strokeWidth ?? drawing.width;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.globalAlpha = lineAlpha;
          ctx.setLineDash(
            drawing.lineStyle === "dashed" ? [8, 5] : drawing.lineStyle === "dotted" ? [2, 4] : [],
          );
          if (geometry.rectangle && geometry.rectangleFill) {
            const rect = geometry.rectangle;
            ctx.globalAlpha = geometry.rectangleFill.opacity;
            ctx.fillStyle = geometry.rectangleFill.color;
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          }
          for (const polygon of geometry.polygons ?? []) {
            if (!polygon.points.length) continue;
            ctx.globalAlpha = polygon.opacity * (polygon.lineFill ? genericLineOpacity : 1);
            ctx.fillStyle = polygon.color ?? drawing.color;
            ctx.beginPath();
            ctx.moveTo(polygon.points[0]!.x, polygon.points[0]!.y);
            for (const point of polygon.points.slice(1)) ctx.lineTo(point.x, point.y);
            ctx.closePath();
            ctx.fill();
          }
          ctx.globalAlpha = lineAlpha;
          ctx.fillStyle = drawing.color;
          ctx.font = `${drawing.textFontSize ?? 12}px ${chart.options().layout.fontFamily}`;
          const gapText = geometry.text;
          const clipTextGap = Boolean(
            gapText &&
            textLayout &&
            gapText.value.length > 0 &&
            supportsLineTextGap(drawing.kind) &&
            (drawing.kind === "vertical" || drawing.textPosition === "center"),
          );
          if (clipTextGap && gapText && textLayout) {
            ctx.save();
            const strokeFont = ctx.font;
            ctx.font = textLayout.font;
            const textWidth = textLayout.width;
            ctx.font = strokeFont;
            const left =
              (gapText.align === "right"
                ? -textWidth
                : gapText.align === "center"
                  ? -textWidth / 2
                  : 0) - 4;
            const top = textLayout.top - 4;
            const right = left + textWidth + 8;
            const bottom = top + textLayout.height + 8;
            const angle = gapText.angle ?? 0;
            const cos = Math.cos(angle),
              sin = Math.sin(angle);
            const corners = [
              [left, top],
              [right, top],
              [right, bottom],
              [left, bottom],
            ].map(([x, y]) => ({
              x: gapText.point.x + x! * cos - y! * sin,
              y: gapText.point.y + x! * sin + y! * cos,
            }));
            // Cut only this drawing's stroke out of the text bounds. Earlier chart pixels and fills remain intact.
            ctx.beginPath();
            ctx.rect(0, 0, width, height);
            ctx.moveTo(corners[0]!.x, corners[0]!.y);
            for (const point of corners.slice(1)) ctx.lineTo(point.x, point.y);
            ctx.closePath();
            ctx.clip("evenodd");
          }
          ctx.beginPath();
          let previous: DrawingPoint | undefined;
          let activeColor = drawing.color;
          let activeStyle = drawing.lineStyle ?? "solid";
          let activeWidth = geometry.strokeWidth ?? drawing.width;
          let activeOpacity = lineAlpha;
          const visibleLines = geometry.lines;
          const fork = isPitchforkDrawingTool(drawing.kind);
          for (const line of visibleLines) {
            const color = line.color ?? drawing.color;
            const style = line.lineStyle ?? drawing.lineStyle ?? "solid";
            const lineWidth = line.width ?? geometry.strokeWidth ?? drawing.width;
            const opacity =
              (drawing.kind === "channel" || fork) && line.opacity !== undefined
                ? line.opacity * (geometry.opacity ?? 1)
                : (line.opacity ?? 1) * lineAlpha;
            if (
              color !== activeColor ||
              style !== activeStyle ||
              lineWidth !== activeWidth ||
              opacity !== activeOpacity ||
              // Coincident pitchfork rails (including zero levels) each retain
              // their own opacity instead of becoming one unioned canvas path.
              (fork && previous !== undefined)
            ) {
              if (previous) ctx.stroke();
              ctx.beginPath();
              ctx.strokeStyle = color;
              activeColor = color;
              activeStyle = style;
              activeWidth = lineWidth;
              activeOpacity = opacity;
              ctx.globalAlpha = opacity;
              ctx.lineWidth = lineWidth;
              ctx.setLineDash(style === "dashed" ? [8, 5] : style === "dotted" ? [2, 4] : []);
              previous = undefined;
            }
            if (!previous || previous.x !== line.from.x || previous.y !== line.from.y)
              ctx.moveTo(line.from.x, line.from.y);
            ctx.lineTo(line.to.x, line.to.y);
            previous = line.to;
          }
          if (visibleLines.length) ctx.stroke();
          if (clipTextGap) ctx.restore();
          for (const line of visibleLines) {
            if (!line.label) continue;
            ctx.globalAlpha = (line.opacity ?? 1) * lineAlpha;
            ctx.fillStyle = line.color ?? drawing.color;
            ctx.textAlign = line.labelAlign ?? "left";
            ctx.textBaseline = line.labelBaseline ?? "alphabetic";
            const point = line.labelPoint ?? { x: line.to.x + 4, y: line.to.y - 3 };
            ctx.fillText(line.label, point.x, point.y);
          }
          ctx.globalAlpha = geometry.opacity ?? 1;
          if (geometry.priceLabels?.length) {
            ctx.font = `${drawing.priceLabelItalic ? "italic " : ""}${drawing.priceLabelBold ? "bold " : ""}${drawing.priceLabelFontSize ?? 12}px ${chart.options().layout.fontFamily}`;
            ctx.fillStyle = drawing.priceLabelColor ?? drawing.color;
            ctx.textBaseline = "middle";
            for (const label of geometry.priceLabels) {
              ctx.textAlign = label.align;
              ctx.fillText(label.value, label.point.x, label.point.y);
            }
          }
          if (geometry.text && textLayout) {
            const text = geometry.text;
            const { rows, rowHeight } = textLayout;
            ctx.font = textLayout.font;
            ctx.textAlign = text.align ?? "left";
            ctx.textBaseline = "top";
            const rotated = text.angle !== undefined && text.angle !== 0;
            ctx.save();
            if (rotated) {
              ctx.translate(text.point.x, text.point.y);
              ctx.rotate(text.angle!);
            }
            const originX = rotated ? 0 : text.point.x;
            const originY = rotated ? 0 : text.point.y;
            if (text.background) {
              ctx.globalAlpha = text.background.opacity;
              ctx.fillStyle = text.background.color;
              ctx.fillRect(
                originX + textLayout.left,
                originY + textLayout.top,
                textLayout.width,
                textLayout.height,
              );
            }
            if (text.border) {
              ctx.globalAlpha = text.border.opacity;
              ctx.strokeStyle = text.border.color;
              ctx.lineWidth = 1;
              ctx.setLineDash([]);
              ctx.strokeRect(
                originX + textLayout.left,
                originY + textLayout.top,
                textLayout.width,
                textLayout.height,
              );
            }
            ctx.globalAlpha = drawing.kind === "regression-trend" ? 1 : (drawing.textOpacity ?? 1);
            ctx.fillStyle =
              drawing.kind === "regression-trend"
                ? (
                    drawing.regressionLowerLine ??
                    defaultRegressionDrawingSettings().regressionLowerLine
                  ).color
                : (drawing.textColor ?? drawing.color);
            const x =
              drawing.kind !== "text"
                ? originX
                : originX +
                  (text.align === "right"
                    ? textLayout.left + textLayout.width - textLayout.padding
                    : text.align === "center"
                      ? textLayout.left + textLayout.width / 2
                      : textLayout.left + textLayout.padding);
            const top = originY + textLayout.top + textLayout.padding;
            rows.forEach((row, index) => ctx.fillText(row, x, top + index * rowHeight));
            ctx.restore();
          }

          if (supportsLineStatistics(drawing.kind) && drawing.anchors.length >= 2) {
            const a = project(drawing.anchors[0]!);
            const b = project(drawing.anchors[1]!);
            if (a && b) {
              ctx.setLineDash([]);
              ctx.globalAlpha = lineAlpha;
              ctx.strokeStyle = drawing.color;
              ctx.fillStyle = drawing.color;
              if (drawing.showMiddlePoint) {
                ctx.beginPath();
                ctx.arc((a.x + b.x) / 2, (a.y + b.y) / 2, 3, 0, Math.PI * 2);
                ctx.fill();
              }
              const statKinds = drawing.stats ?? defaultDrawingStats(drawing.kind);
              if (
                statKinds.length &&
                (drawing.id === state.selected ||
                  state.selectedIds?.includes(drawing.id) ||
                  drawing.id === state.hovered ||
                  drawing === state.preview ||
                  (drawing.alwaysShowStats ?? drawing.kind === "info-line"))
              ) {
                const scale = chart.timeScale();
                const priceFormat = series.options().priceFormat;
                const stats = calculateDrawingStats({
                  anchors: drawing.anchors,
                  points: [a, b],
                  logical: [scale.coordinateToLogical(a.x), scale.coordinateToLogical(b.x)],
                  minMove:
                    priceFormat.base && priceFormat.base > 0
                      ? 1 / priceFormat.base
                      : priceFormat.minMove,
                });
                const left = a.x <= b.x ? a : b;
                const right = a.x <= b.x ? b : a;
                const position =
                  drawing.statsPosition ?? (drawing.kind === "info-line" ? "center" : "right");
                const point =
                  position === "left"
                    ? left
                    : position === "center" || position === "auto"
                      ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
                      : right;
                ctx.font = `12px ${chart.options().layout.fontFamily}`;
                const groups = formatInfoLineStats(stats, statKinds, (price) =>
                  series.priceFormatter().format(price),
                );
                if (groups.length) {
                  const panelWidth =
                    Math.max(0, ...groups.map((row) => ctx.measureText(row.text).width)) + 48;
                  const panelHeight = groups.length * 26 + 16;
                  const clampX = (x: number) => Math.max(0, Math.min(width - panelWidth, x));
                  const clampY = (y: number) => Math.max(0, Math.min(height - panelHeight, y));
                  const below = position === "auto" && right.y < left.y;
                  const preferredY = below ? point.y + 12 : point.y - panelHeight - 12;
                  let panelX = position === "auto" ? clampX(point.x + 12) : point.x + 12;
                  let panelY = position === "auto" ? clampY(preferredY) : preferredY;
                  if (position === "auto" && panelX < point.x + 12) {
                    // Only the actual segment can obstruct the right-clamped panel, not its extensions.
                    const overlapLeft = Math.max(left.x, panelX);
                    const overlapRight = Math.min(right.x, panelX + panelWidth);
                    const yAt = (x: number) =>
                      left.y + ((right.y - left.y) * (x - left.x)) / (right.x - left.x);
                    const lowY =
                      right.x === left.x
                        ? Math.min(left.y, right.y)
                        : Math.min(yAt(overlapLeft), yAt(overlapRight));
                    const highY =
                      right.x === left.x
                        ? Math.max(left.y, right.y)
                        : Math.max(yAt(overlapLeft), yAt(overlapRight));
                    if (
                      overlapLeft <= overlapRight &&
                      lowY <= panelY + panelHeight &&
                      highY >= panelY
                    ) {
                      panelX = clampX(point.x - panelWidth - 12);
                      panelY = clampY(below ? point.y - panelHeight - 12 : point.y + 12);
                    }
                  }
                  const layout = chart.options().layout;
                  const background = layout.background;
                  ctx.globalAlpha = 0.94;
                  ctx.fillStyle =
                    background?.type === "solid"
                      ? background.color
                      : background?.type === "gradient"
                        ? background.topColor
                        : "#202020";
                  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
                  ctx.globalAlpha = 0.05;
                  ctx.fillStyle = layout.textColor ?? "#dbdbdb";
                  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
                  ctx.globalAlpha = 1;
                  ctx.fillStyle = layout.textColor ?? "#dbdbdb";
                  ctx.strokeStyle = layout.textColor ?? "#dbdbdb";
                  ctx.lineWidth = 1;
                  ctx.textAlign = "left";
                  ctx.textBaseline = "middle";
                  groups.forEach((row, index) => {
                    const y = panelY + 21 + index * 26,
                      x = panelX + 18;
                    ctx.beginPath();
                    if (row.kind === "price") {
                      ctx.moveTo(x, y - 5);
                      ctx.lineTo(x, y + 5);
                      ctx.moveTo(x - 3, y - 2);
                      ctx.lineTo(x, y - 5);
                      ctx.lineTo(x + 3, y - 2);
                      ctx.moveTo(x - 3, y + 2);
                      ctx.lineTo(x, y + 5);
                      ctx.lineTo(x + 3, y + 2);
                      ctx.moveTo(x - 5, y - 7);
                      ctx.lineTo(x + 5, y - 7);
                      ctx.moveTo(x - 5, y + 7);
                      ctx.lineTo(x + 5, y + 7);
                    } else if (row.kind === "range") {
                      ctx.moveTo(x - 5, y);
                      ctx.lineTo(x + 5, y);
                      ctx.moveTo(x - 2, y - 3);
                      ctx.lineTo(x - 5, y);
                      ctx.lineTo(x - 2, y + 3);
                      ctx.moveTo(x + 2, y - 3);
                      ctx.lineTo(x + 5, y);
                      ctx.lineTo(x + 2, y + 3);
                      ctx.moveTo(x - 7, y - 5);
                      ctx.lineTo(x - 7, y + 5);
                      ctx.moveTo(x + 7, y - 5);
                      ctx.lineTo(x + 7, y + 5);
                    } else {
                      ctx.moveTo(x + 6, y + 5);
                      ctx.lineTo(x - 5, y + 5);
                      ctx.lineTo(x + 1, y - 6);
                      ctx.moveTo(x, y + 5);
                      ctx.arc(x - 5, y + 5, 5, 0, -Math.PI / 3, true);
                    }
                    ctx.stroke();
                    ctx.fillText(row.text, panelX + 40, y);
                  });
                }
              }
            }
          }
          if ((state.selectedIds?.length ?? 0) > 1 && state.selectedIds?.includes(drawing.id)) {
            ctx.save();
            ctx.strokeStyle = SELECTION_COLOR;
            ctx.lineWidth = drawing.width + 3;
            ctx.globalAlpha = 0.35;
            ctx.setLineDash([]);
            for (const line of geometry.lines) {
              ctx.beginPath();
              ctx.moveTo(line.from.x, line.from.y);
              ctx.lineTo(line.to.x, line.to.y);
              ctx.stroke();
            }
            ctx.restore();
          }
          if (
            (state.selectedIds?.length ?? 0) <= 1 &&
            (drawing.id === state.selected ||
              state.selectedIds?.includes(drawing.id) ||
              (drawing.id === state.hovered && !drawing.locked) ||
              drawing === state.preview)
          ) {
            const hovering =
              drawing.id === state.hovered &&
              !(drawing.id === state.selected || state.selectedIds?.includes(drawing.id)) &&
              drawing !== state.preview;
            ctx.setLineDash([]);
            ctx.globalAlpha = hovering ? 0.6 : 1;
            ctx.lineWidth = hovering ? 1 : drawing.kind === "channel" ? 1.5 : drawing.width;
            for (const index of geometry.handleIndices ??
              geometry.handles.map((_, index) => index)) {
              if (drawing.kind === "text" && index === 1 && (hovering || drawing.locked)) continue;
              const point = geometry.handles[index]!;
              ctx.beginPath();
              const radius = hovering ? 6 : drawing.locked ? 3 : drawing.kind === "channel" ? 5 : 4;
              // The disjoint channel's third anchor changes only the opposite right price.
              if (
                (drawing.kind === "channel" && (index === 1 || index === 4)) ||
                (drawing.kind === "text" && index === 1)
              )
                ctx.roundRect(point.x - radius, point.y - radius, radius * 2, radius * 2, 2);
              else if (drawing.kind === "disjoint-channel" && index === 2)
                ctx.rect(point.x - radius, point.y - radius, radius * 2, radius * 2);
              else ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
              ctx.fillStyle = "#15171a";
              ctx.fill();
              ctx.strokeStyle =
                drawing.id === state.selected ||
                state.selectedIds?.includes(drawing.id) ||
                drawing.id === state.hovered
                  ? SELECTION_COLOR
                  : drawing.color;
              ctx.stroke();
            }
          }
        }
        if (state.selectionRect) {
          const rect = state.selectionRect;
          ctx.globalAlpha = 1;
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(41,98,255,0.12)";
          ctx.strokeStyle = "#2962ff";
          ctx.lineWidth = 1;
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          ctx.strokeRect(
            rect.x + 0.5,
            rect.y + 0.5,
            Math.max(0, rect.width - 1),
            Math.max(0, rect.height - 1),
          );
        }
        ctx.restore();
      });
    },
  };
  const axisCache = {
    price: { signature: "", views: [] as ISeriesPrimitiveAxisView[] },
    time: { signature: "", views: [] as ISeriesPrimitiveAxisView[] },
  };
  const drawingAxisViews = (axis: "price" | "time") => {
    const state = read();
    const entries = state.hidden
      ? []
      : state.drawings.flatMap((drawing) => {
          if (
            drawing.hidden ||
            (axis === "price" && drawing.kind === "vertical") ||
            (axis === "time" && drawing.kind === "horizontal")
          )
            return [];
          const selected = drawing.id === state.selected || state.selectedIds?.includes(drawing.id);
          const persistent =
            axis === "price"
              ? drawingPriceLabelVisible(drawing) &&
                drawing.kind !== "horizontal" &&
                !isSpecialChannelDrawing(drawing.kind)
              : drawingTimeLabelVisible(drawing);
          if (!selected && !persistent) return [];
          const projection = drawingProjection(chart, series);
          const selectedAnchors =
            isSpecialChannelDrawing(drawing.kind) ||
            drawing.kind === "regression-trend" ||
            drawing.kind === "channel"
              ? buildDrawingGeometry(
                  drawing,
                  projection.project,
                  projection.priceY,
                  projection.width,
                  projection.height,
                  undefined,
                  undefined,
                  regressionFit(drawing),
                ).handles.flatMap((point, index) => {
                  if (drawing.kind === "channel" && (index === 1 || index === 4)) return [];
                  const anchor = projection.unproject(point);
                  return anchor ? [anchor] : [];
                })
              : drawing.anchors;
          const anchors = selected
            ? selectedAnchors.length > 4 && drawing.kind !== "regression-trend"
              ? [selectedAnchors[0]!, selectedAnchors.at(-1)!]
              : selectedAnchors
            : drawing.anchors.slice(0, 2);
          return anchors
            .filter(
              (anchor, index, anchors) =>
                anchors.findIndex((other) =>
                  axis === "price"
                    ? other.price === anchor.price
                    : drawingTimeValue(other.time) === drawingTimeValue(anchor.time),
                ) === index,
            )
            .map((anchor) => ({
              anchor,
              color: selected ? SELECTION_COLOR : drawing.color,
              id: drawing.id,
            }));
        });
    const signature = JSON.stringify(entries);
    const cache = axisCache[axis];
    if (signature !== cache.signature) {
      cache.signature = signature;
      cache.views = entries.map(({ anchor, color }) => ({
        coordinate: () =>
          axis === "price"
            ? (series.priceToCoordinate(anchor.price) ?? -10000)
            : (drawingTimeCoordinate(chart, series, anchor.time) ?? -10000),
        text: () => {
          if (axis === "price") return series.priceFormatter().format(anchor.price);
          const formatter = chart.options().localization?.timeFormatter;
          if (formatter) return formatter(anchor.time);
          const seconds = drawingTimeValue(anchor.time);
          if (seconds === null) return "";
          const date = new Date(seconds * 1000);
          if (!Number.isFinite(date.getTime())) return "";
          const iso = date.toISOString();
          return typeof anchor.time === "number"
            ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
            : iso.slice(0, 10);
        },
        textColor: () => "#ffffff",
        backColor: () => color,
        visible: () => {
          const coordinate =
            axis === "price"
              ? series.priceToCoordinate(anchor.price)
              : drawingTimeCoordinate(chart, series, anchor.time);
          const extent = axis === "price" ? series.getPane().getHeight() : chart.paneSize().width;
          return (
            coordinate !== null &&
            Number.isFinite(coordinate) &&
            coordinate >= 0 &&
            coordinate <= extent
          );
        },
        tickVisible: () => true,
      }));
    }
    return cache.views;
  };
  const view: IPrimitivePaneView = { zOrder: () => "top", renderer: () => renderer };
  const primitive: ISeriesPrimitive<Time> = {
    attached: (parameters) => {
      requestUpdate = parameters.requestUpdate;
      regressionSeries.subscribeDataChanged?.(invalidateRegression);
    },
    detached: () => {
      regressionSeries.unsubscribeDataChanged?.(invalidateRegression);
      regressionData = undefined;
      regressionCache.clear();
      requestUpdate = () => {};
    },
    hitTest: (x, y) => {
      const hit = hitTest({ x, y });
      return hit
        ? {
            externalId: hit.drawing.id,
            zOrder: "top",
            distance: hit.distance,
            hitTestPriority: hit.hitTestPriority,
            cursorStyle: hit.cursorStyle,
            itemType: "primitive",
          }
        : null;
    },
    paneViews: () => [view],
    priceAxisViews: () => drawingAxisViews("price"),
    timeAxisViews: () => drawingAxisViews("time"),
  };
  return { primitive, hitTest, drawingsInRect, redraw: () => requestUpdate() };
}
