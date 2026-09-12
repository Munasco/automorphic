import { useState } from "react";
import { ChartIcon } from "./ChartIcon";
import {
  ColorPicker,
  WidthPicker,
  LineStylePicker,
  Check,
  inputClass,
} from "./DrawingStyleControls";
import { defaultDrawingLevels, isPitchforkDrawingTool, type ChartDrawing } from "./drawingGeometry";
import type { DrawingPatch } from "./useChartDrawings";
import { cn } from "../../lib/utils";

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
          <select
            aria-label="Extend Fibonacci levels"
            value={
              drawing.extendLeft && drawing.extendRight
                ? "both"
                : drawing.extendLeft
                  ? "left"
                  : drawing.extendRight
                    ? "right"
                    : "none"
            }
            onChange={(event) =>
              onChange({
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
            <input
              aria-label={`Level ${index + 1} value`}
              type="number"
              step="0.001"
              min={-100}
              max={100}
              value={level.value}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isFinite(value) && Math.abs(value) <= 100) changeLevel(index, { value });
              }}
              className={cn(inputClass, "min-w-0 w-full px-2")}
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
            <select
              aria-label="Level label format"
              value={drawing.levelLabelFormat ?? (drawing.kind === "fib" ? "percent" : "value")}
              onChange={(event) =>
                onChange({ levelLabelFormat: event.target.value as "percent" | "value" })
              }
              className={cn(inputClass, "w-36 bg-[#202020]")}
            >
              <option value="value">Values</option>
              <option value="percent">Percents</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="mr-auto text-sm">Labels</span>
            <select
              aria-label="Level horizontal alignment"
              value={drawing.levelLabelPosition ?? "right"}
              onChange={(event) =>
                onChange({
                  levelLabelPosition: event.target.value as NonNullable<
                    ChartDrawing["levelLabelPosition"]
                  >,
                })
              }
              className={cn(inputClass, "w-28 bg-[#202020]")}
            >
              {["left", "center", "right"].map((position) => (
                <option key={position} value={position}>
                  {position[0]!.toUpperCase() + position.slice(1)}
                </option>
              ))}
            </select>
            <select
              aria-label="Level vertical alignment"
              value={drawing.levelLabelAlignment ?? "top"}
              onChange={(event) =>
                onChange({
                  levelLabelAlignment: event.target.value as NonNullable<
                    ChartDrawing["levelLabelAlignment"]
                  >,
                })
              }
              className={cn(inputClass, "w-28 bg-[#202020]")}
            >
              {["top", "middle", "bottom"].map((position) => (
                <option key={position} value={position}>
                  {position[0]!.toUpperCase() + position.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center justify-between text-sm">
            Font size
            <select
              aria-label="Level font size"
              value={drawing.textFontSize ?? 12}
              onChange={(event) => onChange({ textFontSize: Number(event.target.value) })}
              className={cn(inputClass, "w-20 bg-[#202020]")}
            >
              {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <label className="flex items-center justify-between text-sm">
          Style
          <select
            aria-label="Pitchfork style"
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
            onChange={(event) =>
              onChange({
                pitchforkStyle: event.target.value as NonNullable<ChartDrawing["pitchforkStyle"]>,
              })
            }
            className={cn(inputClass, "w-44 bg-[#202020]")}
          >
            <option value="original">Original</option>
            <option value="schiff">Schiff</option>
            <option value="modified-schiff">Modified Schiff</option>
            <option value="inside">Inside</option>
          </select>
        </label>
      )}
    </>
  );
}
