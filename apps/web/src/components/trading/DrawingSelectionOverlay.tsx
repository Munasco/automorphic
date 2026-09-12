import {
  ColorPicker,
  WidthPicker,
  LineStylePicker,
  MarkerPicker,
  LineAppearancePicker,
  Check,
  inputClass,
} from "./DrawingStyleControls";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Slider } from "@base-ui/react/slider";
import { createPortal } from "react-dom";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
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
  supportsLineMarkers,
  supportsDrawingPriceLabels,
  supportsLineStatistics,
  defaultDrawingStats,
  supportsDrawingLevels,
  defaultDrawingLevelSettings,
} from "./drawingGeometry";
import { DrawingLevelSettings } from "./DrawingLevelSettings";
import { cn } from "../../lib/utils";

const lineKinds = new Set([
  "trend",
  "horizontal",
  "ray",
  "horizontal-ray",
  "vertical",
  "arrow",
  "arrow-marker",
  "channel",
]);
function titleFor(drawing: ChartDrawing) {
  const labels: Record<string, string> = {
    trend: "Trend Line",
    horizontal: "Horizontal Line",
    "horizontal-ray": "Horizontal Ray",
    fib: "Fib Retracement",
    channel: "Parallel Channel",
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
    ...drawing,
  }));
  const availableTabs = supportsDrawingLevels(draft.kind)
    ? ["Style", "Coordinates", "Visibility"]
    : ["Style", "Text", "Coordinates", "Visibility"];
  const tab = availableTabs.includes(requestedTab) ? requestedTab : "Style";
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
  const extendLeft = draft.extendLeft ?? draft.kind === "extended-line";
  const extendRight = draft.extendRight ?? ["ray", "extended-line"].includes(draft.kind);
  const canSave = validDrawingAnchors(draft.kind, draft.anchors);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) drawings.closeSettings();
      }}
    >
      <DialogPopup
        bottomStickOnMobile={false}
        backdropStyle={{ background: "transparent", backdropFilter: "none" }}
        ref={measureDialog}
        className="max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-white/10 p-0 text-zinc-100"
        style={{
          background: "#202020",
          backdropFilter: "none",
          width: tab === "Visibility" || supportsDrawingLevels(draft.kind) ? 460 : 380,
          ...(dialogPosition
            ? {
                position: "fixed",
                left: Math.min(
                  dialogPosition.left,
                  window.innerWidth -
                    (tab === "Visibility" || supportsDrawingLevels(draft.kind) ? 460 : 380) -
                    12,
                ),
                top: dialogPosition.top,
                maxHeight: `calc(100dvh - ${dialogPosition.top + 12}px)`,
              }
            : {}),
        }}
      >
        <DialogTitle className="px-5 pb-5 pt-5 text-xl font-medium">{titleFor(draft)}</DialogTitle>
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
                "mr-5 border-b-2 border-transparent pb-3 text-sm text-zinc-400 hover:text-white",
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
          {tab === "Style" && supportsDrawingLevels(draft.kind) ? (
            <DrawingLevelSettings drawing={draft} onChange={update} />
          ) : null}
          {tab === "Style" && !supportsDrawingLevels(draft.kind) ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-sm">{line ? "Line" : "Stroke"}</span>
                <LineAppearancePicker drawing={draft} onChange={update} />
                {supportsLineMarkers(draft.kind) ? (
                  <>
                    <MarkerPicker
                      side="start"
                      value={draft.startMarker ?? "normal"}
                      onChange={(startMarker) => update({ startMarker })}
                    />
                    <MarkerPicker
                      side="end"
                      value={draft.endMarker ?? "normal"}
                      onChange={(endMarker) => update({ endMarker })}
                    />
                  </>
                ) : null}
              </div>
              {extendable ? (
                <label className="flex items-center justify-between gap-3 text-sm">
                  Extend
                  <select
                    aria-label="Extend line"
                    value={
                      extendLeft && extendRight
                        ? "both"
                        : extendLeft
                          ? "left"
                          : extendRight
                            ? "right"
                            : "none"
                    }
                    onChange={(event) =>
                      update({
                        extendLeft: ["left", "both"].includes(event.target.value),
                        extendRight: ["right", "both"].includes(event.target.value),
                      })
                    }
                    className={cn(inputClass, "w-44 bg-[#202020]")}
                  >
                    <option value="none">Don't extend</option>
                    <option value="left">Extend left</option>
                    <option value="right">Extend right</option>
                    <option value="both">Extend both</option>
                  </select>
                </label>
              ) : null}
              {supportsLineStatistics(draft.kind) ? (
                <Check
                  label="Middle point"
                  checked={draft.showMiddlePoint ?? false}
                  onChange={(showMiddlePoint) => update({ showMiddlePoint })}
                />
              ) : null}
              {supportsDrawingPriceLabels(draft.kind) ? (
                <Check
                  label="Price labels"
                  checked={draft.showPriceLabel ?? draft.kind === "horizontal"}
                  onChange={(showPriceLabel) => update({ showPriceLabel })}
                />
              ) : null}
              {supportsLineStatistics(draft.kind) ? (
                <>
                  <div className="text-[11px] text-zinc-500">INFO</div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Stats</span>
                    <Popover>
                      <PopoverTrigger
                        className={cn(inputClass, "flex w-44 items-center justify-between")}
                      >
                        {selectedStats.length ? `${selectedStats.length} selected` : "Hidden"}
                        <ChartIcon name="chevron-down" className="size-4" />
                      </PopoverTrigger>
                      <PopoverPopup
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
                  <label className="flex items-center justify-between text-sm">
                    Stats position
                    <select
                      aria-label="Stats position"
                      value={draft.statsPosition ?? "right"}
                      onChange={(event) =>
                        update({
                          statsPosition: event.target.value as NonNullable<
                            ChartDrawing["statsPosition"]
                          >,
                        })
                      }
                      className={cn(inputClass, "w-44 bg-[#202020]")}
                    >
                      {["left", "center", "right"].map((position) => (
                        <option key={position} value={position}>
                          {position[0]!.toUpperCase() + position.slice(1)}
                        </option>
                      ))}
                    </select>
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
                />
                <select
                  aria-label="Text size"
                  value={draft.textFontSize ?? 14}
                  onChange={(event) => update({ textFontSize: Number(event.target.value) })}
                  className={cn(inputClass, "bg-[#1e222d]")}
                >
                  {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map((size) => (
                    <option key={size}>{size}</option>
                  ))}
                </select>
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
                <select
                  aria-label="Text vertical alignment"
                  value={draft.textPosition ?? "above"}
                  onChange={(event) =>
                    update({
                      textPosition: event.target.value as NonNullable<ChartDrawing["textPosition"]>,
                    })
                  }
                  className={cn(inputClass, "bg-[#1e222d]")}
                >
                  {["above", "center", "below"].map((value) => (
                    <option key={value} value={value}>
                      {value === "above"
                        ? "Top"
                        : value === "below"
                          ? "Bottom"
                          : value === "center"
                            ? "Middle"
                            : value}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Text horizontal alignment"
                  value={draft.textAlignment ?? "center"}
                  onChange={(event) =>
                    update({
                      textAlignment: event.target.value as NonNullable<
                        ChartDrawing["textAlignment"]
                      >,
                    })
                  }
                  className={cn(inputClass, "bg-[#1e222d]")}
                >
                  {["left", "center", "right"].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
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
                        min={1}
                        max={range.max}
                        value={range.min}
                        onChange={(event) => {
                          const min = event.target.valueAsNumber;
                          if (Number.isFinite(min))
                            setRange({ min: Math.max(1, Math.min(range.max, min)) });
                        }}
                        className={cn(inputClass, "w-16")}
                      />
                      <span className="text-zinc-500">—</span>
                      <input
                        type="number"
                        aria-label={`${unit} maximum`}
                        min={range.min}
                        max={limit}
                        value={range.max}
                        onChange={(event) => {
                          const max = event.target.valueAsNumber;
                          if (Number.isFinite(max))
                            setRange({ max: Math.min(limit, Math.max(range.min, max)) });
                        }}
                        className={cn(inputClass, "w-16")}
                      />
                    </div>
                    <Slider.Root
                      min={1}
                      max={limit}
                      value={[range.min, range.max]}
                      onValueChange={(values) => setRange({ min: values[0]!, max: values[1]! })}
                      className="ml-32"
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
              {draft.anchors.map((anchor, index) => (
                <div key={anchorKeys[index]} className="space-y-2">
                  <span className="text-sm text-zinc-400">#{index + 1} (price, bar)</span>
                  <div className="flex gap-3">
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
                            anchors: draft.anchors.map((point, i) => (i === index ? next : point)),
                          });
                      }}
                      className={cn(inputClass, "w-28")}
                    />
                  </div>
                </div>
              ))}
              {!canSave ? (
                <p className="text-xs text-red-400">Choose distinct points for this drawing.</p>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/10 px-5 py-4">
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
              drawings.applySettings(patch);
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
  const closeThen = (action: () => void) => {
    drawings.closeContextMenu();
    action();
  };
  return (
    <>
      <div
        role="toolbar"
        aria-label="Selected drawing"
        className="absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-0.5 rounded-lg border border-white/15 bg-[#1e222d] p-1 text-zinc-200 shadow-lg"
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
        <ColorPicker
          value={selected.color}
          onChange={(color) => drawings.updateSelected({ color })}
        />
        <WidthPicker drawing={selected} onChange={drawings.updateSelected} />
        <LineStylePicker drawing={selected} onChange={drawings.updateSelected} />
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
        <Popover>
          <PopoverTrigger
            aria-label="More drawing options"
            className="flex size-8 shrink-0 items-center justify-center rounded hover:bg-white/10"
          >
            <svg width="20" height="20" aria-hidden="true" fill="currentColor">
              {[4, 10, 16].map((x) => (
                <circle key={x} cx={x} cy="10" r="1.6" />
              ))}
            </svg>
          </PopoverTrigger>
          <PopoverPopup
            style={{ background: "#1e222d", backdropFilter: "none" }}
            className="w-48"
            viewportClassName="p-1"
          >
            <PopoverTitle className="sr-only">Drawing options</PopoverTitle>
            <button
              type="button"
              onClick={() => drawings.duplicateDrawing(selected.id)}
              className="w-full rounded px-3 py-2 text-left text-sm hover:bg-white/10"
            >
              Clone
            </button>
            <button
              type="button"
              onClick={() => drawings.updateSelected({ hidden: true })}
              className="w-full rounded px-3 py-2 text-left text-sm hover:bg-white/10"
            >
              Hide
            </button>
          </PopoverPopup>
        </Popover>
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
      {drawings.contextPoint
        ? createPortal(
            <div
              className="fixed inset-0 z-40"
              onPointerDown={drawings.closeContextMenu}
              onContextMenu={(event) => {
                event.preventDefault();
                drawings.closeContextMenu();
              }}
            >
              <div
                role="menu"
                aria-label="Drawing context menu"
                className="fixed w-56 rounded-lg border border-white/15 bg-[#1e222d] p-1 text-sm text-zinc-200 shadow-xl"
                style={{
                  left: Math.min(drawings.contextPoint.x, window.innerWidth - 232),
                  top: Math.min(drawings.contextPoint.y, window.innerHeight - 250),
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {[
                  { label: "Settings…", action: drawings.openSettings },
                  { label: "Clone", action: () => drawings.duplicateDrawing(selected.id) },
                  {
                    label: selected.locked ? "Unlock" : "Lock",
                    action: () => drawings.updateSelected({ locked: !selected.locked }),
                  },
                  { label: "Hide", action: () => drawings.updateSelected({ hidden: true }) },
                  { label: "Remove", action: drawings.deleteSelected },
                ].map((item) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={item.label}
                    onClick={() => closeThen(item.action)}
                    className="block w-full rounded px-3 py-2.5 text-left hover:bg-white/10"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
