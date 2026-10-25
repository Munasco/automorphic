import { useState } from "react";
import { cn } from "../../lib/utils";
import {
  defaultDrawingLevels,
  fibTimeAppearancePatch,
  defaultFibTimeDrawingSettings,
  type ChartDrawing,
} from "./drawingGeometry";
import { Check, ColorPicker, DrawingSelect, LineAppearancePicker } from "./DrawingStyleControls";
import { DrawingNumberField } from "./DrawingNumberField";
import type { DrawingPatch } from "./useChartDrawings";

export function DrawingFibTimeSettings({
  drawing,
  onChange,
}: {
  drawing: ChartDrawing;
  onChange: (patch: DrawingPatch) => void;
}) {
  const settings = { ...defaultFibTimeDrawingSettings(drawing.kind), ...drawing };
  const levels = settings.levels ?? defaultDrawingLevels(drawing.kind);
  const [rowKeys] = useState(() => Array.from({ length: 64 }, (_, index) => `time-level-${index}`));
  const changeLevel = (index: number, patch: Partial<(typeof levels)[number]>) =>
    onChange({ levels: levels.map((level, i) => (i === index ? { ...level, ...patch } : level)) });
  const trendLine = settings.trendLine ?? {
    color: "#808080",
    width: 2,
    lineStyle: "dashed" as const,
  };
  return (
    <div className="space-y-4">
      {drawing.kind === "fib-trend-time" ? (
        <div className="flex h-[34px] items-center gap-4">
          <Check
            label="Trend line"
            checked={settings.showTrendLine ?? true}
            onChange={(showTrendLine) => onChange({ showTrendLine })}
          />
          <div
            inert={settings.showTrendLine === false}
            className={cn(settings.showTrendLine === false && "opacity-40")}
          >
            <LineAppearancePicker
              label="Trend line appearance"
              fillOpacity={trendLine.opacity ?? 1}
              onFillOpacityChange={(opacity) => onChange({ trendLine: { ...trendLine, opacity } })}
              drawing={{ ...drawing, ...trendLine }}
              onChange={(patch) => onChange({ trendLine: { ...trendLine, ...patch } })}
            />
          </div>
        </div>
      ) : null}
      {levels.map((level, index) => (
        <div key={rowKeys[index]} className="flex h-[34px] items-center gap-2">
          <input
            type="checkbox"
            aria-label={`Show level ${index + 1}`}
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
            disabled={!level.visible}
            onValueChange={(value) => {
              if (Math.abs(value) <= 100) changeLevel(index, { value });
            }}
            className="w-[100px]"
          />
          <div inert={!level.visible} className={cn(!level.visible && "opacity-40")}>
            <LineAppearancePicker
              label={`Level ${index + 1} appearance`}
              fillOpacity={level.opacity ?? 1}
              onFillOpacityChange={(opacity) => changeLevel(index, { opacity })}
              drawing={{
                ...drawing,
                color: level.color ?? drawing.color,
                width: level.width ?? 2,
                lineStyle: level.lineStyle ?? "solid",
              }}
              onChange={({ color, width, lineStyle }) =>
                changeLevel(index, {
                  ...(color === undefined ? {} : { color }),
                  ...(width === undefined ? {} : { width }),
                  ...(lineStyle === undefined ? {} : { lineStyle }),
                })
              }
            />
          </div>
        </div>
      ))}
      <div className="flex h-[34px] items-center gap-4 text-sm">
        <span className="w-[108px]">Use one color</span>
        <ColorPicker
          label="All level colors"
          value={levels[0]?.color ?? drawing.color}
          mixed={new Set(levels.map((level) => level.color ?? drawing.color)).size > 1}
          onChange={(color) => onChange(fibTimeAppearancePatch(drawing, { color }))}
        />
      </div>
      <div className="flex h-[34px] items-center gap-4">
        <div className="w-[108px]">
          <Check
            label="Background"
            checked={settings.background ?? false}
            onChange={(background) => onChange({ background })}
          />
        </div>
        <input
          aria-label="Background opacity"
          type="range"
          min={0}
          max={100}
          disabled={!settings.background}
          value={Math.round((settings.backgroundOpacity ?? 0.2) * 100)}
          onChange={(event) => onChange({ backgroundOpacity: event.target.valueAsNumber / 100 })}
          className="w-[148px] accent-white disabled:opacity-40"
        />
      </div>
      <div className="flex h-[34px] items-center gap-2">
        <div className="w-[116px] shrink-0">
          <Check
            label="Labels"
            checked={settings.showLevels ?? true}
            onChange={(showLevels) => onChange({ showLevels })}
          />
        </div>
        <DrawingSelect
          label="Level horizontal alignment"
          value={settings.levelLabelPosition ?? "right"}
          disabled={settings.showLevels === false}
          className="flex-1"
          options={[
            ["left", "Left"],
            ["center", "Center"],
            ["right", "Right"],
          ]}
          onChange={(value) =>
            onChange({ levelLabelPosition: value as "left" | "center" | "right" })
          }
        />
        <DrawingSelect
          label="Level vertical alignment"
          value={settings.levelLabelAlignment ?? "bottom"}
          disabled={settings.showLevels === false}
          className="flex-1"
          options={[
            ["top", "Top"],
            ["middle", "Middle"],
            ["bottom", "Bottom"],
          ]}
          onChange={(value) =>
            onChange({ levelLabelAlignment: value as "top" | "middle" | "bottom" })
          }
        />
      </div>
    </div>
  );
}
