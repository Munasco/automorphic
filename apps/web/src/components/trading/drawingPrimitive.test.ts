import { describe, expect, it, vi } from "vite-plus/test";
import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";
import { createDrawingPrimitive, drawingProjection } from "./drawingPrimitive";
import type { ChartDrawing } from "./drawingGeometry";

function fixture() {
  const chart = {
    options: () => ({ layout: { fontFamily: "system-ui" } }),
    timeScale: () => ({
      width: () => 1000,
      timeToCoordinate: (time: number) => (time === 150 ? null : time),
      coordinateToTime: (x: number) => (x > 200 || x < 100 ? null : x),
    }),
  } as unknown as IChartApi;
  const series = {
    getPane: () => ({ getHeight: () => 500 }),
    priceToCoordinate: (price: number) => 500 - price,
    coordinateToPrice: (y: number) => 500 - y,
    data: () => [{ time: 100 }, { time: 200 }],
  } as unknown as ISeriesApi<SeriesType>;
  return { chart, series };
}

describe("native drawing primitive", () => {
  it("interpolates retained timestamps after the candle interval changes", () => {
    const { chart, series } = fixture();
    expect(drawingProjection(chart, series).project({ time: 150 as Time, price: 300 })).toEqual({
      x: 150,
      y: 200,
    });
  });
  it("allows drawing and dragging into empty future and past chart space", () => {
    const { chart, series } = fixture();
    const projection = drawingProjection(chart, series);
    expect(projection.unproject({ x: 300, y: 200 })).toEqual({ time: 300, price: 300 });
    expect(projection.unproject({ x: 50, y: 200 })).toEqual({ time: 50, price: 300 });
  });
  it("paints rectangle, fib and text geometry and stops requesting updates when detached", () => {
    const { chart, series } = fixture();
    const shapes: ChartDrawing[] = [
      {
        id: "rect",
        kind: "rectangle",
        anchors: [
          { time: 100 as Time, price: 400 },
          { time: 200 as Time, price: 300 },
        ],
        color: "#729bff",
        width: 2,
      },
      {
        id: "fib",
        kind: "fib",
        anchors: [
          { time: 100 as Time, price: 400 },
          { time: 200 as Time, price: 300 },
        ],
        color: "#729bff",
        width: 2,
      },
      {
        id: "text",
        kind: "text",
        anchors: [{ time: 100 as Time, price: 400 }],
        color: "#729bff",
        width: 2,
        text: "Entry",
      },
    ];
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: shapes,
      selected: "rect",
    }));
    const update = vi.fn();
    plugin.primitive.attached!({ chart, series, requestUpdate: update } as unknown as Parameters<
      NonNullable<typeof plugin.primitive.attached>
    >[0]);
    plugin.redraw();
    expect(update).toHaveBeenCalledTimes(1);
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      setLineDash: vi.fn(),
    };
    const renderer = plugin.primitive.paneViews!()[0]!.renderer()!;
    renderer.draw({
      useMediaCoordinateSpace: (callback: (scope: { context: typeof ctx }) => void) =>
        callback({ context: ctx }),
    } as unknown as Parameters<typeof renderer.draw>[0]);
    expect(ctx.fillRect).toHaveBeenCalledWith(100, 100, 100, 100);
    expect(ctx.lineTo).toHaveBeenCalledTimes(11);
    expect(ctx.fillText).toHaveBeenCalledWith("Entry", 100, 100);
    expect(ctx.arc).toHaveBeenCalledTimes(2);
    plugin.primitive.detached!();
    plugin.redraw();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
