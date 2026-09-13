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
import {
  clampDrawingInlineTextOrigin,
  drawingInlineTextBox,
  drawingInlineTextIntersectsPane,
} from "./drawingInlineTextBounds";

type Placement = NonNullable<ReturnType<typeof drawingTextPlacement>> & {
  fontFamily: string;
  paneWidth: number;
  paneHeight: number;
  drawingId: string;
  local: NonNullable<ReturnType<typeof drawingTextPlacement>>;
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
  useLayoutEffect(() => {
    const element = input.current;
    const context = document.createElement("canvas").getContext("2d");
    if (!element || !context) return;
    const resize = () => {
      context.font = `${drawing.textItalic ? "italic " : ""}${drawing.textBold ? "bold " : ""}${size}px ${placement.fontFamily}`;
      const width = Math.ceil(
        Math.max(...value.split(/\r?\n/).map((row) => context.measureText(row).width)),
      );
      // Change only dimensions so typing and late font loads preserve the caret.
      element.style.width = `${Math.min(Math.max(60, width + 4), Math.max(60, placement.paneWidth - 12))}px`;
    };
    resize();
    document.fonts.addEventListener("loadingdone", resize);
    return () => document.fonts.removeEventListener("loadingdone", resize);
  }, [
    value,
    size,
    drawing.textBold,
    drawing.textItalic,
    placement.fontFamily,
    placement.paneWidth,
  ]);
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
      rows={rows.length}
      wrap="off"
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
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          finished.current = true;
          cancelTextEdit(drawingId);
        } else if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          finish();
        }
      }}
      className="pointer-events-auto block resize-none overflow-auto rounded-none border border-blue-500/60 bg-[#15171a]/95 p-0 outline-none"
      style={{
        ...style,
        color: drawing.textColor ?? drawing.color,
        width: 60,
        height: Math.min(
          rows.length * size * 1.2 + 2,
          Math.max(size * 1.2 + 2, placement.paneHeight - 12),
        ),
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
    drawings.selectedIds.length === 1 &&
    drawings.isVisible(selected) &&
    drawings.tool === "cursor" &&
    !drawings.settingsOpen &&
    !drawings.contextPoint &&
    supportsInlineDrawingText(selected.kind);
  const measure = useCallback(() => {
    if (!chart || !series || !eligible || !overlay.current) {
      setPlacement(null);
      return;
    }
    const position = drawingTextPlacement(chart, series, selected);
    const pane = series.getPane();
    const element = pane.getHTMLElement();
    if (!element) return;
    const paneRect = element.getBoundingClientRect();
    const bounds = overlay.current.getBoundingClientRect();
    const paneWidth = chart.timeScale().width();
    const paneHeight = pane.getHeight();
    const fontFamily = chart.options().layout.fontFamily;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    const size = selected.textFontSize ?? 14;
    context.font = `${selected.textItalic ? "italic " : ""}${selected.textBold ? "bold " : ""}${size}px ${fontFamily}`;
    const editing = drawings.textEditing;
    const rows = (selected.text || (editing ? "" : "Add text")).split(/\r?\n/);
    const labelWidth = Math.max(...rows.map((row) => context.measureText(row).width));
    const width = editing
      ? Math.min(Math.max(60, Math.ceil(labelWidth) + 4), Math.max(60, paneWidth - 12))
      : labelWidth;
    const height = editing
      ? Math.min(rows.length * size * 1.2 + 2, Math.max(size * 1.2 + 2, paneHeight - 12))
      : rows.length * size * 1.2;
    const leftScaleWidth = chart.priceScale("left", pane.paneIndex()).width();
    setPlacement((current) => {
      // Panning can temporarily remove the projected anchor. The active textarea
      // must retain its DOM node, draft and caret while projection catches up.
      const local =
        position ?? (editing && current?.drawingId === selected.id ? current.local : null);
      const box = local ? drawingInlineTextBox(local, width, height) : null;
      let next: Placement | null = null;
      if (
        local &&
        box &&
        (editing || drawingInlineTextIntersectsPane(box, paneWidth, paneHeight))
      ) {
        const point = editing
          ? clampDrawingInlineTextOrigin(local.point, box, paneWidth, paneHeight)
          : local.point;
        next = {
          ...local,
          local,
          drawingId: selected.id,
          point: {
            x: paneRect.left - bounds.left + leftScaleWidth + point.x,
            y: paneRect.top - bounds.top + point.y,
          },
          fontFamily,
          paneWidth,
          paneHeight,
        };
      }
      return JSON.stringify(current) === JSON.stringify(next) ? current : next;
    });
  }, [chart, series, eligible, selected, drawings.textEditing]);
  const measureRef = useRef(measure);
  useLayoutEffect(() => {
    measureRef.current = measure;
    // Synchronize the overlay with the chart's external DOM projection after layout.
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
    document.fonts.addEventListener("loadingdone", schedule);
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
      document.fonts.removeEventListener("loadingdone", schedule);
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
    textAlign: placement?.align ?? "left",
    whiteSpace: "pre",
    transform: `translate(${placement?.align === "right" ? "-100%" : placement?.align === "center" ? "-50%" : 0}, ${placement?.baseline === "top" ? 0 : placement?.baseline === "middle" ? "-50%" : "-100%"})`,
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
              {selected.text || "Add text"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
