import { useId } from "react";
import { Checkbox } from "../ui/checkbox";
import { useChartPreferences } from "./chartPreferences";

export function ChartPreviousCloseControl() {
  const id = useId();
  const enabled = useChartPreferences((state) => state.colorBarsByPreviousClose);
  const setEnabled = useChartPreferences((state) => state.setColorBarsByPreviousClose);
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 pt-2 text-xs">
      <Checkbox id={id} checked={enabled} onCheckedChange={setEnabled} />
      Color bars based on previous close
    </label>
  );
}
