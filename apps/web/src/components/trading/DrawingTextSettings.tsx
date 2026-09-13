import {
  DEFAULT_DRAWING_TEXT_BACKGROUND_COLOR,
  DEFAULT_DRAWING_TEXT_BACKGROUND_OPACITY,
  DEFAULT_DRAWING_TEXT_BORDER_COLOR,
  DEFAULT_DRAWING_TEXT_BORDER_OPACITY,
} from "./drawingTextLayout";
import { cn } from "../../lib/utils";
import { Check, ColorPicker, DrawingSelect, inputClass } from "./DrawingStyleControls";
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
          className="flex size-[34px] shrink-0 items-center justify-center rounded-[6px] border border-[#575757] hover:border-[#8c8c8c] aria-pressed:border-[#8c8c8c] aria-pressed:bg-[#8c8c8c] aria-pressed:text-white"
        >
          <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="currentColor">
            <path d="M14 21h-3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3c2 0 4 1 4 3 0 1 0 2-1.5 3 1.5.5 2.5 2 2.5 4 0 2.75-2.638 4-5 4zM12 9l.004 3c.39.026.82 0 1.25 0C14.908 12 16 11.743 16 10.5c0-1.1-.996-1.5-2.5-1.5-.397 0-.927-.033-1.5 0zm0 5v5h1.5c1.5 0 3.5-.5 3.5-2.5S15 14 13.5 14c-.5 0-.895-.02-1.5 0z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Italic text"
          aria-pressed={drawing.textItalic ?? false}
          onClick={() => onChange({ textItalic: !drawing.textItalic })}
          className="flex size-[34px] shrink-0 items-center justify-center rounded-[6px] border border-[#575757] hover:border-[#8c8c8c] aria-pressed:border-[#8c8c8c] aria-pressed:bg-[#8c8c8c] aria-pressed:text-white"
        >
          <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="currentColor">
            <path d="M12.143 20l1.714-12H12V7h5v1h-2.143l-1.714 12H15v1h-5v-1h2.143z" />
          </svg>
        </button>
      </div>
      <textarea
        aria-label="Drawing text"
        placeholder="Add text"
        value={drawing.text ?? ""}
        onChange={(event) => onChange({ text: event.target.value })}
        className={cn(
          inputClass,
          "block w-full resize-none rounded-[8px] px-[7px] py-1 text-sm leading-[18px] focus:border-[#2962ff] focus:outline-2 focus:outline-offset-[-2px] focus:outline-[#2962ff] focus:[outline-style:solid]",
          drawing.kind === "text" ? "h-[170px]" : "h-[100px]",
        )}
      />
      {drawing.kind === "text" ? (
        <div className="text-sm [&>div]:flex [&>div]:h-[50px] [&>div]:items-center">
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
              label="Background color"
              disabled={!drawing.background}
              value={drawing.backgroundColor ?? DEFAULT_DRAWING_TEXT_BACKGROUND_COLOR}
              opacity={drawing.backgroundOpacity ?? DEFAULT_DRAWING_TEXT_BACKGROUND_OPACITY}
              onChange={(backgroundColor) => onChange({ backgroundColor })}
              onOpacityChange={(backgroundOpacity) => onChange({ backgroundOpacity })}
            />
          </div>
          <div>
            <div className="w-[124px] shrink-0">
              <Check
                label="Border"
                checked={drawing.textBorder ?? false}
                onChange={(textBorder) => onChange({ textBorder })}
              />
            </div>
            <ColorPicker
              variant="settings"
              label="Border color"
              disabled={!drawing.textBorder}
              value={drawing.textBorderColor ?? DEFAULT_DRAWING_TEXT_BORDER_COLOR}
              opacity={drawing.textBorderOpacity ?? DEFAULT_DRAWING_TEXT_BORDER_OPACITY}
              onChange={(textBorderColor) => onChange({ textBorderColor })}
              onOpacityChange={(textBorderOpacity) => onChange({ textBorderOpacity })}
            />
          </div>
          <div>
            <Check
              label="Text wrap"
              checked={drawing.textWrap ?? false}
              onChange={(textWrap) => onChange({ textWrap })}
            />
          </div>
        </div>
      ) : (
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
              value={drawing.textAlignment ?? "center"}
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
      )}
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
