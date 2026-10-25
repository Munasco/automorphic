import type { IChartApi, ISeriesApi, SeriesType, Time, MouseEventParams } from "lightweight-charts";

const locks = new WeakMap<IChartApi, Time>();

export function lockedChartCrosshair(chart: IChartApi, event: MouseEventParams): MouseEventParams {
  const time = locks.get(chart);
  if (time === undefined) return event;
  const x = chart.timeScale().timeToCoordinate(time);
  const logical = x === null ? null : chart.timeScale().coordinateToLogical(x);
  const seriesData: MouseEventParams["seriesData"] = new Map();
  if (logical !== null) {
    for (const pane of chart.panes())
      for (const series of pane.getSeries()) {
        const value = series.dataByIndex(Math.round(logical));
        if (value) seriesData.set(series, value);
      }
  }
  return {
    ...event,
    time,
    seriesData,
    ...(logical !== null ? { logical } : {}),
    ...(event.point && x !== null ? { point: { ...event.point, x } } : {}),
  };
}

/** Pin the vertical crosshair to a bar's time while the horizontal crosshair follows price. */
export function attachLockedChartCursor(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  time: Time,
  initialPrice: number,
) {
  locks.set(chart, time);
  let price = initialPrice;
  let active = true;
  const restore = () => {
    if (!active) return;
    const x = chart.timeScale().timeToCoordinate(time);
    if (x === null || x < 0 || x > chart.paneSize(series.getPane().paneIndex()).width) {
      chart.clearCrosshairPosition();
      return;
    }
    chart.setCrosshairPosition(price, time, series);
  };
  const move = (event: MouseEventParams) => {
    if (event.point && (event.paneIndex ?? 0) === series.getPane().paneIndex()) {
      const next = series.coordinateToPrice(event.point.y);
      if (next !== null && Number.isFinite(next)) price = next;
    }
    restore();
  };
  chart.subscribeCrosshairMove(move);
  chart.timeScale().subscribeVisibleLogicalRangeChange(restore);
  chart.timeScale().subscribeSizeChange(restore);
  restore();
  return () => {
    active = false;
    locks.delete(chart);
    chart.unsubscribeCrosshairMove(move);
    chart.timeScale().unsubscribeVisibleLogicalRangeChange(restore);
    chart.timeScale().unsubscribeSizeChange(restore);
    chart.clearCrosshairPosition();
  };
}
