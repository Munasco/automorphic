import { Slider } from "@base-ui/react/slider";
import { NumberField } from "@base-ui/react/number-field";
import { DrawingToolIcon } from "./DrawingToolIcon";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import type { ChartDrawing } from "./drawingGeometry";
import type { DrawingPatch } from "./useChartDrawings";
import { cn } from "../../lib/utils";
import type { ComponentProps } from "react";
import { TradingSelect } from "./TradingSelect";
const colors = [
  "#ffffff",
  "#dbdbdb",
  "#b8b8b8",
  "#9c9c9c",
  "#808080",
  "#636363",
  "#4a4a4a",
  "#2e2e2e",
  "#0f0f0f",
  "#000000",
  "#f23645",
  "#ff9800",
  "#ffeb3b",
  "#4caf50",
  "#089981",
  "#00bcd4",
  "#2962ff",
  "#673ab7",
  "#9c27b0",
  "#e91e63",
  "#fccbcd",
  "#ffe0b2",
  "#fff9c4",
  "#c8e6c9",
  "#ace5dc",
  "#b2ebf2",
  "#bbd9fb",
  "#d1c4e9",
  "#e1bee7",
  "#f8bbd0",
  "#faa1a4",
  "#ffcc80",
  "#fff59d",
  "#a5d6a7",
  "#70ccbd",
  "#80deea",
  "#90bff9",
  "#b39ddb",
  "#ce93d8",
  "#f48fb1",
  "#f77c80",
  "#ffb74d",
  "#fff176",
  "#81c784",
  "#42bda8",
  "#4dd0e1",
  "#5b9cf6",
  "#9575cd",
  "#ba68c8",
  "#f06292",
  "#f7525f",
  "#ffa726",
  "#ffee58",
  "#66bb6a",
  "#22ab94",
  "#26c6da",
  "#3179f5",
  "#7e57c2",
  "#ab47bc",
  "#ec407a",
  "#b22833",
  "#f57c00",
  "#fbc02d",
  "#388e3c",
  "#056656",
  "#0097a7",
  "#1848cc",
  "#512da8",
  "#7b1fa2",
  "#c2185b",
  "#801922",
  "#e65100",
  "#f57f17",
  "#1b5e20",
  "#00332a",
  "#006064",
  "#0c3299",
  "#311b92",
  "#4a148c",
  "#880e4f",
];
export const inputClass =
  "h-[34px] rounded border border-white/15 bg-transparent px-2.5 text-sm leading-[18px] text-zinc-200 outline-none focus:border-blue-500";
