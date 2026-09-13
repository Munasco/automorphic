import { useCallback, useEffect, useId, useRef, useState, type PointerEventHandler } from "react";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "../ui/dialog";
import { cn } from "../../lib/utils";
import { ColorPicker, inputClass, LineAppearancePicker } from "./DrawingStyleControls";
import { DrawingVisibilitySettings } from "./DrawingVisibilitySettings";
import { drawingPriceLabelVisible } from "./drawingGeometry";
import { getDrawingDialogBounds } from "./drawingDialogBounds";
import { sanitizeDrawingVisibility, type DrawingVisibility } from "./drawingVisibility";
import type {
  ChartDrawingsController,
  DrawingPatch,
  DrawingVisibilityPatch,
} from "./useChartDrawings";

const tabs = ["Style", "Displacement", "Visibility"] as const;
type Tab = (typeof tabs)[number];

function displacement(price: string, bars: string) {
  let priceOffset = 0;
  let priceMultiplier = 1;
  let barOffset = 0;
  if (price.trim()) {
    const match = /^([+\-*/])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(price.trim());
    if (!match) return null;
    const value = Number(match[2]);
    switch (match[1]) {
      case "+":
        priceOffset = value;
        break;
      case "-":
        priceOffset = -value;
        break;
      case "*":
        priceMultiplier = value;
        break;
      case "/":
        priceMultiplier = 1 / value;
        break;
    }
  }
  if (bars.trim()) {
    if (!/^[+-]\s*\d+$/.test(bars.trim())) return null;
    barOffset = Number(bars.replace(/\s/g, ""));
  }
  return [priceOffset, priceMultiplier, barOffset].every(Number.isFinite)
    ? { price: priceOffset, priceMultiplier, bars: barOffset }
    : null;
}

function changedVisibility(before: DrawingVisibility, after: DrawingVisibility) {
  const patch: DrawingVisibilityPatch = {};
  if (before.ticks !== after.ticks) patch.ticks = after.ticks;
  if (before.ranges !== after.ranges) patch.ranges = after.ranges;
  for (const unit of ["seconds", "minutes", "hours", "days", "weeks", "months"] as const) {
    const changed: Partial<DrawingVisibility[typeof unit]> = {};
    if (before[unit].enabled !== after[unit].enabled) changed.enabled = after[unit].enabled;
    if (before[unit].min !== after[unit].min) changed.min = after[unit].min;
    if (before[unit].max !== after[unit].max) changed.max = after[unit].max;
    if (Object.keys(changed).length) patch[unit] = changed;
  }
  return patch;
}

