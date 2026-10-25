import { useId, useState } from "react";
import {
  useChartPreferences,
  type WatermarkHorizontalAlignment,
  type WatermarkVerticalAlignment,
} from "./chartPreferences";
import { TradingSelect } from "./TradingSelect";
import { IndicatorNumberField } from "./IndicatorNumberField";

export function ChartWatermarkAppearance() {
  const id = useId();
  const horizontal = useChartPreferences((state) => state.watermarkHorizontalAlignment);
  const vertical = useChartPreferences((state) => state.watermarkVerticalAlignment);
  const setHorizontal = useChartPreferences((state) => state.setWatermarkHorizontalAlignment);
  const setVertical = useChartPreferences((state) => state.setWatermarkVerticalAlignment);
  const color = useChartPreferences((state) => state.watermarkColor);
  const scale = useChartPreferences((state) => state.watermarkScale);
  const setScale = useChartPreferences((state) => state.setWatermarkScale);
  const opacity = useChartPreferences((state) => state.watermarkOpacity);
  const setColor = useChartPreferences((state) => state.setWatermarkColor);
  const setOpacity = useChartPreferences((state) => state.setWatermarkOpacity);
  const [resetKey, setResetKey] = useState(0);
  return (
    <div className="space-y-2 pt-2">
      <label className="flex items-center justify-between gap-3 text-xs">
        Color
        <input
          type="color"
          aria-label="Watermark color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent"
        />
      </label>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span>Opacity (%)</span>
        <IndicatorNumberField
          label="Watermark opacity (%)"
          value={opacity}
          resetKey={resetKey}
          min={0}
          max={100}
          step={1}
          onCommit={setOpacity}
          className="h-8 w-20 rounded border border-zinc-600 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-blue-400"
        />
      </div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span>Size (%)</span>
        <IndicatorNumberField
          label="Watermark size (%)"
          value={scale}
          resetKey={resetKey}
          min={25}
          max={200}
          step={1}
          onCommit={setScale}
          className="h-8 w-20 rounded border border-zinc-600 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-blue-400"
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={`${id}-horizontal`}>Horizontal</label>
        <TradingSelect
          id={`${id}-horizontal`}
          label="Watermark horizontal alignment"
          value={horizontal}
          options={[
            ["left", "Left"],
            ["center", "Center"],
            ["right", "Right"],
          ]}
          onChange={(value) => setHorizontal(value as WatermarkHorizontalAlignment)}
          className="w-24 border-zinc-600 bg-zinc-900 text-xs"
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={`${id}-vertical`}>Vertical</label>
        <TradingSelect
          id={`${id}-vertical`}
          label="Watermark vertical alignment"
          value={vertical}
          options={[
            ["top", "Top"],
            ["center", "Center"],
            ["bottom", "Bottom"],
          ]}
          onChange={(value) => setVertical(value as WatermarkVerticalAlignment)}
          className="w-24 border-zinc-600 bg-zinc-900 text-xs"
        />
      </div>
      <button
        type="button"
        className="text-xs text-zinc-400 hover:text-white"
        onClick={() => {
          setColor("#9299a7");
          setOpacity(14);
          setScale(100);
          setHorizontal("center");
          setVertical("center");
          setResetKey((value) => value + 1);
        }}
      >
        Reset watermark appearance
      </button>
    </div>
  );
}
