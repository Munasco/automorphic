import { describe, expect, it, vi } from "vite-plus/test";
import type { IChartApi, ISeriesApi, SeriesAttachedParameter, Time } from "lightweight-charts";
import { createIndicatorMarkers } from "./indicatorMarkers";

function harness() {
  const rects: number[][] = [],
    paints: { color: string; opacity: number; rects: number[][] }[] = [];
  const context = {
    fillStyle: "",
    globalAlpha: 1,
    save() {},
    restore() {},
    beginPath() {
      rects.length = 0;
    },
    rect(...args: number[]) {
      rects.push(args);
    },
    fill() {
      paints.push({
        color: this.fillStyle,
        opacity: this.globalAlpha,
        rects: rects.map((r) => [...r]),
      });
    },
  };
  const coordinate = vi.fn((time: number) => time);
  const price = vi.fn((value: number) => value);
  const chart = {
    timeScale: () => ({
      getVisibleRange: () => ({ from: 10, to: 100 }),
      timeToCoordinate: coordinate,
    }),
  } as unknown as IChartApi;
  const series = { priceToCoordinate: price } as unknown as ISeriesApi<"Line">;
  const markers = createIndicatorMarkers(chart, series);
  const refresh = vi.fn();
  markers.primitive.attached!({
    requestUpdate: refresh,
  } as unknown as SeriesAttachedParameter<Time>);
  const draw = () =>
    markers.primitive.paneViews!()[0]!
      .renderer()!
      .draw({
        useBitmapCoordinateSpace: (draw: (scope: unknown) => void) =>
          draw({
            context,
            horizontalPixelRatio: 2,
            verticalPixelRatio: 3,
            bitmapSize: { width: 200, height: 300 },
          }),
      } as never);
  return { markers, draw, paints, coordinate, price, refresh };
}
const style = { color: "#123456", opacity: 0.4, visible: true, lineWidth: 2 };

describe("indicator cross markers", () => {
  it("paints one cross per visible observation at device scale without connecting points", () => {
    const h = harness();
    h.markers.update(
      [
        { time: 0, value: 50 },
        { time: 20, value: 30 },
        { time: 90, value: 50 },
        { time: 120, value: 50 },
      ],
      style,
    );
    h.draw();
    expect(h.coordinate.mock.calls).toEqual([[20], [90]]);
    expect(h.paints).toEqual([
      {
        color: "#123456",
        opacity: 0.4,
        rects: [
          [32, 87, 16, 6],
          [38, 78, 4, 24],
        ],
      },
      {
        color: "#123456",
        opacity: 0.4,
        rects: [
          [172, 147, 16, 6],
          [178, 138, 4, 24],
        ],
      },
    ]);
  });
  it("uses current chart coordinates and replacement points on replay or scale changes", () => {
    const h = harness();
    h.markers.update(
      [
        { time: 20, value: 30 },
        { time: 90, value: 50 },
      ],
      style,
    );
    h.draw();
    h.paints.length = 0;
    h.price.mockImplementation((value) => value * 2);
    h.markers.update([{ time: 20, value: 30 }], { ...style, lineWidth: 1 });
    h.draw();
    expect(h.paints).toHaveLength(1);
    expect(h.paints[0]!.rects).toEqual([
      [34, 179, 12, 3],
      [39, 171, 2, 18],
    ]);
    expect(h.refresh).toHaveBeenCalledTimes(3);
  });
  it("skips hidden, transparent, missing, invalid and off-pane markers and detaches cleanly", () => {
    const h = harness();
    const points = [{ time: 20, value: 30 }];
    h.markers.update(points, { ...style, visible: false });
    h.draw();
    h.markers.update(points, { ...style, opacity: 0 });
    h.draw();
    expect(h.coordinate).not.toHaveBeenCalled();
    h.markers.update(points, style);
    h.price
      .mockReturnValueOnce(null as unknown as number)
      .mockReturnValueOnce(NaN)
      .mockReturnValueOnce(1000);
    h.draw();
    h.draw();
    h.draw();
    expect(h.paints).toHaveLength(0);
    h.markers.primitive.detached!();
    h.draw();
    expect(h.paints).toHaveLength(0);
  });
});
