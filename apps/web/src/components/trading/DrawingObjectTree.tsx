import { useEffect, useRef, type ReactNode } from "react";
import { XIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { ChartDrawingGlyph } from "./ChartDrawingGlyph";
import { ChartIcon } from "./ChartIcon";
import { DrawingToolIcon } from "./DrawingToolIcon";
import type { ChartDrawing } from "./drawingGeometry";
import type { ChartDrawingsController } from "./useChartDrawings";

export interface DrawingObjectTreeIndicator {
  key: string;
  label: string;
  hidden: boolean;
  onToggleHidden: () => void;
  onRemove: () => void;
}

const NO_INDICATORS: readonly DrawingObjectTreeIndicator[] = [];

function drawingLabel(drawing: ChartDrawing) {
  const labels: Partial<Record<ChartDrawing["kind"], string>> = {
    trend: "Trendline",
    horizontal: "Horizontal line",
    vertical: "Vertical line",
    fib: "Fib retracement",
    "fib-extension": "Trend-based fib extension",
    "fib-trend-time": "Trend-based fib time",
    channel: "Parallel channel",
    "flat-channel": "Flat top/bottom",
    "arrow-up": "Arrow mark up",
    "arrow-down": "Arrow mark down",
  };
  return (
    drawing.name ||
    (drawing.kind === "text" ? drawing.text : null) ||
    labels[drawing.kind] ||
    drawing.kind.replaceAll("-", " ").replace(/^\w/, (letter) => letter.toUpperCase())
  );
}

function RowAction({
  label,
  active = false,
  disabled = false,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded text-zinc-400 opacity-0 hover:bg-white/10 hover:text-white group-hover/object:opacity-100 group-focus-within/object:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 [@media(hover:none)]:opacity-100",
              active && "text-zinc-300 opacity-100",
              disabled && "pointer-events-none text-zinc-600",
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

export function DrawingObjectTree({
  drawings,
  symbol,
  onClose,
  indicators = NO_INDICATORS,
}: {
  drawings: ChartDrawingsController;
  symbol: string;
  onClose: () => void;
  indicators?: readonly DrawingObjectTreeIndicator[];
}) {
  const openMenu = (id: string, trigger: HTMLButtonElement, point?: { x: number; y: number }) => {
    trigger.focus({ preventScroll: true });
    const rect = trigger.getBoundingClientRect();
    drawings.openDrawingContextMenu(id, point ?? { x: rect.left, y: rect.bottom }, trigger);
  };
  const selectedRow = useRef<HTMLLIElement>(null);
  const selected = drawings.selected;
  const selectedId = selected?.id;
  const selectedIndex = drawings.objects.findIndex((object) => object.id === selectedId);
  const selectedIndices = drawings.objects.flatMap((drawing, index) =>
    drawings.selectedIds.includes(drawing.id) ? [index] : [],
  );
  const lastIndex = drawings.objects.length - 1;
  const atFront = selectedIndices.every(
    (value, offset) => value === lastIndex - selectedIndices.length + 1 + offset,
  );
  const atBack = selectedIndices.every((value, offset) => value === offset);
  useEffect(() => {
    if (selectedId) selectedRow.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <aside
      aria-label="Object tree"
      className="flex min-h-0 w-64 shrink-0 flex-col border-l border-white/10 bg-[#131313] text-zinc-200"
    >
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-3">
        <h3 className="text-sm font-medium">Object tree</h3>
        <div className="flex items-center gap-1">
          <Menu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <MenuTrigger
                    aria-label="Visual order"
                    disabled={selectedIndex < 0}
                    className="flex size-7 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-white data-popup-open:bg-white/10 data-popup-open:text-white disabled:pointer-events-none disabled:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
                  />
                }
              >
                <ChartIcon name="stack" className="size-4" />
              </TooltipTrigger>
              <TooltipPopup>Visual order</TooltipPopup>
            </Tooltip>
            <MenuPopup align="end" aria-label="Visual order">
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
                  disabled={selectedIndex < 0 || boundary}
                  onClick={() => drawings.reorderSelected(direction)}
                >
                  {label}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
          <RowAction
            label={
              drawings.selectedIds.length > 1
                ? "Duplicate selected drawings"
                : "Duplicate selected drawing"
            }
            active
            disabled={!selected || drawings.count + drawings.selectedIds.length > 100}
            onClick={() => {
              if (selected) drawings.duplicateSelected();
            }}
          >
            <DrawingToolIcon name="copy" className="size-4" />
          </RowAction>
          <RowAction label="Close object tree" active onClick={onClose}>
            <XIcon className="size-4" />
          </RowAction>
        </div>
      </header>
      <div className="flex h-[38px] shrink-0 items-center gap-3 border-b border-white/5 px-3 text-xs font-medium">
        <ChartIcon name="chart-candle" className="size-5 shrink-0 text-zinc-400" />
        <span className="truncate">{symbol}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {indicators.length > 0 ? (
          <ul aria-label="Indicators">
            {indicators.map((indicator) => (
              <li
                key={indicator.key}
                className="group/object flex h-[38px] items-center gap-1 px-2 hover:bg-white/5 focus-within:bg-white/5"
              >
                <ChartIcon name="chart-area-line" className="mx-1 size-5 shrink-0 text-zinc-400" />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate pl-1 text-xs",
                    indicator.hidden && "text-zinc-500",
                  )}
                >
                  {indicator.label}
                </span>
                <RowAction
                  label={`${indicator.hidden ? "Show" : "Hide"} ${indicator.label}`}
                  active={indicator.hidden}
                  onClick={indicator.onToggleHidden}
                >
                  <DrawingToolIcon name={indicator.hidden ? "eye-off" : "eye"} className="size-4" />
                </RowAction>
                <RowAction label={`Remove ${indicator.label}`} onClick={indicator.onRemove}>
                  <ChartIcon name="trash" className="size-4" />
                </RowAction>
              </li>
            ))}
          </ul>
        ) : null}
        {drawings.hidden && drawings.count > 0 ? (
          <button
            type="button"
            onClick={drawings.toggleHidden}
            className="w-full px-3 py-2 text-left text-xs text-blue-300 hover:bg-white/5 focus-visible:outline-blue-400"
          >
            Show drawings on chart
          </button>
        ) : null}
        <ul aria-label="Drawings">
          {drawings.objects.toReversed().map((object) => {
            const label = drawingLabel(object);
            const isSelected = drawings.selectedIds.includes(object.id);
            return (
              <li
                key={object.id}
                ref={selected?.id === object.id ? selectedRow : undefined}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const trigger =
                    event.currentTarget.querySelector<HTMLButtonElement>("[data-drawing-select]");
                  if (trigger)
                    openMenu(
                      object.id,
                      trigger,
                      event.clientX || event.clientY
                        ? { x: event.clientX, y: event.clientY }
                        : undefined,
                    );
                }}
                className={cn(
                  "group/object flex h-[38px] items-center gap-0.5 pl-3 pr-1 hover:bg-white/5 focus-within:bg-white/5",
                  isSelected && "bg-[#1e3260] hover:bg-[#1e3260] focus-within:bg-[#1e3260]",
                )}
              >
                <button
                  type="button"
                  aria-label={`Select ${label}`}
                  data-drawing-select
                  aria-haspopup="menu"
                  onKeyDown={(event) => {
                    if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey))
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    openMenu(object.id, event.currentTarget);
                  }}
                  aria-pressed={isSelected}
                  onClick={(event) =>
                    drawings.selectDrawing(object.id, {
                      additive: event.metaKey || event.ctrlKey,
                      includeHidden: true,
                      range: event.shiftKey,
                      replaceSelection: !event.metaKey && !event.ctrlKey && !event.shiftKey,
                    })
                  }
                  onDoubleClick={() => {
                    drawings.selectDrawing(object.id, {
                      includeHidden: true,
                      replaceSelection: true,
                    });
                    drawings.openSettings();
                  }}
                  className={cn(
                    "flex h-full min-w-0 flex-1 items-center gap-3 text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-400",
                    object.hidden && "text-zinc-500",
                  )}
                >
                  <ChartDrawingGlyph tool={object.kind} />
                  <span className="truncate">{label}</span>
                </button>
                <RowAction
                  label={`${object.locked ? "Unlock" : "Lock"} ${label}`}
                  active={!!object.locked}
                  onClick={() => drawings.updateDrawing(object.id, { locked: !object.locked })}
                >
                  <DrawingToolIcon name={object.locked ? "lock" : "lock-open"} className="size-4" />
                </RowAction>
                <RowAction
                  label={`${object.hidden ? "Show" : "Hide"} ${label}`}
                  active={!!object.hidden}
                  onClick={() => {
                    const patch = { hidden: !object.hidden };
                    if (isSelected) drawings.updateSelected(patch);
                    else drawings.updateDrawing(object.id, patch);
                  }}
                >
                  <DrawingToolIcon name={object.hidden ? "eye-off" : "eye"} className="size-4" />
                </RowAction>
                <RowAction
                  label={`Remove ${label}`}
                  onClick={() => drawings.deleteDrawing(object.id)}
                >
                  <ChartIcon name="trash" className="size-4" />
                </RowAction>
              </li>
            );
          })}
        </ul>
        {drawings.objects.length === 0 ? (
          <p className="px-3 py-4 text-xs text-zinc-500">Draw on the chart to add an object.</p>
        ) : null}
      </div>
    </aside>
  );
}
