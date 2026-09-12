import { cn } from "../../lib/utils";
import { ColorPicker, DrawingSelect, inputClass } from "./DrawingStyleControls";
import type { ChartDrawing } from "./drawingGeometry";
import type { DrawingPatch } from "./useChartDrawings";

export const DRAWING_TEXT_FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40];
const textSizes = DRAWING_TEXT_FONT_SIZES.map((size) => [String(size), String(size)] as const);

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
        value={drawing.text ?? ""}
        onChange={(event) => onChange({ text: event.target.value })}
        className={cn(
          inputClass,
          "h-[100px] w-full resize-none rounded-[8px] px-[7px] py-1 text-sm leading-[18px] focus:border-[#2962ff] focus:outline-2 focus:outline-offset-[-2px] focus:outline-[#2962ff] focus:[outline-style:solid]",
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
