import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesType,
  Time,
} from "lightweight-charts";
import {
  buildDrawingGeometry,
  drawingTimeValue,
  type ChartDrawing,
  type DrawingAnchor,
  type DrawingPoint,
} from "./drawingGeometry";

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

export function createDrawingPrimitive(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  read: () => {
    drawings: ChartDrawing[];
    selected: string | null;
    preview?: ChartDrawing | null;
    hidden?: boolean;
  },
) {
  let requestUpdate = () => {};
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
          const geometry = buildDrawingGeometry(drawing, project, priceY, width, height);
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
          if (!nativeLine) {
            if (geometry.rectangle) {
              const rect = geometry.rectangle;
              ctx.globalAlpha = 0.12;
              ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
              ctx.globalAlpha = 1;
            }
            for (const polygon of geometry.polygons ?? []) {
              if (!polygon.points.length) continue;
              ctx.globalAlpha = polygon.opacity;
              ctx.beginPath();
              ctx.moveTo(polygon.points[0]!.x, polygon.points[0]!.y);
              for (const point of polygon.points.slice(1)) ctx.lineTo(point.x, point.y);
              ctx.closePath();
              ctx.fill();
            }
            ctx.globalAlpha = geometry.opacity ?? 1;
            ctx.font = `12px ${chart.options().layout.fontFamily}`;
            ctx.beginPath();
            let previous: DrawingPoint | undefined;
            for (const line of geometry.lines) {
              if (!previous || previous.x !== line.from.x || previous.y !== line.from.y)
                ctx.moveTo(line.from.x, line.from.y);
              ctx.lineTo(line.to.x, line.to.y);
              previous = line.to;
            }
            if (geometry.lines.length) ctx.stroke();
            for (const line of geometry.lines)
              if (line.label) ctx.fillText(line.label, line.to.x + 4, line.to.y - 3);
            if (geometry.text) {
              ctx.font = `13px ${chart.options().layout.fontFamily}`;
              ctx.fillText(geometry.text.value, geometry.text.point.x, geometry.text.point.y);
            }
          }
          if ((drawing.id === state.selected && !drawing.locked) || drawing === state.preview) {
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            ctx.lineWidth = drawing.width;
            for (const index of geometry.handleIndices ??
              geometry.handles.map((_, index) => index)) {
              const point = geometry.handles[index]!;
              ctx.beginPath();
              ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
              ctx.fillStyle = "#15171a";
              ctx.fill();
              ctx.strokeStyle = drawing.color;
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      });
    },
  };
  const view: IPrimitivePaneView = { zOrder: () => "top", renderer: () => renderer };
  const primitive: ISeriesPrimitive<Time> = {
    attached: (parameters) => {
      requestUpdate = parameters.requestUpdate;
    },
    detached: () => {
      requestUpdate = () => {};
    },
    paneViews: () => [view],
  };
  return { primitive, redraw: () => requestUpdate() };
}
