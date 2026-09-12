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
        const upper = data[left]!,
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
  return { width, height, priceY, project };
}

export function createDrawingPrimitive(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  read: () => { drawings: ChartDrawing[]; selected: string | null },
) {
  let requestUpdate = () => {};
  const renderer: IPrimitivePaneRenderer = {
    draw(target) {
      const { width, height, priceY, project } = drawingProjection(chart, series);
      const state = read();
      target.useMediaCoordinateSpace(({ context: ctx }) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.clip();
        for (const drawing of state.drawings) {
          const geometry = buildDrawingGeometry(drawing, project, priceY, width, height);
          ctx.strokeStyle = drawing.color;
          ctx.fillStyle = drawing.color;
          ctx.lineWidth = drawing.width;
          const nativeLine = drawing.kind === "horizontal" || drawing.kind === "trend";
          if (!nativeLine) {
            if (geometry.rectangle) {
              const rect = geometry.rectangle;
              ctx.globalAlpha = 0.12;
              ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
              ctx.globalAlpha = 1;
            }
            ctx.font = `12px ${chart.options().layout.fontFamily}`;
            for (const line of geometry.lines) {
              ctx.beginPath();
              ctx.moveTo(line.from.x, line.from.y);
              ctx.lineTo(line.to.x, line.to.y);
              ctx.stroke();
              if (line.label) ctx.fillText(line.label, line.to.x + 4, line.to.y - 3);
            }
            if (geometry.text) {
              ctx.font = `13px ${chart.options().layout.fontFamily}`;
              ctx.fillText(geometry.text.value, geometry.text.point.x, geometry.text.point.y);
            }
          }
          if (drawing.id === state.selected) {
            for (const point of geometry.handles) {
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
