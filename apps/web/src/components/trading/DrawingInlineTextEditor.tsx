import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { drawingTextPlacement, supportsInlineDrawingText } from "./drawingPrimitive";
import type { ChartDrawingsController } from "./useChartDrawings";
import type { ChartDrawing } from "./drawingGeometry";

type Placement = NonNullable<ReturnType<typeof drawingTextPlacement>> & {
  fontFamily: string;
  paneWidth: number;
};

function TextInput({
  drawing,
  drawings,
  placement,
  style,
}: {
  drawing: ChartDrawing;
  drawings: ChartDrawingsController;
  placement: Placement;
  style: CSSProperties;
}) {
  const { commitText, cancelTextEdit, previewText } = drawings;
  const drawingId = drawing.id;
  const input = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);
  const [value, setValue] = useState(drawing.text ?? "");
  const valueRef = useRef(value);
  const size = drawing.textFontSize ?? 14;
  const rows = value.split(/\r?\n/);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    commitText(valueRef.current, drawingId);
  }, [commitText, drawingId]);
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.setSelectionRange(valueRef.current.length, valueRef.current.length);
  }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !input.current?.contains(event.target)) finish();
    };
    // Commit before the chart's pointer handler changes selection or begins a drag.
    document.addEventListener("pointerdown", outside, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      // StrictMode replays effects while the textarea stays mounted. Cancel only
      // after a real removal, once React has detached the ref and DOM node.
      queueMicrotask(() => {
        if (!input.current?.isConnected) cancelTextEdit(drawingId);
      });
    };
  }, [drawingId, cancelTextEdit, finish]);
  return (
    <textarea
      ref={input}
      aria-label="Drawing text"
      placeholder="Add text"
      maxLength={140}
      rows={rows.length}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        valueRef.current = next;
        setValue(next);
        previewText(next);
      }}
      onBlur={finish}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          finished.current = true;
          cancelTextEdit(drawingId);
        } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          finish();
        }
      }}
      className="pointer-events-auto block resize-none overflow-hidden rounded-none border border-blue-500/60 bg-[#15171a]/95 p-0 outline-none"
      style={{
        ...style,
        color: drawing.textColor ?? drawing.color,
        width: Math.min(
          Math.max(60, ...rows.map((row) => row.length * size * 0.65 + 4)),
          Math.max(60, placement.paneWidth - 12),
        ),
        height: rows.length * size * 1.2 + 2,
      }}
    />
  );
}

/** Mount beside DrawingSelectionOverlay in the chart's positioned container. */
export function DrawingInlineTextEditor({
  chart,
  series,
  drawings,
}: {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  drawings: ChartDrawingsController;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const selected = drawings.selected;
  const eligible =
    selected &&
    !selected.locked &&
    drawings.isVisible(selected) &&
    drawings.tool === "cursor" &&
    !drawings.settingsOpen &&
    !drawings.contextPoint &&
    supportsInlineDrawingText(selected.kind);
  const measure = useCallback(() => {
    let next: Placement | null = null;
    if (chart && series && eligible && overlay.current) {
      const position = drawingTextPlacement(chart, series, selected);
      const pane = series.getPane();
      const element = pane.getHTMLElement();
      if (
        position &&
        element &&
        position.point.x >= 0 &&
        position.point.x <= chart.timeScale().width() &&
        position.point.y >= 0 &&
        position.point.y <= pane.getHeight()
      ) {
        const paneRect = element.getBoundingClientRect(),
          bounds = overlay.current.getBoundingClientRect();
        next = {
          ...position,
          point: {
            x:
              paneRect.left -
              bounds.left +
              chart.priceScale("left", pane.paneIndex()).width() +
              position.point.x,
            y: paneRect.top - bounds.top + position.point.y,
          },
          fontFamily: chart.options().layout.fontFamily,
          paneWidth: chart.timeScale().width(),
        };
      }
    }
    setPlacement((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, [chart, series, eligible, selected]);
  const measureRef = useRef(measure);
  useLayoutEffect(() => {
    measureRef.current = measure;
    // Synchronize the overlay with the chart's external DOM projection after layout.
    // eslint-disable-next-line react/set-state-in-effect
    measure();
  }, [measure]);
  useEffect(() => {
    if (!chart || !series || !eligible) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        measureRef.current();
      });
    };
    const scale = chart.timeScale(),
      element = chart.chartElement();
    const pointerMove = (event: PointerEvent) => {
      if (event.buttons) schedule();
    };
    scale.subscribeVisibleLogicalRangeChange(schedule);
    scale.subscribeSizeChange(schedule);
    series.subscribeDataChanged(schedule);
    element.addEventListener("pointermove", pointerMove);
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
      element.removeEventListener("pointermove", pointerMove);
      element.removeEventListener("pointerup", schedule);
      element.removeEventListener("wheel", schedule);
      element.removeEventListener("dblclick", schedule);
    };
  }, [chart, series, eligible]);
  if (!chart || !series) return null;
  const size = selected?.textFontSize ?? 14;
  const style: CSSProperties = {
    fontFamily: placement?.fontFamily,
    fontSize: size,
    fontWeight: selected?.textBold ? "bold" : "normal",
    fontStyle: selected?.textItalic ? "italic" : "normal",
    lineHeight: `${size * 1.2}px`,
    textAlign: placement?.align ?? "center",
    whiteSpace: "pre",
    transform: `translate(${placement?.align === "left" ? 0 : placement?.align === "right" ? "-100%" : "-50%"}, ${placement?.baseline === "top" ? 0 : placement?.baseline === "middle" ? "-50%" : "-100%"})`,
  };
  return (
    <div ref={overlay} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {eligible && placement && (
        <div
          className="absolute"
          style={{
            left: placement.point.x,
            top: placement.point.y,
            transform: `rotate(${placement.angle ?? 0}rad)`,
            transformOrigin: "0 0",
          }}
        >
          {drawings.textEditing ? (
            <TextInput
              key={selected.id}
              drawing={selected}
              drawings={drawings}
              placement={placement}
              style={style}
            />
          ) : (
            <button
              type="button"
              aria-label={selected.text ? "Edit drawing text" : "Add drawing text"}
              onClick={(event) => {
                event.stopPropagation();
                drawings.beginTextEdit();
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              className="pointer-events-auto block cursor-text border-0 bg-transparent p-0 outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              style={{ ...style, color: selected.text ? "transparent" : "#2962ff" }}
            >
              {selected.text || "+ Add text"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
