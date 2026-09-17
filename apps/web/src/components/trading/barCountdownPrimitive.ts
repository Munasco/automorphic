import type {
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  SeriesType,
  Time,
} from "lightweight-charts";

/** An axis-only timer: never changes candle data or the price scale's range. */
export function createBarCountdownPrimitive(
  series: ISeriesApi<SeriesType>,
  fontSize: () => number,
) {
  let text: string | null = null;
  let price = NaN;
  let belowPrice = true;
  let requestUpdate: (() => void) | undefined;
  const coordinate = () => {
    const y = series.priceToCoordinate(price);
    const height = series.getPane().getHeight();
    const size = fontSize();
    if (y === null || !Number.isFinite(y) || y < 0 || y > height) return undefined;
    const offset = belowPrice ? size + 8 : 0;
    return Math.max(
      size,
      Math.min(height - size, y + offset > height - size ? y - offset : y + offset),
    );
  };
  const view: ISeriesPrimitiveAxisView = {
    coordinate: () => -10000,
    fixedCoordinate: coordinate,
    text: () => text ?? "",
    textColor: () => "#e4e4e7",
    backColor: () => "#1e293b",
    visible: () => text !== null && coordinate() !== undefined,
    tickVisible: () => false,
  };
  const views = [view];
  const primitive: ISeriesPrimitive<Time> = {
    attached: (params) => {
      requestUpdate = params.requestUpdate;
    },
    detached: () => {
      requestUpdate = undefined;
    },
    priceAxisViews: () => (text === null ? [] : views),
  };
  return {
    primitive,
    update(nextText: string | null, nextPrice: number, nextBelowPrice: boolean) {
      if (
        text === nextText &&
        (text === null || (price === nextPrice && belowPrice === nextBelowPrice))
      )
        return;
      text = nextText;
      price = nextPrice;
      belowPrice = nextBelowPrice;
      requestUpdate?.();
    },
  };
}
