import { useChartPreferences } from "./chartPreferences";
import {
  DEFAULT_PRICE_LINE_APPEARANCE,
  type ChartPriceLineAppearance,
} from "./chartPriceLineAppearance";
import { TradingSelect } from "./TradingSelect";

export function ChartPriceLineControls() {
  const appearance = useChartPreferences((state) => state.priceLineAppearance);
  const update = useChartPreferences((state) => state.setPriceLineAppearance);
  return (
    <div className="space-y-2 px-2 pb-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span>Line style</span>
        <TradingSelect
          label="Last price line style"
          value={appearance.style}
          options={[
            ["solid", "Solid"],
            ["dotted", "Dotted"],
            ["dashed", "Dashed"],
          ]}
          onChange={(style) => update({ style: style as ChartPriceLineAppearance["style"] })}
          className="w-28"
        />
      </div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span>Width</span>
        <TradingSelect
          label="Last price line width"
          value={String(appearance.width)}
          options={[
            ["1", "1 px"],
            ["2", "2 px"],
            ["3", "3 px"],
            ["4", "4 px"],
          ]}
          onChange={(width) =>
            update({ width: Number(width) as ChartPriceLineAppearance["width"] })
          }
          className="w-28"
        />
      </div>
      <label className="flex items-center justify-between gap-3 text-xs">
        Color
        <span className="flex items-center gap-2">
          <span className="text-zinc-400">{appearance.color === null ? "Auto" : "Custom"}</span>
          <input
            type="color"
            aria-label="Last price line color"
            value={appearance.color ?? "#9299a7"}
            onChange={(event) => update({ color: event.target.value })}
            className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent"
          />
        </span>
      </label>
      <button
        type="button"
        className="text-xs text-zinc-400 hover:text-white"
        onClick={() => update(DEFAULT_PRICE_LINE_APPEARANCE)}
      >
        Reset price line appearance
      </button>
    </div>
  );
}
