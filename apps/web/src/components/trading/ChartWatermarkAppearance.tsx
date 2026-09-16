import { useState } from "react";
import { useChartPreferences } from "./chartPreferences";
import { IndicatorNumberField } from "./IndicatorNumberField";

export function ChartWatermarkAppearance() {
  const color = useChartPreferences((state) => state.watermarkColor);
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
      <button
        type="button"
        className="text-xs text-zinc-400 hover:text-white"
        onClick={() => {
          setColor("#9299a7");
          setOpacity(14);
          setResetKey((value) => value + 1);
        }}
      >
        Reset watermark appearance
      </button>
    </div>
  );
}
