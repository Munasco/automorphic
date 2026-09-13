import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { drawingContextMenuStyle } from "./drawingContextMenuStyles";
import { Slider } from "@base-ui/react/slider";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { SelectPopup, SelectItem } from "../ui/select";
import { NumberField } from "@base-ui/react/number-field";
import { DrawingToolIcon } from "./DrawingToolIcon";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import type { ChartDrawing } from "./drawingGeometry";
import type { DrawingPatch } from "./useChartDrawings";
import { cn } from "../../lib/utils";
import { useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
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
  "h-[34px] rounded border border-[#575757] bg-transparent px-2.5 text-sm leading-[18px] text-[#dbdbdb] outline-none focus:border-blue-500";
export function ColorPicker({
  value,
  onChange,
  label = "Line color",
  mixed = false,
  icon,
  opacity,
  onOpacityChange,
  variant = "default",
  disabled = false,
}: {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  mixed?: boolean | "diagonal";
  icon?: "pencil" | "letter-t" | "bucket-droplet";
  variant?: "default" | "settings" | "toolbar";
  opacity?: number | undefined;
  onOpacityChange?: (opacity: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        disabled={disabled}
        className={cn(
          "flex shrink-0 items-center justify-center rounded hover:bg-white/10 disabled:opacity-40",
          variant === "settings"
            ? "size-[34px] border border-[#575757]"
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
              "relative overflow-hidden rounded-sm border border-white/20",
              variant === "settings" ? "size-6" : "size-4",
            )}
            style={
              opacity === undefined
                ? undefined
                : {
                    backgroundColor: "white",
                    backgroundImage:
                      "repeating-conic-gradient(rgba(42,46,57,.4) 0 25%, transparent 0 50%)",
                    backgroundSize: "8px 8px",
                  }
            }
          >
            <span
              className="absolute inset-0"
              style={{
                background:
                  mixed === "diagonal"
                    ? "linear-gradient(45deg, #f7525f 50%, #22ab94 50%)"
                    : mixed
                      ? "conic-gradient(#f23645 0 25%, #2962ff 0 50%, #4caf50 0 75%, #ff9800 0)"
                      : value,
                opacity: opacity ?? 1,
              }}
            />
          </span>
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
  const [focusedSwatch, setFocusedSwatch] = useState(0);
  const swatchRefs = useRef<(HTMLButtonElement | null)[]>([]);
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
    <div className="py-1.5 text-[#dbdbdb]">
      <div className="w-[248px] px-3 py-1.5">
        <div role="group" aria-label={`${label} palette`} className="-mx-[3px] grid grid-cols-10">
          {colors.map((color, index) => (
            <button
              type="button"
              key={color}
              ref={(element) => {
                swatchRefs.current[index] = element;
              }}
              tabIndex={focusedSwatch === index ? 0 : -1}
              aria-label={`${label} ${color}`}
              aria-pressed={value.toLowerCase() === color}
              onFocus={() => setFocusedSwatch(index)}
              onKeyDown={(event) => {
                const offset =
                  event.key === "ArrowRight"
                    ? 1
                    : event.key === "ArrowLeft"
                      ? -1
                      : event.key === "ArrowDown"
                        ? 10
                        : event.key === "ArrowUp"
                          ? -10
                          : 0;
                if (!offset || event.altKey || event.ctrlKey || event.metaKey) return;
                event.preventDefault();
                event.stopPropagation();
                swatchRefs.current[index + offset]?.focus();
              }}
              onClick={() => onChange(color)}
              className={cn(
                "m-[3px] size-[17px] rounded-[1px] border border-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
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
                  aria-pressed={(drawing.lineStyle ?? "solid") === lineStyle}
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
const drawingToolbarOptionClass =
  "h-8 min-h-8 whitespace-nowrap rounded-none py-0.5 text-sm text-[#dbdbdb] sm:min-h-8 data-selected:bg-[#f2f2f2] data-selected:text-black data-highlighted:bg-[#f2f2f2] data-highlighted:text-black";

function DrawingToolbarSelectPopup({ children }: { children: ReactNode }) {
  return (
    <SelectPopup
      align="start"
      alignItemWithTrigger={false}
      sideOffset={2}
      matchTriggerWidth={false}
      scrollArrows={false}
      className="px-0 py-1.5 [&:has([data-highlighted])_[data-selected]:not([data-highlighted])]:bg-transparent [&:has([data-highlighted])_[data-selected]:not([data-highlighted])]:text-[#dbdbdb]"
      popupClassName="w-max overflow-hidden rounded-[6px] border-0! bg-[#1f1f1f]! backdrop-filter-none!"
      style={{ fontFamily: '-apple-system, system-ui, "Trebuchet MS", Roboto, Ubuntu, sans-serif' }}
    >
      {children}
    </SelectPopup>
  );
}

function LineStyleGlyph({ style }: { style: NonNullable<ChartDrawing["lineStyle"]> }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      className="size-7 text-current"
      aria-hidden="true"
    >
      {style === "solid" ? (
        <path stroke="currentColor" d="M4 13.5h20" />
      ) : style === "dashed" ? (
        <path fill="currentColor" d="M4 13h5v1H4zM12 13h5v1h-5zM20 13h5v1h-5z" />
      ) : (
        <path
          fill="currentColor"
          d="M3 13h2v2H3zM8 13h2v2H8zM13 13h2v2h-2zM18 13h2v2h-2zM23 13h2v2h-2z"
        />
      )}
    </svg>
  );
}

export function LineStylePicker({
  drawing,
  onChange,
  variant = "default",
  mixed = false,
}: {
  drawing: ChartDrawing;
  mixed?: boolean;
  onChange: (patch: DrawingPatch) => void;
  variant?: "default" | "toolbar";
}) {
  return (
    <SelectPrimitive.Root
      value={mixed ? null : (drawing.lineStyle ?? "solid")}
      onValueChange={(next) => {
        if (next === "solid" || next === "dashed" || next === "dotted")
          onChange({ lineStyle: next });
      }}
    >
      <SelectPrimitive.Trigger
        aria-label="Line style"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded hover:bg-white/10 aria-expanded:bg-white/10",
          variant === "toolbar" && "size-[38px]",
        )}
      >
        {mixed ? (
          <span aria-hidden="true">—</span>
        ) : (
          <LineStyleGlyph style={drawing.lineStyle ?? "solid"} />
        )}
      </SelectPrimitive.Trigger>
      <DrawingToolbarSelectPopup>
        {(
          [
            ["solid", "Line"],
            ["dashed", "Dashed line"],
            ["dotted", "Dotted line"],
          ] as const
        ).map(([style, label]) => (
          <SelectItem
            key={style}
            value={style}
            hideIndicator
            className={cn(drawingToolbarOptionClass, "pl-2 pr-5")}
          >
            <span className="flex items-center gap-1.5">
              <LineStyleGlyph style={style} />
              {label}
            </span>
          </SelectItem>
        ))}
      </DrawingToolbarSelectPopup>
    </SelectPrimitive.Root>
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
  return (
    <SelectPrimitive.Root
      value={mixed ? null : drawing.width}
      onValueChange={(next) => {
        if (next !== null) onChange({ width: next });
      }}
    >
      <SelectPrimitive.Trigger
        aria-label="Line width"
        style={{ fontFeatureSettings: '"lnum", "tnum"' }}
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
              <span
                className="w-[18px] rounded-full bg-current"
                style={{ height: drawing.width }}
              />
            ) : null}
            {drawing.width}px
          </>
        )}
      </SelectPrimitive.Trigger>
      <DrawingToolbarSelectPopup>
        {[1, 2, 3, 4].map((width) => (
          <SelectItem
            key={width}
            value={width}
            hideIndicator
            className={cn(drawingToolbarOptionClass, "pl-[13px] pr-[14px]")}
            style={{ fontFeatureSettings: '"lnum", "tnum"' }}
          >
            <span className="flex items-center gap-[11px]">
              <span className="w-[18px] rounded-full bg-current" style={{ height: width }} />
              {width}px
            </span>
          </SelectItem>
        ))}
      </DrawingToolbarSelectPopup>
    </SelectPrimitive.Root>
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
        className="group flex h-[34px] w-[180px] shrink-0 items-center gap-2 rounded border border-[#575757] bg-transparent px-2 text-sm leading-[18px] text-[#dbdbdb] outline-none hover:border-white/30 focus-visible:border-blue-500 aria-expanded:border-white/50"
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
  const glyph = (marker: "normal" | "arrow") => (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      className="size-7 shrink-0 text-current"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      style={{ transform: side === "end" ? "scaleX(-1)" : undefined }}
    >
      <path
        d={
          marker === "arrow"
            ? "M4.5 13.5H24m-19.5 0L8 17m-3.5-3.5L8 10"
            : "M8.5 13.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 0H24"
        }
      />
    </svg>
  );
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(next) => {
        if (next === "normal" || next === "arrow") onChange(next);
      }}
    >
      <SelectPrimitive.Trigger
        aria-label={side === "start" ? "Start marker" : "End marker"}
        className="flex size-[34px] shrink-0 items-center justify-center rounded border border-[#575757] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2962ff]"
      >
        {glyph(value)}
      </SelectPrimitive.Trigger>
      <SelectPopup
        align="start"
        alignItemWithTrigger={false}
        sideOffset={0}
        scrollArrows={false}
        className="p-1.5 [&:has([data-highlighted])_[data-selected]:not([data-highlighted])]:bg-transparent [&:has([data-highlighted])_[data-selected]:not([data-highlighted])]:text-[#dbdbdb]"
        popupClassName="rounded-[10px] border-0! bg-[#1f1f1f]! backdrop-filter-none! shadow-[0_2px_4px_0_rgb(0_0_0/20%)] dark:shadow-[0_2px_4px_0_rgb(0_0_0/20%)]"
        style={{
          fontFamily: '-apple-system, system-ui, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        }}
      >
        {(["normal", "arrow"] as const).map((marker) => (
          <SelectItem
            key={marker}
            value={marker}
            hideIndicator
            className="min-h-8 rounded-[6px] pl-1 pr-3.5 py-0.5 text-sm text-[#dbdbdb] sm:min-h-8 data-selected:bg-[#f2f2f2] data-selected:text-black data-highlighted:bg-[#f2f2f2] data-highlighted:text-black"
          >
            <span className="flex items-center gap-1.5">
              {glyph(marker)}
              <span>{marker === "normal" ? "Normal" : "Arrow"}</span>
            </span>
          </SelectItem>
        ))}
      </SelectPopup>
    </SelectPrimitive.Root>
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
  const opacity = fillOpacity ?? drawing.lineOpacity ?? 1;
  const dotted = drawing.lineStyle === "dotted";
  const segmented = dotted || drawing.lineStyle === "dashed";
  const segmentWidth = dotted ? drawing.width + 1 : segmented ? 5 : 30;
  const segmentHeight = dotted ? drawing.width + 1 : drawing.width;
  const segmentCount = segmented ? Math.ceil(30 / (segmentWidth + 3)) : 1;
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        disabled={disabled}
        className="flex h-[34px] w-[75px] shrink-0 items-center rounded-[6px] border border-[#575757] p-1 outline-none hover:border-[#8c8c8c] focus-visible:border-[#2962ff] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#2962ff] aria-expanded:border-[#2962ff] aria-expanded:ring-1 aria-expanded:ring-inset aria-expanded:ring-[#2962ff] disabled:opacity-40"
      >
        <span
          aria-hidden="true"
          className="relative size-6 shrink-0 overflow-hidden rounded-[3px] bg-black"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%228%22 height=%228%22%3E%3Cpath fill=%22%232a2e39%22 fill-opacity=%22.4%22 d=%22M0 0h4v4H0zM4 4h4v4H4z%22/%3E%3C/svg%3E")',
            backgroundSize: "50% auto",
          }}
        >
          <span className="absolute inset-0" style={{ backgroundColor: drawing.color, opacity }} />
        </span>
        <span className="flex h-6 w-[41px] shrink-0 items-center overflow-hidden pl-2">
          <svg width="30" height="24" className="shrink-0" aria-hidden="true" opacity={opacity}>
            {Array.from({ length: segmentCount }, (_, index) => (
              <rect
                key={index}
                x={index * (segmentWidth + 3)}
                y={(24 - segmentHeight) / 2}
                width={segmentWidth}
                height={segmentHeight}
                fill={drawing.color}
              />
            ))}
          </svg>
        </span>
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
    <label className="flex cursor-pointer items-center gap-2 text-sm leading-[18px] text-[#dbdbdb]">
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
      icon={
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          aria-hidden="true"
          className="size-[18px] shrink-0 text-[#8c8c8c] opacity-100"
        >
          <path
            fill="currentColor"
            d="M3.92 7.83 9 12.29l5.08-4.46-1-1.13L9 10.29l-4.09-3.6-.99 1.14Z"
          />
        </svg>
      }
      popupProps={{
        align: "start",
        sideOffset: 0,
        className: "p-[6px]",
        style: {
          fontFamily: '-apple-system, system-ui, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
          color: "#dbdbdb",
          "--popover": "#1f1f1f",
          "--foreground": "#dbdbdb",
        } as CSSProperties,
        popupClassName:
          "rounded-[10px] border-0! bg-[#1f1f1f]! backdrop-filter-none! shadow-[0_2px_4px_0_rgb(0_0_0/20%)] dark:shadow-[0_2px_4px_0_rgb(0_0_0/20%)]",
      }}
      itemClassName="min-h-8 rounded-[6px] px-2 py-0.5 text-sm text-[#dbdbdb] sm:min-h-8 data-highlighted:bg-[#2e2e2e] data-highlighted:text-[#dbdbdb] data-selected:bg-[#f2f2f2] data-selected:text-[#0f0f0f] data-selected:data-highlighted:bg-[#f2f2f2] data-selected:data-highlighted:text-[#0f0f0f] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2962ff] focus-visible:[outline-style:solid] data-highlighted:focus-visible:not-hover:not-data-selected:bg-transparent"
      className={cn(
        inputClass,
        "min-h-[34px] pl-[7px] pr-0.5 shadow-none before:hidden dark:bg-transparent sm:min-h-[34px] sm:text-sm focus-visible:ring-1 [&_[data-slot=select-icon]]:flex [&_[data-slot=select-icon]]:h-7 [&_[data-slot=select-icon]]:w-5 [&_[data-slot=select-icon]]:shrink-0 [&_[data-slot=select-icon]]:items-center [&_[data-slot=select-icon]]:justify-center [&[aria-expanded=true]_[data-slot=select-icon]]:rotate-180",
        className,
      )}
    />
  );
}
