import { useChartPreferences } from "./chartPreferences";
import { IndicatorNumberField } from "./IndicatorNumberField";

export function ChartFontSizeControl() {
  const size = useChartPreferences((state) => state.chartFontSize);
  const setSize = useChartPreferences((state) => state.setChartFontSize);
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span>Scale text size (px)</span>
      <IndicatorNumberField
        label="Scale text size (px)"
        value={size}
        resetKey={undefined}
        min={8}
        max={24}
        step={1}
        onCommit={setSize}
        className="h-8 w-16 shrink-0 rounded border border-zinc-600 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-blue-400"
      />
    </div>
  );
}
