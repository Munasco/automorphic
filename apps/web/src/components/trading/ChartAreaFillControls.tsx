import { useState } from "react";
import { useChartPreferences } from "./chartPreferences";
import { DEFAULT_CHART_AREA_FILL } from "./chartAreaFill";
import { IndicatorNumberField } from "./IndicatorNumberField";

export function ChartAreaFillControls() {
  const fill = useChartPreferences((state) => state.areaFill);
  const lineColor = useChartPreferences((state) => state.lineChartColor);
  const setFill = useChartPreferences((state) => state.setAreaFill);
  const [resetKey, setResetKey] = useState(0);
  return (
    <fieldset className="space-y-2 border-t border-white/10 pt-2">
      <legend className="text-xs text-zinc-400">Area fill</legend>
      {(["top", "bottom"] as const).map((position) => (
        <div key={position} className="flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 capitalize">{position}</span>
          <input
            type="color"
            aria-label={`Area ${position} color`}
            value={fill[`${position}Color`] ?? lineColor}
            onChange={(event) => setFill({ [`${position}Color`]: event.target.value })}
            className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent"
          />
          <IndicatorNumberField
            label={`Area ${position} opacity (%)`}
            value={fill[`${position}Opacity`]}
            resetKey={resetKey}
            min={0}
            max={100}
            step={1}
            onCommit={(value) => setFill({ [`${position}Opacity`]: value })}
            className="h-8 w-14 shrink-0 rounded border border-zinc-600 bg-zinc-900 px-1 text-xs text-zinc-200 outline-none focus:border-blue-400"
          />
          <span className="text-zinc-400">%</span>
        </div>
      ))}
      <button
        type="button"
        className="text-xs text-zinc-400 hover:text-white"
        onClick={() => {
          setFill(DEFAULT_CHART_AREA_FILL);
          setResetKey((value) => value + 1);
        }}
      >
        Reset area fill
      </button>
    </fieldset>
  );
}
