import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { drawingContextMenuStyle } from "./drawingContextMenuStyles";
import { Slider } from "@base-ui/react/slider";
import { NumberField } from "@base-ui/react/number-field";
import { DrawingToolIcon } from "./DrawingToolIcon";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import type { ChartDrawing } from "./drawingGeometry";
import type { DrawingPatch } from "./useChartDrawings";
import { cn } from "../../lib/utils";
import { useRef, useState, type ComponentProps } from "react";
import { DrawingCustomColorEditor } from "./DrawingCustomColorEditor";
import { useDrawingCustomColors } from "./drawingCustomColors";
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
  variant?: "default" | "settings" | "toolbar";
  opacity?: number | undefined;
  onOpacityChange?: (opacity: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "flex shrink-0 items-center justify-center rounded hover:bg-white/10",
          variant === "settings"
            ? "size-[34px] border border-white/15"
            : variant === "toolbar"
              ? "size-[38px] aria-expanded:bg-white/10"
              : "size-8",
        )}
      >
        {icon ? (
          <span className="relative flex size-6 items-center justify-center pb-1">
            <DrawingToolIcon name={icon} className={variant === "toolbar" ? "size-4" : "size-5"} />
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
        style={{ background: "#1f1f1f", backdropFilter: "none", border: 0 }}
        align="start"
        sideOffset={variant === "toolbar" ? 2 : 0}
        className={cn("w-[250px] rounded border-0", variant === "toolbar" && "w-[248px]")}
        viewportClassName="p-0"
      >
        <PopoverTitle className="sr-only">{label}</PopoverTitle>
        <ColorSettingsPanel
          value={value}
          onChange={(color) => {
            onChange(color);
            if (variant === "toolbar") setOpen(false);
          }}
          label={label}
          opacity={opacity}
          onOpacityChange={onOpacityChange}
        />
      </PopoverPopup>
    </Popover>
  );
}
function ColorSettingsPanel({
  value,
  onChange,
  label,
  opacity,
  onOpacityChange,
  drawing,
  onDrawingChange,
}: {
  value: string;
  onChange: (color: string) => void;
  label: string;
  opacity?: number | undefined;
  onOpacityChange?: ((opacity: number) => void) | undefined;
  drawing?: ChartDrawing;
  onDrawingChange?: (patch: DrawingPatch) => void;
}) {
  const [custom, setCustom] = useState(false);
  const customColors = useDrawingCustomColors((state) => state.colors);
  const addCustomColor = useDrawingCustomColors((state) => state.addColor);
  if (custom) {
    return (
      <DrawingCustomColorEditor
        initialColor={value}
        onAdd={(color) => {
          addCustomColor(color);
          onChange(color);
          setCustom(false);
        }}
      />
    );
  }
  return (
    <div className="py-1.5 text-zinc-200">
      <div className="w-[248px] px-3 py-1.5">
        <div className="-mx-[3px] grid grid-cols-10">
          {colors.map((color, index) => (
            <button
              type="button"
              key={color}
              aria-label={`${label} ${color}`}
              aria-pressed={value.toLowerCase() === color}
              onClick={() => onChange(color)}
              className={cn(
                "m-[3px] size-[17px] rounded-[1px] border border-white/10",
                index >= 20 && index < 30 && "mt-[9px]",
                color === value.toLowerCase() &&
                  "ring-2 ring-white ring-offset-2 ring-offset-[#202020]",
              )}
              style={{ background: color }}
            />
          ))}
        </div>
        <div className="my-3 h-px bg-[#4a4a4a]" />
        <div className="-mx-[3px] flex flex-wrap items-center">
          {customColors.map((color) => (
            <button
              type="button"
              key={color}
              aria-label={`${label} custom ${color}`}
              aria-pressed={value === color}
              onClick={() => onChange(color)}
              className="m-[3px] size-[17px] rounded-[1px] border border-white/20 aria-pressed:ring-2 aria-pressed:ring-white"
              style={{ background: color }}
            />
          ))}
          <button
            type="button"
            aria-label="Add custom color"
            onClick={() => setCustom(true)}
            className="m-[3px] flex size-[17px] items-center justify-center rounded hover:bg-white/10"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M9 3v12M3 9h12" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        {opacity !== undefined && onOpacityChange ? (
          <OpacityControl
            label={`${label} opacity`}
            value={opacity}
            onChange={onOpacityChange}
            compact
          />
        ) : null}
      </div>
      {drawing && onDrawingChange ? (
        <div className="space-y-3 px-3 pt-1.5">
          <div>
            <div className="mb-1 text-xs leading-[14px]">Thickness</div>
            <div className="flex h-8 overflow-hidden rounded border border-white/15">
              {[1, 2, 3, 4].map((width) => (
                <button
                  key={width}
                  type="button"
                  aria-label={`${width}px thickness`}
                  aria-pressed={drawing.width === width}
                  onClick={() => onDrawingChange({ width })}
                  className="flex min-w-0 flex-1 items-center justify-center border-r border-white/15 last:border-r-0 hover:bg-white/10 aria-pressed:bg-white/20"
                >
                  <svg width="26" height="16" aria-hidden="true">
                    <path d="M0 8h26" stroke="currentColor" strokeWidth={width} />
                  </svg>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs leading-[14px]">Line style</div>
            <div className="flex h-8 overflow-hidden rounded border border-white/15">
              {(["solid", "dashed", "dotted"] as const).map((lineStyle) => (
                <button
                  key={lineStyle}
                  type="button"
                  aria-label={`${lineStyle} line`}
                  aria-pressed={drawing.lineStyle === lineStyle}
                  onClick={() => onDrawingChange({ lineStyle })}
                  className="flex min-w-0 flex-1 items-center justify-center border-r border-white/15 last:border-r-0 hover:bg-white/10 aria-pressed:bg-white/20"
                >
                  <svg width="40" height="16" aria-hidden="true">
                    <path
                      d="M0 8h40"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray={
                        lineStyle === "dashed" ? "6 3" : lineStyle === "dotted" ? "2 3" : undefined
                      }
                    />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
export function OpacityControl({
  label,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  compact?: boolean;
}) {
  const percent = Math.round(value * 100);
  return (
    <div
      className={cn(
        "mt-3 space-y-2 border-t border-white/10 pt-3",
        compact && "space-y-1 border-0 pt-0",
      )}
    >
      <div className="text-xs leading-[14px] text-zinc-300">Opacity</div>
      <div className={cn("flex items-center gap-3", compact && "gap-2")}>
        <Slider.Root
          min={0}
          max={100}
          value={percent}
          onValueChange={(next) => onChange(Number(next) / 100)}
          className="flex-1"
        >
          <Slider.Control className="relative flex h-6 w-full touch-none items-center">
            <Slider.Track
              className={cn(
                "relative h-1 w-full rounded bg-zinc-600",
                compact && "h-[10px] border border-white bg-transparent",
              )}
            >
              <Slider.Indicator className={cn("rounded bg-[#2962ff]", compact && "bg-zinc-200")} />
              <Slider.Thumb
                getAriaLabel={() => `${label} slider`}
                className={cn(
                  "size-3 rounded-full border-2 border-[#2962ff] bg-[#202020] outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  compact && "border-white",
                )}
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
          className={cn(
            "flex h-8 items-center gap-1 rounded border border-white/15 px-2 text-xs text-zinc-300",
            compact && "h-[26px] w-[47px] shrink-0 gap-0 px-[5px] text-sm leading-6",
          )}
        >
          <NumberField.Input
            aria-label={label}
            className={cn(
              "w-8 bg-transparent text-right outline-none",
              compact && "min-w-0 flex-1",
            )}
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
  variant = "default",
}: {
  drawing: ChartDrawing;
  onChange: (patch: DrawingPatch) => void;
  variant?: "default" | "toolbar";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Line style"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded hover:bg-white/10 aria-expanded:bg-white/10",
          variant === "toolbar" && "size-[38px]",
        )}
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
        align="start"
        sideOffset={2}
        style={{
          background: "#1f1f1f",
          backdropFilter: "none",
          border: 0,
          fontFamily: '-apple-system, system-ui, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        }}
        className="w-max rounded"
        viewportClassName="px-0 py-1.5"
      >
        <PopoverTitle className="sr-only">Line style</PopoverTitle>
        {(
          [
            ["solid", "Line"],
            ["dashed", "Dashed line"],
            ["dotted", "Dotted line"],
          ] as const
        ).map(([style, label]) => (
          <button
            type="button"
            key={style}
            aria-pressed={(drawing.lineStyle ?? "solid") === style}
            onClick={() => {
              onChange({ lineStyle: style });
              setOpen(false);
            }}
            className="flex h-8 w-full items-center gap-1.5 whitespace-nowrap pl-2 pr-5 text-sm hover:bg-white/10 aria-pressed:bg-white/15"
          >
            <svg width="28" height="28" aria-hidden="true">
              <line
                x1="4"
                y1="14"
                x2="24"
                y2="14"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={
                  style === "dashed" ? "7 4" : style === "dotted" ? "2 4" : undefined
                }
              />
            </svg>
            {label}
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
  variant = "default",
  compact = false,
}: {
  drawing: ChartDrawing;
  mixed?: boolean;
  compact?: boolean;
  onChange: (patch: DrawingPatch) => void;
  variant?: "default" | "toolbar";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Line width"
        className={cn(
          "flex h-8 shrink-0 items-center justify-center gap-2 rounded px-2 text-sm hover:bg-white/10 aria-expanded:bg-white/10",
          variant === "toolbar" && "h-[38px] gap-[7px] pl-[10px] pr-[11px]",
        )}
      >
        {mixed ? (
          <svg width="22" height="18" aria-hidden="true" stroke="currentColor">
            <path d="M1 3H21" strokeWidth="1" />
            <path d="M1 9H21" strokeWidth="2" />
            <path d="M1 15H21" strokeWidth="3" />
          </svg>
        ) : (
          <>
            {variant === "toolbar" && !compact ? (
              <span className="w-[18px] bg-current" style={{ height: drawing.width }} />
            ) : null}
            {drawing.width}px
          </>
        )}
      </PopoverTrigger>
      <PopoverPopup
        instant
        align="start"
        sideOffset={2}
        style={{
          background: "#1f1f1f",
          backdropFilter: "none",
          border: 0,
          fontFamily: '-apple-system, system-ui, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        }}
        className="w-max rounded"
        viewportClassName="px-0 py-1.5"
      >
        <PopoverTitle className="sr-only">Line width</PopoverTitle>
        {[1, 2, 3, 4].map((width) => (
          <button
            type="button"
            key={width}
            aria-pressed={!mixed && drawing.width === width}
            onClick={() => {
              onChange({ width });
              setOpen(false);
            }}
            className="flex h-8 w-full items-center gap-[11px] whitespace-nowrap pl-[13px] pr-[14px] text-sm hover:bg-white/10 aria-pressed:bg-white/15"
          >
            <span className="w-[18px] bg-current" style={{ height: width }} />
            {width}px
          </button>
        ))}
      </PopoverPopup>
    </Popover>
  );
}
export function DrawingMultiSelect<T extends string>({
  label,
  placeholder,
  options,
  selected,
  onCheckedChange,
}: {
  label: string;
  placeholder: string;
  options: readonly (readonly [T, string])[];
  selected: readonly T[];
  onCheckedChange: (key: T, checked: boolean) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedOptions = options.filter(([key]) => selected.includes(key));
  return (
    <Menu
      onOpenChange={(open, details) => {
        // Checkbox menus stay open while the pointer returns to the chart.
        if (!open && details.reason === "trigger-hover") details.cancel();
      }}
    >
      <MenuTrigger
        ref={triggerRef}
        openOnHover={false}
        aria-label={label}
        title={selectedOptions.map(([, text]) => text).join(", ") || placeholder}
        className="group flex h-[34px] w-[180px] shrink-0 items-center gap-2 rounded border border-white/15 bg-transparent px-2 text-sm leading-[18px] text-zinc-200 outline-none hover:border-white/30 focus-visible:border-blue-500 aria-expanded:border-white/50"
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selectedOptions.length
            ? selectedOptions.map(([key, text], index) => (
                <span key={key}>
                  {index > 0 && ",\u00a0"}
                  <span className="inline-block">{text}</span>
                </span>
              ))
            : placeholder}
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          aria-hidden="true"
          className="shrink-0 group-aria-expanded:rotate-180"
        >
          <path fill="currentColor" d="M4 7 9 11.5 14 7l-1-1-4 3.5L5 6Z" />
        </svg>
      </MenuTrigger>
      <MenuPopup
        finalFocus={triggerRef}
        align="start"
        sideOffset={0}
        style={drawingContextMenuStyle}
        className="w-[180px] rounded-[10px] [&>div]:p-1.5"
      >
        {options.map(([key, text]) => {
          const checked = selected.includes(key);
          return (
            <MenuPrimitive.CheckboxItem
              key={key}
              checked={checked}
              closeOnClick={false}
              onCheckedChange={(value) => onCheckedChange(key, value)}
              className="flex h-8 items-center gap-2.5 rounded px-2 text-sm leading-[18px] whitespace-nowrap outline-none data-highlighted:bg-white/10"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-[18px] shrink-0 items-center justify-center rounded-[3px] border",
                  checked ? "border-zinc-200 bg-zinc-200 text-zinc-900" : "border-zinc-400",
                )}
              >
                <MenuPrimitive.CheckboxItemIndicator>
                  <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                    <path stroke="currentColor" strokeWidth="2" d="M1 4 4 7 10 1" />
                  </svg>
                </MenuPrimitive.CheckboxItemIndicator>
              </span>
              {text}
            </MenuPrimitive.CheckboxItem>
          );
        })}
      </MenuPopup>
    </Menu>
  );
}
export function LineExtensionPicker({
  left,
  right,
  onChange,
}: {
  left: boolean;
  right: boolean;
  onChange: (patch: Pick<DrawingPatch, "extendLeft" | "extendRight">) => void;
}) {
  return (
    <DrawingMultiSelect
      label="Extend line"
      placeholder="Don't extend"
      options={
        [
          ["extendLeft", "Extend left line"],
          ["extendRight", "Extend right line"],
        ] as const
      }
      selected={[
        ...(left ? ["extendLeft" as const] : []),
        ...(right ? ["extendRight" as const] : []),
      ]}
      onCheckedChange={(key, value) => onChange({ [key]: value })}
    />
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
  const [open, setOpen] = useState(false);
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
    <Popover open={open} onOpenChange={setOpen}>
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
            onClick={() => {
              onChange(marker);
              setOpen(false);
            }}
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
  disabled = false,
}: {
  drawing: ChartDrawing;
  label?: string;
  fillOpacity?: number;
  onFillOpacityChange?: (opacity: number) => void;
  disabled?: boolean;
  onChange: (patch: DrawingPatch) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        disabled={disabled}
        className="flex h-[34px] w-[75px] shrink-0 items-center gap-1 rounded border border-white/20 p-1 hover:bg-white/10 disabled:opacity-40"
      >
        <span
          className="size-6 shrink-0 rounded"
          style={{ background: drawing.color, opacity: fillOpacity ?? drawing.lineOpacity ?? 1 }}
        />
        <svg
          width="28"
          height="16"
          aria-hidden="true"
          opacity={fillOpacity ?? drawing.lineOpacity ?? 1}
        >
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
        style={{ background: "#202020", backdropFilter: "none", border: 0 }}
        align="start"
        sideOffset={0}
        className="w-[250px] rounded border-0"
        viewportClassName="p-0"
      >
        <PopoverTitle className="sr-only">{label}</PopoverTitle>
        <ColorSettingsPanel
          label={label}
          value={drawing.color}
          onChange={(color) => onChange({ color })}
          opacity={fillOpacity ?? drawing.lineOpacity ?? 1}
          onOpacityChange={
            fillOpacity !== undefined
              ? onFillOpacityChange
              : (lineOpacity) => onChange({ lineOpacity })
          }
          drawing={drawing}
          onDrawingChange={onChange}
        />
      </PopoverPopup>
    </Popover>
  );
}
export function Check({
  label,
  checked,
  onChange,
  hideLabel = false,
}: {
  label: string;
  hideLabel?: boolean;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm leading-[18px] text-zinc-200">
      <span className="relative flex size-[18px] shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none flex size-full items-center justify-center rounded-[3px] border border-[#f2f2f2] text-[#2e2e2e] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#2962ff] peer-focus-visible:[outline-style:solid]",
            checked ? "bg-[#f2f2f2]" : "peer-hover:bg-[#efefef]/[0.075]",
          )}
        >
          {checked ? (
            <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
              <path stroke="currentColor" strokeWidth="2" d="M1 4 4 7 10 1" />
            </svg>
          ) : null}
        </span>
      </span>
      <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
    </label>
  );
}

export function DrawingSelect({ className, ...props }: ComponentProps<typeof TradingSelect>) {
  return (
    <TradingSelect
      {...props}
      popupProps={{
        align: "start",
        sideOffset: 0,
        className: "p-[6px]",
        popupClassName:
          "rounded-[10px] border-0! bg-popover! backdrop-filter-none! shadow-[0_2px_4px_0_rgb(0_0_0/20%)] dark:shadow-[0_2px_4px_0_rgb(0_0_0/20%)]",
      }}
      itemClassName="min-h-8 rounded-[4px] px-1 py-0.5 text-sm sm:min-h-8 data-selected:bg-foreground data-selected:text-background"
      className={cn(
        inputClass,
        "min-h-[34px] shadow-none before:hidden dark:bg-transparent sm:min-h-[34px] sm:text-sm focus-visible:ring-1 [&[aria-expanded=true]_[data-slot=select-icon]]:rotate-180",
        className,
      )}
    />
  );
}
