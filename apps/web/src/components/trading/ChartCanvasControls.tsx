import { useId } from "react";
import { useChartPreferences } from "./chartPreferences";
import { TradingSelect } from "./TradingSelect";

export function ChartCanvasControls() {
  const id = useId();
  const mode = useChartPreferences((state) => state.chartBackgroundMode);
  const top = useChartPreferences((state) => state.chartBackgroundColor);
  const bottom = useChartPreferences((state) => state.chartBackgroundBottomColor);
  const text = useChartPreferences((state) => state.chartTextColor);
  const setMode = useChartPreferences((state) => state.setChartBackgroundMode);
  const setTop = useChartPreferences((state) => state.setChartBackgroundColor);
  const setBottom = useChartPreferences((state) => state.setChartBackgroundBottomColor);
  const setText = useChartPreferences((state) => state.setChartTextColor);
  return (
    <>
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={id}>Background</label>
        <TradingSelect
          id={id}
          label="Chart background style"
          value={mode}
          options={[
            ["solid", "Solid"],
            ["gradient", "Gradient"],
          ]}
          onChange={(value) => {
            if (value === "solid" || value === "gradient") setMode(value);
          }}
          className="w-24 border-zinc-600 bg-zinc-900 text-xs"
        />
      </div>
      {[
        {
          label: mode === "gradient" ? "Top" : "Color",
          accessible: "Chart background color",
          value: top,
          onChange: setTop,
        },
        ...(mode === "gradient"
          ? [
              {
                label: "Bottom",
                accessible: "Chart background bottom color",
                value: bottom,
                onChange: setBottom,
              },
            ]
          : []),
        { label: "Text", accessible: "Chart text color", value: text, onChange: setText },
      ].map(({ label, accessible, value, onChange }) => (
        <label key={accessible} className="flex items-center justify-between text-xs">
          {label}
          <input
            type="color"
            aria-label={accessible}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent"
          />
        </label>
      ))}
      <button
        type="button"
        className="text-xs text-zinc-400 hover:text-white"
        onClick={() => {
          setMode("solid");
          setTop("#0b0d12");
          setBottom("#000000");
          setText("#9299a7");
        }}
      >
        Reset canvas colors
      </button>
    </>
  );
}
