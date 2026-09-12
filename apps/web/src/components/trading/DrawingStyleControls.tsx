import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import type { ChartDrawing } from "./drawingGeometry";
import type { DrawingPatch } from "./useChartDrawings";
import { cn } from "../../lib/utils";
const colors = [
  "#ffffff",
  "#b2b5be",
  "#787b86",
  "#131722",
  "#f23645",
  "#ff9800",
  "#ffeb3b",
  "#4caf50",
  "#089981",
  "#00bcd4",
  "#2962ff",
  "#729bff",
  "#9c27b0",
  "#e040fb",
];
export const inputClass =
  "h-9 rounded border border-white/15 bg-transparent px-2.5 text-[13px] text-zinc-200 outline-none focus:border-blue-500";
export function ColorPicker({
  value,
  onChange,
  label = "Line color",
}: {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className="flex size-8 items-center justify-center rounded hover:bg-white/10"
      >
        <span className="size-4 rounded-sm border border-white/20" style={{ background: value }} />
      </PopoverTrigger>
      <PopoverPopup
        style={{ background: "#1f1f1f", backdropFilter: "none" }}
        className="w-56"
        viewportClassName="p-3"
      >
        <PopoverTitle className="sr-only">{label}</PopoverTitle>
        <div className="grid grid-cols-7 gap-2">
          {colors.map((color) => (
            <button
              type="button"
              key={color}
              aria-label={`${label} ${color}`}
              aria-pressed={value === color}
              onClick={() => onChange(color)}
              className={cn(
                "size-5 rounded-sm border border-white/10",
                color === value && "ring-2 ring-white ring-offset-2 ring-offset-[#1e222d]",
              )}
              style={{ background: color }}
            />
          ))}
        </div>
        <label className="mt-4 flex items-center justify-between text-xs text-zinc-400">
          Custom color
          <input
            type="color"
            aria-label={`Custom ${label.toLowerCase()}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-10 bg-transparent"
          />
        </label>
      </PopoverPopup>
    </Popover>
  );
}
export function LineStylePicker({
  drawing,
  onChange,
}: {
  drawing: ChartDrawing;
  onChange: (patch: DrawingPatch) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Line style"
        className="flex size-8 items-center justify-center rounded hover:bg-white/10"
      >
        <svg width="22" height="12" aria-hidden="true">
          <line
            x1="1"
            y1="6"
            x2="21"
            y2="6"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={
              drawing.lineStyle === "dashed"
                ? "6 3"
                : drawing.lineStyle === "dotted"
                  ? "2 3"
                  : undefined
            }
          />
        </svg>
      </PopoverTrigger>
      <PopoverPopup
        style={{ background: "#1f1f1f", backdropFilter: "none" }}
        className="w-44"
        viewportClassName="p-1"
      >
        <PopoverTitle className="sr-only">Line style</PopoverTitle>
        {(["solid", "dashed", "dotted"] as const).map((style) => (
          <button
            type="button"
            key={style}
            aria-pressed={(drawing.lineStyle ?? "solid") === style}
            onClick={() => onChange({ lineStyle: style })}
            className="flex w-full items-center gap-3 rounded px-3 py-2 text-[13px] capitalize hover:bg-white/10 aria-pressed:bg-zinc-100 aria-pressed:text-zinc-950"
          >
            <svg width="35" height="12" aria-hidden="true">
              <line
                x1="0"
                y1="6"
                x2="35"
                y2="6"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={
                  style === "dashed" ? "7 4" : style === "dotted" ? "2 4" : undefined
                }
              />
            </svg>
            {style}
          </button>
        ))}
      </PopoverPopup>
    </Popover>
  );
}
export function WidthPicker({
  drawing,
  onChange,
}: {
  drawing: ChartDrawing;
  onChange: (patch: DrawingPatch) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Line width"
        className="h-8 rounded px-2 text-[13px] hover:bg-white/10"
      >
        {drawing.width}px
      </PopoverTrigger>
      <PopoverPopup
        style={{ background: "#1f1f1f", backdropFilter: "none" }}
        className="w-36"
        viewportClassName="p-1"
      >
        <PopoverTitle className="sr-only">Line width</PopoverTitle>
        {[1, 2, 3, 4].map((width) => (
          <button
            type="button"
            key={width}
            aria-pressed={drawing.width === width}
            onClick={() => onChange({ width })}
            className="flex w-full items-center gap-3 rounded px-3 py-2 text-[13px] hover:bg-white/10 aria-pressed:bg-zinc-100 aria-pressed:text-zinc-950"
          >
            <span className="w-10 bg-current" style={{ height: width }} />
            {width}px
          </button>
        ))}
      </PopoverPopup>
    </Popover>
  );
}
export function MarkerPicker({
  side,
  value,
  onChange,
}: {
  side: "start" | "end";
  value: "normal" | "arrow";
  onChange: (value: "normal" | "arrow") => void;
}) {
  const glyph = (marker: "normal" | "arrow") => (
    <svg
      width="24"
      height="20"
      viewBox="0 0 24 20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      style={{ transform: side === "start" ? "scaleX(-1)" : undefined }}
    >
      <path d="M2 10H18" />
      {marker === "arrow" ? <path d="m14 6 5 4-5 4" /> : <circle cx="19" cy="10" r="2" />}
    </svg>
  );
  return (
    <Popover>
      <PopoverTrigger
        aria-label={side === "start" ? "Start marker" : "End marker"}
        className="flex size-8 items-center justify-center rounded border border-white/20 hover:bg-white/10"
      >
        {glyph(value)}
      </PopoverTrigger>
      <PopoverPopup
        style={{ background: "#202020", backdropFilter: "none" }}
        className="w-40"
        viewportClassName="p-1"
      >
        <PopoverTitle className="sr-only">Line end</PopoverTitle>
        {(["normal", "arrow"] as const).map((marker) => (
          <button
            key={marker}
            type="button"
            aria-pressed={value === marker}
            onClick={() => onChange(marker)}
            className="flex w-full items-center gap-3 rounded px-3 py-2 text-sm capitalize hover:bg-white/10 aria-pressed:bg-white/15"
          >
            {glyph(marker)}
            {marker}
          </button>
        ))}
      </PopoverPopup>
    </Popover>
  );
}
export function LineAppearancePicker({
  drawing,
  onChange,
}: {
  drawing: ChartDrawing;
  onChange: (patch: DrawingPatch) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Line appearance"
        className="flex h-8 items-center gap-2 rounded border border-white/20 px-1.5 hover:bg-white/10"
      >
        <span className="size-5 rounded" style={{ background: drawing.color }} />
        <svg width="28" height="16" aria-hidden="true">
          <path
            d="M0 8H28"
            stroke="currentColor"
            strokeWidth={drawing.width}
            strokeDasharray={
              drawing.lineStyle === "dashed"
                ? "6 3"
                : drawing.lineStyle === "dotted"
                  ? "2 3"
                  : undefined
            }
          />
        </svg>
      </PopoverTrigger>
      <PopoverPopup
        style={{ background: "#202020", backdropFilter: "none" }}
        className="w-48"
        viewportClassName="p-2"
      >
        <PopoverTitle className="sr-only">Line appearance</PopoverTitle>
        <div className="flex items-center justify-between">
          <ColorPicker value={drawing.color} onChange={(color) => onChange({ color })} />
          <WidthPicker drawing={drawing} onChange={onChange} />
          <LineStylePicker drawing={drawing} onChange={onChange} />
        </div>
      </PopoverPopup>
    </Popover>
  );
}
export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-[14px] text-zinc-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[#2962ff]"
      />
      {label}
    </label>
  );
}
