import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { IChartApi, ISeriesApi, Logical, SeriesType } from "lightweight-charts";
import type { ChartTableSource } from "./ChartDataTableDialog";
import { drawingProjection } from "./drawingPrimitive";
import { drawingTimeValue, type DrawingAnchor } from "./drawingGeometry";
import { calculateDrawingStats, formatDrawingStats } from "./drawingStats";
import { snapDrawingAnchor } from "./drawingMagnet";
import type { DrawingMagnetMode } from "./useChartDrawings";
import { useChartOverlayLayout } from "./chartOverlayLayout";

type Measurement = { start: DrawingAnchor; end: DrawingAnchor };
type View = {
  width: number;
  height: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  rows: string[];
  up: boolean;
};

/** A temporary ruler, isolated from saved drawings, alerts, and their undo history. */
export function ChartMeasureOverlay({
  chart,
  series,
  source,
  onClose,
  magnetMode,
  onComplete,
}: {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  source: ChartTableSource;
  onClose: () => void;
  magnetMode: DrawingMagnetMode;
  onComplete: () => void;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const measurement = useRef<Measurement | null>(null);
  const snappedEndpoint = useRef<DrawingAnchor | null>(null);
  const pointer = useRef<number | null>(null);
  const refresh = useRef<() => void>(() => {});
  const [view, setView] = useState<View | null>(null);
  const [complete, setComplete] = useState(false);
  const [snapPoint, setSnapPoint] = useState<{ x: number; y: number } | null>(null);
  const { scale } = useChartOverlayLayout();
  useEffect(() => {
    if (!complete) return;
    const element = chart.chartElement();
    element.addEventListener("pointerdown", onClose);
    return () => element.removeEventListener("pointerdown", onClose);
  }, [chart, complete, onClose]);
  useEffect(() => {
    let frame: number | undefined;
    let signature = "";
    const render = () => {
      frame = undefined;
      const projection = drawingProjection(chart, series);
      const projectedSnap = snappedEndpoint.current
        ? projection.project(snappedEndpoint.current)
        : null;
      setSnapPoint((previous) =>
        previous?.x === projectedSnap?.x && previous?.y === projectedSnap?.y
          ? previous
          : projectedSnap,
      );
      const value = measurement.current;
      const a = value ? projection.project(value.start) : null;
      const b = value ? projection.project(value.end) : null;
      if (overlay.current) {
        overlay.current.style.width = `${projection.width}px`;
        overlay.current.style.height = `${projection.height}px`;
      }
      if (!value || !a || !b) {
        setView(null);
        signature = "";
        return;
      }
      const realAnchor = (anchor: DrawingAnchor) => {
        const time = drawingTimeValue(anchor.time);
        const bar = time === null ? undefined : source.bars.get(time);
        return { ...anchor, time: (bar?.actualTime ?? anchor.time) as DrawingAnchor["time"] };
      };
      const stats = calculateDrawingStats({
        anchors: [realAnchor(value.start), realAnchor(value.end)],
        logical: [
          chart.timeScale().coordinateToLogical(a.x),
          chart.timeScale().coordinateToLogical(b.x),
        ],
        minMove: series.options().priceFormat.minMove,
      });
      const labels = formatDrawingStats(
        stats,
        ["price", "percent", "ticks", "bars", "datetime"],
        (price) => series.priceFormatter().format(price),
      );
      const next = {
        width: projection.width,
        height: projection.height,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        rows: [`${labels[0]} (${labels[1]}) · ${labels[2]}`, `${labels[3]} · ${labels[4]}`],
        up: (stats.price ?? 0) >= 0,
      };
      const nextSignature = JSON.stringify(next);
      if (signature !== nextSignature) {
        signature = nextSignature;
        setView(next);
      }
    };
    const schedule = () => {
      if (frame === undefined) frame = requestAnimationFrame(render);
    };
    refresh.current = schedule;
    const element = chart.chartElement();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);
    element.addEventListener("pointermove", schedule);
    element.addEventListener("pointerup", schedule);
    const unsubscribe = source.subscribeBars(schedule);
    overlay.current?.focus({ preventScroll: true });
    render();
    return () => {
      observer.disconnect();
      unsubscribe();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(schedule);
      element.removeEventListener("pointermove", schedule);
      element.removeEventListener("pointerup", schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [chart, series, source]);

  const anchorAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const logical = chart.timeScale().coordinateToLogical(x);
    if (logical === null) return null;
    const snappedX = chart.timeScale().logicalToCoordinate(Math.round(logical) as Logical);
    if (snappedX === null) return null;
    const anchor = drawingProjection(chart, series).unproject({ x: snappedX, y });
    const tick = series.options().priceFormat.minMove;
    if (!anchor) return null;
    const candle = series.dataByIndex(Math.round(logical));
    const snapped = snapDrawingAnchor(
      anchor,
      { x, y },
      candle && "open" in candle ? candle : undefined,
      magnetMode,
      (price) => series.priceToCoordinate(price),
    );
    snappedEndpoint.current = snapped === anchor ? null : snapped;
    refresh.current();
    return tick > 0
      ? { ...snapped, price: Number((Math.round(snapped.price / tick) * tick).toFixed(8)) }
      : snapped;
  };
  const color = view?.up ? "#3b82f6" : "#ef4444";
  const labelWidth = view ? Math.min(280 * scale, Math.max(0, view.width - 8)) : 0;
  const labelHeight = 48 * scale;
  const midX = view ? (view.x1 + view.x2) / 2 : 0;
  const midY = view ? (view.y1 + view.y2) / 2 : 0;
  const arrowX = view ? Math.min(5 * scale, Math.abs(view.x2 - view.x1) / 3) : 0;
  const arrowY = view ? Math.min(5 * scale, Math.abs(view.y2 - view.y1) / 3) : 0;
  return (
    <div
      ref={overlay}
      tabIndex={0}
      aria-label="Measure chart"
      className="absolute left-0 top-0 z-30 touch-none overflow-hidden outline-none"
      style={{ cursor: "crosshair", pointerEvents: complete ? "none" : "auto" }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || pointer.current !== null) return;
        const start = anchorAt(event);
        if (!start) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus({ preventScroll: true });
        if (measurement.current) {
          measurement.current.end = start;
          snappedEndpoint.current = null;
          setComplete(true);
          onComplete();
          refresh.current();
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = event.pointerId;
        measurement.current = { start, end: start };
        refresh.current();
      }}
      onPointerMove={(event) => {
        const end = anchorAt(event);
        if (!measurement.current || complete) return;
        if (end) {
          measurement.current.end = end;
          refresh.current();
        }
      }}
      onPointerUp={(event) => {
        if (pointer.current !== event.pointerId) return;
        const end = anchorAt(event);
        if (end && measurement.current) measurement.current.end = end;
        pointer.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        refresh.current();
      }}
      onPointerCancel={() => {
        pointer.current = null;
        measurement.current = null;
        refresh.current();
      }}
    >
      {snapPoint && magnetMode !== "off" && (
        <svg
          className="pointer-events-none absolute inset-0 size-full"
          aria-label="Snapped to candle price"
        >
          <circle
            cx={snapPoint.x}
            cy={snapPoint.y}
            r={7}
            fill="#090b10"
            stroke="#60a5fa"
            strokeWidth={2}
          />
          <circle cx={snapPoint.x} cy={snapPoint.y} r={2} fill="#93c5fd" />
        </svg>
      )}
      {view ? (
        <>
          <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
            <rect
              x={Math.min(view.x1, view.x2)}
              y={Math.min(view.y1, view.y2)}
              width={Math.abs(view.x2 - view.x1)}
              height={Math.abs(view.y2 - view.y1)}
              fill={color}
              fillOpacity={0.15}
            />
            <path
              d={`M ${view.x1} ${midY} H ${view.x2} M ${midX} ${view.y1} V ${view.y2}`}
              fill="none"
              stroke={color}
            />
            <path
              d={`M ${view.x2 - Math.sign(view.x2 - view.x1) * arrowX} ${midY - arrowX} L ${view.x2} ${midY} L ${view.x2 - Math.sign(view.x2 - view.x1) * arrowX} ${midY + arrowX} M ${midX - arrowY} ${view.y2 - Math.sign(view.y2 - view.y1) * arrowY} L ${midX} ${view.y2} L ${midX + arrowY} ${view.y2 - Math.sign(view.y2 - view.y1) * arrowY}`}
              fill="none"
              stroke={color}
            />
          </svg>
          <output
            aria-label="Measurement result"
            className="pointer-events-none absolute rounded border px-2 py-1 text-center font-medium text-white shadow-md"
            style={{
              background: view.up ? "#1d4ed8" : "#b91c1c",
              borderColor: color,
              width: labelWidth,
              fontSize: 12 * scale,
              lineHeight: `${18 * scale}px`,
              left: Math.max(
                4,
                Math.min(view.width - labelWidth - 4, (view.x1 + view.x2 - labelWidth) / 2),
              ),
              top: Math.max(
                4,
                Math.min(
                  view.height - labelHeight - 4,
                  view.y2 < view.y1
                    ? Math.min(view.y1, view.y2) - labelHeight - 8
                    : Math.max(view.y1, view.y2) + 8,
                ),
              ),
            }}
          >
            <div>{view.rows[0]}</div>
            <div>{view.rows[1]}</div>
          </output>
        </>
      ) : (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded border border-white/15 bg-zinc-900/95 px-3 py-1.5 text-xs text-zinc-200">
          Click a start point, then an end point · Esc to exit
        </div>
      )}
    </div>
  );
}
