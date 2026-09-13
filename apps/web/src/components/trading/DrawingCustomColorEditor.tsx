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
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    let h = draft.hsv.h;
    if (event.key === "ArrowUp") h -= 3.6;
    else if (event.key === "ArrowDown") h += 3.6;
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
      <div className="mb-3 flex h-[26px] items-start">
        <span
          aria-label={`Color preview ${preview}`}
          className="size-[26px] shrink-0 rounded border border-transparent"
          style={{ background: preview }}
        />
        <div className="relative ml-2 h-[26px] w-[68px] shrink-0">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[3px] top-1/2 -translate-y-1/2 text-sm leading-normal text-[#dbdbdb]"
          >
            #
          </span>
          <input
            aria-label="Hex color"
            aria-invalid={!validHex}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={draft.hex.replace(/^#/, "")}
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
            className="h-[26px] w-full rounded border border-[#575757] bg-transparent pl-3 pr-[5px] text-sm leading-6 text-[#dbdbdb] outline-none focus:border-[#2962ff] aria-invalid:border-red-400"
          />
        </div>
        <button
          type="submit"
          disabled={!validHex}
          className="ml-auto h-7 shrink-0 rounded-[6px] border border-[#f2f2f2] bg-[#f2f2f2] px-[7px] text-sm leading-[18px] text-[#0f0f0f] hover:border-white hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
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
          className="relative h-[184px] w-[200px] shrink-0 cursor-crosshair touch-none rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          style={{
            backgroundColor: `hsl(${draft.hsv.h} 100% 50%)`,
            backgroundImage:
              "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
          }}
          {...pointerHandlers("plane")}
          onKeyDown={planeKeyDown}
        >
          <span
            className="pointer-events-none absolute -mt-[6px] -ml-[6px] size-[14px] rounded-full border-2 border-white shadow-[0_1px_2px_rgb(0_0_0/50%)]"
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
          className="relative h-[184px] w-[17px] shrink-0 cursor-pointer touch-none rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          style={{
            background:
              "linear-gradient(to bottom, #f00 0, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00)",
          }}
          {...pointerHandlers("hue")}
          onKeyDown={hueKeyDown}
        >
          <span className="pointer-events-none absolute inset-x-0 inset-y-[3px]">
            <span
              className="absolute -left-0.5 -mt-1 h-[9px] w-[21px] rounded-[2px] border-2 border-white shadow-[0_1px_2px_rgb(0_0_0/50%)]"
              style={{ top: `${(draft.hsv.h / 360) * 100}%` }}
            />
          </span>
        </div>
      </div>
    </form>
  );
}
