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
import { measureDrawingText, type DrawingTextLayout } from "./drawingTextLayout";
import {
  clampDrawingInlineTextOrigin,
  drawingInlineTextBox,
  drawingInlineTextIntersectsPane,
  fitDrawingInlineTextSize,
} from "./drawingInlineTextBounds";

const ADD_TEXT_LABEL = "+ Add text";

type Placement = NonNullable<ReturnType<typeof drawingTextPlacement>> & {
  fontFamily: string;
  editorLayout: DrawingTextLayout | null;
  editorSize: { width: number; height: number } | null;
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
  const value = drawing.text ?? "";
  const size = drawing.textFontSize ?? 14;
  const rows = value.split(/\r?\n/);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    // The controller owns the draft and merges peer updates. Passing the displayed
    // value back would incorrectly turn an untouched peer label into a local edit.
    commitText(undefined, drawingId);
  }, [commitText, drawingId]);
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true });
    const length = input.current?.value.length ?? 0;
    input.current?.setSelectionRange(length, length);
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
      rows={rows.length}
      wrap={drawing.kind === "text" && drawing.textWrap ? "soft" : "off"}
      value={value}
      onChange={(event) => {
        previewText(event.target.value);
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
        width: placement.editorSize?.width ?? 60,
        padding: placement.editorLayout ? Math.max(0, placement.editorLayout.padding - 1) : 0,
        boxSizing: "border-box",
        whiteSpace: drawing.kind === "text" && drawing.textWrap ? "pre-wrap" : "pre",
        overflowWrap: drawing.kind === "text" && drawing.textWrap ? "anywhere" : "normal",
        height: placement.editorSize?.height ?? rows.length * size * 1.2 + 2,
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
  const [hoveredTextId, setHoveredTextId] = useState<string | null>(null);
  const selected = drawings.selected;
  const showPlaceholder =
    selected?.kind === "text" ||
    drawings.hovered?.id === selected?.id ||
    hoveredTextId === selected?.id;
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
    const paneWidth = chart.paneSize().width;
    const paneHeight = pane.getHeight();
    const fontFamily = chart.options().layout.fontFamily;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    const size = selected.textFontSize ?? 14;
    context.font = `${selected.textItalic ? "italic " : ""}${selected.textBold ? "bold " : ""}${size}px ${fontFamily}`;
    const editing = drawings.textEditing;
    const rows = (selected.text || (editing ? "" : ADD_TEXT_LABEL)).split(/\r?\n/);
    const labelWidth = Math.max(...rows.map((row) => context.measureText(row).width));
    const width = editing ? Math.max(60, Math.ceil(labelWidth) + 4) : labelWidth;
    const height = editing ? rows.length * size * 1.2 + 2 : rows.length * size * 1.2;
    const leftScaleWidth = chart.priceScale("left", pane.paneIndex()).width();
    setPlacement((current) => {
      // Panning can temporarily remove the projected anchor. The active textarea
      // must retain its DOM node, draft and caret while projection catches up.
      const local =
        position ?? (editing && current?.drawingId === selected.id ? current.local : null);
      let layout =
        local && selected.kind === "text"
          ? measureDrawingText(
              selected,
              { ...local, value: selected.text || (editing ? "" : ADD_TEXT_LABEL) },
              fontFamily,
              (text, font) => {
                context.font = font;
                return context.measureText(text).width;
              },
            )
          : null;
      // Size in the label's local axes before translating its rotated box into the pane.
      // The textarea scrolls overflowing content without changing the drawing's font or anchors.
      const editorSize =
        editing && local
          ? fitDrawingInlineTextSize(
              layout?.width ?? width,
              layout?.height ?? height,
              local.angle ?? 0,
              paneWidth,
              paneHeight,
            )
          : null;
      // A temporarily collapsed pane must not unmount the textarea and cancel its draft.
      if (editorSize && (editorSize.width <= 0 || editorSize.height <= 0)) return current;
      if (layout && editorSize) layout = { ...layout, ...editorSize };
      const box = local
        ? drawingInlineTextBox(
            layout
              ? {
                  ...local,
                  point: { x: local.point.x + layout.left, y: local.point.y + layout.top },
                  align: "left",
                  baseline: "top",
                }
              : local,
            editorSize?.width ?? layout?.width ?? width,
            editorSize?.height ?? layout?.height ?? height,
          )
        : null;
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
          editorLayout: layout,
          editorSize,
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
    transform: placement?.editorLayout
      ? `translate(${placement.editorLayout.left}px, ${placement.editorLayout.top}px)`
      : `translate(${placement?.align === "right" ? "-100%" : placement?.align === "center" ? "-50%" : 0}, ${placement?.baseline === "top" ? 0 : placement?.baseline === "middle" ? "-50%" : "-100%"})`,
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
                setHoveredTextId(null);
                drawings.beginTextEdit();
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onPointerEnter={() => setHoveredTextId(selected.id)}
              onPointerLeave={() => setHoveredTextId(null)}
              className={`block cursor-text border-0 bg-transparent p-0 outline-none focus-visible:ring-1 focus-visible:ring-blue-500 ${
                selected.text || showPlaceholder
                  ? "pointer-events-auto"
                  : "pointer-events-none opacity-0 focus:pointer-events-auto focus:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
              }`}
              style={{
                ...style,
                color: selected.text ? "transparent" : "#2962ff",
                ...(placement.editorLayout
                  ? {
                      clipPath: selected.textWrap ? "inset(0 7px 0 0)" : undefined,
                      width: placement.editorLayout.width,
                      height: placement.editorLayout.height,
                      padding: placement.editorLayout.padding,
                      boxSizing: "border-box",
                      whiteSpace: selected.textWrap ? "pre-wrap" : "pre",
                      overflowWrap: selected.textWrap ? "anywhere" : "normal",
                    }
                  : {}),
              }}
            >
              {selected.text || ADD_TEXT_LABEL}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