export function ColorPicker({
  value,
  onChange,
  label = "Line color",
  mixed = false,
  icon,
  opacity,
  onOpacityChange,
  variant = "default",
}: {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  mixed?: boolean;
  icon?: "pencil" | "letter-t";
  variant?: "default" | "settings";
  opacity?: number | undefined;
  onOpacityChange?: (opacity: number) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "flex shrink-0 items-center justify-center rounded hover:bg-white/10",
          variant === "settings" ? "size-[34px] border border-white/15" : "size-8",
        )}
      >
        {icon ? (
          <span className="relative flex size-6 items-center justify-center pb-1">
            <DrawingToolIcon name={icon} className="size-5" />
            <span
              className="absolute inset-x-0 bottom-0 h-0.5 rounded"
              style={{ background: value }}
            />
          </span>
        ) : (
          <span
            className={cn(
              "rounded-sm border border-white/20",
              variant === "settings" ? "size-6" : "size-4",
            )}
            style={{
              background: mixed
                ? "conic-gradient(#f23645 0 25%, #2962ff 0 50%, #4caf50 0 75%, #ff9800 0)"
                : value,
            }}
          />
        )}
      </PopoverTrigger>
      <PopoverPopup
        instant
        style={{ background: "#1f1f1f", backdropFilter: "none" }}
        className="w-[250px]"
        viewportClassName="p-3"
      >
        <PopoverTitle className="sr-only">{label}</PopoverTitle>
        <div className="grid grid-cols-10 gap-[6px]">
          {colors.map((color, index) => (
            <button
              type="button"
              key={color}
              aria-label={`${label} ${color}`}
              aria-pressed={value === color}
              onClick={() => onChange(color)}
              className={cn(
                "size-[17px] rounded-[1px] border border-white/10",
                index >= 20 && index < 30 && "mt-[6px]",
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
        {opacity !== undefined && onOpacityChange ? (
          <OpacityControl label={`${label} opacity`} value={opacity} onChange={onOpacityChange} />
        ) : null}
      </PopoverPopup>
    </Popover>
  );
}
export function OpacityControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
      <div className="text-xs text-zinc-300">Opacity</div>
      <div className="flex items-center gap-3">
        <Slider.Root
          min={0}
          max={100}
          value={percent}
          onValueChange={(next) => onChange(Number(next) / 100)}
          className="flex-1"
        >
          <Slider.Control className="relative flex h-6 w-full touch-none items-center">
            <Slider.Track className="relative h-1 w-full rounded bg-zinc-600">
              <Slider.Indicator className="rounded bg-[#2962ff]" />
              <Slider.Thumb
                getAriaLabel={() => `${label} slider`}
                className="size-3 rounded-full border-2 border-[#2962ff] bg-[#202020] outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
        <NumberField.Root
          value={percent}
          min={0}
          max={100}
          allowWheelScrub={false}
          onValueChange={(next) => {
            if (next !== null && Number.isFinite(next) && next !== percent)
              onChange(Math.min(100, Math.max(0, next)) / 100);
          }}
          className="flex h-8 items-center gap-1 rounded border border-white/15 px-2 text-xs text-zinc-300"
        >
          <NumberField.Input
            aria-label={label}
            className="w-8 bg-transparent text-right outline-none"
          />
          %
        </NumberField.Root>
      </div>
    </div>
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
        instant
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
  mixed = false,
}: {
  drawing: ChartDrawing;
  mixed?: boolean;
  onChange: (patch: DrawingPatch) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Line width"
        className="h-8 rounded px-2 text-[13px] hover:bg-white/10"
      >
        {mixed ? (
          <svg width="22" height="18" aria-hidden="true" stroke="currentColor">
            <path d="M1 3H21" strokeWidth="1" />
            <path d="M1 9H21" strokeWidth="2" />
            <path d="M1 15H21" strokeWidth="3" />
          </svg>
        ) : (
          `${drawing.width}px`
        )}
      </PopoverTrigger>
      <PopoverPopup
        instant
        style={{ background: "#1f1f1f", backdropFilter: "none" }}
        className="w-36"
        viewportClassName="p-1"
      >
        <PopoverTitle className="sr-only">Line width</PopoverTitle>
        {[1, 2, 3, 4].map((width) => (
          <button
            type="button"
            key={width}
            aria-pressed={!mixed && drawing.width === width}
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
        className="flex size-[34px] shrink-0 items-center justify-center rounded border border-white/20 hover:bg-white/10"
      >
        {glyph(value)}
      </PopoverTrigger>
      <PopoverPopup
        instant
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
  label = "Line appearance",
  fillOpacity,
  onFillOpacityChange,
}: {
  drawing: ChartDrawing;
  label?: string;
  fillOpacity?: number;
  onFillOpacityChange?: (opacity: number) => void;
  onChange: (patch: DrawingPatch) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className="flex h-[34px] w-[75px] shrink-0 items-center gap-1 rounded border border-white/20 p-1 hover:bg-white/10"
      >
        <span className="size-6 shrink-0 rounded" style={{ background: drawing.color }} />
        <svg width="28" height="16" aria-hidden="true">
          <path
            d="M0 8H28"
            stroke={drawing.color}
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
        instant
        style={{ background: "#202020", backdropFilter: "none" }}
        className="w-48"
        viewportClassName="p-2"
      >
        <PopoverTitle className="sr-only">{label}</PopoverTitle>
        <div className="flex items-center justify-between">
          <ColorPicker
            value={drawing.color}
            onChange={(color) => onChange({ color })}
            opacity={fillOpacity === undefined ? (drawing.lineOpacity ?? 1) : undefined}
            onOpacityChange={(lineOpacity) => onChange({ lineOpacity })}
          />
          <WidthPicker drawing={drawing} onChange={onChange} />
          <LineStylePicker drawing={drawing} onChange={onChange} />
        </div>
        {fillOpacity !== undefined && onFillOpacityChange ? (
          <OpacityControl
            label={`${label} opacity`}
            value={fillOpacity}
            onChange={onFillOpacityChange}
          />
        ) : null}
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
    <label className="flex cursor-pointer items-center gap-2 text-sm leading-[18px] text-zinc-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-[18px] shrink-0 accent-[#2962ff]"
      />
      {label}
    </label>
  );
}

export function DrawingSelect({ className, ...props }: ComponentProps<typeof TradingSelect>) {
  return (
    <TradingSelect
      {...props}
      className={cn(
        inputClass,
        "min-h-[34px] shadow-none before:hidden dark:bg-transparent sm:min-h-[34px] sm:text-sm focus-visible:ring-1",
        className,
      )}
    />
  );
}
