import { isDrawingVisibleAtInterval } from "./drawingVisibility";
import type { ChartInterval } from "./tradingIntervals";
import type { IndicatorAppearance } from "./indicatorStyles";

/** Timeframe restrictions do not change the user's separate show/hide preference. */
export function isIndicatorVisibleOnTimeframe(
  appearance: IndicatorAppearance,
  interval: ChartInterval,
): boolean {
  return isDrawingVisibleAtInterval(appearance.timeframeVisibility, interval);
}
