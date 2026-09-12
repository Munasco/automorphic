import { defaultRegressionDrawingSettings, type ChartDrawing } from "./drawingGeometry";
import type { DrawingPatch } from "./useChartDrawings";
import type { RegressionSource } from "./chartRegression";
import { Check, DrawingSelect, inputClass, LineAppearancePicker } from "./DrawingStyleControls";
import { cn } from "../../lib/utils";

export function DrawingRegressionSettings({
  drawing,
  tab,
  onChange,
}: {
  drawing: ChartDrawing;
  tab: "Inputs" | "Style";
  onChange: (patch: DrawingPatch) => void;
}) {
  const settings = { ...defaultRegressionDrawingSettings(), ...drawing };
  if (tab === "Inputs")
    return (
      <>
        {(["Upper", "Lower"] as const).map((side) => {
          const valueKey =
            side === "Upper" ? "regressionUpperDeviation" : "regressionLowerDeviation";
          const useKey =
            side === "Upper" ? "regressionUseUpperDeviation" : "regressionUseLowerDeviation";
          return (
            <div key={side} className="space-y-4">
              <label className="flex items-center justify-between gap-4 text-sm">
                {side} Deviation
                <input
                  type="number"
                  aria-label={`${side} deviation`}
                  step="0.1"
                  value={settings[valueKey]}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    if (Number.isFinite(value)) onChange({ [valueKey]: value });
                  }}
                  className={cn(inputClass, "w-28")}
                />
              </label>
              <Check
                label={`Use ${side.toLowerCase()} deviation`}
                checked={settings[useKey]}
                onChange={(value) => onChange({ [useKey]: value })}
              />
            </div>
          );
        })}
        <label className="flex items-center justify-between gap-4 text-sm">
          Source
          <DrawingSelect
            label="Regression source"
            value={settings.regressionSource}
            className="w-44"
            onChange={(value) => onChange({ regressionSource: value as RegressionSource })}
            options={[
              ["open", "Open"],
              ["high", "High"],
              ["low", "Low"],
              ["close", "Close"],
              ["hl2", "(H + L) / 2"],
              ["hlc3", "(H + L + C) / 3"],
              ["ohlc4", "(O + H + L + C) / 4"],
              ["hlcc4", "(H + L + C + C) / 4"],
            ]}
          />
        </label>
      </>
    );
  return (
    <>
      {(
        [
          ["regressionBaseLine", "Base"],
          ["regressionUpperLine", "Up"],
          ["regressionLowerLine", "Down"],
        ] as const
      ).map(([key, label]) => {
        const line = settings[key];
        return (
          <div key={key} className="flex items-center justify-between gap-4">
            <Check
              label={label}
              checked={line.visible}
              onChange={(visible) => onChange({ [key]: { ...line, visible } })}
            />
            <div inert={!line.visible} className={cn(!line.visible && "opacity-40")}>
              <LineAppearancePicker
                label={`${label} line appearance`}
                fillOpacity={line.opacity ?? 0.3}
                onFillOpacityChange={(opacity) => onChange({ [key]: { ...line, opacity } })}
                drawing={{ ...drawing, ...line }}
                onChange={(patch) => onChange({ [key]: { ...line, ...patch } })}
              />
            </div>
          </div>
        );
      })}
      <Check
        label="Extend lines"
        checked={settings.extendLines}
        onChange={(extendLines) => onChange({ extendLines })}
      />
      <Check
        label="Pearson's R"
        checked={settings.regressionShowPearson}
        onChange={(regressionShowPearson) => onChange({ regressionShowPearson })}
      />
    </>
  );
}
