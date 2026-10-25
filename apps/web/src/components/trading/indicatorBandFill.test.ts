import { describe, it, expect } from "vite-plus/test";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { indicatorBandPolygons, createIndicatorBandFill } from "./indicatorBandFill";

describe("indicator band fills", () => {
  it("joins matching boundaries and breaks at missing observations", () => {
    const points = (times: number[], value: number) => times.map((time) => ({ time, value }));
    const polygons = indicatorBandPolygons(
      points([0, 2, 3], 100),
      points([0, 1, 2, 3], 10),
      (point) => ({ x: point.time * 5, y: Math.log10(point.value) * 10 }),
    );
    expect(polygons).toEqual([
      [
        { x: 10, y: 20 },
        { x: 15, y: 20 },
        { x: 15, y: 10 },
        { x: 10, y: 10 },
      ],
    ]);
  });
  it("paints configured opacity and color at device coordinates then clears hidden fills", () => {
    const chart = {
      timeScale: () => ({ timeToCoordinate: (time: number) => time * 10 }),
    } as unknown as IChartApi;
    const series = {
      priceToCoordinate: (price: number) => 100 - price,
    } as unknown as ISeriesApi<"Line">;
    const fill = createIndicatorBandFill(chart, series);
    const painted: { color: string; opacity: number; points: number[][] }[] = [];
    let points: number[][] = [];
    const context = {
      fillStyle: "",
      globalAlpha: 1,
      save() {},
      restore() {},
      beginPath() {
        points = [];
      },
      moveTo(x: number, y: number) {
        points.push([x, y]);
      },
      lineTo(x: number, y: number) {
        points.push([x, y]);
      },
      closePath() {},
      fill() {
        painted.push({ color: this.fillStyle, opacity: this.globalAlpha, points });
      },
    };
    const target = {
      useBitmapCoordinateSpace: (callback: (scope: unknown) => void) =>
        callback({ context, horizontalPixelRatio: 2, verticalPixelRatio: 3 }),
    };
    const area = {
      upper: [
        { time: 1, value: 20 },
        { time: 2, value: 30 },
      ],
      lower: [
        { time: 1, value: 10 },
        { time: 2, value: 15 },
      ],
      color: "#4caf50",
      opacity: 0.05,
      visible: true,
    };
    const draw = () =>
      fill.primitive.paneViews!()[0]!
        .renderer()!
        .draw(target as never);
    fill.update([area]);
    draw();
    expect(painted).toEqual([
      {
        color: "#4caf50",
        opacity: 0.05,
        points: [
          [20, 240],
          [40, 210],
          [40, 255],
          [20, 270],
        ],
      },
    ]);
    fill.update([{ ...area, color: "#abcdef", opacity: 0.4 }]);
    draw();
    expect(painted.at(-1)).toMatchObject({ color: "#abcdef", opacity: 0.4 });
    fill.update([{ ...area, visible: false }]);
    draw();
    fill.update([{ ...area, opacity: 0 }]);
    draw();
    expect(painted).toHaveLength(2);
    fill.update([]);
    draw();
    expect(painted).toHaveLength(2);
  });
});
