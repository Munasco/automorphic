import { Fragment } from "react";
import { defaultRegressionDrawingSettings, type ChartDrawing } from "./drawingGeometry";
import type { DrawingPatch } from "./useChartDrawings";
import type { RegressionSource } from "./chartRegression";
import { Check, DrawingSelect, LineAppearancePicker } from "./DrawingStyleControls";
import { DrawingNumberField } from "./DrawingNumberField";
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
      <div className="grid grid-cols-[max-content_100px] items-center gap-x-5 text-sm">
        {(["Upper", "Lower"] as const).map((side) => {
          const valueKey =
            side === "Upper" ? "regressionUpperDeviation" : "regressionLowerDeviation";
          return (
            <Fragment key={side}>
              <span className="flex h-[50px] items-center">{side} Deviation</span>
              <DrawingNumberField
                label={`${side} deviation`}
                step={0.1}
                min={-100}
                max={100}
                value={settings[valueKey]}
                onValueChange={(value) => onChange({ [valueKey]: value })}
              />
            </Fragment>
          );
        })}
        {(["Upper", "Lower"] as const).map((side) => {
          const useKey =
            side === "Upper" ? "regressionUseUpperDeviation" : "regressionUseLowerDeviation";
          return (
            <div key={side} className="col-span-2 flex h-[34px] items-center">
              <Check
                label={`Use ${side} Deviation`}
                checked={settings[useKey]}
                onChange={(value) => onChange({ [useKey]: value })}
              />
            </div>
          );
        })}
        <span className="flex h-[50px] items-center">Source</span>
        <DrawingSelect
          label="Regression source"
          value={settings.regressionSource}
          className="w-[100px]"
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
      </div>
    );
  return (
    <div className="grid grid-cols-[max-content_1fr] items-center gap-x-5 auto-rows-[50px]">
      {(
        [
          ["regressionBaseLine", "Base"],
          ["regressionUpperLine", "Up"],
          ["regressionLowerLine", "Down"],
        ] as const
      ).map(([key, label]) => {
        const line = settings[key];
        return (
          <Fragment key={key}>
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
          </Fragment>
        );
      })}
      <div className="col-span-2">
        <Check
          label="Extend lines"
          checked={settings.extendLines}
          onChange={(extendLines) => onChange({ extendLines })}
        />
      </div>
      <div className="col-span-2">
        <Check
          label="Pearson's R"
          checked={settings.regressionShowPearson}
          onChange={(regressionShowPearson) => onChange({ regressionShowPearson })}
        />
      </div>
    </div>
  );
}
