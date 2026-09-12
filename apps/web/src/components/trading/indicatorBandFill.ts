import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import type { IndicatorPoint } from "./chartIndicators";
export type IndicatorBandArea = {
  upper: readonly IndicatorPoint[];
  lower: readonly IndicatorPoint[];
  color: string;
  opacity: number;
  visible: boolean;
};
type Point = { x: number; y: number };
/** Join only matching observations. Missing points break the fill instead of painting across
 * warmup gaps or invalid data; chart coordinates support both logarithmic and linear scales. */
export function indicatorBandPolygons(
  upper: readonly IndicatorPoint[],
  lower: readonly IndicatorPoint[],
  project: (point: IndicatorPoint) => Point | null,
): Point[][] {
  const polygons: Point[][] = [];
  let top: Point[] = [],
    bottom: Point[] = [],
    i = 0,
    j = 0;
  const flush = () => {
    if (top.length > 1) polygons.push([...top, ...bottom.toReversed()]);
    top = [];
    bottom = [];
  };
  while (i < upper.length && j < lower.length) {
    const high = upper[i]!,
      low = lower[j]!;
    if (high.time !== low.time) {
      flush();
      if (high.time < low.time) i++;
      else j++;
      continue;
    }
    const a = project(high),
      b = project(low);
    if (!a || !b || ![a.x, a.y, b.x, b.y].every(Number.isFinite)) flush();
    else {
      top.push(a);
      bottom.push(b);
    }
    i++;
    j++;
  }
  flush();
  return polygons;
}

export function createIndicatorBandFill(chart: IChartApi, series: ISeriesApi<"Line">) {
  let areas: readonly IndicatorBandArea[] = [],
    requestUpdate = () => {};
  const renderer: IPrimitivePaneRenderer = {
    draw(target) {
      target.useBitmapCoordinateSpace((scope) => {
        const { context, horizontalPixelRatio: rx, verticalPixelRatio: ry } = scope;
        for (const area of areas) {
          if (!area.visible || area.opacity <= 0) continue;
          const polygons = indicatorBandPolygons(area.upper, area.lower, (point) => {
            const x = chart.timeScale().timeToCoordinate(point.time as UTCTimestamp),
              y = series.priceToCoordinate(point.value);
            return x === null || y === null ? null : { x: x * rx, y: y * ry };
          });
          context.save();
          context.fillStyle = area.color;
          context.globalAlpha = area.opacity;
          for (const polygon of polygons) {
            context.beginPath();
            context.moveTo(polygon[0]!.x, polygon[0]!.y);
            for (const point of polygon.slice(1)) context.lineTo(point.x, point.y);
            context.closePath();
            context.fill();
          }
          context.restore();
        }
      });
    },
  };
  const view = { zOrder: () => "bottom" as const, renderer: () => renderer };
  const primitive: ISeriesPrimitive<Time> = {
    attached(parameters) {
      requestUpdate = parameters.requestUpdate;
      requestUpdate();
    },
    detached() {
      requestUpdate = () => {};
      areas = [];
    },
    paneViews: () => [view],
  };
  return {
    primitive,
    update(next: readonly IndicatorBandArea[]) {
      areas = next;
      requestUpdate();
    },
  };
}