export function DrawingGroupSettings({ drawings }: { drawings: ChartDrawingsController }) {
  const id = useId();
  const [tab, setTab] = useState<Tab>("Style");
  const [priceExpression, setPriceExpression] = useState("");
  const [barExpression, setBarExpression] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
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
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
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
  const dialogWidth = tab === "Visibility" ? 459.07 : 432;
  const dialogBounds = dialogPosition
    ? getDrawingDialogBounds(dialogPosition, dialogWidth, viewport)
    : null;
  const finishDrag: PointerEventHandler<HTMLElement> = (event) => {
    if (dialogDrag.current?.pointerId !== event.pointerId) return;
    dialogDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const selected = drawings.selectedObjects;
  const first = selected[0];
  if (!first) return null;

  const mixed = <T,>(value: (drawing: (typeof selected)[number]) => T) =>
    selected.some((drawing) => !Object.is(value(drawing), value(first)));
  const mixedLine =
    mixed((drawing) => drawing.color) ||
    mixed((drawing) => drawing.width) ||
    mixed((drawing) => drawing.lineStyle ?? "solid") ||
    mixed((drawing) => drawing.lineOpacity ?? 1);
  const mixedPriceLabel = mixed(drawingPriceLabelVisible);
  const visibility = sanitizeDrawingVisibility(first.visibility);
  const mixedVisibility = mixed((drawing) =>
    JSON.stringify(sanitizeDrawingVisibility(drawing.visibility)),
  );
  const parsedDisplacement = displacement(priceExpression, barExpression);
  const canSave = parsedDisplacement !== null && !previewFailed;
  const update = (patch: DrawingPatch) => drawings.previewSettings(patch);
  const save = () => {
    if (canSave) drawings.applySettings({});
  };
  const previewDisplacement = (price: string, bars: string) => {
    const parsed = displacement(price, bars);
    setPreviewFailed(parsed !== null && !drawings.previewSelectedDisplacement(parsed));
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) drawings.closeSettings();
      }}
    >
      <DialogPopup
        ref={measureDialog}
        showCloseButton={false}
        bottomStickOnMobile={false}
        backdropStyle={{ background: "transparent", backdropFilter: "none", transition: "none" }}
        className="max-w-[calc(100vw-24px)] overflow-hidden rounded-md border-0 p-0 text-zinc-100 transition-none data-starting-style:scale-100 data-ending-style:scale-100 data-starting-style:opacity-100 data-ending-style:opacity-100"
        style={{
          width: dialogWidth,
          background: "#202020",
          fontFamily: '-apple-system, system-ui, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
          backdropFilter: "none",
          ...(dialogBounds ? { position: "fixed", ...dialogBounds } : {}),
        }}
        onKeyDown={(event) => {
          if (event.defaultPrevented || event.nativeEvent.isComposing) return;
          if (!(event.target instanceof HTMLElement) || !event.currentTarget.contains(event.target))
            return;
          if (event.key === "Enter" && !event.target.closest("textarea,button,[role=combobox]")) {
            event.preventDefault();
            save();
          }
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
        <DialogTitle
          className="touch-none px-5 pb-6 pt-6 pr-14 text-xl font-semibold leading-6"
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary || !dialogBounds) return;
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
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={finishDrag}
        >
          Selected Drawings
        </DialogTitle>
        <div
          role="tablist"
          aria-label="Selected drawings settings"
          className="relative flex h-8 shrink-0 overflow-x-auto px-5 before:absolute before:inset-x-5 before:bottom-0 before:h-1 before:rounded-[2px] before:bg-[#4a4a4a]"
        >
          {tabs.map((name, index) => (
            <button
              key={name}
              type="button"
              role="tab"
              id={`${id}-tab-${name}`}
              aria-controls={`${id}-panel-${name}`}
              aria-selected={tab === name}
              tabIndex={tab === name ? 0 : -1}
              onClick={() => setTab(name)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                setTab(tabs[next]!);
                (
                  event.currentTarget.parentElement?.children[next] as HTMLElement | undefined
                )?.focus();
              }}
              className={cn(
                "relative mr-6 h-8 shrink-0 pb-2 text-base font-semibold leading-6 text-zinc-400 outline-none after:absolute after:inset-x-0 after:bottom-0 after:h-1 after:rounded-[2px] hover:text-white focus-visible:outline-2 focus-visible:outline-blue-500",
                tab === name && "text-white after:bg-[#f2f2f2]",
              )}
            >
              {name}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${id}-panel-${tab}`}
          aria-labelledby={`${id}-tab-${tab}`}
          className="max-h-[calc(100dvh-220px)] overflow-auto px-5 py-4"
        >
          {tab === "Style" ? (
            <>
              <div className="flex h-[50px] items-center text-sm">
                <span className="w-[113px] shrink-0">Line</span>
                <LineAppearancePicker
                  drawing={first}
                  onChange={update}
                  label="Selected drawings line appearance"
                />
                {mixedLine ? <span className="ml-3 text-xs text-zinc-400">Mixed</span> : null}
              </div>
              <label className="flex h-[50px] cursor-pointer items-center gap-2 text-sm">
                <span className="relative flex size-[18px] shrink-0">
                  <input
                    type="checkbox"
                    aria-label="Price label"
                    aria-checked={mixedPriceLabel ? "mixed" : drawingPriceLabelVisible(first)}
                    ref={(node) => {
                      if (node) node.indeterminate = mixedPriceLabel;
                    }}
                    checked={!mixedPriceLabel && drawingPriceLabelVisible(first)}
                    onChange={(event) => update({ showPriceLabel: event.target.checked })}
                    className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none flex size-full items-center justify-center rounded-[3px] border border-[#f2f2f2] text-[#2e2e2e] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-500",
                      (mixedPriceLabel || drawingPriceLabelVisible(first)) && "bg-[#f2f2f2]",
                    )}
                  >
                    {mixedPriceLabel ? (
                      <span className="h-0.5 w-2.5 bg-current" />
                    ) : drawingPriceLabelVisible(first) ? (
                      <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                        <path stroke="currentColor" strokeWidth="2" d="M1 4 4 7 10 1" />
                      </svg>
                    ) : null}
                  </span>
                </span>
                Price label
              </label>
              <div className="flex h-[50px] items-center text-sm">
                <span className="w-[113px] shrink-0">Text color</span>
                <ColorPicker
                  value={first.textColor ?? first.color}
                  mixed={mixed((drawing) => drawing.textColor ?? drawing.color)}
                  label="Selected drawings text color"
                  variant="settings"
                  onChange={(textColor) => update({ textColor })}
                />
              </div>
            </>
          ) : null}
          {tab === "Displacement" ? (
            <div className="grid min-h-[113px] grid-cols-[minmax(0,1fr)_100px_100px] items-start gap-x-2 gap-y-2 max-[420px]:grid-cols-2">
              <span className="self-center text-sm max-[420px]:col-span-2">
                Displacement (price, bar)
              </span>
              <input
                aria-label="Price displacement"
                aria-describedby={`${id}-displacement-help`}
                aria-invalid={parsedDisplacement === null || previewFailed}
                value={priceExpression}
                placeholder="e.g. /2"
                autoComplete="off"
                spellCheck={false}
                className={cn(inputClass, "min-w-0 w-full")}
                onChange={(event) => {
                  setPriceExpression(event.target.value);
                  previewDisplacement(event.target.value, barExpression);
                }}
              />
              <input
                aria-label="Bar displacement"
                aria-describedby={`${id}-displacement-help`}
                aria-invalid={parsedDisplacement === null || previewFailed}
                value={barExpression}
                placeholder="e.g. +1"
                autoComplete="off"
                spellCheck={false}
                className={cn(inputClass, "min-w-0 w-full")}
                onChange={(event) => {
                  setBarExpression(event.target.value);
                  previewDisplacement(priceExpression, event.target.value);
                }}
              />
              <p
                id={`${id}-displacement-help`}
                className="col-span-2 col-start-2 text-[13px] leading-[18px] text-zinc-400 max-[420px]:col-start-1"
              >
                Use special math signs to displace selected drawings: +,-,/,* for price and +,- for
                bar index.
              </p>
              {previewFailed ? (
                <p role="alert" className="col-span-full text-xs text-red-400">
                  This displacement cannot be applied to the selected drawings.
                </p>
              ) : null}
            </div>
          ) : null}
          {tab === "Visibility" ? (
            <>
              {mixedVisibility ? (
                <p className="mb-2 text-xs text-zinc-400">Mixed visibility</p>
              ) : null}
              <DrawingVisibilitySettings
                visibility={visibility}
                onChange={(next) =>
                  drawings.previewSelectedVisibility(changedVisibility(visibility, next))
                }
              />
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={drawings.closeSettings}
            className="h-[34px] rounded border border-white/20 px-[11px] text-base hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={save}
            className="h-[34px] rounded bg-[#f2f2f2] px-[11px] text-base text-[#202020] hover:bg-white disabled:opacity-40"
          >
            Ok
          </button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
