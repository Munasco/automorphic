import { useState } from "react";
import {
  parallelChannelSettingsLevels,
  type ChartDrawing,
  type DrawingLevel,
} from "./drawingGeometry";
import {
  Check,
  ColorPicker,
  LineExtensionPicker,
  LineAppearancePicker,
} from "./DrawingStyleControls";
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
    <div className="text-sm [&>div]:flex [&>div]:h-[50px] [&>div]:items-center">
      {levels.slice(0, 7).map((level, index) => (
        <div key={rowKeys[index]} className="gap-2">
          {index === 1 || index === 5 ? (
            <span className="size-[18px] shrink-0" />
          ) : (
            <Check
              label={`Show level ${index + 1}`}
              hideLabel
              checked={level.visible}
              onChange={(visible) => changeLevel(index, { visible })}
            />
          )}
          <DrawingNumberField
            label={`Level ${index + 1} ratio`}
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
          <LineAppearancePicker
            disabled={!level.visible}
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
      ))}
      <div>
        <span className="w-[124px] shrink-0">Extend</span>
        <LineExtensionPicker
          left={drawing.extendLeft ?? false}
          right={drawing.extendRight ?? false}
          onChange={onChange}
        />
      </div>
      <div>
        <div className="w-[124px] shrink-0">
          <Check
            label="Background"
            checked={drawing.background ?? false}
            onChange={(background) => onChange({ background })}
          />
        </div>
        <ColorPicker
          variant="settings"
          disabled={!drawing.background}
          label="Background color"
          value={drawing.backgroundColor ?? drawing.color}
          opacity={drawing.backgroundOpacity ?? 0.12}
          onChange={(backgroundColor) => onChange({ backgroundColor })}
          onOpacityChange={(backgroundOpacity) => onChange({ backgroundOpacity })}
        />
      </div>
    </div>
  );
}
