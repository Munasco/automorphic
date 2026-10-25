import { useId } from "react";
import { Checkbox } from "../ui/checkbox";
import { useChartPreferences } from "./chartPreferences";

export function ChartPriceLabelControl() {
  const id = useId();
  const enabled = useChartPreferences((state) => state.alignPriceLabels);
  const setEnabled = useChartPreferences((state) => state.setAlignPriceLabels);
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-xs hover:bg-white/5"
    >
      <Checkbox id={id} checked={enabled} onCheckedChange={setEnabled} />
      Avoid price label overlap
    </label>
  );
}
