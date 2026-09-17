import { useState } from "react";
import { ChartIcon } from "./ChartIcon";
import {
  ColorPicker,
  DrawingSelect,
  WidthPicker,
  LineStylePicker,
  Check,
} from "./DrawingStyleControls";
import { DrawingNumberField } from "./DrawingNumberField";
import { defaultDrawingLevels, isPitchforkDrawingTool, type ChartDrawing } from "./drawingGeometry";
import type { DrawingPatch } from "./useChartDrawings";

export function DrawingLevelSettings({
  drawing,
  onChange,
}: {
  drawing: ChartDrawing;
  onChange: (patch: DrawingPatch) => void;
}) {
  const fork = isPitchforkDrawingTool(drawing.kind);
  const levels = drawing.levels ?? defaultDrawingLevels(drawing.kind);
  const [rowKeys] = useState(() => Array.from({ length: 64 }, (_, index) => `level-${index}`));
  const changeLevel = (index: number, patch: Partial<(typeof levels)[number]>) =>
    onChange({ levels: levels.map((level, i) => (i === index ? { ...level, ...patch } : level)) });
  return (
    <>
      {["fib", "fib-extension"].includes(drawing.kind) ? (
        <div className="flex items-center justify-between">
          <Check
            label="Trend line"
            checked={drawing.showTrendLine ?? drawing.kind === "fib-extension"}
            onChange={(showTrendLine) => onChange({ showTrendLine })}
          />
          <ColorPicker value={drawing.color} onChange={(color) => onChange({ color })} />
        </div>
      ) : null}
      {fork ? (
        <>
          <Check
            label="Extend lines"
            checked={drawing.extendLines ?? false}
            onChange={(extendLines) => onChange({ extendLines })}
          />
          <div className="flex items-center justify-between">
            <span className="text-sm">Median</span>
            <ColorPicker value={drawing.color} onChange={(color) => onChange({ color })} />
          </div>
        </>
      ) : null}
      <div className="flex items-center justify-between">
        <span className="text-sm">Levels line</span>
        <div className="flex items-center gap-2">
          <WidthPicker drawing={drawing} onChange={onChange} />
          <LineStylePicker drawing={drawing} onChange={onChange} />
        </div>
      </div>
      {!fork ? (
        <label className="flex items-center justify-between text-sm">
          Extend
          <DrawingSelect
            label="Extend Fibonacci levels"
            value={
              drawing.extendLeft && drawing.extendRight
                ? "both"
                : drawing.extendLeft
                  ? "left"
                  : drawing.extendRight
                    ? "right"
                    : "none"
            }
            onChange={(value) =>
              onChange({
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
            className="w-44"
          />
        </label>
      ) : null}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {levels.map((level, index) => (
          <div key={rowKeys[index]} className="flex items-center gap-2">
            <input
              aria-label={`Show level ${index + 1}`}
              type="checkbox"
              checked={level.visible}
              onChange={(event) => changeLevel(index, { visible: event.target.checked })}
              className="size-4 shrink-0 accent-white"
            />
            <DrawingNumberField
              label={`Level ${index + 1} value`}
              step={0.001}
              min={-100}
              max={100}
              value={level.value}
              onValueChange={(value) => {
                if (Math.abs(value) <= 100) changeLevel(index, { value });
              }}
              className="min-w-0 w-full shrink"
            />
            <ColorPicker
              label={`Level ${index + 1} color`}
              value={level.color ?? drawing.color}
              onChange={(color) => changeLevel(index, { color })}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={levels.length >= 64}
          onClick={() => {
            onChange({ levels: [...levels, { value: 1, visible: true, color: drawing.color }] });
          }}
          className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/10 disabled:opacity-30"
        >
          <ChartIcon name="crosshair" className="size-4" />
          Add level
        </button>
        <button
          type="button"
          onClick={() => onChange({ levels: defaultDrawingLevels(drawing.kind) })}
          className="rounded px-2 py-1.5 text-xs text-zinc-400 hover:bg-white/10"
        >
          Reset levels
        </button>
      </div>
      <div className="flex items-center justify-between text-sm">
        <Check
          label="Use one color"
          checked={drawing.useOneColor ?? false}
          onChange={(useOneColor) => onChange({ useOneColor })}
        />
        <ColorPicker value={drawing.color} onChange={(color) => onChange({ color })} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Check
          label="Background"
          checked={drawing.background ?? false}
          onChange={(background) => onChange({ background })}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Opacity
          <input
            aria-label="Background opacity"
            type="range"
            min={0}
            max={100}
            value={Math.round((drawing.backgroundOpacity ?? 0.12) * 100)}
            onChange={(event) => onChange({ backgroundOpacity: event.target.valueAsNumber / 100 })}
            className="w-24 accent-white"
          />
        </label>
      </div>
      {["fib", "fib-extension"].includes(drawing.kind) ? (
        <Check
          label="Reverse"
          checked={drawing.reverse ?? false}
          onChange={(reverse) => onChange({ reverse })}
        />
      ) : null}
      {!fork ? (
        <>
          <Check
            label="Prices"
            checked={drawing.showPrices ?? false}
            onChange={(showPrices) => onChange({ showPrices })}
          />
          <div className="flex items-center justify-between">
            <Check
              label="Levels"
              checked={drawing.showLevels ?? true}
              onChange={(showLevels) => onChange({ showLevels })}
            />
            <DrawingSelect
              label="Level label format"
              value={drawing.levelLabelFormat ?? (drawing.kind === "fib" ? "percent" : "value")}
              onChange={(value) => onChange({ levelLabelFormat: value as "percent" | "value" })}
              options={[
                ["value", "Values"],
                ["percent", "Percents"],
              ]}
              className="w-36"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="mr-auto text-sm">Labels</span>
            <DrawingSelect
              label="Level horizontal alignment"
              value={drawing.levelLabelPosition ?? "right"}
              onChange={(value) =>
                onChange({
                  levelLabelPosition: value as NonNullable<ChartDrawing["levelLabelPosition"]>,
                })
              }
              options={[
                ["left", "Left"],
                ["center", "Center"],
                ["right", "Right"],
              ]}
              className="w-28"
            />
            <DrawingSelect
              label="Level vertical alignment"
              value={drawing.levelLabelAlignment ?? "top"}
              onChange={(value) =>
                onChange({
                  levelLabelAlignment: value as NonNullable<ChartDrawing["levelLabelAlignment"]>,
                })
              }
              options={[
                ["top", "Top"],
                ["middle", "Middle"],
                ["bottom", "Bottom"],
              ]}
              className="w-28"
            />
          </div>
          <label className="flex items-center justify-between text-sm">
            Font size
            <DrawingSelect
              label="Level font size"
              value={String(drawing.textFontSize ?? 12)}
              onChange={(value) => onChange({ textFontSize: Number(value) })}
              options={[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map(
                (size) => [String(size), String(size)] as const,
              )}
              className="w-20"
            />
          </label>
        </>
      ) : (
        <label className="flex items-center justify-between text-sm">
          Style
          <DrawingSelect
            label="Pitchfork style"
            value={
              drawing.pitchforkStyle ??
              (drawing.kind === "schiff-pitchfork"
                ? "schiff"
                : drawing.kind === "modified-schiff-pitchfork"
                  ? "modified-schiff"
                  : drawing.kind === "inside-pitchfork"
                    ? "inside"
                    : "original")
            }
            onChange={(value) =>
              onChange({ pitchforkStyle: value as NonNullable<ChartDrawing["pitchforkStyle"]> })
            }
            options={[
              ["original", "Original"],
              ["schiff", "Schiff"],
              ["modified-schiff", "Modified Schiff"],
              ["inside", "Inside"],
            ]}
            className="w-44"
          />
        </label>
      )}
    </>
  );
}
