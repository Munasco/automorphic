import { supportsInlineDrawingText } from "./drawingPrimitive";
import { getDrawingDialogBounds } from "./drawingDialogBounds";
import { DrawingTextSettings } from "./DrawingTextSettings";
import { DrawingNumberField } from "./DrawingNumberField";
import { DrawingVisibilitySettings } from "./DrawingVisibilitySettings";
import {
  ColorPicker,
  DrawingSelect,
  DrawingMultiSelect,
  WidthPicker,
  LineStylePicker,
  MarkerPicker,
  LineExtensionPicker,
  LineAppearancePicker,
  Check,
} from "./DrawingStyleControls";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type ReactNode,
  type PointerEventHandler,
} from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "../ui/dialog";
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
import { AlertIcon } from "./AlertIcon";
import { supportsDrawingAlert } from "./drawingAlerts";
import { type ChartDrawing, validDrawingAnchors } from "./drawingGeometry";
import type { ChartDrawingsController, DrawingPatch } from "./useChartDrawings";
import { sanitizeDrawingVisibility } from "./drawingVisibility";
import {
  supportsLineExtensions,
  drawingLineExtensions,
  drawingLineMarkers,
  supportsShapeBackground,
  DEFAULT_SHAPE_BACKGROUND_OPACITY,
  supportsLineMarkers,
  supportsDrawingPriceLabels,
  supportsDrawingTimeLabels,
  drawingPriceLabelVisible,
  drawingTimeLabelVisible,
  defaultVerticalLineSettings,
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
import {
  DrawingTemplateMenu,
  DrawingTemplateSaveDialog,
  DrawingTemplateSubmenu,
} from "./DrawingTemplateMenu";
import { DrawingVisibilitySubmenu } from "./DrawingVisibilitySubmenu";
import {
  drawingContextMenuStyle as drawingMenuStyle,
  drawingContextMenuPopupClass,
  drawingContextMenuItemClass as drawingMenuItemClass,
} from "./drawingContextMenuStyles";
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
    trend: "Trendline",
    "trend-angle": "Trend angle",
    "info-line": "Info line",
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
function settingsEntryField(panel: HTMLDivElement | null) {
  if (panel?.id === "drawing-panel-Coordinates")
    return panel.querySelector<HTMLInputElement>("input:not(:disabled)");
  if (panel?.id === "drawing-panel-Text")
    return panel.querySelector<HTMLTextAreaElement>("textarea");
  return null;
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
              "flex size-[38px] shrink-0 items-center justify-center rounded text-zinc-300 hover:bg-white/10 focus-visible:outline-blue-500",
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
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  drawing: ChartDrawing;
  onChange: (patch: DrawingPatch) => void;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
}) {
  const [editing, setEditing] = useState(false);
  const nameBeforeEdit = useRef(drawing.name ?? "");
  const restoreFocus = useRef(false);
  return (
    <DialogTitle
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      className="flex h-[68px] shrink-0 touch-none items-center gap-2 px-5 py-5 pr-12 text-xl font-semibold leading-7"
    >
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
    ...defaultVerticalLineSettings(drawing.kind),
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
        : supportsDrawingLevels(draft.kind) || ["crossline", "trend-angle"].includes(draft.kind)
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
  const axisLine = ["horizontal", "horizontal-ray", "vertical", "crossline"].includes(draft.kind);
  const angle = draft.kind === "trend-angle" ? drawings.drawingAngle(draft) : null;
  const coordinateHasPrice = draft.kind !== "vertical" && draft.kind !== "regression-trend";
  const coordinateHasBar = draft.kind !== "horizontal";
  const coordinateLabel = coordinateHasPrice ? (coordinateHasBar ? "price, bar" : "price") : "bar";
  const selectedStats = draft.stats ?? defaultDrawingStats(draft.kind);
  const extendable = supportsLineExtensions(draft.kind);
  const [dialogPosition, setDialogPosition] = useState<{ left: number; top: number } | null>(null);
  const dialogDrag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const tabList = useRef<HTMLDivElement>(null);
  const dialogElement = useRef<HTMLDivElement>(null);
  const settingsPanel = useRef<HTMLDivElement>(null);
  const focusSettingsInput = useCallback(() => {
    // Select on entry only; preview rerenders must preserve the user's caret.
    const input = settingsEntryField(settingsPanel.current);
    input?.focus({ preventScroll: true });
    input?.select();
    return input;
  }, []);
  useEffect(() => {
    if (tab === "Text" || tab === "Coordinates") focusSettingsInput();
  }, [tab, focusSettingsInput]);
  useEffect(() => {
    tabList.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
    // Tab changes and viewport resizes both change the DOM scroll target's visible bounds.
    // eslint-disable-next-line react/exhaustive-effect-dependencies
  }, [tab, viewport.width]);
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const measureDialog = useCallback((node: HTMLDivElement | null) => {
    dialogElement.current = node;
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
    tab === "Visibility"
      ? 459.07
      : supportsDrawingLevels(draft.kind) && !isFibTimeDrawing(draft.kind)
        ? 460
        : 380;
  const dialogBounds = dialogPosition
    ? getDrawingDialogBounds(dialogPosition, dialogWidth, viewport)
    : null;
  const save = () => {
    if (!canSave) return;
    const { id: _id, kind: _kind, ...patch } = draft;
    drawings.applySettings(patch, { replace: replaceAppearance });
  };
  return (
    <Dialog
      open
      onOpenChange={(open, details) => {
        if (open) return;
        if (!canSave) {
          details.cancel();
          return;
        }
        save();
      }}
    >
      <DialogPopup
        showCloseButton={false}
        bottomStickOnMobile={false}
        backdropStyle={{ background: "transparent", backdropFilter: "none", transition: "none" }}
        ref={measureDialog}
        initialFocus={() => focusSettingsInput() ?? dialogElement.current}
        className="max-w-[calc(100vw-24px)] overflow-hidden rounded-md border-0 p-0 text-zinc-100 transition-none data-starting-style:scale-100 data-ending-style:scale-100 data-starting-style:opacity-100 data-ending-style:opacity-100"
        style={{
          background: "#202020",
          fontFamily: '-apple-system, system-ui, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
          backdropFilter: "none",
          width: dialogWidth,
          ...(dialogBounds ? { position: "fixed", ...dialogBounds } : {}),
        }}
      >
        <DialogClose
          aria-label="Close"
          className="absolute right-5 top-5 z-10 flex size-7 items-center justify-center rounded text-zinc-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-blue-500"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="m3 3 14 14M17 3 3 17" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </DialogClose>
        <DrawingSettingsTitle
          drawing={draft}
          onChange={update}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary || !dialogBounds) return;
            if (event.target instanceof Element && event.target.closest("button,input")) return;
            dialogDrag.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              left: dialogBounds.left,
              top: dialogBounds.top,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
          }}
          onPointerMove={(event) => {
            const drag = dialogDrag.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            setDialogPosition({
              left: drag.left + event.clientX - drag.x,
              top: drag.top + event.clientY - drag.y,
            });
          }}
          onPointerUp={(event) => {
            if (dialogDrag.current?.pointerId !== event.pointerId) return;
            dialogDrag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        />
        <div
          ref={tabList}
          role="tablist"
          aria-label="Drawing settings"
          className="flex h-8 shrink-0 overflow-x-auto border-b border-white/10 px-5"
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
                "relative mr-6 h-8 shrink-0 pb-2 text-base font-semibold leading-6 text-zinc-400 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-transparent hover:text-white",
                tab === name && "text-white after:bg-white",
              )}
            >
              {name}
            </button>
          ))}
        </div>
        <div
          ref={settingsPanel}
          role="tabpanel"
          id={`drawing-panel-${tab}`}
          aria-labelledby={`drawing-tab-${tab}`}
          className={cn(
            "max-h-[calc(100dvh-220px)] min-h-0 overflow-y-auto px-5 py-4",
            tab === "Text"
              ? "space-y-4 pt-6 pb-6"
              : tab === "Coordinates" || tab === "Visibility"
                ? "space-y-0"
                : tab === "Style" && supportsLineStatistics(draft.kind)
                  ? "pb-8 [&>div]:min-h-[50px] [&>label]:min-h-[50px]"
                  : tab === "Style" && axisLine
                    ? "min-h-[145px] [&>div]:min-h-[50px] [&>label]:min-h-[50px]"
                    : "space-y-6",
          )}
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
              <div className={cn("flex items-center", axisLine ? "gap-5" : "gap-2")}>
                <span className={cn("shrink-0 text-sm", !axisLine && "w-[100px]")}>
                  {line ? "Line" : "Stroke"}
                </span>
                <LineAppearancePicker drawing={draft} onChange={update} />
                {supportsLineMarkers(draft.kind) && !axisLine ? (
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
                  <LineExtensionPicker left={extendLeft} right={extendRight} onChange={update} />
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
                  label={axisLine ? "Price label" : "Price labels"}
                  checked={drawingPriceLabelVisible(draft)}
                  onChange={(showPriceLabel) => update({ showPriceLabel })}
                />
              ) : null}
              {draft.kind === "vertical" ? (
                <Check
                  label="Extend"
                  checked={draft.extendAcrossPanes !== false}
                  onChange={(extendAcrossPanes) => update({ extendAcrossPanes })}
                />
              ) : null}
              {supportsDrawingTimeLabels(draft.kind) ? (
                <Check
                  label="Time label"
                  checked={drawingTimeLabelVisible(draft)}
                  onChange={(showTimeLabel) => update({ showTimeLabel })}
                />
              ) : null}
              {supportsLineStatistics(draft.kind) ? (
                <>
                  <h4 className="flex h-8 items-center text-[11px] font-normal text-zinc-500">
                    INFO
                  </h4>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-[100px] shrink-0">Stats</span>
                    <DrawingMultiSelect
                      label="Line statistics"
                      placeholder="Hidden"
                      selected={selectedStats}
                      options={(
                        [
                          ["price", "Price range"],
                          ["percent", "Percent change"],
                          ["ticks", "Ticks"],
                          ["bars", "Bars range"],
                          ["datetime", "Date/time range"],
                          ["distance", "Distance"],
                          ["angle", "Angle"],
                        ] as const
                      ).filter(
                        ([key]) =>
                          draft.kind !== "trend-angle" ||
                          !["datetime", "distance", "angle"].includes(key),
                      )}
                      onCheckedChange={(key, checked) =>
                        update({
                          stats: checked
                            ? [...selectedStats, key]
                            : selectedStats.filter((stat) => stat !== key),
                        })
                      }
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="w-[100px] shrink-0">Stats position</span>
                    <DrawingSelect
                      label="Stats position"
                      value={
                        draft.statsPosition ?? (draft.kind === "info-line" ? "center" : "right")
                      }
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
          {tab === "Text" ? <DrawingTextSettings drawing={draft} onChange={update} /> : null}
          {tab === "Visibility" ? (
            <DrawingVisibilitySettings
              visibility={visibility}
              onChange={(visibility) => update({ visibility })}
            />
          ) : null}
          {tab === "Coordinates" ? (
            <div className="min-h-[113px]">
              {draft.anchors
                .slice(
                  0,
                  draft.kind === "trend-angle" ? 1 : draft.kind === "channel" ? 2 : undefined,
                )
                .map((anchor, index) => (
                  <div key={anchorKeys[index]} className="flex h-[50px] items-center">
                    <span className="w-[113px] shrink-0 pr-5 text-sm leading-[18px] text-zinc-400">
                      #{index + 1} ({coordinateLabel})
                    </span>
                    <div className="flex gap-2">
                      {coordinateHasPrice ? (
                        <DrawingNumberField
                          label={`Point ${index + 1} price`}
                          step={drawings.coordinatePriceStep()}
                          value={drawings.coordinatePrice(anchor.price)}
                          onValueChange={(price) => {
                            const next = {
                              ...anchor,
                              price: drawings.normalizeCoordinatePrice(price),
                            };
                            const anchors =
                              draft.kind === "trend-angle"
                                ? drawings.anchorsAtOrigin(draft, next)
                                : draft.anchors.map((point, i) => (i === index ? next : point));
                            if (anchors) update({ anchors });
                          }}
                        />
                      ) : null}
                      {coordinateHasBar ? (
                        <DrawingNumberField
                          label={`Point ${index + 1} bar`}
                          integerOnly
                          step={1}
                          value={Math.round(drawings.anchorBar(anchor) ?? 0)}
                          onValueChange={(bar) => {
                            const next = drawings.anchorAtBar(bar, anchor.price);
                            if (next) {
                              const anchors =
                                draft.kind === "trend-angle"
                                  ? drawings.anchorsAtOrigin(draft, next)
                                  : draft.anchors.map((point, i) => (i === index ? next : point));
                              if (anchors) update({ anchors });
                            }
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              {draft.kind === "trend-angle" ? (
                <label className="flex h-[50px] items-center text-sm">
                  <span className="w-[113px] shrink-0 pr-5 text-zinc-400">Angle</span>
                  <DrawingNumberField
                    label="Angle"
                    step="any"
                    value={angle === null ? null : Number(angle.toFixed(2))}
                    onValueChange={(angle) => {
                      const anchors = drawings.anchorsAtAngle(draft, angle);
                      if (anchors) update({ anchors });
                    }}
                  />
                </label>
              ) : null}
              {draft.kind === "channel" ? (
                <label className="flex items-center gap-3 text-sm">
                  <span className="w-28">Price offset</span>
                  <DrawingNumberField
                    label="Price offset"
                    step={drawings.coordinatePriceStep()}
                    disabled={channelOffset === null}
                    value={channelOffset === null ? null : drawings.coordinatePrice(channelOffset)}
                    onValueChange={(offset) => {
                      const anchors = drawings.channelAnchorsAtOffset(
                        draft,
                        drawings.normalizeCoordinatePrice(offset),
                      );
                      if (anchors) update({ anchors });
                    }}
                  />
                </label>
              ) : null}
              {!canSave ? (
                <p className="text-xs text-red-400">Choose distinct points for this drawing.</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t border-white/10 px-5 py-4 max-sm:gap-2 max-sm:px-3">
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
            className="h-[34px] rounded border border-white/20 px-[11px] text-base font-normal hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={save}
            className="h-[34px] rounded bg-zinc-100 px-[11px] text-base font-normal text-zinc-900 hover:bg-white disabled:opacity-40"
          >
            OK
          </button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
export function DrawingSelectionOverlay({
  drawings,
  onOpenObjectTree,
  onCreateAlert,
}: {
  drawings: ChartDrawingsController;
  onOpenObjectTree?: (() => void) | undefined;
  onCreateAlert?: ((drawing: ChartDrawing) => void) | undefined;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [compactToolbar, setCompactToolbar] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [settingsTab, setSettingsTab] = useState("Style");
  const [templateDrawing, setTemplateDrawing] = useState<ChartDrawing | null>(null);
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const selected = drawings.selected;
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    const chart = toolbar?.parentElement;
    if (!toolbar || !chart) return;
    const resize = () => {
      setCompactToolbar(chart.clientWidth < 440);
      const limit = Math.max(0, (chart.clientWidth - toolbar.offsetWidth) / 2 - 8);
      const bottom = Math.max(0, chart.clientHeight - toolbar.offsetHeight - 12);
      setOffset((previous) => {
        const x = Math.max(-limit, Math.min(limit, previous.x));
        const y = Math.max(0, Math.min(bottom, previous.y));
        return x === previous.x && y === previous.y ? previous : { x, y };
      });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(chart);
    observer.observe(toolbar);
    return () => observer.disconnect();
    // Selection/tool changes mount or replace the toolbar node observed above.
    // eslint-disable-next-line react/exhaustive-effect-dependencies
  }, [selected?.id, drawings.tool]);
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
        ref={toolbarRef}
        role="toolbar"
        aria-label="Selected drawing"
        className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center rounded-[6px] bg-[#1f1f1f] text-zinc-200 shadow-lg"
        style={{
          marginLeft: offset.x,
          marginTop: offset.y,
          fontFamily: '-apple-system, system-ui, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        }}
      >
        <button
          type="button"
          aria-label="Move drawing toolbar"
          className="flex h-[38px] w-6 shrink-0 cursor-grab touch-none items-center justify-center text-zinc-500 active:cursor-grabbing"
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary) return;
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
          onPointerUp={(event) => {
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() => {
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
            variant="toolbar"
            compact={compactToolbar}
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
              variant="toolbar"
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
              variant="toolbar"
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
                variant="toolbar"
                label="Text color"
                icon="letter-t"
                value={selected.textColor ?? selected.color}
                onChange={(textColor) => drawings.updateSelected({ textColor })}
                opacity={selected.textOpacity ?? 1}
                onOpacityChange={(textOpacity) => drawings.updateSelected({ textOpacity })}
              />
            ) : null}
            <WidthPicker
              variant="toolbar"
              compact={compactToolbar}
              drawing={toolbarAppearance}
              onChange={updateLineAppearance}
              mixed={
                channelLevels
                  ? new Set(channelLevels.map((level) => level.width ?? selected.width)).size > 1
                  : false
              }
            />
            <LineStylePicker
              variant="toolbar"
              drawing={toolbarAppearance}
              onChange={updateLineAppearance}
            />
          </>
        )}
        {!compactToolbar ? (
          <>
            <IconButton label="Drawing settings" onClick={drawings.openSettings}>
              <SolarSettingsIcon className="size-7" />
            </IconButton>
            {onCreateAlert && supportsDrawingAlert(selected) ? (
              <IconButton label="Add drawing alert" onClick={() => onCreateAlert(selected)}>
                <AlertIcon name="alarm-add" size={28} />
              </IconButton>
            ) : null}
            <IconButton
              label={selected.locked ? "Unlock drawing" : "Lock drawing"}
              active={selected.locked ?? false}
              onClick={() => drawings.updateSelected({ locked: !selected.locked })}
            >
              <DrawingToolIcon name={selected.locked ? "lock" : "lock-open"} className="size-7" />
            </IconButton>
          </>
        ) : null}
        <IconButton label="Delete drawing" onClick={drawings.deleteSelected}>
          <ChartIcon name="trash" className="size-7" />
        </IconButton>
        <Menu>
          <MenuTrigger
            aria-label="More drawing options"
            className="flex size-[38px] shrink-0 items-center justify-center rounded hover:bg-white/10 aria-expanded:bg-white/10"
          >
            <svg width="20" height="20" aria-hidden="true" fill="currentColor">
              {[4, 10, 16].map((x) => (
                <circle key={x} cx={x} cy="10" r="1.6" />
              ))}
            </svg>
          </MenuTrigger>
          <MenuPopup
            aria-label="Drawing options"
            className={drawingContextMenuPopupClass}
            style={drawingMenuStyle}
            onCopy={copyFromMenu}
          >
            <DrawingMenuCommands
              drawings={drawings}
              onSaveTemplate={() => setTemplateDrawing(selected)}
              onOpenObjectTree={onOpenObjectTree}
              onCreateAlert={onCreateAlert}
            />
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
            className={drawingContextMenuPopupClass}
            style={drawingMenuStyle}
            align="start"
            sideOffset={0}
            anchor={{
              getBoundingClientRect: () =>
                new DOMRect(drawings.contextPoint!.x, drawings.contextPoint!.y, 0, 0),
            }}
          >
            <DrawingMenuCommands
              drawings={drawings}
              onAction={closeThen}
              onSaveTemplate={() => setTemplateDrawing(selected)}
              onOpenObjectTree={onOpenObjectTree}
              onCreateAlert={onCreateAlert}
            />
          </MenuPopup>
        </ContextMenu.Root>
      ) : null}
      {templateDrawing ? (
        <DrawingTemplateSaveDialog
          drawing={templateDrawing}
          onClose={() => setTemplateDrawing(null)}
        />
      ) : null}
    </>
  );
}

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
  onSaveTemplate,
  onOpenObjectTree,
  onCreateAlert,
}: {
  drawings: ChartDrawingsController;
  onAction?: (action: () => void) => void;
  onSaveTemplate: () => void;
  onOpenObjectTree?: (() => void) | undefined;
  onCreateAlert?: ((drawing: ChartDrawing) => void) | undefined;
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
      {onCreateAlert && supportsDrawingAlert(selected) ? (
        <MenuItem
          className={drawingMenuItemClass}
          onClick={() => onAction(() => onCreateAlert(selected))}
        >
          <DrawingMenuIcon>
            <AlertIcon name="alarm-add" size={18} />
          </DrawingMenuIcon>
          Add alert…
        </MenuItem>
      ) : null}
      <DrawingTemplateSubmenu
        drawing={selected}
        onApply={(patch) => onAction(() => drawings.applySelectedTemplate(patch))}
        onSave={() => onAction(onSaveTemplate)}
      />
      <DrawingOrderSubmenu drawings={drawings} />
      <DrawingVisibilitySubmenu
        interval={drawings.interval}
        onApply={(visibility) => onAction(() => drawings.updateSelected({ visibility }))}
      />
      {onOpenObjectTree ? (
        <MenuItem className={drawingMenuItemClass} onClick={() => onAction(onOpenObjectTree)}>
          <DrawingMenuIcon />
          Object tree
        </MenuItem>
      ) : null}
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
      <MenuSubPopup
        aria-label="Visual order"
        alignOffset={-6}
        className={drawingContextMenuPopupClass}
        style={drawingMenuStyle}
      >
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
          <DrawingNumberField
            label="Price label font size"
            min={8}
            max={48}
            value={drawing.priceLabelFontSize ?? 12}
            onValueChange={(priceLabelFontSize) => onChange({ priceLabelFontSize })}
            className="w-14"
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
