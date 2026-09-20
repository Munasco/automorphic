import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from "lightweight-charts";
import type { RollEvent } from "./backAdjustment";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";

export interface ChartRollMarkersProps {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  symbol: string;
  rollEvents: readonly RollEvent[];
  backAdjusted: boolean;
  onToggleBackAdjusted?: () => void;
  visible?: boolean;
}

interface MarkerPosition {
  event: RollEvent;
  x: number;
  y: number;
}

export function ChartRollMarkers({
  chart,
  series,
  symbol,
  rollEvents,
  backAdjusted,
  onToggleBackAdjusted,
  visible = true,
}: ChartRollMarkersProps) {
  const root = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<MarkerPosition[]>([]);

  const measure = useCallback(() => {
    if (!chart || !series || !root.current || !visible || !rollEvents.length) {
      setPositions([]);
      return;
    }
    const bounds = root.current.getBoundingClientRect();
    const pane = series.getPane();
    const paneRect = pane.getHTMLElement()?.getBoundingClientRect();
    if (!paneRect) return;

    const left = paneRect.left - bounds.left + chart.priceScale("left", pane.paneIndex()).width();
    const top = paneRect.top - bounds.top;
    const paneHeight = pane.getHeight();
    const timeScale = chart.timeScale();

    const next: MarkerPosition[] = [];
    for (const event of rollEvents) {
      const coord = timeScale.timeToCoordinate(event.timestamp as UTCTimestamp);
      if (coord !== null && coord >= -20 && coord <= bounds.width + 20) {
        // Place just above the time axis at the bottom of the pane
        next.push({
          event,
          x: left + coord,
          y: top + paneHeight - 22,
        });
      }
    }

    setPositions((prev) => {
      if (prev.length !== next.length) return next;
      const changed = prev.some(
        (p, i) =>
          p.event.id !== next[i]!.event.id ||
          Math.abs(p.x - next[i]!.x) > 0.5 ||
          Math.abs(p.y - next[i]!.y) > 0.5,
      );
      return changed ? next : prev;
    });
  }, [chart, series, visible, rollEvents]);

  const measureRef = useRef(measure);
  useLayoutEffect(() => {
    measureRef.current = measure;
    measure();
  }, [measure]);

  useEffect(() => {
    if (!chart || !series) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        measureRef.current();
      });
    };

    const element = chart.chartElement();
    const scale = chart.timeScale();
    const drag = (event: PointerEvent) => {
      if (event.buttons) schedule();
    };

    scale.subscribeVisibleLogicalRangeChange(schedule);
    scale.subscribeSizeChange(schedule);
    series.subscribeDataChanged(schedule);
    element.addEventListener("pointermove", drag);
    element.addEventListener("pointerup", schedule);
    element.addEventListener("wheel", schedule, { passive: true });
    element.addEventListener("dblclick", schedule);

    const observer = new ResizeObserver(schedule);
    observer.observe(element);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      scale.unsubscribeVisibleLogicalRangeChange(schedule);
      scale.unsubscribeSizeChange(schedule);
      series.unsubscribeDataChanged(schedule);
      element.removeEventListener("pointermove", drag);
      element.removeEventListener("pointerup", schedule);
      element.removeEventListener("wheel", schedule);
    };
  }, [chart, series]);

  if (!visible || !positions.length) {
    return <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" />;
  }

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden">
      {positions.map(({ event, x, y }) => (
        <div
          key={event.id}
          className="pointer-events-auto absolute -translate-x-1/2"
          style={{ left: `${x}px`, top: `${y}px` }}
        >
          <Popover>
            <Tooltip>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`Rollover ${event.fromContract} to ${event.toContract}`}
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold shadow-md transition-transform hover:scale-110",
                          backAdjusted
                            ? "border-sky-500/60 bg-sky-950/80 text-sky-400 hover:bg-sky-900"
                            : "border-amber-500/60 bg-amber-950/80 text-amber-400 hover:bg-amber-900",
                        )}
                      >
                        R
                      </button>
                    }
                  />
                }
              />
              <TooltipPopup>
                Rollover: {event.fromContract} ➔ {event.toContract}
              </TooltipPopup>
            </Tooltip>

            <PopoverPopup className="w-64 rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-xl">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="font-semibold text-foreground">Contract Rollover</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {event.formattedDate}
                </span>
              </div>

              <div className="mt-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Transition</span>
                  <span className="font-mono font-medium text-foreground">
                    <span className="text-red-400">{event.fromContract}</span>
                    {" ➔ "}
                    <span className="text-emerald-400">{event.toContract}</span>
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Rollover Gap (Δ)</span>
                  <span className="font-mono font-medium text-foreground">
                    {event.spread >= 0 ? `+${event.spread.toFixed(2)}` : event.spread.toFixed(2)}{" "}
                    pts
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Chart Mode</span>
                  <span
                    className={cn(
                      "font-semibold",
                      backAdjusted ? "text-sky-400" : "text-amber-400",
                    )}
                  >
                    {backAdjusted ? "B-ADJ (Smoothed)" : "Unadjusted (Raw)"}
                  </span>
                </div>
              </div>

              {onToggleBackAdjusted ? (
                <button
                  type="button"
                  onClick={onToggleBackAdjusted}
                  className="mt-3 w-full rounded bg-white/10 px-2 py-1 text-center text-[11px] font-medium text-foreground transition-colors hover:bg-white/15"
                >
                  {backAdjusted ? "Switch to Unadjusted Prices" : "Enable Panama Back-Adjustment"}
                </button>
              ) : null}
            </PopoverPopup>
          </Popover>
        </div>
      ))}
    </div>
  );
}
