import { positionDrawingAnchors } from "./projectionDrawingGeometry";
import { clampDrawingToolbarOffset } from "./drawingToolbarBounds";
import { DrawingRenameDialog } from "./DrawingRenameDialog";
import { mergeDrawingChanges } from "./drawingChanges";
import { drawingKindLabel } from "./drawingNames";
import {
  DEFAULT_DRAWING_TEXT_BACKGROUND_COLOR,
  DEFAULT_DRAWING_TEXT_BACKGROUND_OPACITY,
} from "./drawingTextLayout";
import { DrawingGroupSettings } from "./DrawingGroupSettings";
import { getDrawingGroupAppearance } from "./drawingGroupAppearance";
import { supportsInlineDrawingText } from "./drawingPrimitive";
import { getZoomedDrawingDialogBounds } from "./drawingDialogBounds";
import { useChartOverlayLayout } from "./chartOverlayLayout";
import { DRAWING_TEXT_FONT_SIZES, DrawingTextSettings } from "./DrawingTextSettings";
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
  isPitchforkDrawingTool,
} from "./drawingGeometry";
import { DrawingRegressionSettings } from "./DrawingRegressionSettings";
import { DrawingFibTimeSettings } from "./DrawingFibTimeSettings";
import { DrawingLevelSettings } from "./DrawingLevelSettings";
import { DrawingPitchforkSettings } from "./DrawingPitchforkSettings";
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
  return drawingKindLabel(drawing.kind);
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
  const [editingName, setEditingName] = useState("");
  const nameBeforeEdit = useRef(drawing.name ?? "");
  const restoreFocus = useRef(false);
  return (
    <DialogTitle
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      data-drawing-name-editing={editing || undefined}
      className={cn(
        "flex h-[68px] shrink-0 touch-none items-center gap-2 px-5 py-[17px] text-xl font-semibold leading-7",
        !editing && "pr-12",
      )}
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
          value={editingName}
          onChange={(event) => {
            setEditingName(event.target.value);
            onChange({ name: event.target.value });
          }}
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
          className="h-[34px] min-w-0 flex-1 rounded-[6px] border border-[#575757] bg-transparent px-[7px] text-xl font-semibold leading-7 outline-2 outline-offset-[-2px] outline-[#2962ff] [outline-style:solid]"
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
              setEditingName(drawing.name?.trim() || titleFor(drawing));
              setEditing(true);
            }}
            className="flex size-7 shrink-0 items-center justify-center rounded text-[#dbdbdb] hover:bg-white/10 focus-visible:outline-blue-500"
          >
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16.73 6.56a2.5 2.5 0 0 1 3.54 0l1.17 1.17a2.5 2.5 0 0 1 0 3.54l-.59.58-9 9-1 1-.14.15H6v-4.7l.15-.15 1-1 9-9 .58-.59Zm2.83.7a1.5 1.5 0 0 0-2.12 0l-.23.24 3.29 3.3.23-.24a1.5 1.5 0 0 0 0-2.12l-1.17-1.17Zm.23 4.24L16.5 8.2l-8.3 8.3 3.3 3.3 8.3-8.3Zm-9 9L7.5 17.2l-.5.5V21h3.3l.5-.5Z"
              />
            </svg>
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
  const [openingDraft] = useState(draft);
  // Display accepted peer coordinates without adding them to our local edit patch.
  // Callbacks retain the opening-based draft so the next keystroke cannot claim
  // an untouched endpoint that changed in another chart.
  const coordinateDisplay = mergeDrawingChanges(openingDraft, draft, drawing);
  const availableTabs =
    draft.kind === "text"
      ? ["Text", "Visibility"]
      : draft.kind === "regression-trend"
        ? ["Inputs", "Style", "Coordinates", "Visibility"]
        : supportsDrawingLevels(draft.kind) || ["crossline", "trend-angle"].includes(draft.kind)
          ? ["Style", "Coordinates", "Visibility"]
          : isSpecialChannelDrawing(draft.kind)
            ? ["Style", "Text", "Visibility"]
            : ["Style", "Text", "Coordinates", "Visibility"];
  const tab = availableTabs.includes(requestedTab) ? requestedTab : availableTabs[0]!;
  const [focusedTab, setFocusedTab] = useState(tab);
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
  const coordinateBars =
    tab === "Coordinates" && coordinateHasBar
      ? coordinateDisplay.anchors.map((anchor) => drawings.anchorBar(anchor))
      : [];
  const coordinateLabel = coordinateHasPrice ? (coordinateHasBar ? "price, bar" : "price") : "bar";
  const selectedStats = draft.stats ?? defaultDrawingStats(draft.kind);
  const extendable = supportsLineExtensions(draft.kind);
  const overlayLayout = useChartOverlayLayout();
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
  }, []);
  const visibility = sanitizeDrawingVisibility(draft.visibility);
  const { left: extendLeft, right: extendRight } = drawingLineExtensions(draft);
  const markers = drawingLineMarkers(draft);
  const canSave = validDrawingAnchors(draft.kind, draft.anchors);
  const channelOffset = draft.kind === "channel" ? drawings.channelPriceOffset(draft) : null;
  const dialogWidth =
    tab === "Visibility"
      ? 459.07
      : tab === "Style" && isSpecialChannelDrawing(draft.kind)
        ? 390
        : supportsDrawingLevels(draft.kind) &&
            !isFibTimeDrawing(draft.kind) &&
            !isPitchforkDrawingTool(draft.kind)
          ? 460
          : 380;
  const dialogBounds = dialogPosition
    ? getZoomedDrawingDialogBounds(
        dialogPosition,
        dialogWidth,
        overlayLayout.bounds ?? {
          left: Math.min(12, viewport.width / 2),
          top: Math.min(12, viewport.height / 2),
          width: Math.max(0, viewport.width - 24),
          height: Math.max(0, viewport.height - 24),
        },
        overlayLayout.scale,
      )
    : null;
  const save = () => {
    if (!canSave) return;
    // Each input has already previewed its change. Saving the entire form would
    // also submit untouched defaults and stale coordinates from another view.
    drawings.applySettings({});
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
        className="max-w-[calc(100vw-24px)] overflow-hidden rounded-md border-0 p-0 text-[#dbdbdb] transition-none data-starting-style:scale-100 data-ending-style:scale-100 data-starting-style:opacity-100 data-ending-style:opacity-100 [&:has([data-drawing-name-editing])_[data-drawing-settings-close]]:hidden"
        style={{
          background: "#1f1f1f",
          fontFamily: '-apple-system, system-ui, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
          backdropFilter: "none",
          width: dialogWidth,
          ...(dialogBounds
            ? { position: "fixed", ...dialogBounds, maxBlockSize: dialogBounds.maxHeight }
            : {}),
        }}
      >
        <DialogClose
          aria-label="Close"
          data-drawing-settings-close
          className="absolute right-[17px] top-[17px] z-10 flex size-[34px] items-center justify-center rounded text-[#dbdbdb] hover:bg-white/10 focus-visible:outline focus-visible:outline-blue-500"
        >
          <svg width="18" height="18" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="m1.5 1.5 11 11m0-11-11 11"
              stroke="currentColor"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </DialogClose>
        <DrawingSettingsTitle
          drawing={draft}
          onChange={update}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary) return;
            if (event.target instanceof Element && event.target.closest("button,input")) return;
            const rect = dialogElement.current?.getBoundingClientRect();
            if (!rect) return;
            dialogDrag.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              left: rect.left,
              top: rect.top,
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
          className="relative flex h-8 shrink-0 overflow-x-auto px-5 before:absolute before:inset-x-5 before:bottom-0 before:h-1 before:rounded-[2px] before:bg-[#4a4a4a]"
        >
          {availableTabs.map((name) => (
            <button
              type="button"
              role="tab"
              key={name}
              id={`drawing-tab-${name}`}
              aria-controls={`drawing-panel-${name}`}
              aria-selected={name === tab}
              tabIndex={name === focusedTab ? 0 : -1}
              onFocus={() => setFocusedTab(name)}
              onKeyDown={(event) => {
                const tabs = availableTabs;
                let index = tabs.indexOf(name);
                if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
                else if (event.key === "ArrowLeft") index = (index + tabs.length - 1) % tabs.length;
                else if (event.key === "Home") index = 0;
                else if (event.key === "End") index = tabs.length - 1;
                else return;
                event.preventDefault();
                (
                  event.currentTarget.parentElement?.children[index] as HTMLElement | undefined
                )?.focus();
              }}
              onClick={() => setTab(name)}
              className={cn(
                "relative mr-6 h-8 shrink-0 pb-2 text-base font-semibold leading-6 text-[#dbdbdb] outline-none before:pointer-events-none before:absolute before:-inset-x-2.5 before:-top-0.5 before:bottom-0 before:rounded-[8px] before:border-2 before:border-transparent after:absolute after:inset-x-0 after:bottom-0 after:h-1 after:rounded-[2px] after:bg-transparent hover:text-white focus-visible:before:border-[#2962ff]",
                tab === name && "after:bg-[#f2f2f2]",
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
                : tab === "Style" && isPitchforkDrawingTool(draft.kind)
                  ? "space-y-0"
                  : tab === "Style" && supportsLineStatistics(draft.kind)
                    ? "pb-8 [&>div]:min-h-[50px] [&>label]:min-h-[50px]"
                    : tab === "Style" && isSpecialChannelDrawing(draft.kind)
                      ? "space-y-0 [&>div]:min-h-[50px] [&>label]:min-h-[50px]"
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
            ) : isPitchforkDrawingTool(draft.kind) ? (
              <DrawingPitchforkSettings drawing={draft} onChange={update} />
            ) : (
              <DrawingLevelSettings drawing={draft} onChange={update} />
            )
          ) : null}
          {tab === "Style" &&
          !supportsDrawingLevels(draft.kind) &&
          draft.kind !== "channel" &&
          draft.kind !== "regression-trend" ? (
            <>
              <div
                className={cn(
                  "flex items-center",
                  isSpecialChannelDrawing(draft.kind) ? "gap-0" : axisLine ? "gap-5" : "gap-2",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 text-sm",
                    isSpecialChannelDrawing(draft.kind) ? "w-[124px]" : !axisLine && "w-[100px]",
                  )}
                >
                  {line ? "Line" : "Stroke"}
                </span>
                <div className="flex items-center gap-2">
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
              </div>
              {extendable ? (
                <label
                  className={cn(
                    "flex items-center text-sm",
                    !isSpecialChannelDrawing(draft.kind) && "gap-2",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0",
                      isSpecialChannelDrawing(draft.kind) ? "w-[124px]" : "w-[100px]",
                    )}
                  >
                    Extend
                  </span>
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
              {draft.kind === "ghost-feed" ? (
                <div className="space-y-3">
                  {(
                    [
                      ["ghostRange", "Candle range (price)", 10],
                      ["ghostVariance", "Variance (price)", 3],
                      ["ghostBars", "Candles per segment", 12],
                    ] as const
                  ).map(([key, label, fallback]) => (
                    <label key={key} className="flex items-center justify-between gap-3 text-sm">
                      {label}
                      <DrawingNumberField
                        label={label}
                        value={draft[key] ?? fallback}
                        integerOnly={key === "ghostBars"}
                        step={key === "ghostBars" ? 1 : drawings.coordinatePriceStep()}
                        onValueChange={(value) => {
                          if (
                            value >= (key === "ghostBars" ? 2 : 0) &&
                            value <= (key === "ghostBars" ? 100 : 1_000_000)
                          )
                            update({ [key]: value });
                        }}
                      />
                    </label>
                  ))}
                </div>
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
                        ["auto", "Auto"],
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
                    <span className="w-[113px] shrink-0 pr-5 text-sm leading-[18px] text-[#dbdbdb]">
                      {draft.kind === "long-position" || draft.kind === "short-position"
                        ? ["Entry", "Target", "Stop"][index]
                        : `#${index + 1}`}{" "}
                      ({coordinateLabel})
                    </span>
                    <div className="flex gap-2">
                      {coordinateHasPrice ? (
                        <DrawingNumberField
                          label={`Point ${index + 1} price`}
                          step={drawings.coordinatePriceStep()}
                          precision={drawings.coordinatePricePrecision()}
                          value={drawings.coordinatePrice(
                            coordinateDisplay.anchors[index]?.price ?? anchor.price,
                          )}
                          onValueChange={(price) => {
                            const next = {
                              ...anchor,
                              price: drawings.normalizeCoordinatePrice(price),
                            };
                            const anchors =
                              draft.kind === "trend-angle"
                                ? drawings.anchorsAtOrigin(draft, next)
                                : draft.kind === "channel" && (index === 0 || index === 1)
                                  ? drawings.channelAnchorsAtEndpoint(draft, index, next)
                                  : positionDrawingAnchors(
                                      draft.kind,
                                      draft.anchors.map((point, i) => (i === index ? next : point)),
                                      index,
                                    );
                            if (anchors) update({ anchors });
                          }}
                        />
                      ) : null}
                      {coordinateHasBar ? (
                        <DrawingNumberField
                          label={`Point ${index + 1} bar`}
                          integerOnly
                          step={1}
                          disabled={coordinateBars[index] == null}
                          value={
                            coordinateBars[index] == null ? null : Math.round(coordinateBars[index])
                          }
                          onValueChange={(bar) => {
                            const next = drawings.anchorAtBar(bar, anchor.price);
                            if (next) {
                              const anchors =
                                draft.kind === "trend-angle"
                                  ? drawings.anchorsAtOrigin(draft, next)
                                  : draft.kind === "channel" && (index === 0 || index === 1)
                                    ? drawings.channelAnchorsAtEndpoint(draft, index, next)
                                    : positionDrawingAnchors(
                                        draft.kind,
                                        draft.anchors.map((point, i) =>
                                          i === index ? next : point,
                                        ),
                                        index,
                                      );
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
                    min={-360}
                    max={360}
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
                    precision={drawings.coordinatePricePrecision()}
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
        <div className="flex shrink-0 justify-end gap-3 border-t border-[#4a4a4a] px-5 py-4 max-sm:gap-2 max-sm:px-3">
          <div className="mr-auto">
            <DrawingTemplateMenu
              drawing={draft}
              onResetDefaults={() => drawings.resetDrawingDefaults(draft.kind)}
              onApply={(patch) => {
                const next = applyDrawingTemplate(draft, patch);
                setDraft({
                  ...defaultDrawingLevelSettings(next.kind),
                  ...defaultChannelDrawingSettings(next.kind),
                  ...(next.kind === "regression-trend" ? defaultRegressionDrawingSettings() : {}),
                  ...next,
                });
                drawings.previewSettings(patch, { replace: true });
              }}
            />
          </div>
          <button
            type="button"
            onClick={drawings.closeSettings}
            className="h-[34px] rounded border border-white px-[11px] text-base font-normal text-white hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={save}
            className="h-[34px] rounded border border-[#f2f2f2] bg-[#f2f2f2] px-[11px] text-base font-normal text-[#0f0f0f] hover:bg-white disabled:opacity-40"
          >
            Ok
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
  const { scale: toolbarScale } = useChartOverlayLayout();
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [compactToolbar, setCompactToolbar] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolbarControlsRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const optionsPopupRef = useRef<HTMLDivElement | null>(null);
  const contextPopupRef = useRef<HTMLDivElement | null>(null);
  const revealToolbarControl = useCallback(
    (control: Element | null) => {
      const scroller = toolbarControlsRef.current;
      // Portal popovers bubble React focus events but must not move the toolbar.
      if (!scroller || !control || !scroller.contains(control)) return;
      const viewport = scroller.getBoundingClientRect();
      const bounds = control.getBoundingClientRect();
      if (bounds.left < viewport.left)
        scroller.scrollLeft += (bounds.left - viewport.left) / toolbarScale;
      else if (bounds.right > viewport.right)
        scroller.scrollLeft += (bounds.right - viewport.right) / toolbarScale;
    },
    [toolbarScale],
  );
  const [settingsTab, setSettingsTab] = useState("Style");
  const [templateDrawing, setTemplateDrawing] = useState<{
    drawing: ChartDrawing;
    renameFrom?: string;
  } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    drawing: ChartDrawing;
    trigger: HTMLElement | null;
  } | null>(null);
  if (renameTarget && drawings.selected?.id !== renameTarget.drawing.id) setRenameTarget(null);
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const selected = drawings.selected;
  const group = drawings.selectedObjects.length > 1;
  const groupAppearance = group ? getDrawingGroupAppearance(drawings.selectedObjects) : null;
  const allLocked = drawings.selectedObjects.every((drawing) => drawing.locked);
  const mixed = (value: (drawing: ChartDrawing) => unknown) =>
    new Set(drawings.selectedObjects.map(value)).size > 1;
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    const chart = toolbar?.parentElement;
    if (!toolbar || !chart) return;
    const resize = () => {
      setCompactToolbar(chart.clientWidth < 440);
      setOffset((previous) => {
        const next = clampDrawingToolbarOffset(
          previous,
          { width: chart.clientWidth, height: chart.clientHeight },
          { width: toolbar.offsetWidth, height: toolbar.offsetHeight },
          toolbarScale,
        );
        return next.x === previous.x && next.y === previous.y ? previous : next;
      });
      revealToolbarControl(document.activeElement);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(chart);
    observer.observe(toolbar);
    return () => observer.disconnect();
    // Selection/tool changes mount or replace the toolbar node observed above.
    // eslint-disable-next-line react/exhaustive-effect-dependencies
  }, [selected?.id, drawings.tool, group, revealToolbarControl, toolbarScale]);
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
  const menuFinalFocus = (returnToChart: boolean) => {
    const stillExists = drawings
      .getCommittedDrawings()
      ?.some((drawing) => drawing.id === selected.id);
    const active = document.activeElement;
    const contextTrigger = returnToChart ? drawings.getContextMenuTrigger() : null;
    // An explicit focus callback bypasses the popup's default outside-focus guard.
    // Respect another chart or a newly opened dialog when it already owns focus.
    if (
      active &&
      active !== document.body &&
      active.isConnected &&
      !optionsPopupRef.current?.contains(active) &&
      !contextPopupRef.current?.contains(active) &&
      !(!stillExists && (toolbarRef.current?.contains(active) || active === contextTrigger))
    )
      return false;
    if (stillExists && contextTrigger?.isConnected) return contextTrigger;
    // Removal unmounts the trigger. Let the popup's own focus cleanup
    // return to this chart instead of falling back to the page body.
    return !returnToChart && stillExists && moreTriggerRef.current?.isConnected
      ? moreTriggerRef.current
      : drawings.getChartElement();
  };
  const closeThen = (action: () => void) => {
    drawings.closeContextMenu();
    action();
  };
  return (
    <>
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label={group ? "Selected drawings" : "Selected drawing"}
        className="absolute left-1/2 top-3 z-20 flex w-max max-w-[calc(100%-16px)] -translate-x-1/2 items-center rounded-[6px] bg-[#1f1f1f] text-zinc-200 shadow-lg"
        style={{
          marginLeft: offset.x,
          marginTop: offset.y,
          scale: toolbarScale,
          transformOrigin: "top center",
          maxWidth: `calc((100% - 16px) / ${toolbarScale})`,
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
            setOffset(
              clampDrawingToolbarOffset(
                {
                  x: drag.current.originX + event.clientX - drag.current.x,
                  y: drag.current.originY + event.clientY - drag.current.y,
                },
                chart,
                { width: parent.offsetWidth, height: parent.offsetHeight },
                toolbarScale,
              ),
            );
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
        <div
          ref={toolbarControlsRef}
          className="min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onFocusCapture={(event) => revealToolbarControl(event.target)}
        >
          <div className="flex w-max items-center">
            <DrawingTemplateMenu
              compact
              drawing={selected}
              onResetDefaults={() => drawings.resetDrawingDefaults(selected.kind)}
              onApply={drawings.applySelectedTemplate}
            />
            {group ? (
              <>
                <WidthPicker
                  variant="toolbar"
                  compact={compactToolbar}
                  drawing={{ ...selected, ...groupAppearance?.appearance }}
                  mixed={groupAppearance?.mixed.width ?? false}
                  onChange={drawings.updateSelected}
                />
                <LineStylePicker
                  variant="toolbar"
                  drawing={{ ...selected, ...groupAppearance?.appearance }}
                  mixed={groupAppearance?.mixed.lineStyle ?? false}
                  onChange={drawings.updateSelected}
                />
                <ColorPicker
                  variant="toolbar"
                  value={groupAppearance?.appearance.color ?? selected.color}
                  icon="pencil"
                  mixed={groupAppearance?.mixed.color ?? false}
                  opacity={groupAppearance?.appearance.lineOpacity ?? selected.lineOpacity ?? 1}
                  onOpacityChange={(lineOpacity) => drawings.updateSelected({ lineOpacity })}
                  onChange={(color) => drawings.updateSelected({ color })}
                />
                {drawings.selectedObjects.some((drawing) =>
                  supportsInlineDrawingText(drawing.kind),
                ) ? (
                  <ColorPicker
                    variant="toolbar"
                    label="Text color"
                    icon="letter-t"
                    value={selected.textColor ?? selected.color}
                    mixed={mixed((drawing) => drawing.textColor ?? drawing.color)}
                    onChange={(textColor) => drawings.updateSelected({ textColor })}
                  />
                ) : null}
              </>
            ) : selected.kind === "regression-trend" ? (
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
                {selected.background ? (
                  <ColorPicker
                    variant="toolbar"
                    label="Background color"
                    icon="bucket-droplet"
                    value={selected.backgroundColor ?? DEFAULT_DRAWING_TEXT_BACKGROUND_COLOR}
                    opacity={selected.backgroundOpacity ?? DEFAULT_DRAWING_TEXT_BACKGROUND_OPACITY}
                    onChange={(backgroundColor) => drawings.updateSelected({ backgroundColor })}
                    onOpacityChange={(backgroundOpacity) =>
                      drawings.updateSelected({ backgroundOpacity })
                    }
                  />
                ) : null}
                <DrawingSelect
                  label="Text size"
                  value={String(selected.textFontSize ?? 14)}
                  onChange={(value) => drawings.updateSelected({ textFontSize: Number(value) })}
                  options={DRAWING_TEXT_FONT_SIZES.map(
                    (size) => [String(size), String(size)] as const,
                  )}
                  className="w-16"
                />
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
                      ? new Set(channelLevels.map((level) => level.color ?? selected.color)).size >
                        1
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
                      ? new Set(channelLevels.map((level) => level.width ?? selected.width)).size >
                        1
                      : false
                  }
                />
                <LineStylePicker
                  variant="toolbar"
                  drawing={toolbarAppearance}
                  onChange={updateLineAppearance}
                  mixed={
                    channelLevels
                      ? new Set(
                          channelLevels.map(
                            (level) => level.lineStyle ?? selected.lineStyle ?? "solid",
                          ),
                        ).size > 1
                      : false
                  }
                />
              </>
            )}
            {!compactToolbar ? (
              <>
                <IconButton label="Drawing settings" onClick={drawings.openSettings}>
                  <DrawingToolIcon name="nut" className="size-7 rotate-90" />
                </IconButton>
                {!group && onCreateAlert && supportsDrawingAlert(selected) ? (
                  <IconButton label="Add drawing alert" onClick={() => onCreateAlert(selected)}>
                    <AlertIcon name="alarm-add" size={28} />
                  </IconButton>
                ) : null}
                <IconButton
                  label={allLocked ? "Unlock drawing" : "Lock drawing"}
                  active={allLocked}
                  onClick={() => drawings.updateSelected({ locked: !allLocked })}
                >
                  <DrawingToolIcon name={allLocked ? "lock" : "lock-open"} className="size-7" />
                </IconButton>
              </>
            ) : null}
          </div>
        </div>
        <IconButton label="Delete drawing" onClick={drawings.deleteSelected}>
          <ChartIcon name="trash" className="size-7" />
        </IconButton>
        <Menu
          onOpenChangeComplete={(open) => {
            if (open) return;
            // Popup cleanup can briefly return focus before removing the modal guards.
            // Recover only abandoned page focus after that cleanup has finished.
            requestAnimationFrame(() => {
              if (document.activeElement === document.body)
                (moreTriggerRef.current ?? drawings.getChartElement())?.focus({
                  preventScroll: true,
                });
            });
          }}
        >
          <MenuTrigger
            ref={moreTriggerRef}
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
            ref={(node) => {
              // Retain the closing popup for the focus cleanup after unmount.
              if (node) optionsPopupRef.current = node;
            }}
            finalFocus={() => menuFinalFocus(false)}
            className={drawingContextMenuPopupClass}
            style={drawingMenuStyle}
          >
            <DrawingMenuCommands
              drawings={drawings}
              onSaveTemplate={() => setTemplateDrawing({ drawing: selected })}
              onRenameTemplate={(name) =>
                setTemplateDrawing({ drawing: selected, renameFrom: name })
              }
              onRename={() =>
                setRenameTarget({ drawing: selected, trigger: moreTriggerRef.current })
              }
              onOpenObjectTree={onOpenObjectTree}
              onCreateAlert={onCreateAlert}
            />
          </MenuPopup>
        </Menu>
      </div>
      {drawings.settingsOpen && group ? (
        <DrawingGroupSettings drawings={drawings} />
      ) : drawings.settingsOpen ? (
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
            ref={(node) => {
              if (node) contextPopupRef.current = node;
            }}
            finalFocus={() => menuFinalFocus(true)}
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
              onSaveTemplate={() => setTemplateDrawing({ drawing: selected })}
              onRenameTemplate={(name) =>
                setTemplateDrawing({ drawing: selected, renameFrom: name })
              }
              onRename={() => {
                const renameInTree = drawings.getContextMenuRenameAction();
                if (renameInTree) renameInTree();
                else
                  setRenameTarget({
                    drawing: selected,
                    trigger: drawings.getContextMenuTrigger() ?? moreTriggerRef.current,
                  });
              }}
              onOpenObjectTree={onOpenObjectTree}
              onCreateAlert={onCreateAlert}
            />
          </MenuPopup>
        </ContextMenu.Root>
      ) : null}
      {renameTarget && selected.id === renameTarget.drawing.id ? (
        <DrawingRenameDialog
          key={renameTarget.drawing.id}
          drawing={renameTarget.drawing}
          onRename={drawings.renameDrawing}
          onClose={() => setRenameTarget(null)}
          returnFocus={() =>
            renameTarget.trigger?.isConnected ? renameTarget.trigger : drawings.getChartElement()
          }
        />
      ) : null}
      {templateDrawing ? (
        <DrawingTemplateSaveDialog
          drawing={templateDrawing.drawing}
          renameFrom={templateDrawing.renameFrom}
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
  onRenameTemplate,
  onRename,
  onOpenObjectTree,
  onCreateAlert,
}: {
  drawings: ChartDrawingsController;
  onAction?: (action: () => void) => void;
  onSaveTemplate: () => void;
  onRenameTemplate: (name: string) => void;
  onRename: () => void;
  onOpenObjectTree?: (() => void) | undefined;
  onCreateAlert?: ((drawing: ChartDrawing) => void) | undefined;
}) {
  const selected = drawings.selected;
  if (!selected) return null;
  const group = drawings.selectedObjects.length > 1;
  const allLocked = drawings.selectedObjects.every((drawing) => drawing.locked);
  const allHidden = drawings.selectedObjects.every((drawing) => drawing.hidden);
  const mac = typeof navigator !== "undefined" && isMacPlatform(navigator.platform);
  const modifier = mac ? "⌘" : "Ctrl";
  const copy = () => {
    void (group ? drawings.copySelected() : drawings.copyDrawing(selected.id)).then((copied) => {
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
      {!group && onCreateAlert && supportsDrawingAlert(selected) ? (
        <MenuItem
          className={drawingMenuItemClass}
          onClick={() => onAction(() => onCreateAlert(selected))}
        >
          <DrawingMenuIcon>
            <AlertIcon name="alarm-add" size={18} />
          </DrawingMenuIcon>
          Add alert on {drawingKindLabel(selected.kind).toLowerCase()}…
          <MenuShortcut className="tracking-normal">{mac ? "⌥" : "Alt"} A</MenuShortcut>
        </MenuItem>
      ) : null}
      <DrawingTemplateSubmenu
        drawing={selected}
        onResetDefaults={() => drawings.resetDrawingDefaults(selected.kind)}
        onApply={(patch) => onAction(() => drawings.applySelectedTemplate(patch))}
        onSave={() => onAction(onSaveTemplate)}
        onRename={(name) => onAction(() => onRenameTemplate(name))}
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
        onClick={() =>
          onAction(() =>
            group ? drawings.duplicateSelected() : drawings.duplicateDrawing(selected.id),
          )
        }
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
      {!group ? (
        <MenuItem className={drawingMenuItemClass} onClick={() => onAction(onRename)}>
          <DrawingMenuIcon />
          Rename
        </MenuItem>
      ) : null}
      <MenuSeparator />
      {[
        {
          label: allLocked ? "Unlock" : "Lock",
          action: () => drawings.updateSelected({ locked: !allLocked }),
          icon: <DrawingToolIcon name={allLocked ? "lock-open" : "lock"} className="size-4.5" />,
        },
        {
          label: allHidden ? "Show" : "Hide",
          action: () => drawings.updateSelected({ hidden: !allHidden }),
          icon: <DrawingToolIcon name={allHidden ? "eye" : "eye-off"} className="size-4.5" />,
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
          <DrawingToolIcon name="nut" className="size-4.5 rotate-90" />
        </DrawingMenuIcon>
        Settings…
      </MenuItem>
    </>
  );
}
function DrawingOrderSubmenu({ drawings }: { drawings: ChartDrawingsController }) {
  const selectedIndices = drawings.objects.flatMap((drawing, index) =>
    drawings.selectedIds.includes(drawing.id) ? [index] : [],
  );
  const index = selectedIndices[0] ?? -1;
  const last = drawings.objects.length - 1;
  const atFront = selectedIndices.every(
    (value, offset) => value === last - selectedIndices.length + 1 + offset,
  );
  const atBack = selectedIndices.every((value, offset) => value === offset);
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
            ["front", "Bring to front", atFront],
            ["back", "Send to back", atBack],
            ["forward", "Bring forward", atFront],
            ["backward", "Send backward", atBack],
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
  const background = drawing.background ?? true;
  const fontSize = drawing.priceLabelFontSize ?? 12;
  const fontSizes: readonly number[] = DRAWING_TEXT_FONT_SIZES;
  const fontOptions = (
    fontSizes.includes(fontSize) ? fontSizes : [...fontSizes, fontSize].sort((a, b) => a - b)
  ).map((size) => [String(size), String(size)] as const);
  return (
    <>
      <div className="flex h-[50px] items-center">
        <div className="w-[124px] shrink-0">
          <Check
            label="Prices"
            checked={prices}
            onChange={(showPriceLabel) => onChange({ showPriceLabel })}
          />
        </div>
        <div className="flex items-center gap-2" inert={!prices}>
          <ColorPicker
            variant="settings"
            disabled={!prices}
            label="Price label color"
            value={drawing.priceLabelColor ?? drawing.color}
            onChange={(priceLabelColor) => onChange({ priceLabelColor })}
          />
          <DrawingSelect
            label="Price label font size"
            disabled={!prices}
            value={String(fontSize)}
            options={fontOptions}
            onChange={(value) => onChange({ priceLabelFontSize: Number(value) })}
            className="h-[34px] w-[100px] shrink-0 disabled:opacity-40"
          />
          <button
            type="button"
            aria-label="Bold price labels"
            disabled={!prices}
            aria-pressed={drawing.priceLabelBold ?? false}
            onClick={() => onChange({ priceLabelBold: !drawing.priceLabelBold })}
            className={cn(
              "size-[34px] shrink-0 rounded border border-white/15 font-bold hover:bg-white/10 disabled:opacity-40",
              drawing.priceLabelBold && "bg-white/15",
            )}
          >
            B
          </button>
          <button
            type="button"
            aria-label="Italic price labels"
            disabled={!prices}
            aria-pressed={drawing.priceLabelItalic ?? false}
            onClick={() => onChange({ priceLabelItalic: !drawing.priceLabelItalic })}
            className={cn(
              "size-[34px] shrink-0 rounded border border-white/15 italic hover:bg-white/10 disabled:opacity-40",
              drawing.priceLabelItalic && "bg-white/15",
            )}
          >
            I
          </button>
        </div>
      </div>
      <div className="flex h-[50px] items-center">
        <div className="w-[124px] shrink-0">
          <Check
            label="Background"
            checked={background}
            onChange={(background) => onChange({ background })}
          />
        </div>
        <ColorPicker
          variant="settings"
          disabled={!background}
          label="Background color"
          value={drawing.backgroundColor ?? drawing.color}
          onChange={(backgroundColor) => onChange({ backgroundColor })}
          opacity={drawing.backgroundOpacity ?? 0.12}
          onOpacityChange={(backgroundOpacity) => onChange({ backgroundOpacity })}
        />
      </div>
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
