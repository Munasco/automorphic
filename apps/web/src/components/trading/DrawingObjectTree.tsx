import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontalIcon, XIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Popover, PopoverPopup } from "../ui/popover";
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
  settingsContent?: ReactNode;
  settingsLabel?: string;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove?: (direction: "up" | "down") => void;
  onDrop?: (sourceId: string, position: "before" | "after") => void;
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

function DrawingNameInput({
  drawing,
  label,
  onSave,
  onClose,
}: {
  drawing: ChartDrawing;
  label: string;
  onSave: (id: string, name: string) => boolean;
  onClose: (restoreFocus: boolean) => void;
}) {
  const [name, setName] = useState(drawing.name ?? label);
  const initialName = useRef(name);
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const finish = (save: boolean, restoreFocus: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (save && name !== initialName.current) onSave(drawing.id, name);
    onClose(restoreFocus);
  };
  return (
    <input
      ref={input}
      aria-label="Drawing name"
      value={name}
      maxLength={80}
      placeholder={label}
      onChange={(event) => setName(event.target.value)}
      onBlur={() => finish(true, false)}
      onContextMenu={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          finish(event.key === "Enter", true);
        }
      }}
      className="h-7 min-w-0 flex-1 rounded border border-[#2962ff] bg-transparent px-1 text-xs text-zinc-200 outline-none"
    />
  );
}

const INDICATOR_DRAG_TYPE = "application/x-automorphic-indicator";

