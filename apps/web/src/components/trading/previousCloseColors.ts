import type { Candle } from "./chartIndicators";
import type { HollowCandlePalette } from "./hollowCandles";

/** Missing prior history falls back to the current open; unchanged closes use the up color. */
export function previousCloseColors(
  bar: Pick<Candle, "open" | "close">,
  previous: Pick<Candle, "close"> | undefined,
  enabled: boolean,
  palette: HollowCandlePalette,
): { color?: string; wickColor?: string; borderColor?: string } {
  if (!enabled) return {};
  const reference = previous && Number.isFinite(previous.close) ? previous.close : bar.open;
  const up = bar.close >= reference;
  return {
    color: up ? palette.up : palette.down,
    wickColor: up ? (palette.wickUp ?? palette.up) : (palette.wickDown ?? palette.down),
    borderColor: up ? (palette.borderUp ?? palette.up) : (palette.borderDown ?? palette.down),
  };
}
