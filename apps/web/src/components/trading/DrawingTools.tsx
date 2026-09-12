import { Fragment, useState, type ReactNode } from "react";
import { ChartIcon } from "./ChartIcon";
import { ChartDrawingGlyph } from "./ChartDrawingGlyph";
import { DrawingToolIcon } from "./DrawingToolIcon";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ChartDrawingsController, ChartDrawingTool } from "./useChartDrawings";
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
  { kind: "trend", label: "Trend line" },
  { kind: "horizontal", label: "Horizontal line" },
  { kind: "ray", label: "Ray" },
  { kind: "horizontal-ray", label: "Horizontal ray" },
  { kind: "vertical", label: "Vertical line" },
  { kind: "fib", label: "Fibonacci retracement" },
  { kind: "rectangle", label: "Rectangle", section: "Shapes" },
  { kind: "channel", label: "Parallel channel · three points" },
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
    kinds: ["trend", "horizontal", "ray", "horizontal-ray", "vertical", "channel"],
  },
  { label: "Fibonacci tools", kinds: ["fib"] },
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
        style={{ background: "#17191f", backdropFilter: "none" }}
        side="right"
        align="start"
        className="w-64 max-w-[calc(100vw-4rem)]"
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
              <button
                type="button"
                aria-pressed={currentTool === entry.kind}
                onClick={() => {
                  setLastTool(entry);
                  onSelect(entry.kind);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded px-2 py-2 text-left text-[13px] text-zinc-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70",
                  currentTool === entry.kind && "bg-blue-600 text-white hover:bg-blue-600",
                )}
              >
                <ChartDrawingGlyph tool={entry.kind} />
                <span className="flex-1">{entry.label}</span>
                {currentTool === entry.kind ? (
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-blue-300" />
                ) : null}
              </button>
            </Fragment>
          ))}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

export function DrawingTools({ drawings }: { drawings: ChartDrawingsController }) {
  const selected = drawings.selected;
  const [removeOpen, setRemoveOpen] = useState(false);
  const [magnetOpen, setMagnetOpen] = useState(false);
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
          style={{ background: "#17191f", backdropFilter: "none" }}
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
          style={{ background: "#17191f", backdropFilter: "none" }}
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
        label={selected?.locked ? "Unlock selected drawing" : "Lock selected drawing"}
        active={selected?.locked ?? false}
        disabled={!selected}
        onClick={() => drawings.updateSelected({ locked: !selected?.locked })}
      >
        <DrawingToolIcon name={selected?.locked ? "lock" : "lock-open"} className="size-[18px]" />
      </Action>
      <Action
        label={drawings.hidden ? "Show drawings" : "Hide drawings"}
        active={drawings.hidden}
        disabled={!drawings.count}
        onClick={drawings.toggleHidden}
      >
        <DrawingToolIcon name={drawings.hidden ? "eye-off" : "eye"} className="size-[18px]" />
      </Action>
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
          style={{ background: "#17191f", backdropFilter: "none" }}
          side="right"
          align="start"
          className="w-56"
          viewportClassName="p-1.5"
        >
          <PopoverTitle className="px-2 py-2 text-xs text-zinc-400">Remove drawings</PopoverTitle>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              drawings.deleteSelected();
              setRemoveOpen(false);
            }}
            className="w-full rounded px-2 py-2 text-left text-[13px] text-zinc-300 hover:bg-white/10 disabled:opacity-30"
          >
            Delete selected drawing
          </button>
          <button
            type="button"
            disabled={!drawings.count && !drawings.pending}
            onClick={() => {
              drawings.clear();
              setRemoveOpen(false);
            }}
            className="w-full rounded px-2 py-2 text-left text-xs text-red-400 hover:bg-white/10 disabled:opacity-30"
          >
            Clear all drawings
          </button>
        </PopoverPopup>
      </Popover>
    </>
  );
}
