import { useState } from "react";
import { Slider } from "@base-ui/react/slider";
import { cn } from "../../lib/utils";
import { defaultDrawingLevels, type ChartDrawing, type DrawingLevel } from "./drawingGeometry";
import { DrawingNumberField } from "./DrawingNumberField";
import { Check, ColorPicker, DrawingSelect, LineAppearancePicker } from "./DrawingStyleControls";
import type { DrawingPatch } from "./useChartDrawings";

export function DrawingPitchforkSettings({
  drawing,
  onChange,
}: {
  drawing: ChartDrawing;
  onChange: (patch: DrawingPatch) => void;
}) {
  const levels = drawing.levels ?? defaultDrawingLevels(drawing.kind);
  const [rowKeys] = useState(() => Array.from({ length: 64 }, (_, index) => `fork-level-${index}`));
  // Freeze inherited appearance before editing the median or a single level.
  // A legacy one-color flag must not override later individual color choices.
  const effectiveLevels = levels.map((level) => ({
    ...level,
    color: drawing.useOneColor ? drawing.color : (level.color ?? drawing.color),
    width: level.width ?? drawing.width,
    lineStyle: level.lineStyle ?? drawing.lineStyle ?? "solid",
    opacity: level.opacity ?? drawing.lineOpacity ?? 1,
  }));
  const changeLevel = (index: number, patch: Partial<DrawingLevel>) =>
    onChange({
      useOneColor: false,
      levels: effectiveLevels.map((level, i) => (i === index ? { ...level, ...patch } : level)),
    });
  const changeMedian = (patch: DrawingPatch) =>
    onChange({ ...patch, useOneColor: false, levels: effectiveLevels });
  const background = drawing.background ?? true;
  return (
    <div className="text-sm [&>div]:flex [&>div]:h-[50px] [&>div]:items-center">
      <div>
        <Check
          label="Extend lines"
          checked={drawing.extendLines ?? false}
          onChange={(extendLines) => onChange({ extendLines })}
        />
      </div>
      <div>
        <span className="w-[124px] shrink-0">Median</span>
        <LineAppearancePicker label="Median appearance" drawing={drawing} onChange={changeMedian} />
      </div>
      {levels.map((level, index) => (
        <div key={rowKeys[index]} className="gap-2">
          <Check
            label={`Show level ${index + 1}`}
            hideLabel
            checked={level.visible}
            onChange={(visible) => changeLevel(index, { visible })}
          />
          <DrawingNumberField
            label={`Level ${index + 1} value`}
            value={level.value}
            step={0.001}
            min={-100}
            max={100}
            disabled={!level.visible}
            onValueChange={(value) => changeLevel(index, { value })}
            className="w-[100px]"
          />
          <LineAppearancePicker
            disabled={!level.visible}
            label={`Level ${index + 1} appearance`}
            drawing={{ ...drawing, ...effectiveLevels[index]! }}
            fillOpacity={effectiveLevels[index]!.opacity}
            onFillOpacityChange={(opacity) => changeLevel(index, { opacity })}
            onChange={({ color, width, lineStyle }) =>
              changeLevel(index, {
                ...(color === undefined ? {} : { color }),
                ...(width === undefined ? {} : { width }),
                ...(lineStyle === undefined ? {} : { lineStyle }),
              })
            }
          />
        </div>
      ))}
      <div>
        <span className="w-[124px] shrink-0">Use one color</span>
        <ColorPicker
          label="Use one color"
          variant="settings"
          value={drawing.color}
          mixed={
            effectiveLevels.some((level) => level.color !== drawing.color) ? "diagonal" : false
          }
          onChange={(color) =>
            onChange({
              color,
              useOneColor: false,
              levels: effectiveLevels.map((level) => ({ ...level, color })),
            })
          }
        />
      </div>
      <div>
        <div className="w-[124px] shrink-0">
          <Check
            label="Background"
            checked={background}
            onChange={(value) => onChange({ background: value })}
          />
        </div>
        <Slider.Root
          min={0}
          max={100}
          thumbAlignment="edge"
          disabled={!background}
          value={Math.round((drawing.backgroundOpacity ?? 0.12) * 100)}
          onValueChange={(value) => onChange({ backgroundOpacity: Number(value) / 100 })}
          className={cn("w-[148px]", !background && "opacity-40")}
        >
          <Slider.Control className="relative flex h-[34px] w-full touch-none items-center">
            <Slider.Track
              className="relative h-[10px] w-full rounded-[5px] bg-white"
              style={{
                backgroundImage:
                  "repeating-conic-gradient(rgba(42,46,57,.4) 0 25%, transparent 0 50%)",
                backgroundSize: "8px 8px",
                backgroundPosition: "1px center",
              }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded border border-[#2962ff] bg-gradient-to-r from-transparent to-[#2962ff]"
              />
              <Slider.Thumb
                getAriaLabel={() => "Background opacity"}
                className="size-3 rounded-full border-2 border-white bg-[#202020] shadow-[0_1px_2px_rgb(0_0_0/0.5)] outline-none transition-[inset-inline-start,top] duration-100 ease-[ease] data-[dragging]:duration-0 focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
      </div>
      <div>
        <span className="w-[124px] shrink-0">Style</span>
        <DrawingSelect
          label="Pitchfork style"
          value={
            drawing.pitchforkStyle ??
            (drawing.kind === "pitchfork" ? "original" : drawing.kind.replace("-pitchfork", ""))
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
          className="w-[100px]"
        />
      </div>
    </div>
  );
}
