import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  drawingColorAtPoint,
  drawingHexToHsv,
  drawingHsvToHex,
  normalizeDrawingColorHex,
  type DrawingColorHsv,
} from "./drawingColor";

export function DrawingCustomColorEditor({
  initialColor,
  onAdd,
}: {
  initialColor: string;
  onAdd: (hex: string) => void;
}) {
  const instructionsId = useId();
  const [draft, setDraft] = useState(() => {
    const hex = normalizeDrawingColorHex(initialColor) ?? "#2962ff";
    return { hex, hsv: drawingHexToHsv(hex)! };
  });
  const validHex = normalizeDrawingColorHex(draft.hex);
  const preview = drawingHsvToHex(draft.hsv)!;
  const updateHsv = (hsv: DrawingColorHsv) => {
    const hex = drawingHsvToHex(hsv);
    if (hex) setDraft({ hsv, hex });
  };
  const updatePointer = (event: PointerEvent<HTMLDivElement>, control: "plane" | "hue") => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = drawingColorAtPoint(
      draft.hsv,
      control,
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      bounds,
    );
    if (next) updateHsv(next);
  };
  const pointerHandlers = (control: "plane" | "hue") => ({
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      updatePointer(event, control);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePointer(event, control);
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      updatePointer(event, control);
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    },
  });
  const planeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = { ...draft.hsv },
      step = event.shiftKey ? 0.1 : 0.01;
    if (event.key === "ArrowLeft") next.s -= step;
    else if (event.key === "ArrowRight") next.s += step;
    else if (event.key === "ArrowUp") next.v += step;
    else if (event.key === "ArrowDown") next.v -= step;
    else if (event.key === "Home") next.s = 0;
    else if (event.key === "End") next.s = 1;
    else return;
    event.preventDefault();
    next.s = Math.max(0, Math.min(1, next.s));
    next.v = Math.max(0, Math.min(1, next.v));
    updateHsv(next);
  };
  const hueKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let h = draft.hsv.h;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") h += step;
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") h -= step;
    else if (event.key === "PageUp") h += 10;
    else if (event.key === "PageDown") h -= 10;
    else if (event.key === "Home") h = 0;
    else if (event.key === "End") h = 360;
    else return;
    event.preventDefault();
    updateHsv({ ...draft.hsv, h: Math.max(0, Math.min(360, h)) });
  };
  return (
    <form
      aria-label="Custom drawing color"
      className="h-[246px] w-[248px] bg-[#1f1f1f] p-3 text-zinc-200"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (validHex) onAdd(validHex);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.stopPropagation();
      }}
    >
      <div className="mb-3 flex h-[26px] items-center gap-2">
        <span
          aria-label={`Color preview ${preview}`}
          className="h-[26px] min-w-0 flex-1 rounded-sm border border-white/15"
          style={{ background: preview }}
        />
        <input
          aria-label="Hex color"
          aria-invalid={!validHex}
          autoComplete="off"
          spellCheck={false}
          value={draft.hex}
          maxLength={7}
          onChange={(event) => {
            const hex = event.target.value,
              parsed = drawingHexToHsv(hex);
            setDraft((current) => ({
              hex,
              hsv: parsed
                ? {
                    ...parsed,
                    h: parsed.s === 0 ? current.hsv.h : parsed.h,
                    s: parsed.v === 0 ? current.hsv.s : parsed.s,
                  }
                : current.hsv,
            }));
          }}
          className="h-[26px] w-[68px] shrink-0 rounded border border-white/20 bg-transparent px-1 text-xs outline-none focus:border-blue-500 aria-invalid:border-red-400"
        />
        <button
          type="submit"
          disabled={!validHex}
          className="h-[26px] shrink-0 rounded border border-white/20 px-3 text-xs hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add
        </button>
      </div>
      <span id={instructionsId} className="sr-only">
        Use left and right arrows for saturation, up and down for brightness. Hold Shift for larger
        changes.
      </span>
      <div className="flex gap-[7px]">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Saturation and brightness"
          aria-describedby={instructionsId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(draft.hsv.s * 100)}
          aria-valuetext={`Saturation ${Math.round(draft.hsv.s * 100)}%, brightness ${Math.round(draft.hsv.v * 100)}%`}
          className="relative h-[184px] w-[200px] shrink-0 cursor-crosshair touch-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          style={{
            backgroundColor: `hsl(${draft.hsv.h} 100% 50%)`,
            backgroundImage:
              "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
          }}
          {...pointerHandlers("plane")}
          onKeyDown={planeKeyDown}
        >
          <span
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#000]"
            style={{ left: `${draft.hsv.s * 100}%`, top: `${(1 - draft.hsv.v) * 100}%` }}
          />
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Hue"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(draft.hsv.h)}
          className="relative h-[184px] w-[17px] shrink-0 cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          style={{
            background: "linear-gradient(to bottom, #f00, #f0f, #00f, #0ff, #0f0, #ff0, #f00)",
          }}
          {...pointerHandlers("hue")}
          onKeyDown={hueKeyDown}
        >
          <span
            className="pointer-events-none absolute -left-px h-1.5 w-[19px] -translate-y-1/2 border-2 border-white shadow-[0_0_0_1px_#000]"
            style={{ top: `${(1 - draft.hsv.h / 360) * 100}%` }}
          />
        </div>
      </div>
    </form>
  );
}
