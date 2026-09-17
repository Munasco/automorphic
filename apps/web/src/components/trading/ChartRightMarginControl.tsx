import { useChartPreferences } from "./chartPreferences";
import { IndicatorNumberField } from "./IndicatorNumberField";
export function ChartRightMarginControl() {
  const bars = useChartPreferences((state) => state.rightOffsetBars);
  const setBars = useChartPreferences((state) => state.setRightOffsetBars);
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-2.5 text-xs">
      <span>Right margin (bars)</span>
      <IndicatorNumberField
        label="Right margin (bars)"
        value={bars}
        resetKey={undefined}
        min={0}
        max={100}
        step={1}
        onCommit={setBars}
        className="h-8 w-20 rounded border border-zinc-600 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-blue-400"
      />
    </div>
  );
}
