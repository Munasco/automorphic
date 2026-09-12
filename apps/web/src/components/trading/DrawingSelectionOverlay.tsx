import { supportsInlineDrawingText } from "./drawingPrimitive";
import {
  ColorPicker,
  DrawingSelect,
  WidthPicker,
  LineStylePicker,
  MarkerPicker,
  LineAppearancePicker,
  Check,
  inputClass,
} from "./DrawingStyleControls";
import { useCallback, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import { Slider } from "@base-ui/react/slider";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
  MenuSeparator,
  MenuShortcut,
} from "../ui/menu";
import { toastManager } from "../ui/toast";
import { ChartIcon } from "./ChartIcon";
import { DrawingToolIcon } from "./DrawingToolIcon";
import { SolarSettingsIcon } from "./SolarSettingsIcon";
import { type ChartDrawing, validDrawingAnchors } from "./drawingGeometry";
import type { ChartDrawingsController, DrawingPatch } from "./useChartDrawings";
import {
  DEFAULT_DRAWING_VISIBILITY,
  sanitizeDrawingVisibility,
  type DrawingVisibility,
} from "./drawingVisibility";
import {
  supportsLineExtensions,
  drawingLineExtensions,
  drawingLineMarkers,
  supportsShapeBackground,
  DEFAULT_SHAPE_BACKGROUND_OPACITY,
  supportsLineMarkers,
  supportsDrawingPriceLabels,
  supportsLineStatistics,
  defaultDrawingStats,
  supportsDrawingLevels,
  defaultDrawingLevelSettings,
  defaultDrawingLevels,
  fibTimeAppearancePatch,
  defaultChannelDrawingSettings,
  defaultRegressionDrawingSettings,
  isSpecialChannelDrawing,
  isFibTimeDrawing,
} from "./drawingGeometry";
import { DrawingRegressionSettings } from "./DrawingRegressionSettings";
import { DrawingFibTimeSettings } from "./DrawingFibTimeSettings";
import { DrawingLevelSettings } from "./DrawingLevelSettings";
import { DrawingParallelChannelSettings } from "./DrawingParallelChannelSettings";
import { DrawingTemplateMenu } from "./DrawingTemplateMenu";
import { applyDrawingTemplate } from "./drawingTemplates";
import { cn, isMacPlatform } from "../../lib/utils";

