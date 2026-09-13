import type { Candle } from "./chartIndicators";

export interface HollowCandleColors {
  color: string;
  borderColor: string;
  wickColor: string;
}

/** Body fill follows open-to-close movement; outline and wick follow close-to-close movement.
 * Equal closes use the up color. With no usable previous close, compare to the current open.
 * Doji bodies remain colored so their horizontal stroke is visible.
 */
export function hollowCandleColors(bar: Candle, previous?: Candle): HollowCandleColors {
  if (!Number.isFinite(bar.open) || !Number.isFinite(bar.close))
    return { color: "transparent", borderColor: "transparent", wickColor: "transparent" };
  const previousClose = previous && Number.isFinite(previous.close) ? previous.close : bar.open;
  const directionColor = bar.close >= previousClose ? "#26a69a" : "#ef5350";
  return {
    color: bar.close > bar.open ? "transparent" : directionColor,
    borderColor: directionColor,
    wickColor: directionColor,
  };
}
