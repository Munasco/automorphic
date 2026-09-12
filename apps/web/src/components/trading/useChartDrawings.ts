import { useCallback, useEffect, useRef, useState } from "react";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import {
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
} from "lightweight-charts";

export type ChartDrawingTool = "cursor" | "horizontal" | "trend";
type Anchor = { time: Time; price: number };
type Drawing = { kind: "horizontal"; price: number } | { kind: "trend"; from: Anchor; to: Anchor };
type DrawingState = { tool: ChartDrawingTool; count: number; pending: boolean };
type DrawingStorage = Pick<Storage, "getItem" | "setItem">;
const MAX_DRAWINGS = 100;

function timeValue(time: unknown): number | null {
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
    return timeValue(
      `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }
  return null;
}

function isAnchor(value: unknown): value is Anchor {
  return (
    !!value &&
    typeof value === "object" &&
    "time" in value &&
    timeValue(value.time) !== null &&
    "price" in value &&
    typeof value.price === "number" &&
    Number.isFinite(value.price)
  );
}

function parseDrawings(value: string | null): Drawing[] {
  if (!value) return [];
  try {
    const decoded: unknown = JSON.parse(value);
    if (!Array.isArray(decoded)) return [];
    return decoded
      .filter((drawing): drawing is Drawing => {
        if (!drawing || typeof drawing !== "object") return false;
        if (drawing.kind === "horizontal")
          return typeof drawing.price === "number" && Number.isFinite(drawing.price);
        return (
          drawing.kind === "trend" &&
          isAnchor(drawing.from) &&
          isAnchor(drawing.to) &&
          timeValue(drawing.from.time) !== timeValue(drawing.to.time)
        );
      })
      .slice(-MAX_DRAWINGS);
  } catch {
    return [];
  }
}

/** One chart lifecycle. Records survive replacement; chart objects and event handlers never do. */
export function createChartDrawingSession(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  symbol: string,
  onChange: (state: DrawingState) => void,
  storage: DrawingStorage | undefined = tradingWorkspaceStorage,
) {
  const key = `automorphic:chart-drawings:v1:${encodeURIComponent(symbol)}`;
  let drawings: Drawing[] = [];
  try {
    const saved = storage?.getItem(key);
    if (saved !== undefined && saved !== null) drawings = parseDrawings(saved);
  } catch {
    /* Keep this session usable when browser storage is unavailable. */
  }
  drawings = [...drawings];
  let tool: ChartDrawingTool = "cursor";
  let first: Anchor | null = null;
  let disposed = false;
  const removers: Array<() => void> = [];
  const emit = () => onChange({ tool, count: drawings.length, pending: first !== null });
  const persist = () => {
    try {
      storage?.setItem(key, JSON.stringify(drawings));
    } catch {
      /* Memory remains available. */
    }
  };
  const removeLast = () => {
    const remove = removers.pop();
    // Parent components may remove the entire chart before this hook's cleanup runs.
    try {
      remove?.();
    } catch {
      /* Chart already disposed. */
    }
  };
  const render = (drawing: Drawing) => {
    if (drawing.kind === "horizontal") {
      const line = series.createPriceLine({
        price: drawing.price,
        color: "#729bff",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "",
      });
      removers.push(() => series.removePriceLine(line));
    } else {
      const line = chart.addSeries(
        LineSeries,
        {
          color: "#729bff",
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => null,
          priceScaleId: series.options().priceScaleId ?? "right",
        },
        series.getPane().paneIndex(),
      );
      const anchors = [drawing.from, drawing.to].sort(
        (a, b) => timeValue(a.time)! - timeValue(b.time)!,
      );
      line.setData(anchors.map(({ time, price }) => ({ time, value: price })));
      removers.push(() => chart.removeSeries(line));
    }
  };
  const setTool = (next: ChartDrawingTool) => {
    if (disposed) return;
    tool = next;
    first = null;
    emit();
  };
  const commit = (drawing: Drawing) => {
    if (drawings.length === MAX_DRAWINGS) {
      const remove = removers.shift();
      remove?.();
      drawings.shift();
    }
    render(drawing);
    drawings.push(drawing);
    persist();
    setTool("cursor");
  };
  const click = (event: MouseEventParams<Time>) => {
    if (
      disposed ||
      tool === "cursor" ||
      !event.point ||
      (event.paneIndex !== undefined && event.paneIndex !== series.getPane().paneIndex())
    )
      return;
    const price = series.coordinateToPrice(event.point.y);
    if (price === null || !Number.isFinite(price)) return;
    if (tool === "horizontal") {
      commit({ kind: "horizontal", price });
      return;
    }
    if (event.time === undefined || timeValue(event.time) === null) return;
    const anchor = { time: event.time, price };
    if (first === null) {
      first = anchor;
      emit();
      return;
    }
    // Two anchors on the same candle cannot form a time-series line. Keep the first anchor.
    if (timeValue(first.time) === timeValue(anchor.time)) return;
    commit({ kind: "trend", from: first, to: anchor });
  };
  for (const drawing of drawings) render(drawing);
  chart.subscribeClick(click);
  emit();
  return {
    setTool,
    cancel: () => setTool("cursor"),
    undo: () => {
      if (disposed) return;
      if (first !== null) {
        setTool("cursor");
        return;
      }
      if (drawings.length === 0) return;
      drawings.pop();
      removeLast();
      persist();
      emit();
    },
    clear: () => {
      if (disposed) return;
      while (removers.length) removeLast();
      drawings = [];
      first = null;
      tool = "cursor";
      persist();
      emit();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        chart.unsubscribeClick(click);
      } catch {
        /* Chart already disposed. */
      }
      while (removers.length) removeLast();
      first = null;
    },
  };
}

export function useChartDrawings(
  chart: IChartApi | null,
  series: ISeriesApi<SeriesType> | null,
  symbol: string,
) {
  const [state, setState] = useState<DrawingState>({ tool: "cursor", count: 0, pending: false });
  const session = useRef<ReturnType<typeof createChartDrawingSession> | null>(null);
  useEffect(() => {
    if (!chart || !series || !symbol) return;
    const current = createChartDrawingSession(chart, series, symbol, setState);
    session.current = current;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") current.cancel();
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
      current.dispose();
      if (session.current === current) session.current = null;
    };
  }, [chart, series, symbol]);
  const setTool = useCallback((tool: ChartDrawingTool) => session.current?.setTool(tool), []);
  const undo = useCallback(() => session.current?.undo(), []);
  const clear = useCallback(() => session.current?.clear(), []);
  return { ...state, setTool, undo, clear };
}
