import { useId } from "react";
import { Checkbox } from "../ui/checkbox";
import { useChartPreferences } from "./chartPreferences";

export function ChartMouseWheelControl() {
  const id = useId();
  const enabled = useChartPreferences((state) => state.zoomWithMouseWheel);
  const setEnabled = useChartPreferences((state) => state.setZoomWithMouseWheel);
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-xs">
      <Checkbox id={id} checked={enabled} onCheckedChange={setEnabled} />
      Zoom with mouse wheel
    </label>
  );
}
