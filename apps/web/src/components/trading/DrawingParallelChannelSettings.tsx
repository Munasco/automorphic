import { useState } from "react";
import { cn } from "../../lib/utils";
import {
  parallelChannelSettingsLevels,
  type ChartDrawing,
  type DrawingLevel,
} from "./drawingGeometry";
import { Check, ColorPicker, DrawingSelect, LineAppearancePicker } from "./DrawingStyleControls";
import { DrawingNumberField } from "./DrawingNumberField";
import type { DrawingPatch } from "./useChartDrawings";

export function DrawingParallelChannelSettings({
  drawing,
  onChange,
}: {
  drawing: ChartDrawing;
  onChange: (patch: DrawingPatch) => void;
}) {
  const levels = parallelChannelSettingsLevels(drawing);
  const [rowKeys] = useState(() =>
    Array.from({ length: 64 }, (_, index) => `channel-level-${index}`),
  );
  const changeLevel = (index: number, patch: Partial<DrawingLevel>) =>
    onChange({ levels: levels.map((level, i) => (i === index ? { ...level, ...patch } : level)) });
  return (
    <div className="space-y-3">
      {levels.slice(0, 7).map((level, index) => (
        <div key={rowKeys[index]} className="flex h-[34px] items-center gap-2">
          {index === 1 || index === 5 ? (
            <span className="size-4 shrink-0" />
          ) : (
            <input
              type="checkbox"
              aria-label={`Show level ${index + 1}`}
              checked={level.visible}
              onChange={(event) => changeLevel(index, { visible: event.target.checked })}
              className="size-4 shrink-0 accent-white"
            />
          )}
          <DrawingNumberField
            label={`Level ${index + 1} ratio`}
            step={0.001}
            min={-100}
            max={100}
            value={level.value}
            disabled={!level.visible}
            readOnly={index === 1 || index === 5}
            onValueChange={(value) => {
              if (Math.abs(value) <= 100) changeLevel(index, { value });
            }}
            className="w-24"
          />
          <div inert={!level.visible} className={cn(!level.visible && "opacity-40")}>
            <LineAppearancePicker
              label={`Level ${index + 1} appearance`}
              fillOpacity={level.opacity ?? drawing.lineOpacity ?? 1}
              onFillOpacityChange={(opacity) => changeLevel(index, { opacity })}
              drawing={{
                ...drawing,
                color: level.color ?? drawing.color,
                width: level.width ?? drawing.width,
                lineStyle: level.lineStyle ?? drawing.lineStyle ?? "solid",
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
      <label className="flex items-center justify-between gap-3 text-sm">
        Extend
        <DrawingSelect
          label="Extend channel"
          value={
            drawing.extendLeft && drawing.extendRight
              ? "both"
              : drawing.extendLeft
                ? "left"
                : drawing.extendRight
                  ? "right"
                  : "none"
          }
          options={[
            ["none", "Don't extend"],
            ["left", "Extend left"],
            ["right", "Extend right"],
            ["both", "Extend both"],
          ]}
          onChange={(value) =>
            onChange({
              extendLeft: value === "left" || value === "both",
              extendRight: value === "right" || value === "both",
            })
          }
          className="w-44"
        />
      </label>
      <div className="flex items-center gap-3">
        <div className="w-[100px] shrink-0">
          <Check
            label="Background"
            checked={drawing.background ?? false}
            onChange={(background) => onChange({ background })}
          />
        </div>
        <div inert={!drawing.background} className={cn(!drawing.background && "opacity-40")}>
          <ColorPicker
            label="Background color"
            value={drawing.backgroundColor ?? drawing.color}
            opacity={drawing.backgroundOpacity ?? 0.12}
            onChange={(backgroundColor) => onChange({ backgroundColor })}
            onOpacityChange={(backgroundOpacity) => onChange({ backgroundOpacity })}
          />
        </div>
      </div>
    </div>
  );
}