const lineKinds = new Set([
  "trend",
  "horizontal",
  "ray",
  "horizontal-ray",
  "vertical",
  "arrow",
  "arrow-marker",
  "channel",
  "flat-channel",
  "disjoint-channel",
]);
function titleFor(drawing: ChartDrawing) {
  const labels: Record<string, string> = {
    trend: "Trend Line",
    horizontal: "Horizontal Line",
    "horizontal-ray": "Horizontal Ray",
    fib: "Fib Retracement",
    "fib-time-zone": "Fib Time Zone",
    "fib-trend-time": "Trend-based Fib Time",
    channel: "Parallel Channel",
    "flat-channel": "Flat Top/Bottom",
    "disjoint-channel": "Disjoint Channel",
    "rotated-rectangle": "Rotated Rectangle",
    "double-curve": "Double Curve",
  };
  return (
    labels[drawing.kind] ??
    drawing.kind.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
function IconButton({
  label,
  children,
  onClick,
  active,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded text-zinc-300 hover:bg-white/10 focus-visible:outline-blue-500",
              active && "bg-blue-500/15 text-blue-400",
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}
function DrawingSettingsTitle({
  drawing,
  onChange,
}: {
  drawing: ChartDrawing;
  onChange: (patch: DrawingPatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const nameBeforeEdit = useRef(drawing.name ?? "");
  const restoreFocus = useRef(false);
  return (
    <DialogTitle className="flex min-h-16 items-center gap-2 px-5 pb-4 pr-12 pt-5 text-xl font-medium">
      {editing ? (
        <input
          ref={(node) => {
            if (node && document.activeElement !== node) {
              node.focus();
              node.select();
            }
          }}
          aria-label="Drawing name"
          placeholder={titleFor(drawing)}
          maxLength={80}
          value={drawing.name ?? ""}
          onChange={(event) => onChange({ name: event.target.value })}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              if (event.key === "Escape") onChange({ name: nameBeforeEdit.current });
              restoreFocus.current = true;
              setEditing(false);
            }
          }}
          className="h-8 min-w-0 flex-1 rounded border border-blue-500 bg-transparent px-2 text-base outline-none"
        />
      ) : (
        <>
          <span className="min-w-0 truncate">{drawing.name?.trim() || titleFor(drawing)}</span>
          <button
            ref={(node) => {
              if (node && restoreFocus.current) {
                restoreFocus.current = false;
                node.focus();
              }
            }}
            type="button"
            aria-label="Rename drawing"
            onClick={() => {
              nameBeforeEdit.current = drawing.name ?? "";
              setEditing(true);
            }}
            className="flex size-6 shrink-0 items-center justify-center rounded text-zinc-300 hover:bg-white/10 focus-visible:outline-blue-500"
          >
            <DrawingToolIcon name="pencil" className="size-4" />
          </button>
        </>
      )}
    </DialogTitle>
  );
}
function DrawingSettings({
  drawing,
  drawings,
  tab: requestedTab,
  setTab,
}: {
  drawing: ChartDrawing;
  drawings: ChartDrawingsController;
  tab: string;
  setTab: (tab: string) => void;
}) {
  const [draft, setDraft] = useState(() => ({
    ...defaultDrawingLevelSettings(drawing.kind),
    ...defaultChannelDrawingSettings(drawing.kind),
    ...(drawing.kind === "regression-trend" ? defaultRegressionDrawingSettings() : {}),
    ...drawing,
  }));
  const [replaceAppearance, setReplaceAppearance] = useState(false);
  const availableTabs =
    draft.kind === "text"
      ? ["Text", "Coordinates", "Visibility"]
      : draft.kind === "regression-trend"
        ? ["Inputs", "Style", "Coordinates", "Visibility"]
        : supportsDrawingLevels(draft.kind)
          ? ["Style", "Coordinates", "Visibility"]
          : isSpecialChannelDrawing(draft.kind)
            ? ["Style", "Text", "Visibility"]
            : ["Style", "Text", "Coordinates", "Visibility"];
  const tab = availableTabs.includes(requestedTab) ? requestedTab : availableTabs[0]!;
  const [anchorKeys] = useState(() =>
    drawing.anchors.map((_, index) => `${drawing.id}-anchor-${index}`),
  );
  const update = (patch: DrawingPatch) => {
    setDraft((current) => ({ ...current, ...patch }));
    drawings.previewSettings(patch);
  };
  const line =
    lineKinds.has(draft.kind) || supportsLineStatistics(draft.kind) || draft.kind === "crossline";
  const selectedStats = draft.stats ?? defaultDrawingStats(draft.kind);
  const extendable = supportsLineExtensions(draft.kind);
  const [dialogPosition, setDialogPosition] = useState<{ left: number; top: number } | null>(null);
  const measureDialog = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setDialogPosition(
      (current) =>
        current ?? {
          left: rect.x + (rect.width - node.offsetWidth) / 2,
          top: rect.y + (rect.height - node.offsetHeight) / 2,
        },
    );
  }, []);
  const visibility = sanitizeDrawingVisibility(draft.visibility);
  const { left: extendLeft, right: extendRight } = drawingLineExtensions(draft);
  const markers = drawingLineMarkers(draft);
  const canSave = validDrawingAnchors(draft.kind, draft.anchors);
  const channelOffset = draft.kind === "channel" ? drawings.channelPriceOffset(draft) : null;
  const dialogWidth =
    tab === "Visibility" || (supportsDrawingLevels(draft.kind) && !isFibTimeDrawing(draft.kind))
      ? 460
      : 380;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) drawings.closeSettings();
      }}
    >
      <DialogPopup
        bottomStickOnMobile={false}
        backdropStyle={{ background: "transparent", backdropFilter: "none", transition: "none" }}
        ref={measureDialog}
        className="max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-white/10 p-0 text-zinc-100 transition-none data-starting-style:scale-100 data-ending-style:scale-100 data-starting-style:opacity-100 data-ending-style:opacity-100"
        style={{
          background: "#202020",
          backdropFilter: "none",
          width: dialogWidth,
          ...(dialogPosition
            ? {
                position: "fixed",
                left: Math.min(dialogPosition.left, window.innerWidth - dialogWidth - 12),
                top: dialogPosition.top,
                maxHeight: `calc(100dvh - ${dialogPosition.top + 12}px)`,
              }
            : {}),
        }}
      >
        <DrawingSettingsTitle drawing={draft} onChange={update} />
        <div
          role="tablist"
          aria-label="Drawing settings"
          className="flex border-b border-white/10 px-5"
        >
          {availableTabs.map((name) => (
            <button
              type="button"
              role="tab"
              key={name}
              id={`drawing-tab-${name}`}
              aria-controls={`drawing-panel-${name}`}
              aria-selected={name === tab}
              tabIndex={name === tab ? 0 : -1}
              onKeyDown={(event) => {
                const tabs = availableTabs;
                let index = tabs.indexOf(tab);
                if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
                else if (event.key === "ArrowLeft") index = (index + tabs.length - 1) % tabs.length;
                else if (event.key === "Home") index = 0;
                else if (event.key === "End") index = tabs.length - 1;
                else return;
                event.preventDefault();
                setTab(tabs[index]!);
                (
                  event.currentTarget.parentElement?.children[index] as HTMLElement | undefined
                )?.focus();
              }}
              onClick={() => setTab(name)}
              className={cn(
                "mr-6 border-b-2 border-transparent pb-3 text-base font-medium text-zinc-400 hover:text-white",
                tab === name && "border-white text-white",
              )}
            >
              {name}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`drawing-panel-${tab}`}
          aria-labelledby={`drawing-tab-${tab}`}
          className="max-h-[calc(100dvh-220px)] min-h-40 space-y-6 overflow-y-auto p-5"
        >
          {draft.kind === "regression-trend" && (tab === "Style" || tab === "Inputs") ? (
            <DrawingRegressionSettings drawing={draft} tab={tab} onChange={update} />
          ) : null}
          {tab === "Style" && draft.kind === "channel" ? (
            <DrawingParallelChannelSettings drawing={draft} onChange={update} />
          ) : null}
          {tab === "Style" && supportsDrawingLevels(draft.kind) ? (
            isFibTimeDrawing(draft.kind) ? (
              <DrawingFibTimeSettings drawing={draft} onChange={update} />
            ) : (
              <DrawingLevelSettings drawing={draft} onChange={update} />
            )
          ) : null}
          {tab === "Style" &&
          !supportsDrawingLevels(draft.kind) &&
          draft.kind !== "channel" &&
          draft.kind !== "regression-trend" ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-[100px] shrink-0 text-sm">{line ? "Line" : "Stroke"}</span>
                <LineAppearancePicker drawing={draft} onChange={update} />
                {supportsLineMarkers(draft.kind) ? (
                  <>
                    <MarkerPicker
                      side="start"
                      value={markers.start}
                      onChange={(startMarker) => update({ startMarker })}
                    />
                    <MarkerPicker
                      side="end"
                      value={markers.end}
                      onChange={(endMarker) => update({ endMarker })}
                    />
                  </>
                ) : null}
              </div>
              {extendable ? (
                <label className="flex items-center gap-2 text-sm">
                  <span className="w-[100px] shrink-0">Extend</span>
                  <DrawingSelect
                    label="Extend line"
                    value={
                      extendLeft && extendRight
                        ? "both"
                        : extendLeft
                          ? "left"
                          : extendRight
                            ? "right"
                            : "none"
                    }
                    onChange={(value) =>
                      update({
                        extendLeft: ["left", "both"].includes(value),
                        extendRight: ["right", "both"].includes(value),
                      })
                    }
                    options={[
                      ["none", "Don't extend"],
                      ["left", "Extend left"],
                      ["right", "Extend right"],
                      ["both", "Extend both"],
                    ]}
                    className="w-45"
                  />
                </label>
              ) : null}
              {supportsLineStatistics(draft.kind) ? (
                <Check
                  label="Middle point"
                  checked={draft.showMiddlePoint ?? false}
                  onChange={(showMiddlePoint) => update({ showMiddlePoint })}
                />
              ) : null}
              {isSpecialChannelDrawing(draft.kind) ? (
                <ChannelAppearance drawing={draft} onChange={update} />
              ) : null}
              {supportsShapeBackground(draft.kind) ? (
                <div className="flex items-center justify-between gap-3">
                  <Check
                    label="Background"
                    checked={draft.background ?? true}
                    onChange={(background) => update({ background })}
                  />
                  <ColorPicker
                    label="Background color"
                    value={draft.backgroundColor ?? draft.color}
                    opacity={draft.backgroundOpacity ?? DEFAULT_SHAPE_BACKGROUND_OPACITY}
                    onChange={(backgroundColor) => update({ backgroundColor })}
                    onOpacityChange={(backgroundOpacity) => update({ backgroundOpacity })}
                  />
                </div>
              ) : null}
              {supportsDrawingPriceLabels(draft.kind) && !isSpecialChannelDrawing(draft.kind) ? (
                <Check
                  label="Price labels"
                  checked={draft.showPriceLabel ?? draft.kind === "horizontal"}
                  onChange={(showPriceLabel) => update({ showPriceLabel })}
                />
              ) : null}
              {supportsLineStatistics(draft.kind) ? (
                <>
                  <div className="text-[11px] text-zinc-500">INFO</div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-[100px] shrink-0">Stats</span>
                    <Popover>
                      <PopoverTrigger
                        className={cn(inputClass, "flex w-45 items-center justify-between")}
                      >
                        {selectedStats.length ? `${selectedStats.length} selected` : "Hidden"}
                        <ChartIcon name="chevron-down" className="size-4" />
                      </PopoverTrigger>
                      <PopoverPopup
                        instant
                        style={{ background: "#202020", backdropFilter: "none" }}
                        className="w-52"
                        viewportClassName="p-3 space-y-3"
                      >
                        <PopoverTitle className="sr-only">Line statistics</PopoverTitle>
                        {(
                          [
                            ["price", "Price range"],
                            ["percent", "Percent change"],
                            ["ticks", "Ticks"],
                            ["bars", "Bars range"],
                            ["datetime", "Date/time range"],
                            ["distance", "Distance"],
                            ["angle", "Angle"],
                          ] as const
                        ).map(([key, label]) => (
                          <Check
                            key={key}
                            label={label}
                            checked={selectedStats.includes(key)}
                            onChange={(checked) =>
                              update({
                                stats: checked
                                  ? [...selectedStats, key]
                                  : selectedStats.filter((stat) => stat !== key),
                              })
                            }
                          />
                        ))}
                      </PopoverPopup>
                    </Popover>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="w-[100px] shrink-0">Stats position</span>
                    <DrawingSelect
                      label="Stats position"
                      value={draft.statsPosition ?? "right"}
                      onChange={(value) =>
                        update({
                          statsPosition: value as NonNullable<ChartDrawing["statsPosition"]>,
                        })
                      }
                      options={[
                        ["left", "Left"],
                        ["center", "Center"],
                        ["right", "Right"],
                      ]}
                      className="w-45"
                    />
                  </label>
                  <Check
                    label="Always show stats"
                    checked={draft.alwaysShowStats ?? draft.kind === "info-line"}
                    onChange={(alwaysShowStats) => update({ alwaysShowStats })}
                  />
                </>
              ) : null}
            </>
          ) : null}
          {tab === "Text" ? (
            <>
              <div className="flex items-center gap-3">
                <ColorPicker
                  label="Text color"
                  value={draft.textColor ?? draft.color}
                  onChange={(textColor) => update({ textColor })}
                  opacity={draft.textOpacity ?? 1}
                  onOpacityChange={(textOpacity) => update({ textOpacity })}
                />
                <DrawingSelect
                  label="Text size"
                  value={String(draft.textFontSize ?? 14)}
                  onChange={(value) => update({ textFontSize: Number(value) })}
                  options={[8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40, 48].map(
                    (size) => [String(size), String(size)] as const,
                  )}
                  className="w-20"
                />
                <button
                  type="button"
                  aria-label="Bold text"
                  aria-pressed={draft.textBold ?? false}
                  onClick={() => update({ textBold: !draft.textBold })}
                  className="size-8 rounded font-bold hover:bg-white/10 aria-pressed:bg-blue-600"
                >
                  B
                </button>
                <button
                  type="button"
                  aria-label="Italic text"
                  aria-pressed={draft.textItalic ?? false}
                  onClick={() => update({ textItalic: !draft.textItalic })}
                  className="size-8 rounded italic hover:bg-white/10 aria-pressed:bg-blue-600"
                >
                  I
                </button>
              </div>
              <textarea
                aria-label="Drawing text"
                maxLength={140}
                value={draft.text ?? ""}
                onChange={(event) => update({ text: event.target.value })}
                className={cn(inputClass, "h-28 w-full resize-y py-2")}
              />
              <div className="flex items-center gap-3">
                <span className="mr-auto text-sm">Alignment</span>
                <DrawingSelect
                  label="Text vertical alignment"
                  value={draft.textPosition ?? "above"}
                  onChange={(value) =>
                    update({ textPosition: value as NonNullable<ChartDrawing["textPosition"]> })
                  }
                  options={[
                    ["above", "Top"],
                    ["center", "Middle"],
                    ["below", "Bottom"],
                  ]}
                  className="w-24"
                />
                <DrawingSelect
                  label="Text horizontal alignment"
                  value={draft.textAlignment ?? (draft.kind === "text" ? "left" : "center")}
                  onChange={(value) =>
                    update({ textAlignment: value as NonNullable<ChartDrawing["textAlignment"]> })
                  }
                  options={[
                    ["left", "Left"],
                    ["center", "Center"],
                    ["right", "Right"],
                  ]}
                  className="w-24"
                />
              </div>
            </>
          ) : null}
          {tab === "Visibility" ? (
            <>
              <Check
                label="Ticks"
                checked={visibility.ticks}
                onChange={(ticks) => update({ visibility: { ...visibility, ticks } })}
              />
              {(["seconds", "minutes", "hours", "days", "weeks", "months"] as const).map((unit) => {
                const range = visibility[unit];
                const limit = DEFAULT_DRAWING_VISIBILITY[unit].max;
                const setRange = (patch: Partial<DrawingVisibility[typeof unit]>) =>
                  update({ visibility: { ...visibility, [unit]: { ...range, ...patch } } });
                return (
                  <div key={unit} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="w-28">
                        <Check
                          label={unit[0]!.toUpperCase() + unit.slice(1)}
                          checked={range.enabled}
                          onChange={(enabled) => setRange({ enabled })}
                        />
                      </span>
                      <input
                        type="number"
                        aria-label={`${unit} minimum`}
                        disabled={!range.enabled}
                        min={1}
                        max={range.max}
                        value={range.min}
                        onChange={(event) => {
                          const min = event.target.valueAsNumber;
                          if (Number.isFinite(min))
                            setRange({ min: Math.max(1, Math.min(range.max, min)) });
                        }}
                        className={cn(
                          inputClass,
                          "w-16 disabled:cursor-not-allowed disabled:opacity-40",
                        )}
                      />
                      <span className="text-zinc-500">—</span>
                      <input
                        type="number"
                        aria-label={`${unit} maximum`}
                        disabled={!range.enabled}
                        min={range.min}
                        max={limit}
                        value={range.max}
                        onChange={(event) => {
                          const max = event.target.valueAsNumber;
                          if (Number.isFinite(max))
                            setRange({ max: Math.min(limit, Math.max(range.min, max)) });
                        }}
                        className={cn(
                          inputClass,
                          "w-16 disabled:cursor-not-allowed disabled:opacity-40",
                        )}
                      />
                    </div>
                    <Slider.Root
                      disabled={!range.enabled}
                      min={1}
                      max={limit}
                      value={[range.min, range.max]}
                      onValueChange={(values) => setRange({ min: values[0]!, max: values[1]! })}
                      className={cn("ml-32", !range.enabled && "opacity-40")}
                    >
                      <Slider.Control className="relative flex h-5 w-full touch-none items-center">
                        <Slider.Track className="relative h-0.5 w-full rounded bg-zinc-600">
                          <Slider.Indicator className="rounded bg-zinc-200" />
                          <Slider.Thumb
                            index={0}
                            getAriaLabel={() => `${unit} minimum slider`}
                            className="size-3 rounded-full border border-zinc-400 bg-[#202020] outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          />
                          <Slider.Thumb
                            index={1}
                            getAriaLabel={() => `${unit} maximum slider`}
                            className="size-3 rounded-full border border-zinc-400 bg-[#202020] outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          />
                        </Slider.Track>
                      </Slider.Control>
                    </Slider.Root>
                  </div>
                );
              })}
              <Check
                label="Ranges"
                checked={visibility.ranges}
                onChange={(ranges) => update({ visibility: { ...visibility, ranges } })}
              />
            </>
          ) : null}
          {tab === "Coordinates" ? (
            <>
              {draft.anchors
                .slice(0, draft.kind === "channel" ? 2 : undefined)
                .map((anchor, index) => (
                  <div key={anchorKeys[index]} className="space-y-2">
                    <span className="text-sm text-zinc-400">
                      #{index + 1} ({draft.kind === "regression-trend" ? "bar" : "price, bar"})
                    </span>
                    <div className="flex gap-3">
                      {draft.kind !== "regression-trend" ? (
                        <input
                          aria-label={`Point ${index + 1} price`}
                          type="number"
                          step="any"
                          value={drawings.coordinatePrice(anchor.price)}
                          onChange={(event) => {
                            const price = event.target.valueAsNumber;
                            if (Number.isFinite(price))
                              update({
                                anchors: draft.anchors.map((point, i) =>
                                  i === index ? { ...point, price } : point,
                                ),
                              });
                          }}
                          className={cn(inputClass, "w-28")}
                        />
                      ) : null}
                      <input
                        aria-label={`Point ${index + 1} bar`}
                        type="number"
                        step="1"
                        value={Math.round(drawings.anchorBar(anchor) ?? 0)}
                        onChange={(event) => {
                          const bar = event.target.valueAsNumber;
                          const next = Number.isFinite(bar)
                            ? drawings.anchorAtBar(bar, anchor.price)
                            : null;
                          if (next)
                            update({
                              anchors: draft.anchors.map((point, i) =>
                                i === index ? next : point,
                              ),
                            });
                        }}
                        className={cn(inputClass, "w-28")}
                      />
                    </div>
                  </div>
                ))}
              {draft.kind === "channel" ? (
                <label className="flex items-center gap-3 text-sm">
                  <span className="w-28">Price offset</span>
                  <input
                    aria-label="Price offset"
                    type="number"
                    step="any"
                    disabled={channelOffset === null}
                    value={channelOffset === null ? "" : drawings.coordinatePrice(channelOffset)}
                    onChange={(event) => {
                      const offset = event.target.valueAsNumber;
                      const anchors = Number.isFinite(offset)
                        ? drawings.channelAnchorsAtOffset(draft, offset)
                        : null;
                      if (anchors) update({ anchors });
                    }}
                    className={cn(inputClass, "w-28 disabled:opacity-40")}
                  />
                </label>
              ) : null}
              {!canSave ? (
                <p className="text-xs text-red-400">Choose distinct points for this drawing.</p>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/10 px-5 py-4">
          <div className="mr-auto">
            <DrawingTemplateMenu
              drawing={draft}
              onApply={(patch) => {
                const next = applyDrawingTemplate(draft, patch);
                setDraft({
                  ...defaultDrawingLevelSettings(next.kind),
                  ...defaultChannelDrawingSettings(next.kind),
                  ...(next.kind === "regression-trend" ? defaultRegressionDrawingSettings() : {}),
                  ...next,
                });
                setReplaceAppearance(true);
                drawings.previewSettings(patch, { replace: true });
              }}
            />
          </div>
          <button
            type="button"
            onClick={drawings.closeSettings}
            className="rounded border border-white/20 px-5 py-2 text-sm hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              const { id: _id, kind: _kind, ...patch } = draft;
              drawings.applySettings(patch, { replace: replaceAppearance });
            }}
            className="rounded bg-zinc-100 px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-40"
          >
            OK
          </button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
export function DrawingSelectionOverlay({ drawings }: { drawings: ChartDrawingsController }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [settingsTab, setSettingsTab] = useState("Style");
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const selected = drawings.selected;
  if (!selected || drawings.tool !== "cursor") return null;
  const regression =
    selected.kind === "regression-trend"
      ? { ...defaultRegressionDrawingSettings(), ...selected }
      : null;
  const channelLevels =
    selected.kind === "channel" ? (selected.levels ?? defaultDrawingLevels("channel")) : null;
  const firstChannelLevel = channelLevels?.[0];
  const toolbarAppearance: ChartDrawing = firstChannelLevel
    ? {
        ...selected,
        color: firstChannelLevel.color ?? selected.color,
        width: firstChannelLevel.width ?? selected.width,
        lineStyle: firstChannelLevel.lineStyle ?? selected.lineStyle ?? "solid",
        lineOpacity: firstChannelLevel.opacity ?? selected.lineOpacity ?? 1,
      }
    : selected;
  const updateLineAppearance = (patch: DrawingPatch) => {
    if (!channelLevels) {
      drawings.updateSelected(patch);
      return;
    }
    drawings.updateSelected({
      ...patch,
      levels: channelLevels.map((level) => ({
        ...level,
        ...(patch.color === undefined ? {} : { color: patch.color }),
        ...(patch.width === undefined ? {} : { width: patch.width }),
        ...(patch.lineStyle === undefined ? {} : { lineStyle: patch.lineStyle }),
        ...(patch.lineOpacity === undefined ? {} : { opacity: patch.lineOpacity }),
      })),
    });
  };
  const closeThen = (action: () => void) => {
    drawings.closeContextMenu();
    action();
  };
  const copyFromMenu = (event: ClipboardEvent) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    )
      return;
    const text = drawings.copySelectedSerialized();
    if (!text) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <>
      <div
        role="toolbar"
        aria-label="Selected drawing"
        className="absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-0.5 rounded-lg border border-white/15 bg-[#1f1f1f] p-1 text-zinc-200 shadow-lg"
        style={{ marginLeft: offset.x, marginTop: offset.y }}
      >
        <button
          type="button"
          aria-label="Move drawing toolbar"
          className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-zinc-500 active:cursor-grabbing"
          onPointerDown={(event) => {
            const parent = event.currentTarget.parentElement!;
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              originX: offset.x,
              originY: offset.y,
            };
            parent.style.transition = "none";
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const parent = event.currentTarget.parentElement!;
            const chart = parent.parentElement!.getBoundingClientRect();
            const limit = Math.max(0, (chart.width - parent.offsetWidth) / 2 - 8);
            setOffset({
              x: Math.max(
                -limit,
                Math.min(limit, drag.current.originX + event.clientX - drag.current.x),
              ),
              y: Math.max(
                0,
                Math.min(chart.height - 60, drag.current.originY + event.clientY - drag.current.y),
              ),
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <svg width="8" height="20" aria-hidden="true" fill="currentColor">
            {[5, 10, 15].flatMap((y) =>
              [2, 6].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />),
            )}
          </svg>
        </button>
        <DrawingTemplateMenu compact drawing={selected} onApply={drawings.applySelectedTemplate} />
        {selected.kind === "regression-trend" ? (
          <WidthPicker
            drawing={{ ...selected, width: regression!.regressionBaseLine.width }}
            mixed={
              new Set([
                regression!.regressionBaseLine.width,
                regression!.regressionUpperLine.width,
                regression!.regressionLowerLine.width,
              ]).size > 1
            }
            onChange={({ width }) => {
              if (width === undefined) return;
              const settings = { ...defaultRegressionDrawingSettings(), ...selected };
              drawings.updateSelected({
                regressionBaseLine: { ...settings.regressionBaseLine, width },
                regressionUpperLine: { ...settings.regressionUpperLine, width },
                regressionLowerLine: { ...settings.regressionLowerLine, width },
              });
            }}
          />
        ) : selected.kind === "text" ? (
          <>
            <ColorPicker
              label="Text color"
              icon="letter-t"
              value={selected.textColor ?? selected.color}
              onChange={(textColor) => drawings.updateSelected({ textColor })}
              opacity={selected.textOpacity ?? 1}
              onOpacityChange={(textOpacity) => drawings.updateSelected({ textOpacity })}
            />
            <DrawingSelect
              label="Text size"
              value={String(selected.textFontSize ?? 14)}
              onChange={(value) => drawings.updateSelected({ textFontSize: Number(value) })}
              options={[8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40, 48].map(
                (size) => [String(size), String(size)] as const,
              )}
              className="w-16"
            />
            <IconButton
              label="Bold text"
              active={selected.textBold ?? false}
              onClick={() => drawings.updateSelected({ textBold: !selected.textBold })}
            >
              <span className="font-bold">B</span>
            </IconButton>
            <IconButton
              label="Italic text"
              active={selected.textItalic ?? false}
              onClick={() => drawings.updateSelected({ textItalic: !selected.textItalic })}
            >
              <span className="italic">I</span>
            </IconButton>
          </>
        ) : isFibTimeDrawing(selected.kind) ? (
          <FibTimeToolbar drawing={selected} onChange={drawings.updateSelected} />
        ) : (
          <>
            <ColorPicker
              value={toolbarAppearance.color}
              icon="pencil"
              mixed={
                channelLevels
                  ? new Set(channelLevels.map((level) => level.color ?? selected.color)).size > 1
                  : false
              }
              opacity={toolbarAppearance.lineOpacity ?? 1}
              onOpacityChange={(lineOpacity) => updateLineAppearance({ lineOpacity })}
              onChange={(color) => updateLineAppearance({ color })}
            />
            {supportsInlineDrawingText(selected.kind) ? (
              <ColorPicker
                label="Text color"
                icon="letter-t"
                value={selected.textColor ?? selected.color}
                onChange={(textColor) => drawings.updateSelected({ textColor })}
                opacity={selected.textOpacity ?? 1}
                onOpacityChange={(textOpacity) => drawings.updateSelected({ textOpacity })}
              />
            ) : null}
            <WidthPicker
              drawing={toolbarAppearance}
              onChange={updateLineAppearance}
              mixed={
                channelLevels
                  ? new Set(channelLevels.map((level) => level.width ?? selected.width)).size > 1
                  : false
              }
            />
            <LineStylePicker drawing={toolbarAppearance} onChange={updateLineAppearance} />
          </>
        )}
        <span className="mx-1 h-6 border-l border-white/10" />
        <IconButton label="Drawing settings" onClick={drawings.openSettings}>
          <SolarSettingsIcon className="size-5" />
        </IconButton>
        <IconButton
          label={selected.locked ? "Unlock drawing" : "Lock drawing"}
          active={selected.locked ?? false}
          onClick={() => drawings.updateSelected({ locked: !selected.locked })}
        >
          <DrawingToolIcon name={selected.locked ? "lock" : "lock-open"} className="size-5" />
        </IconButton>
        <IconButton label="Delete drawing" onClick={drawings.deleteSelected}>
          <ChartIcon name="trash" className="size-5" />
        </IconButton>
        <Menu>
          <MenuTrigger
            aria-label="More drawing options"
            className="flex size-8 shrink-0 items-center justify-center rounded hover:bg-white/10"
          >
            <svg width="20" height="20" aria-hidden="true" fill="currentColor">
              {[4, 10, 16].map((x) => (
                <circle key={x} cx={x} cy="10" r="1.6" />
              ))}
            </svg>
          </MenuTrigger>
          <MenuPopup
            aria-label="Drawing options"
            className="w-[276px]"
            style={drawingMenuStyle}
            onCopy={copyFromMenu}
          >
            <DrawingMenuCommands drawings={drawings} />
          </MenuPopup>
        </Menu>
      </div>
      {drawings.settingsOpen ? (
        <DrawingSettings
          key={selected.id}
          drawing={selected}
          drawings={drawings}
          tab={settingsTab}
          setTab={setSettingsTab}
        />
      ) : null}
      {drawings.contextPoint ? (
        <ContextMenu.Root
          open
          onOpenChange={(open) => {
            if (!open) drawings.closeContextMenu();
          }}
        >
          <MenuPopup
            aria-label="Drawing context menu"
            onCopy={copyFromMenu}
            onMouseUpCapture={(event) => {
              // Canvas hit testing opens this virtual-anchor menu without a DOM trigger.
              // Releasing the opening right-click must not activate the item under it.
              const origin = drawings.contextPoint;
              if (
                event.button === 2 &&
                origin &&
                Math.abs(event.clientX - origin.x) <= 1 &&
                Math.abs(event.clientY - origin.y) <= 1
              ) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            className="w-[276px]"
            style={drawingMenuStyle}
            align="start"
            sideOffset={0}
            anchor={{
              getBoundingClientRect: () =>
                new DOMRect(drawings.contextPoint!.x, drawings.contextPoint!.y, 0, 0),
            }}
          >
            <DrawingMenuCommands drawings={drawings} onAction={closeThen} />
          </MenuPopup>
        </ContextMenu.Root>
      ) : null}
    </>
  );
}

const drawingMenuStyle = {
  background: "#1f1f1f",
  backdropFilter: "none",
  transition: "none",
  animation: "none",
};
const drawingMenuItemClass = "h-8 min-h-8 gap-3 px-3 py-0 text-sm sm:min-h-8";
function DrawingMenuIcon({ children }: { children?: ReactNode }) {
  return (
    <span aria-hidden="true" className="flex size-4.5 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}
const executeDrawingAction = (action: () => void) => action();
function DrawingMenuCommands({
  drawings,
  onAction = executeDrawingAction,
}: {
  drawings: ChartDrawingsController;
  onAction?: (action: () => void) => void;
}) {
  const selected = drawings.selected;
  if (!selected) return null;
  const mac = typeof navigator !== "undefined" && isMacPlatform(navigator.platform);
  const modifier = mac ? "⌘" : "Ctrl";
  const copy = () => {
    void drawings.copyDrawing(selected.id).then((copied) => {
      if (!copied) {
        toastManager.add({
          type: "error",
          title: "Couldn't copy drawing",
          description: "Clipboard access is unavailable. Try copying again from the chart.",
        });
      }
    });
  };
  return (
    <>
      <DrawingOrderSubmenu drawings={drawings} />
      <MenuSeparator />
      <MenuItem
        className={drawingMenuItemClass}
        onClick={() => onAction(() => drawings.duplicateDrawing(selected.id))}
      >
        <DrawingMenuIcon>
          <DrawingToolIcon name="copy" className="size-4.5" />
        </DrawingMenuIcon>
        Clone <MenuShortcut className="tracking-normal">{modifier} Drag</MenuShortcut>
      </MenuItem>
      <MenuItem className={drawingMenuItemClass} onClick={() => onAction(copy)}>
        <DrawingMenuIcon />
        Copy <MenuShortcut className="tracking-normal">{modifier} C</MenuShortcut>
      </MenuItem>
      <MenuSeparator />
      {[
        {
          label: selected.locked ? "Unlock" : "Lock",
          action: () => drawings.updateSelected({ locked: !selected.locked }),
          icon: (
            <DrawingToolIcon name={selected.locked ? "lock-open" : "lock"} className="size-4.5" />
          ),
        },
        {
          label: "Hide",
          action: () => drawings.updateSelected({ hidden: true }),
          icon: <DrawingToolIcon name="eye-off" className="size-4.5" />,
        },
        {
          label: "Remove",
          action: drawings.deleteSelected,
          icon: <ChartIcon name="trash" className="size-4.5" />,
          shortcut: mac ? "⌫" : "Delete",
        },
      ].map((item) => (
        <MenuItem
          key={item.label}
          className={drawingMenuItemClass}
          onClick={() => onAction(item.action)}
        >
          <DrawingMenuIcon>{item.icon}</DrawingMenuIcon>
          {item.label}
          {item.shortcut ? (
            <MenuShortcut className="tracking-normal">{item.shortcut}</MenuShortcut>
          ) : null}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem className={drawingMenuItemClass} onClick={() => onAction(drawings.openSettings)}>
        <DrawingMenuIcon>
          <SolarSettingsIcon className="size-4.5" />
        </DrawingMenuIcon>
        Settings…
      </MenuItem>
    </>
  );
}
function DrawingOrderSubmenu({ drawings }: { drawings: ChartDrawingsController }) {
  const index = drawings.objects.findIndex((drawing) => drawing.id === drawings.selected?.id);
  const last = drawings.objects.length - 1;
  return (
    <MenuSub>
      <MenuSubTrigger className={drawingMenuItemClass}>
        <DrawingMenuIcon />
        Visual order
      </MenuSubTrigger>
      <MenuSubPopup aria-label="Visual order" className="w-[276px]" style={drawingMenuStyle}>
        {(
          [
            ["front", "Bring to front", index === last],
            ["back", "Send to back", index === 0],
            ["forward", "Bring forward", index === last],
            ["backward", "Send backward", index === 0],
          ] as const
        ).map(([direction, label, boundary]) => (
          <MenuItem
            key={direction}
            className={drawingMenuItemClass}
            disabled={index < 0 || boundary}
            onClick={() => drawings.reorderSelected(direction)}
          >
            <DrawingMenuIcon />
            {label}
          </MenuItem>
        ))}
      </MenuSubPopup>
    </MenuSub>
  );
}

function ChannelAppearance({
  drawing,
  onChange,
}: {
  drawing: ChartDrawing;
  onChange: (patch: DrawingPatch) => void;
}) {
  const prices = drawing.showPriceLabel ?? false;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Check
          label="Prices"
          checked={prices}
          onChange={(showPriceLabel) => onChange({ showPriceLabel })}
        />
        <div
          className={cn("flex items-center gap-1", !prices && "pointer-events-none opacity-40")}
          inert={!prices}
        >
          <ColorPicker
            label="Price label color"
            value={drawing.priceLabelColor ?? drawing.color}
            onChange={(priceLabelColor) => onChange({ priceLabelColor })}
          />
          <input
            aria-label="Price label font size"
            type="number"
            min={8}
            max={48}
            value={drawing.priceLabelFontSize ?? 12}
            onChange={(event) => {
              if (Number.isFinite(event.target.valueAsNumber))
                onChange({
                  priceLabelFontSize: Math.max(8, Math.min(48, event.target.valueAsNumber)),
                });
            }}
            className={cn(inputClass, "w-14 px-1")}
          />
          <button
            type="button"
            aria-label="Bold price labels"
            aria-pressed={drawing.priceLabelBold ?? false}
            onClick={() => onChange({ priceLabelBold: !drawing.priceLabelBold })}
            className={cn(
              "size-8 rounded font-bold hover:bg-white/10",
              drawing.priceLabelBold && "bg-white/15",
            )}
          >
            B
          </button>
          <button
            type="button"
            aria-label="Italic price labels"
            aria-pressed={drawing.priceLabelItalic ?? false}
            onClick={() => onChange({ priceLabelItalic: !drawing.priceLabelItalic })}
            className={cn(
              "size-8 rounded italic hover:bg-white/10",
              drawing.priceLabelItalic && "bg-white/15",
            )}
          >
            I
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Check
          label="Background"
          checked={drawing.background ?? true}
          onChange={(background) => onChange({ background })}
        />
        <ColorPicker
          label="Background color"
          value={drawing.backgroundColor ?? drawing.color}
          onChange={(backgroundColor) => onChange({ backgroundColor })}
        />
      </div>
      <label className="flex items-center justify-between gap-4 text-sm">
        Opacity
        <input
          aria-label="Background opacity"
          type="range"
          min={0}
          max={100}
          value={Math.round((drawing.backgroundOpacity ?? 0.12) * 100)}
          onChange={(event) => onChange({ backgroundOpacity: event.target.valueAsNumber / 100 })}
          className="w-44 accent-white"
        />
      </label>
    </>
  );
}

function FibTimeToolbar({
  drawing,
  onChange,
}: {
  drawing: ChartDrawing;
  onChange: (patch: DrawingPatch) => void;
}) {
  const levels = drawing.levels ?? defaultDrawingLevels(drawing.kind);
  const first = levels[0];
  const updateLevels = (patch: DrawingPatch) => onChange(fibTimeAppearancePatch(drawing, patch));
  const appearance = {
    ...drawing,
    width: first?.width ?? 2,
    lineStyle: first?.lineStyle ?? ("solid" as const),
  };
  return (
    <>
      <ColorPicker
        label="All level colors"
        value={first?.color ?? drawing.color}
        mixed={new Set(levels.map((level) => level.color ?? drawing.color)).size > 1}
        onChange={(color) => updateLevels({ color })}
      />
      <WidthPicker
        drawing={appearance}
        onChange={updateLevels}
        mixed={new Set(levels.map((level) => level.width ?? 2)).size > 1}
      />
      {drawing.kind === "fib-time-zone" ? (
        <LineStylePicker drawing={appearance} onChange={updateLevels} />
      ) : null}
    </>
  );
}
