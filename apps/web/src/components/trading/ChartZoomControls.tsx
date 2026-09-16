import { useId } from "react";
import { Checkbox } from "../ui/checkbox";
import { useChartPreferences } from "./chartPreferences";
import { TradingSelect } from "./TradingSelect";

export function ChartZoomControls() {
  const id = useId();
  const enabled = useChartPreferences((state) => state.zoomWithMouseWheel);
  const setEnabled = useChartPreferences((state) => state.setZoomWithMouseWheel);
  const anchor = useChartPreferences((state) => state.chartZoomAnchor);
  const setAnchor = useChartPreferences((state) => state.setChartZoomAnchor);
  return (
    <>
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-xs">
        <Checkbox id={id} checked={enabled} onCheckedChange={setEnabled} />
        Zoom with mouse wheel
      </label>
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={`${id}-anchor`}>Zoom anchor</label>
        <TradingSelect
          id={`${id}-anchor`}
          label="Zoom anchor"
          value={anchor}
          options={[
            ["pointer", "Pointer"],
            ["right", "Right edge"],
          ]}
          onChange={(value) => {
            if (value === "pointer" || value === "right") setAnchor(value);
          }}
          className="w-24 border-zinc-600 bg-zinc-900 text-xs"
        />
      </div>
    </>
  );
}
