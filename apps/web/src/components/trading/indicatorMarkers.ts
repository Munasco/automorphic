import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import type { IndicatorPoint } from "./chartIndicators";

type MarkerStyle = { color: string; opacity: number; visible: boolean; lineWidth: number };

/** Cross markers share their host series' price scale and crosshair data, without joining observations. */
export function createIndicatorMarkers(chart: IChartApi, series: ISeriesApi<"Line">) {
  let points: readonly IndicatorPoint[] = [];
  let style: MarkerStyle = { color: "#2962ff", opacity: 1, visible: true, lineWidth: 1 };
  let requestUpdate = () => {};
  const renderer: IPrimitivePaneRenderer = {
    draw(target) {
      if (!style.visible || style.opacity <= 0) return;
      const range = chart.timeScale().getVisibleRange();
      if (!range) return;
      target.useBitmapCoordinateSpace(
        ({ context, horizontalPixelRatio: rx, verticalPixelRatio: ry, bitmapSize }) => {
          const radius = 2 + style.lineWidth;
          const widthX = Math.max(1, Math.round(style.lineWidth * rx));
          const widthY = Math.max(1, Math.round(style.lineWidth * ry));
          context.save();
          context.fillStyle = style.color;
          context.globalAlpha = style.opacity;
          for (const point of points) {
            if (point.time < Number(range.from) || point.time > Number(range.to)) continue;
            const x = chart.timeScale().timeToCoordinate(point.time as UTCTimestamp);
            const y = series.priceToCoordinate(point.value);
            if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
            const px = Math.round(x * rx),
              py = Math.round(y * ry);
            if (
              px < -radius * rx ||
              px > bitmapSize.width + radius * rx ||
              py < -radius * ry ||
              py > bitmapSize.height + radius * ry
            )
              continue;
            const left = px - Math.floor(widthX / 2),
              top = py - Math.floor(widthY / 2);
            // One polygon avoids double opacity at the cross intersection.
            context.beginPath();
            context.rect(px - radius * rx, top, radius * rx * 2, widthY);
            context.rect(left, py - radius * ry, widthX, radius * ry * 2);
            context.fill();
          }
          context.restore();
        },
      );
    },
  };
  const view = { zOrder: () => "normal" as const, renderer: () => renderer };
  const primitive: ISeriesPrimitive<Time> = {
    attached(parameters) {
      requestUpdate = parameters.requestUpdate;
      requestUpdate();
    },
    detached() {
      requestUpdate = () => {};
      points = [];
    },
    paneViews: () => [view],
  };
  return {
    primitive,
    update(next: readonly IndicatorPoint[], nextStyle: MarkerStyle) {
      points = next;
      style = nextStyle;
      requestUpdate();
    },
  };
}
