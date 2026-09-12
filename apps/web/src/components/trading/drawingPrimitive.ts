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
  supportsDrawingPriceLabels,
  type ChartDrawing,
  type DrawingAnchor,
  type DrawingPoint,
} from "./drawingGeometry";
import { calculateDrawingStats, formatDrawingStats } from "./drawingStats";

const SELECTION_COLOR = "#2962ff";

export function drawingProjection(chart: IChartApi, series: ISeriesApi<SeriesType>) {
  const scale = chart.timeScale();
  const width = scale.width();
  const height = series.getPane().getHeight();
  const priceY = (price: number) => series.priceToCoordinate(price);
  const project = (anchor: DrawingAnchor) => {
    const y = priceY(anchor.price);
    let x: number | null = scale.timeToCoordinate(anchor.time);
    if (x === null) {
      // Keep absolute timestamps when changing intervals; interpolate between the new candle anchors.
      const target = drawingTimeValue(anchor.time);
      const data = series.data();
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
    return { time: Math.round(value) as Time, price };
  };
  return { width, height, priceY, project, unproject };
}

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
  distance: number;
  hitTestPriority: 0 | 1 | 2;
  cursorStyle: "default" | "pointer";
};

export function createDrawingPrimitive(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  read: () => {
    drawings: ChartDrawing[];
    selected: string | null;
    preview?: ChartDrawing | null;
    hidden?: boolean;
    hovered?: string | null;
    interactive?: boolean;
  },
) {
  let requestUpdate = () => {};
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
      );
      const handle = hitDrawingHandle(geometry, point);
      let candidate: DrawingPrimitiveHit;
      if (handle >= 0) {
        const anchor = geometry.handles[handle]!;
        candidate = {
          drawing,
          handle: drawing.locked ? -1 : handle,
          cursorStyle: "default",
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
          );
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          ctx.strokeStyle = drawing.color;
          ctx.fillStyle = drawing.color;
          ctx.lineWidth = geometry.strokeWidth ?? drawing.width;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.globalAlpha = geometry.opacity ?? 1;
          ctx.setLineDash(
            drawing.lineStyle === "dashed" ? [8, 5] : drawing.lineStyle === "dotted" ? [2, 4] : [],
          );
          const nativeLine = drawing.kind === "horizontal" && drawing !== state.preview;
          if (!nativeLine || geometry.polygons?.length || geometry.text) {
            if (geometry.rectangle) {
              const rect = geometry.rectangle;
              ctx.globalAlpha = 0.12;
              ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
              ctx.globalAlpha = 1;
            }
            for (const polygon of geometry.polygons ?? []) {
              if (!polygon.points.length) continue;
              ctx.globalAlpha = polygon.opacity;
              ctx.fillStyle = polygon.color ?? drawing.color;
              ctx.beginPath();
              ctx.moveTo(polygon.points[0]!.x, polygon.points[0]!.y);
              for (const point of polygon.points.slice(1)) ctx.lineTo(point.x, point.y);
              ctx.closePath();
              ctx.fill();
            }
            ctx.globalAlpha = geometry.opacity ?? 1;
            ctx.fillStyle = drawing.color;
            ctx.font = `${drawing.textFontSize ?? 12}px ${chart.options().layout.fontFamily}`;
            ctx.beginPath();
            let previous: DrawingPoint | undefined;
            let activeColor = drawing.color;
            let activeStyle = drawing.lineStyle ?? "solid";
            const visibleLines = nativeLine ? geometry.lines.slice(1) : geometry.lines;
            for (const line of visibleLines) {
              const color = line.color ?? drawing.color;
              const style = line.lineStyle ?? drawing.lineStyle ?? "solid";
              if (color !== activeColor || style !== activeStyle) {
                if (previous) ctx.stroke();
                ctx.beginPath();
                ctx.strokeStyle = color;
                activeColor = color;
                activeStyle = style;
                ctx.setLineDash(style === "dashed" ? [8, 5] : style === "dotted" ? [2, 4] : []);
                previous = undefined;
              }
              if (!previous || previous.x !== line.from.x || previous.y !== line.from.y)
                ctx.moveTo(line.from.x, line.from.y);
              ctx.lineTo(line.to.x, line.to.y);
              previous = line.to;
            }
            if (visibleLines.length) ctx.stroke();
            for (const line of visibleLines) {
              if (!line.label) continue;
              ctx.fillStyle = line.color ?? drawing.color;
              ctx.textAlign = line.labelAlign ?? "left";
              ctx.textBaseline = line.labelBaseline ?? "alphabetic";
              const point = line.labelPoint ?? { x: line.to.x + 4, y: line.to.y - 3 };
              ctx.fillText(line.label, point.x, point.y);
            }
            if (geometry.text) {
              const text = geometry.text;
              const size = text.fontSize ?? 14;
              const rows = text.value.split(/\r?\n/);
              const rowHeight = size * 1.2;
              ctx.font = `${drawing.textItalic ? "italic " : ""}${drawing.textBold ? "bold " : ""}${size}px ${chart.options().layout.fontFamily}`;
              ctx.fillStyle = drawing.textColor ?? drawing.color;
              ctx.textAlign = text.align ?? "left";
              ctx.textBaseline = "top";
              const rotated = text.angle !== undefined && text.angle !== 0;
              if (rotated) {
                ctx.save();
                ctx.translate(text.point.x, text.point.y);
                ctx.rotate(text.angle!);
              }
              const top =
                (rotated ? 0 : text.point.y) -
                (text.baseline === "top"
                  ? 0
                  : text.baseline === "middle"
                    ? (rows.length * rowHeight) / 2
                    : rows.length * rowHeight);
              rows.forEach((row, index) =>
                ctx.fillText(row, rotated ? 0 : text.point.x, top + index * rowHeight),
              );
              if (rotated) ctx.restore();
            }
          }
          if (supportsLineStatistics(drawing.kind) && drawing.anchors.length >= 2) {
            const a = project(drawing.anchors[0]!);
            const b = project(drawing.anchors[1]!);
            if (a && b) {
              ctx.setLineDash([]);
              ctx.globalAlpha = 1;
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
                const rows = formatDrawingStats(stats, statKinds, (price) =>
                  series.priceFormatter().format(price),
                );
                const left = a.x <= b.x ? a : b;
                const right = a.x <= b.x ? b : a;
                const position = drawing.statsPosition ?? "right";
                const point =
                  position === "left"
                    ? left
                    : position === "center"
                      ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
                      : right;
                ctx.font = `12px ${chart.options().layout.fontFamily}`;
                ctx.textAlign =
                  position === "left" ? "right" : position === "center" ? "center" : "left";
                ctx.textBaseline = "bottom";
                const x = point.x + (position === "left" ? -8 : position === "right" ? 8 : 0);
                rows.forEach((row, index) =>
                  ctx.fillText(row, x, point.y - 8 - (rows.length - index - 1) * 16),
                );
              }
            }
          }
          if (
            drawing.id === state.selected ||
            (drawing.id === state.hovered && !drawing.locked) ||
            drawing === state.preview
          ) {
            const hovering =
              drawing.id === state.hovered &&
              drawing.id !== state.selected &&
              drawing !== state.preview;
            ctx.setLineDash([]);
            ctx.globalAlpha = hovering ? 0.6 : 1;
            ctx.lineWidth = hovering ? 1 : drawing.width;
            for (const index of geometry.handleIndices ??
              geometry.handles.map((_, index) => index)) {
              const point = geometry.handles[index]!;
              ctx.beginPath();
              ctx.arc(point.x, point.y, hovering ? 6 : drawing.locked ? 3 : 4, 0, Math.PI * 2);
              ctx.fillStyle = "#15171a";
              ctx.fill();
              ctx.strokeStyle =
                drawing.id === state.selected || drawing.id === state.hovered
                  ? SELECTION_COLOR
                  : drawing.color;
              ctx.stroke();
            }
          }
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
          if (drawing.hidden) return [];
          const selected = drawing.id === state.selected;
          const persistent =
            axis === "price" &&
            drawing.showPriceLabel === true &&
            drawing.kind !== "horizontal" &&
            supportsDrawingPriceLabels(drawing.kind);
          if (!selected && !persistent) return [];
          const anchors = selected
            ? drawing.anchors.length > 4
              ? [drawing.anchors[0]!, drawing.anchors.at(-1)!]
              : drawing.anchors
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
            : (drawingProjection(chart, series).project(anchor)?.x ?? -10000),
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
          const projection = drawingProjection(chart, series);
          const point = projection.project(anchor);
          return (
            point !== null &&
            point.x >= 0 &&
            point.x <= projection.width &&
            point.y >= 0 &&
            point.y <= projection.height
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
    },
    detached: () => {
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
  return { primitive, hitTest, redraw: () => requestUpdate() };
}
