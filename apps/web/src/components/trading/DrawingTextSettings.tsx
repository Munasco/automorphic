import { cn } from "../../lib/utils";
import { ColorPicker, DrawingSelect, inputClass } from "./DrawingStyleControls";
import type { ChartDrawing } from "./drawingGeometry";
import type { DrawingPatch } from "./useChartDrawings";

const textSizes = [8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40, 48].map(
  (size) => [String(size), String(size)] as const,
);

export function DrawingTextSettings({
  drawing,
  onChange,
}: {
  drawing: ChartDrawing;
  onChange: (patch: DrawingPatch) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <ColorPicker
          variant="settings"
          label="Text color"
          value={drawing.textColor ?? drawing.color}
          onChange={(textColor) => onChange({ textColor })}
          opacity={drawing.textOpacity ?? 1}
          onOpacityChange={(textOpacity) => onChange({ textOpacity })}
        />
        <DrawingSelect
          label="Text size"
          value={String(drawing.textFontSize ?? 14)}
          onChange={(value) => onChange({ textFontSize: Number(value) })}
          options={textSizes}
          className="h-[34px] w-[100px] shrink-0"
        />
        <button
          type="button"
          aria-label="Bold text"
          aria-pressed={drawing.textBold ?? false}
          onClick={() => onChange({ textBold: !drawing.textBold })}
          className="size-[34px] shrink-0 rounded border border-white/15 font-bold hover:bg-white/10 aria-pressed:bg-blue-600"
        >
          B
        </button>
        <button
          type="button"
          aria-label="Italic text"
          aria-pressed={drawing.textItalic ?? false}
          onClick={() => onChange({ textItalic: !drawing.textItalic })}
          className="size-[34px] shrink-0 rounded border border-white/15 italic hover:bg-white/10 aria-pressed:bg-blue-600"
        >
          I
        </button>
      </div>
      <textarea
        aria-label="Drawing text"
        placeholder="Add text"
        maxLength={140}
        value={drawing.text ?? ""}
        onChange={(event) => onChange({ text: event.target.value })}
        className={cn(
          inputClass,
          "h-[100px] w-full resize-none px-[5px] py-[2px] text-sm leading-[18px]",
        )}
      />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span
          className={cn(
            "shrink-0 whitespace-nowrap text-sm",
            drawing.kind === "vertical" && "w-[100px]",
          )}
        >
          Text alignment
        </span>
        <div className="flex items-center gap-2">
          <DrawingSelect
            label="Text vertical alignment"
            value={drawing.textPosition ?? (drawing.kind === "vertical" ? "center" : "above")}
            onChange={(value) =>
              onChange({ textPosition: value as NonNullable<ChartDrawing["textPosition"]> })
            }
            options={[
              ["above", "Top"],
              ["center", "Middle"],
              ["below", "Bottom"],
            ]}
            className="h-[34px] w-[100px] shrink-0"
          />
          <DrawingSelect
            label="Text horizontal alignment"
            value={drawing.textAlignment ?? (drawing.kind === "text" ? "left" : "center")}
            onChange={(value) =>
              onChange({ textAlignment: value as NonNullable<ChartDrawing["textAlignment"]> })
            }
            options={[
              ["left", "Left"],
              ["center", "Center"],
              ["right", "Right"],
            ]}
            className="h-[34px] w-[100px] shrink-0"
          />
        </div>
      </div>
      {drawing.kind === "vertical" ? (
        <div className="flex items-center gap-5">
          <span className="w-[100px] shrink-0 whitespace-nowrap text-sm">Text orientation</span>
          <DrawingSelect
            label="Text orientation"
            value={drawing.textOrientation ?? "vertical"}
            onChange={(value) => onChange({ textOrientation: value as "horizontal" | "vertical" })}
            options={[
              ["horizontal", "Horizontal"],
              ["vertical", "Vertical"],
            ]}
            className="h-[34px] w-[100px] shrink-0"
          />
        </div>
      ) : null}
    </>
  );
}
