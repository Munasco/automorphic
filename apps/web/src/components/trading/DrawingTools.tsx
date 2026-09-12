import { Fragment, useRef, useState, type ReactNode } from "react";
import { ChartIcon } from "./ChartIcon";
import { ChartDrawingGlyph } from "./ChartDrawingGlyph";
import { DrawingToolIcon } from "./DrawingToolIcon";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ChartDrawingsController, ChartDrawingTool } from "./useChartDrawings";
import { useDrawingFavorites } from "./drawingFavorites";
import { cn } from "../../lib/utils";

function Action({
  label,
  active,
  disabled,
  children,
  onClick,
  compact = false,
}: {
  label: string;
  compact?: boolean;
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
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
            className={cn(
              "flex shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-30",
              compact ? "size-6" : "size-8",
              active && "bg-white/15 text-blue-300",
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}
type DrawingTool = { kind: ChartDrawingTool; label: string; section?: string };
const tools: DrawingTool[] = [
  { kind: "cursor", label: "Select drawing / crosshair" },
  { kind: "trend", label: "Trend line", section: "Lines" },
  { kind: "horizontal", label: "Horizontal line", section: "Lines" },
  { kind: "ray", label: "Ray", section: "Lines" },
  { kind: "horizontal-ray", label: "Horizontal ray", section: "Lines" },
  { kind: "vertical", label: "Vertical line", section: "Lines" },
  { kind: "info-line", label: "Info line", section: "Lines" },
  { kind: "extended-line", label: "Extended line", section: "Lines" },
  { kind: "trend-angle", label: "Trend angle", section: "Lines" },
  { kind: "crossline", label: "Crossline", section: "Lines" },
  { kind: "fib", label: "Fib retracement", section: "Fibonacci" },
  { kind: "fib-extension", label: "Trend-based fib extension", section: "Fibonacci" },
  { kind: "fib-channel", label: "Fib channel", section: "Fibonacci" },
  { kind: "pitchfork", label: "Pitchfork", section: "Pitchforks" },
  { kind: "schiff-pitchfork", label: "Schiff pitchfork", section: "Pitchforks" },
  { kind: "modified-schiff-pitchfork", label: "Modified Schiff pitchfork", section: "Pitchforks" },
  { kind: "inside-pitchfork", label: "Inside pitchfork", section: "Pitchforks" },
  { kind: "rectangle", label: "Rectangle", section: "Shapes" },
  { kind: "channel", label: "Parallel channel", section: "Channels" },
  { kind: "brush", label: "Brush", section: "Brushes" },
  { kind: "highlighter", label: "Highlighter", section: "Brushes" },
  { kind: "arrow-marker", label: "Arrow marker", section: "Arrows" },
  { kind: "arrow", label: "Arrow", section: "Arrows" },
  { kind: "arrow-up", label: "Arrow mark up", section: "Arrows" },
  { kind: "arrow-down", label: "Arrow mark down", section: "Arrows" },
  { kind: "rotated-rectangle", label: "Rotated rectangle", section: "Shapes" },
  { kind: "path", label: "Path", section: "Shapes" },
  { kind: "circle", label: "Circle", section: "Shapes" },
  { kind: "ellipse", label: "Ellipse", section: "Shapes" },
  { kind: "polyline", label: "Polyline", section: "Shapes" },
  { kind: "triangle", label: "Triangle", section: "Shapes" },
  { kind: "arc", label: "Arc", section: "Shapes" },
  { kind: "curve", label: "Curve", section: "Shapes" },
  { kind: "double-curve", label: "Double curve", section: "Shapes" },
  { kind: "text", label: "Text annotation" },
];
const toolGroups: Array<{ label: string; kinds: ChartDrawingTool[] }> = [
  { label: "Cursors", kinds: ["cursor"] },
  {
    label: "Lines and channels",
    kinds: [
      "trend",
      "ray",
      "info-line",
      "extended-line",
      "trend-angle",
      "horizontal",
      "horizontal-ray",
      "vertical",
      "crossline",
      "channel",
      "pitchfork",
      "schiff-pitchfork",
      "modified-schiff-pitchfork",
      "inside-pitchfork",
    ],
  },
  { label: "Fibonacci tools", kinds: ["fib", "fib-extension", "fib-channel"] },
  {
    label: "Geometric shapes",
    kinds: [
      "brush",
      "highlighter",
      "arrow-marker",
      "arrow",
      "arrow-up",
      "arrow-down",
      "rectangle",
      "rotated-rectangle",
      "path",
      "circle",
      "ellipse",
      "polyline",
      "triangle",
      "arc",
      "curve",
      "double-curve",
    ],
  },
  { label: "Annotations", kinds: ["text"] },
];

function DrawingToolGroup({
  label,
  entries,
  currentTool,
  onSelect,
}: {
  label: string;
  entries: DrawingTool[];
  currentTool: ChartDrawingTool;
  onSelect: (tool: ChartDrawingTool) => void;
}) {
  const favorites = useDrawingFavorites((state) => state.kinds);
  const toggleFavorite = useDrawingFavorites((state) => state.toggle);
  const [open, setOpen] = useState(false);
  const [lastTool, setLastTool] = useState(entries[0]!);
  const activeTool = entries.find((entry) => entry.kind === currentTool);
  // Repositioning an object can select a tool from outside this picker.
  if (activeTool && activeTool !== lastTool) setLastTool(activeTool);
  const shown = activeTool ?? lastTool;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="group/tool relative flex h-9 w-10 shrink-0 items-center rounded hover:bg-white/5 focus-within:bg-white/5">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={shown.label}
                aria-pressed={!!activeTool}
                onClick={() => onSelect(shown.kind)}
                className={cn(
                  "flex size-8 items-center justify-center rounded text-zinc-400 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400",
                  activeTool && "bg-blue-400/10 text-blue-400",
                )}
              />
            }
          >
            <ChartDrawingGlyph tool={shown.kind} />
          </TooltipTrigger>
          <TooltipPopup side="right">{shown.label}</TooltipPopup>
        </Tooltip>
        <PopoverTrigger
          aria-label={`${label} options`}
          className={cn(
            "absolute right-0 top-1/2 flex h-7 w-2.5 -translate-y-1/2 items-center justify-center rounded-sm text-zinc-400 opacity-0 hover:bg-white/10 hover:text-white group-hover/tool:opacity-100 group-focus-within/tool:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 [@media(hover:none)]:opacity-100",
            (activeTool || open) && "opacity-100",
          )}
        >
          <ChartIcon name="chevron-down" className="size-2.5 -rotate-90" />
        </PopoverTrigger>
      </div>
      <PopoverPopup
        style={{ background: "#1f1f1f", backdropFilter: "none" }}
        side="right"
        align="start"
        className="w-[285px] max-w-[calc(100vw-4rem)]"
        viewportClassName="max-h-[calc(100dvh-4rem)] overflow-y-auto p-1.5"
      >
        <PopoverTitle
          className={
            entries[0]?.section ? "sr-only" : "px-2 py-2 text-xs font-medium text-zinc-400"
          }
        >
          {label}
        </PopoverTitle>
        <div role="group" aria-label={label} className="space-y-0.5">
          {entries.map((entry, index) => (
            <Fragment key={entry.kind}>
              {entry.section && entry.section !== entries[index - 1]?.section ? (
                <div
                  className={cn(
                    "px-2 pb-2 pt-3 text-[10px] uppercase tracking-wide text-zinc-500",
                    index > 0 && "mt-2 border-t border-white/10",
                  )}
                >
                  {entry.section}
                </div>
              ) : null}
              <div className="group/favorite flex items-center rounded hover:bg-white/10">
                <button
                  type="button"
                  aria-pressed={currentTool === entry.kind}
                  onClick={() => {
                    setLastTool(entry);
                    onSelect(entry.kind);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex h-10 min-w-0 flex-1 items-center gap-3 rounded px-2 text-left text-[14px] text-zinc-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70",
                    currentTool === entry.kind && "bg-zinc-100 text-zinc-950 hover:bg-white",
                  )}
                >
                  <ChartDrawingGlyph tool={entry.kind} />
                  <span className="flex-1">{entry.label}</span>
                  {currentTool === entry.kind ? (
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-zinc-700" />
                  ) : null}
                </button>
                {entry.kind !== "cursor" ? (
                  <button
                    type="button"
                    aria-label={`${favorites.includes(entry.kind) ? "Remove" : "Add"} ${entry.label} ${favorites.includes(entry.kind) ? "from" : "to"} favorites`}
                    aria-pressed={favorites.includes(entry.kind)}
                    onClick={() => {
                      if (entry.kind !== "cursor") toggleFavorite(entry.kind);
                    }}
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded text-zinc-500 opacity-0 hover:text-zinc-100 group-hover/favorite:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
                      favorites.includes(entry.kind) && "text-amber-400 opacity-100",
                    )}
                  >
                    <FavoriteStar filled={favorites.includes(entry.kind)} />
                  </button>
                ) : null}
              </div>
            </Fragment>
          ))}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

export function DrawingTools({
  drawings,
  indicatorControls,
}: {
  drawings: ChartDrawingsController;
  indicatorControls: {
    count: number;
    hidden: boolean;
    setHidden: (hidden: boolean) => void;
    remove: () => void;
  };
}) {
  const favorites = useDrawingFavorites((state) => state.kinds);
  const favoritesVisible = useDrawingFavorites((state) => state.visible);
  const toggleFavorites = useDrawingFavorites((state) => state.toggleVisible);
  const selected = drawings.selected;
  const [removeOpen, setRemoveOpen] = useState(false);
  const [magnetOpen, setMagnetOpen] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);
  const removableCount = drawings.objects.filter(
    (drawing) => drawings.alwaysRemoveLocked || !drawing.locked,
  ).length;
  return (
    <>
      {toolGroups.map((group) => (
        <DrawingToolGroup
          key={group.label}
          label={group.label}
          entries={group.kinds.map((kind) => tools.find((tool) => tool.kind === kind)!)}
          currentTool={drawings.tool}
          onSelect={drawings.setTool}
        />
      ))}
      <Popover>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                aria-label={`Drawing objects, ${drawings.count}`}
                className="flex size-8 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-white"
              />
            }
          >
            <DrawingToolIcon name="list-numbers" className="size-[18px]" />
          </TooltipTrigger>
          <TooltipPopup side="right">Drawing objects</TooltipPopup>
        </Tooltip>
        <PopoverPopup
          style={{ background: "#1f1f1f", backdropFilter: "none" }}
          side="right"
          className="w-80 max-w-[calc(100vw-4rem)] space-y-3 p-3"
        >
          <PopoverTitle className="text-sm">Drawing objects · {drawings.count}</PopoverTitle>
          {drawings.hidden && drawings.count > 0 ? (
            <button type="button" onClick={drawings.toggleHidden} className="text-xs text-blue-300">
              Show drawings on chart
            </button>
          ) : null}
          {drawings.objects.length === 0 ? (
            <p className="text-xs text-zinc-400">Draw on the chart to add an object.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto" aria-label="Drawing object list">
              {drawings.objects.toReversed().map((object) => {
                const label =
                  object.name ||
                  (object.kind === "text" ? object.text : null) ||
                  tools.find((tool) => tool.kind === object.kind)?.label ||
                  object.kind;
                return (
                  <div
                    key={object.id}
                    className={cn(
                      "rounded border border-white/10 p-2",
                      selected?.id === object.id && "border-blue-400/60 bg-blue-400/5",
                    )}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Select ${label}`}
                        aria-pressed={selected?.id === object.id}
                        onClick={() => drawings.selectDrawing(object.id)}
                        className="min-w-0 flex-1 truncate text-left text-xs text-zinc-200"
                      >
                        {label}
                      </button>
                      <Action
                        compact
                        label={`${object.hidden ? "Show" : "Hide"} ${label}`}
                        onClick={() =>
                          drawings.updateDrawing(object.id, { hidden: !object.hidden })
                        }
                      >
                        <DrawingToolIcon
                          name={object.hidden ? "eye-off" : "eye"}
                          className="size-4"
                        />
                      </Action>
                      <Action
                        compact
                        label={`${object.locked ? "Unlock" : "Lock"} ${label}`}
                        onClick={() =>
                          drawings.updateDrawing(object.id, { locked: !object.locked })
                        }
                      >
                        <DrawingToolIcon
                          name={object.locked ? "lock" : "lock-open"}
                          className="size-4"
                        />
                      </Action>
                      <Action
                        compact
                        label={`Duplicate ${label}`}
                        disabled={drawings.count >= 100}
                        onClick={() => drawings.duplicateDrawing(object.id)}
                      >
                        <DrawingToolIcon name="copy" className="size-4" />
                      </Action>
                      <Action
                        compact
                        label={`Delete ${label}`}
                        onClick={() => drawings.deleteDrawing(object.id)}
                      >
                        <ChartIcon name="trash" className="size-4" />
                      </Action>
                    </div>
                    <input
                      key={`${object.id}:${object.name ?? ""}`}
                      aria-label={`Name for ${label}`}
                      defaultValue={object.name ?? ""}
                      placeholder="Drawing name"
                      maxLength={80}
                      onBlur={(event) =>
                        drawings.updateDrawing(object.id, { name: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      className="mt-2 w-full rounded border border-white/10 bg-transparent px-2 py-1 text-xs"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </PopoverPopup>
      </Popover>
      <div className="my-1 w-5 border-t border-white/10" />
      <Popover open={magnetOpen} onOpenChange={setMagnetOpen}>
        <div className="group/tool relative flex h-9 w-10 shrink-0 items-center rounded hover:bg-white/5 focus-within:bg-white/5">
          <Action label="Magnet" active={drawings.magnet} onClick={drawings.toggleMagnet}>
            <DrawingToolIcon name="magnet" className="size-[22px]" />
          </Action>
          <PopoverTrigger
            aria-label="Magnet options"
            className={cn(
              "absolute right-0 top-1/2 flex h-7 w-2.5 -translate-y-1/2 items-center justify-center rounded-sm text-zinc-400 opacity-0 hover:bg-white/10 group-hover/tool:opacity-100 group-focus-within/tool:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 [@media(hover:none)]:opacity-100",
              (drawings.magnet || magnetOpen) && "opacity-100",
            )}
          >
            <ChartIcon name="chevron-down" className="size-2.5 -rotate-90" />
          </PopoverTrigger>
        </div>
        <PopoverPopup
          style={{ background: "#1f1f1f", backdropFilter: "none" }}
          side="right"
          align="start"
          className="w-56"
          viewportClassName="p-1.5"
        >
          <PopoverTitle className="sr-only">Magnet options</PopoverTitle>
          {(
            [
              ["off", "Magnet off"],
              ["weak", "Weak magnet"],
              ["strong", "Strong magnet"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={drawings.magnetMode === mode}
              onClick={() => {
                drawings.setMagnetMode(mode);
                setMagnetOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded px-2 py-2.5 text-left text-xs text-zinc-300 hover:bg-white/10",
                drawings.magnetMode === mode && "bg-blue-600 text-white hover:bg-blue-600",
              )}
            >
              <DrawingToolIcon
                name="magnet"
                className={cn("size-5", mode === "off" && "opacity-40")}
              />
              {label}
            </button>
          ))}
        </PopoverPopup>
      </Popover>
      <Action
        label="Keep drawing"
        active={drawings.keepDrawing}
        onClick={() => drawings.setKeepDrawing(!drawings.keepDrawing)}
      >
        <DrawingToolIcon name="pencil" className="size-[22px]" />
      </Action>
      <Action label="Undo drawing edit" disabled={!drawings.canUndo} onClick={drawings.undo}>
        <ChartIcon name="arrow-back-up" className="size-[18px]" />
      </Action>
      <Action label="Redo drawing edit" disabled={!drawings.canRedo} onClick={drawings.redo}>
        <DrawingToolIcon name="arrow-forward-up" className="size-[18px]" />
      </Action>
      <Action
        label={drawings.allLocked ? "Unlock drawings" : "Lock drawings"}
        active={drawings.allLocked}
        disabled={!drawings.count}
        onClick={drawings.toggleLocked}
      >
        <DrawingToolIcon name={drawings.allLocked ? "lock" : "lock-open"} className="size-[22px]" />
      </Action>
      <Popover open={hideOpen} onOpenChange={setHideOpen}>
        <div className="group/tool relative flex h-9 w-10 shrink-0 items-center rounded hover:bg-white/5 focus-within:bg-white/5">
          <Action
            label={drawings.hidden ? "Show drawings" : "Hide drawings"}
            active={drawings.hidden}
            disabled={!drawings.count}
            onClick={drawings.toggleHidden}
          >
            <DrawingToolIcon name={drawings.hidden ? "eye-off" : "eye"} className="size-[22px]" />
          </Action>
          <PopoverTrigger
            aria-label="Visibility options"
            className={cn(
              "absolute right-0 top-1/2 flex h-7 w-2.5 -translate-y-1/2 items-center justify-center rounded-sm text-zinc-400 opacity-0 hover:bg-white/10 group-hover/tool:opacity-100 group-focus-within/tool:opacity-100 [@media(hover:none)]:opacity-100",
              hideOpen && "opacity-100",
            )}
          >
            <ChartIcon name="chevron-down" className="size-2.5 -rotate-90" />
          </PopoverTrigger>
        </div>
        <PopoverPopup
          style={{ background: "#1f1f1f", backdropFilter: "none" }}
          side="right"
          align="start"
          className="w-[285px]"
          viewportClassName="p-1.5"
        >
          <PopoverTitle className="sr-only">Visibility options</PopoverTitle>
          <button
            type="button"
            onClick={() => {
              drawings.toggleHidden();
              setHideOpen(false);
            }}
            className="flex h-8 w-full items-center rounded px-2 text-left text-sm hover:bg-white/10"
          >
            {drawings.hidden ? "Show drawings" : "Hide drawings"}
          </button>
          <button
            type="button"
            disabled={!indicatorControls.count}
            onClick={() => {
              indicatorControls.setHidden(!indicatorControls.hidden);
              setHideOpen(false);
            }}
            className="flex h-8 w-full items-center rounded px-2 text-left text-sm hover:bg-white/10 disabled:opacity-30"
          >
            {indicatorControls.hidden ? "Show indicators" : "Hide indicators"}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !(drawings.hidden && indicatorControls.hidden);
              if (drawings.hidden !== next) drawings.toggleHidden();
              indicatorControls.setHidden(next);
              setHideOpen(false);
            }}
            className="flex h-8 w-full items-center rounded px-2 text-left text-sm hover:bg-white/10"
          >
            {drawings.hidden && indicatorControls.hidden ? "Show all" : "Hide all"}
          </button>
        </PopoverPopup>
      </Popover>
      <Popover open={removeOpen} onOpenChange={setRemoveOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                aria-label="Remove drawings"
                className="flex size-8 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
              />
            }
          >
            <ChartIcon name="trash" className="size-[22px]" />
          </TooltipTrigger>
          <TooltipPopup side="right">Remove drawings</TooltipPopup>
        </Tooltip>
        <PopoverPopup
          style={{ background: "#1f1f1f", backdropFilter: "none" }}
          side="right"
          align="start"
          className="w-[285px]"
          viewportClassName="p-1.5"
        >
          <PopoverTitle className="sr-only">Remove drawings and indicators</PopoverTitle>
          <button
            type="button"
            disabled={!removableCount}
            onClick={() => {
              drawings.removeDrawings(drawings.alwaysRemoveLocked);
              setRemoveOpen(false);
            }}
            className="flex h-8 w-full items-center rounded px-2 text-left text-sm hover:bg-white/10 disabled:opacity-30"
          >
            Remove {removableCount} drawings
          </button>
          <button
            type="button"
            disabled={!indicatorControls.count}
            onClick={() => {
              indicatorControls.remove();
              setRemoveOpen(false);
            }}
            className="flex h-8 w-full items-center rounded px-2 text-left text-sm hover:bg-white/10 disabled:opacity-30"
          >
            Remove {indicatorControls.count} indicators
          </button>
          <button
            type="button"
            disabled={!removableCount && !indicatorControls.count}
            onClick={() => {
              drawings.removeDrawings(drawings.alwaysRemoveLocked);
              indicatorControls.remove();
              setRemoveOpen(false);
            }}
            className="flex h-8 w-full items-center rounded px-2 text-left text-sm hover:bg-white/10 disabled:opacity-30"
          >
            Remove drawings & indicators
          </button>
          <label className="mt-1 flex items-center gap-3 border-t border-white/10 px-2 py-3 text-[13px]">
            <input
              type="checkbox"
              checked={drawings.alwaysRemoveLocked}
              onChange={(event) => drawings.setAlwaysRemoveLocked(event.target.checked)}
              className="size-4 accent-white"
            />
            Always remove locked drawings
          </label>
        </PopoverPopup>
      </Popover>
      {favorites.length ? (
        <Action
          label={favoritesVisible ? "Hide favorite drawing tools" : "Show favorite drawing tools"}
          active={favoritesVisible}
          onClick={toggleFavorites}
        >
          <FavoriteStar filled={favoritesVisible} />
        </Action>
      ) : null}
    </>
  );
}

function FavoriteStar({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3L2.8 9.7l6.4-.9Z" />
    </svg>
  );
}

export function FavoriteDrawingToolbar({ drawings }: { drawings: ChartDrawingsController }) {
  const favorites = useDrawingFavorites((state) => state.kinds);
  const visible = useDrawingFavorites((state) => state.visible);
  const [position, setPosition] = useState({ x: 16, y: 180 });
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  if (!visible || !favorites.length) return null;
  return (
    <div
      role="toolbar"
      aria-label="Favorite drawing tools"
      className="absolute z-20 flex max-w-[calc(100%-24px)] items-center rounded-md border border-white/15 bg-[#1f1f1f] p-1 shadow-lg"
      style={{
        left: `min(${position.x}px, max(0px, calc(100% - ${favorites.length * 32 + 30}px)))`,
        top: `min(${position.y}px, max(0px, calc(100% - 44px)))`,
      }}
    >
      <button
        type="button"
        aria-label="Move favorite drawing tools"
        className="flex h-8 w-5 shrink-0 touch-none cursor-grab items-center justify-center text-zinc-500 active:cursor-grabbing"
        onPointerDown={(event) => {
          const toolbar = event.currentTarget.parentElement!;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            originX: toolbar.offsetLeft,
            originY: toolbar.offsetTop,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const toolbar = event.currentTarget.parentElement!;
          const chart = toolbar.parentElement!;
          setPosition({
            x: Math.max(
              0,
              Math.min(
                chart.clientWidth - toolbar.offsetWidth,
                drag.current.originX + event.clientX - drag.current.x,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                chart.clientHeight - toolbar.offsetHeight,
                drag.current.originY + event.clientY - drag.current.y,
              ),
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
        <svg width="8" height="18" fill="currentColor" aria-hidden="true">
          {[4, 9, 14].flatMap((y) =>
            [2, 6].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />),
          )}
        </svg>
      </button>
      <div className="flex min-w-0 overflow-x-auto">
        {favorites.map((kind) => (
          <Action
            key={kind}
            label={`Favorite: ${tools.find((tool) => tool.kind === kind)?.label ?? kind}`}
            active={drawings.tool === kind}
            onClick={() => drawings.setTool(kind)}
          >
            <ChartDrawingGlyph tool={kind} />
          </Action>
        ))}
      </div>
    </div>
  );
}
