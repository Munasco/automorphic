import { expect, it, vi } from "vite-plus/test";
import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";
import { attachLockedChartCursor } from "./lockedChartCursor";
it("keeps the selected time while price changes, follows scrolling, and cleans up on unlock", () => {
  let crosshair: (event: any) => void = () => {};
  let range: () => void = () => {};
  let x: number | null = 50;
  const scale = {
    timeToCoordinate: vi.fn(() => x),
    subscribeVisibleLogicalRangeChange: vi.fn((fn) => (range = fn)),
    unsubscribeVisibleLogicalRangeChange: vi.fn(),
    subscribeSizeChange: vi.fn(),
    unsubscribeSizeChange: vi.fn(),
  };
  const chart = {
    timeScale: () => scale,
    paneSize: () => ({ width: 100, height: 200 }),
    subscribeCrosshairMove: vi.fn((fn) => (crosshair = fn)),
    unsubscribeCrosshairMove: vi.fn(),
    setCrosshairPosition: vi.fn(),
    clearCrosshairPosition: vi.fn(),
  } as unknown as IChartApi;
  const series = {
    getPane: () => ({ paneIndex: () => 0 }),
    coordinateToPrice: (y: number) => 100 - y,
  } as unknown as ISeriesApi<SeriesType>;
  const dispose = attachLockedChartCursor(chart, series, 123 as Time, 80);
  crosshair({ time: 456, point: { x: 75, y: 15 } });
  expect(chart.setCrosshairPosition).toHaveBeenLastCalledWith(85, 123, series);
  x = 10;
  range();
  expect(chart.setCrosshairPosition).toHaveBeenLastCalledWith(85, 123, series);
  x = -10;
  range();
  expect(chart.clearCrosshairPosition).toHaveBeenCalled();
  x = 60;
  range();
  expect(chart.setCrosshairPosition).toHaveBeenLastCalledWith(85, 123, series);
  dispose();
  const calls = vi.mocked(chart.setCrosshairPosition).mock.calls.length;
  range();
  expect(chart.setCrosshairPosition).toHaveBeenCalledTimes(calls);
  expect(chart.unsubscribeCrosshairMove).toHaveBeenCalledWith(crosshair);
  expect(scale.unsubscribeVisibleLogicalRangeChange).toHaveBeenCalledWith(range);
});

it("reads OHLC and indicator values from the locked bar rather than the moving pointer", async () => {
  const { lockedChartCrosshair } = await import("./lockedChartCursor");
  const value = { time: 123, open: 10, high: 12, low: 9, close: 11 };
  const series = {
    getPane: () => ({ paneIndex: () => 0 }),
    dataByIndex: vi.fn(() => value),
    coordinateToPrice: () => 11,
  } as unknown as ISeriesApi<SeriesType>;
  const scale = {
    timeToCoordinate: () => 20,
    coordinateToLogical: () => 2,
    subscribeVisibleLogicalRangeChange: () => {},
    unsubscribeVisibleLogicalRangeChange: () => {},
    subscribeSizeChange: () => {},
    unsubscribeSizeChange: () => {},
  };
  const chart = {
    timeScale: () => scale,
    panes: () => [{ getSeries: () => [series] }],
    paneSize: () => ({ width: 100, height: 100 }),
    subscribeCrosshairMove: () => {},
    unsubscribeCrosshairMove: () => {},
    setCrosshairPosition: () => {},
    clearCrosshairPosition: () => {},
  } as unknown as IChartApi;
  const raw = {
    time: 456 as Time,
    point: { x: 80, y: 30 },
    seriesData: new Map(),
  } as import("lightweight-charts").MouseEventParams;
  const dispose = attachLockedChartCursor(chart, series, 123 as Time, 11);
  const event = lockedChartCrosshair(chart, raw);
  expect(event.time).toBe(123);
  expect(event.seriesData.get(series)).toEqual(value);
  expect(series.dataByIndex).toHaveBeenCalledWith(2);
  dispose();
  expect(lockedChartCrosshair(chart, raw)).toBe(raw);
});