function IndicatorTreeRow({ indicator }: { indicator: DrawingObjectTreeIndicator }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [dropEdge, setDropEdge] = useState<"before" | "after" | null>(null);
  return (
    <li
      data-indicator-object={indicator.key}
      draggable={!!indicator.onDrop}
      onDragStart={(event) => {
        if (!indicator.onDrop) return;
        event.dataTransfer.setData(INDICATOR_DRAG_TYPE, indicator.key);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        if (!indicator.onDrop || !event.dataTransfer.types.includes(INDICATOR_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const rect = event.currentTarget.getBoundingClientRect();
        setDropEdge(event.clientY < rect.top + rect.height / 2 ? "before" : "after");
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDropEdge(null);
      }}
      onDragEnd={() => setDropEdge(null)}
      onDrop={(event) => {
        const sourceId = event.dataTransfer.getData(INDICATOR_DRAG_TYPE);
        if (!sourceId || !indicator.onDrop) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        indicator.onDrop(sourceId, event.clientY < rect.top + rect.height / 2 ? "before" : "after");
        setDropEdge(null);
      }}
      className={cn(
        "group/object relative flex h-[38px] items-center gap-1 px-2 hover:bg-white/5 focus-within:bg-white/5",
        dropEdge === "before" &&
          "before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-blue-400",
        dropEdge === "after" &&
          "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-blue-400",
      )}
    >
      <ChartIcon name="chart-area-line" className="mx-1 size-5 shrink-0 text-zinc-400" />
      {indicator.settingsContent ? (
        <button
          ref={trigger}
          type="button"
          aria-label={indicator.settingsLabel ?? `${indicator.label} settings`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={(event) => {
            if (event.detail === 0) setOpen(true);
          }}
          onDoubleClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }}
          className={cn(
            "h-full min-w-0 flex-1 truncate pl-1 text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400",
            indicator.hidden && "text-zinc-500",
          )}
        >
          {indicator.label}
        </button>
      ) : (
        <span
          className={cn(
            "min-w-0 flex-1 truncate pl-1 text-xs",
            indicator.hidden && "text-zinc-500",
          )}
        >
          {indicator.label}
        </span>
      )}
      <RowAction
        label={`${indicator.hidden ? "Show" : "Hide"} ${indicator.label}`}
        active={indicator.hidden}
        onClick={indicator.onToggleHidden}
      >
        <DrawingToolIcon name={indicator.hidden ? "eye-off" : "eye"} className="size-4" />
      </RowAction>
      {indicator.onMove ? (
        <Menu>
          <MenuTrigger
            aria-label={`Reorder ${indicator.label}`}
            className="flex size-7 shrink-0 items-center justify-center rounded text-zinc-400 opacity-0 hover:bg-white/10 group-hover/object:opacity-100 group-focus-within/object:opacity-100 data-popup-open:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <MoreHorizontalIcon className="size-4" />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem disabled={!indicator.canMoveUp} onClick={() => indicator.onMove?.("up")}>
              Move up
            </MenuItem>
            <MenuItem disabled={!indicator.canMoveDown} onClick={() => indicator.onMove?.("down")}>
              Move down
            </MenuItem>
          </MenuPopup>
        </Menu>
      ) : null}
      <RowAction label={`Remove ${indicator.label}`} onClick={indicator.onRemove}>
        <ChartIcon name="trash" className="size-4" />
      </RowAction>
      {indicator.settingsContent ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverPopup
            anchor={trigger}
            finalFocus={trigger}
            align="end"
            className="max-h-[min(70vh,36rem)] w-72 overflow-y-auto"
          >
            {indicator.settingsContent}
          </PopoverPopup>
        </Popover>
      ) : null}
    </li>
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const restoreRenameFocus = useRef<string | null>(null);
  if (editingId && !drawings.objects.some((drawing) => drawing.id === editingId))
    setEditingId(null);
  const openMenu = (id: string, trigger: HTMLButtonElement, point?: { x: number; y: number }) => {
    trigger.focus({ preventScroll: true });
    const rect = trigger.getBoundingClientRect();
    drawings.openDrawingContextMenu(id, point ?? { x: rect.left, y: rect.bottom }, trigger, () =>
      setEditingId(id),
    );
  };
  const dragging = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: "above" | "below";
  } | null>(null);
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
              <IndicatorTreeRow key={indicator.key} indicator={indicator} />
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
                onDragOver={(event) => {
                  if (!dragging.current || drawings.selectedIds.includes(object.id)) {
                    setDropTarget(null);
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                  const rect = event.currentTarget.getBoundingClientRect();
                  const position = event.clientY < rect.top + rect.height / 2 ? "above" : "below";
                  setDropTarget((current) =>
                    current?.id === object.id && current.position === position
                      ? current
                      : { id: object.id, position },
                  );
                }}
                onDragLeave={(event) => {
                  if (
                    event.relatedTarget instanceof Node &&
                    event.currentTarget.contains(event.relatedTarget)
                  )
                    return;
                  setDropTarget((current) => (current?.id === object.id ? null : current));
                }}
                onDrop={(event) => {
                  if (!dragging.current) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const position = event.clientY < rect.top + rect.height / 2 ? "above" : "below";
                  dragging.current = null;
                  setDropTarget(null);
                  drawings.moveSelectedTo(object.id, position);
                }}
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
                  "group/object relative flex h-[38px] items-center gap-0.5 pl-3 pr-1 hover:bg-white/5 focus-within:bg-white/5",
                  dropTarget?.id === object.id &&
                    "after:pointer-events-none after:absolute after:inset-x-0 after:z-10 after:h-0.5 after:bg-[#2962ff]",
                  dropTarget?.id === object.id &&
                    (dropTarget.position === "above" ? "after:top-0" : "after:bottom-0"),
                  isSelected && "bg-[#1e3260] hover:bg-[#1e3260] focus-within:bg-[#1e3260]",
                )}
              >
                {editingId === object.id ? (
                  <div className="flex h-full min-w-0 flex-1 items-center gap-3">
                    <ChartDrawingGlyph tool={object.kind} />
                    <DrawingNameInput
                      key={object.id}
                      drawing={object}
                      label={label}
                      onSave={drawings.renameDrawing}
                      onClose={(restoreFocus) => {
                        restoreRenameFocus.current = restoreFocus ? object.id : null;
                        setEditingId(null);
                      }}
                    />
                  </div>
                ) : (
                  <button
                    ref={(node) => {
                      if (node && restoreRenameFocus.current === object.id) {
                        restoreRenameFocus.current = null;
                        node.focus({ preventScroll: true });
                      }
                    }}
                    type="button"
                    aria-label={`Select ${label}`}
                    data-drawing-select
                    draggable
                    onDragStart={(event) => {
                      drawings.selectDrawing(object.id, { includeHidden: true });
                      dragging.current = object.id;
                      setDropTarget(null);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("application/x-automorphic-drawing", object.id);
                    }}
                    onDragEnd={() => {
                      dragging.current = null;
                      setDropTarget(null);
                    }}
                    aria-haspopup="menu"
                    onKeyDown={(event) => {
                      if (event.key === "F2") {
                        event.preventDefault();
                        event.stopPropagation();
                        drawings.selectDrawing(object.id, {
                          includeHidden: true,
                          replaceSelection: true,
                        });
                        setEditingId(object.id);
                        return;
                      }
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
                )}
                <RowAction
                  label={`${object.locked ? "Unlock" : "Lock"} ${label}`}
                  active={!!object.locked}
                  onClick={() => {
                    const patch = { locked: !object.locked };
                    if (isSelected) drawings.updateSelected(patch);
                    else drawings.updateDrawing(object.id, patch);
                  }}
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
                  onClick={() => {
                    if (isSelected) drawings.deleteSelected();
                    else drawings.deleteDrawing(object.id);
                  }}
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
