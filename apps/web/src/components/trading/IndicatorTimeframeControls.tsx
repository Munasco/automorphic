import { useState } from "react";
import { IndicatorNumberField } from "./IndicatorNumberField";
import {
  DEFAULT_DRAWING_VISIBILITY,
  sanitizeDrawingVisibility,
  type DrawingVisibility,
} from "./drawingVisibility";

export function IndicatorTimeframeControls({
  value,
  onChange,
  accessible,
}: {
  value: DrawingVisibility | undefined;
  onChange: (value: DrawingVisibility) => void;
  accessible: (label: string) => string;
}) {
  const visibility = value ?? DEFAULT_DRAWING_VISIBILITY;
  const [resetKey, setResetKey] = useState(0);
  return (
    <details className="border-y border-white/10 py-2">
      <summary className="cursor-pointer font-medium">Timeframe visibility</summary>
      <div className="mt-3 space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label={accessible("Show on tick charts")}
            checked={visibility.ticks}
            onChange={(event) => onChange({ ...visibility, ticks: event.target.checked })}
          />
          Ticks
        </label>
        {(["seconds", "minutes", "hours", "days", "weeks", "months"] as const).map((unit) => {
          const range = visibility[unit];
          const limit = DEFAULT_DRAWING_VISIBILITY[unit].max;
          const label = unit[0]!.toUpperCase() + unit.slice(1);
          const commit = (field: "min" | "max", next: number) => {
            if (
              !Number.isInteger(next) ||
              next < 1 ||
              next > limit ||
              (field === "min" ? next > range.max : next < range.min)
            )
              return false;
            onChange({ ...visibility, [unit]: { ...range, [field]: next } });
            return true;
          };
          return (
            <div key={unit} className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={accessible(`Show on ${unit} charts`)}
                  checked={range.enabled}
                  onChange={(event) =>
                    onChange({ ...visibility, [unit]: { ...range, enabled: event.target.checked } })
                  }
                />
                {label}
              </label>
              <fieldset
                disabled={!range.enabled}
                className="flex shrink-0 items-center gap-1 disabled:opacity-40"
              >
                <IndicatorNumberField
                  label={accessible(`${label} minimum interval`)}
                  value={range.min}
                  resetKey={resetKey}
                  min={1}
                  max={range.max}
                  step={1}
                  onCommit={(next) => commit("min", next)}
                  className="h-7 w-12 rounded border border-zinc-600 bg-zinc-900 px-1 text-xs"
                />
                <span aria-hidden="true">–</span>
                <IndicatorNumberField
                  label={accessible(`${label} maximum interval`)}
                  value={range.max}
                  resetKey={resetKey}
                  min={range.min}
                  max={limit}
                  step={1}
                  onCommit={(next) => commit("max", next)}
                  className="h-7 w-12 rounded border border-zinc-600 bg-zinc-900 px-1 text-xs"
                />
              </fieldset>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            onChange(sanitizeDrawingVisibility(undefined));
            setResetKey((key) => key + 1);
          }}
          className="text-zinc-400 hover:text-white"
        >
          Show on all timeframes
        </button>
      </div>
    </details>
  );
}
