import { useState, type ReactNode } from "react";
import { ChartIcon } from "./ChartIcon";
import { DrawingToolIcon } from "./DrawingToolIcon";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ChartDrawingsController, ChartDrawingTool } from "./useChartDrawings";
import { cn } from "../../lib/utils";
import type { ChartDrawing } from "./drawingGeometry";

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
const tools: Array<{ kind: ChartDrawingTool; label: string; icon: ReactNode }> = [
  {
    kind: "cursor",
    label: "Select drawing / crosshair",
    icon: <ChartIcon name="crosshair" className="size-[18px]" />,
  },
  {
    kind: "horizontal",
    label: "Horizontal line",
    icon: <ChartIcon name="minus" className="size-[18px]" />,
  },
  { kind: "trend", label: "Trend line", icon: <ChartIcon name="line" className="size-[18px]" /> },
  {
    kind: "ray",
    label: "Ray",
    icon: <DrawingToolIcon name="arrow-up-right" className="size-[18px]" />,
  },
  {
    kind: "horizontal-ray",
    label: "Horizontal ray",
    icon: <DrawingToolIcon name="arrow-right" className="size-[18px]" />,
  },
  {
    kind: "vertical",
    label: "Vertical line",
    icon: <DrawingToolIcon name="separator-vertical" className="size-[18px]" />,
  },
  {
    kind: "rectangle",
    label: "Rectangle",
    icon: <DrawingToolIcon name="rectangle" className="size-[18px]" />,
  },
  {
    kind: "fib",
    label: "Fibonacci retracement",
    icon: <DrawingToolIcon name="list-numbers" className="size-[18px]" />,
  },
  {
    kind: "channel",
    label: "Parallel channel · three points",
    icon: <DrawingToolIcon name="copy" className="size-[18px]" />,
  },
  {
    kind: "text",
    label: "Text annotation",
    icon: <DrawingToolIcon name="letter-t" className="size-[18px]" />,
  },
];
export function DrawingTools({ drawings }: { drawings: ChartDrawingsController }) {
  const selected = drawings.selected;
  const [editorOpen, setEditorOpen] = useState(false);
  return (
    <>
      {tools.map((tool) => (
        <Action
          key={tool.kind}
          label={tool.label}
          active={drawings.tool === tool.kind}
          onClick={() => drawings.setTool(tool.kind)}
        >
          {tool.icon}
        </Action>
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
        <PopoverPopup side="right" className="w-80 max-w-[calc(100vw-4rem)] space-y-3 p-3">
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
      <Action
        label="Magnet · snap drawing points to nearby candle OHLC"
        active={drawings.magnet}
        onClick={drawings.toggleMagnet}
      >
        <DrawingToolIcon name="magnet" className="size-[18px]" />
      </Action>
      <Popover open={editorOpen && !!selected} onOpenChange={setEditorOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                disabled={!selected}
                className="flex size-8 items-center justify-center rounded text-zinc-400 hover:bg-white/10 disabled:opacity-30"
                aria-label="Edit selected drawing"
              />
            }
          >
            <DrawingToolIcon name="pencil" className="size-[18px]" />
          </TooltipTrigger>
          <TooltipPopup side="right">Edit selected drawing</TooltipPopup>
        </Tooltip>
        <PopoverPopup side="right" className="w-60 space-y-3 p-3">
          <PopoverTitle className="text-sm">Drawing</PopoverTitle>
          {selected ? (
            <>
              <label className="flex items-center justify-between text-xs">
                Color
                <input
                  aria-label="Drawing color"
                  type="color"
                  value={selected.color}
                  onChange={(event) => drawings.updateSelected({ color: event.target.value })}
                  className="h-7 w-10 rounded bg-transparent"
                />
              </label>
              <label className="flex items-center justify-between text-xs">
                Line style
                <select
                  aria-label="Drawing line style"
                  value={selected.lineStyle ?? "solid"}
                  onChange={(event) =>
                    drawings.updateSelected({
                      lineStyle: event.target.value as NonNullable<ChartDrawing["lineStyle"]>,
                    })
                  }
                  className="rounded border border-white/10 bg-zinc-900 px-2 py-1"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </label>
              <label className="flex items-center justify-between text-xs">
                Width
                <select
                  aria-label="Drawing line width"
                  value={selected.width}
                  onChange={(event) =>
                    drawings.updateSelected({ width: Number(event.target.value) })
                  }
                  className="rounded border border-white/10 bg-zinc-900 px-2 py-1"
                >
                  {[1, 2, 3, 4].map((width) => (
                    <option key={width} value={width}>
                      {width}px
                    </option>
                  ))}
                </select>
              </label>
              {selected.kind === "text" ? (
                <input
                  aria-label="Annotation text"
                  maxLength={140}
                  value={selected.text ?? ""}
                  onChange={(event) => drawings.updateSelected({ text: event.target.value })}
                  className="w-full rounded border border-white/10 bg-transparent px-2 py-1 text-sm"
                />
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={selected.locked}
                  onClick={() => {
                    setEditorOpen(false);
                    drawings.redrawSelected();
                  }}
                  className="flex flex-1 items-center justify-center gap-1 rounded bg-white/10 px-2 py-1.5 text-xs disabled:opacity-30"
                >
                  <DrawingToolIcon name="arrows-move" className="size-4" />
                  Reposition
                </button>
                <button
                  type="button"
                  aria-label="Delete selected drawing"
                  onClick={drawings.deleteSelected}
                  className="rounded px-2 text-red-400 hover:bg-white/10"
                >
                  <ChartIcon name="trash" className="size-4" />
                </button>
              </div>
            </>
          ) : null}
        </PopoverPopup>
      </Popover>
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
      <Action
        label="Delete selected drawing"
        disabled={!selected}
        onClick={drawings.deleteSelected}
      >
        <ChartIcon name="trash" className="size-[18px]" />
      </Action>
      <Action
        label="Clear all drawings"
        disabled={!drawings.count && !drawings.pending}
        onClick={drawings.clear}
      >
        <ChartIcon name="trash" className="size-[18px] opacity-50" />
      </Action>
    </>
  );
}
