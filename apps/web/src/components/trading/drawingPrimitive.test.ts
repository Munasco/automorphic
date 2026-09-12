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
      coordinateToLogical: (x: number) => x / 100,
    }),
  } as unknown as IChartApi;
  const series = {
    getPane: () => ({ getHeight: () => 500 }),
    priceToCoordinate: (price: number) => 500 - price,
    coordinateToPrice: (y: number) => 500 - y,
    priceFormatter: () => ({ format: (price: number) => price.toFixed(2) }),
    options: () => ({ priceFormat: { type: "price", minMove: 0.25 } }),
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
  it("shows independent endpoint price-axis labels and hides them with the drawing", () => {
    const { chart, series } = fixture();
    const drawing: ChartDrawing = {
      id: "line",
      kind: "trend",
      anchors: [
        { time: 100 as Time, price: 400 },
        { time: 200 as Time, price: 300 },
      ],
      color: "#729bff",
      width: 2,
      showPriceLabel: true,
    };
    let hidden = false;
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [drawing],
      selected: null,
      hidden,
    }));
    const views = plugin.primitive.priceAxisViews!();
    expect(views.map((view) => [view.text(), view.coordinate(), view.visible!()])).toEqual([
      ["400.00", 100, true],
      ["300.00", 200, true],
    ]);
    expect(plugin.primitive.priceAxisViews!()).toBe(views);
    drawing.showPriceLabel = false;
    expect(plugin.primitive.priceAxisViews!()).toEqual([]);
    drawing.showPriceLabel = true;
    hidden = true;
    expect(plugin.primitive.priceAxisViews!()).toEqual([]);
  });

  it("shows selected endpoint labels on both axes without persisting them after deselection", () => {
    const { chart, series } = fixture();
    const drawing: ChartDrawing = {
      id: "line",
      kind: "trend",
      color: "#ff0000",
      width: 2,
      showPriceLabel: false,
      anchors: [
        { time: 100 as Time, price: 400 },
        { time: 150 as Time, price: 300 },
      ],
    };
    let selected: string | null = drawing.id;
    const plugin = createDrawingPrimitive(chart, series, () => ({ drawings: [drawing], selected }));
    const prices = plugin.primitive.priceAxisViews!();
    const times = plugin.primitive.timeAxisViews!();
    expect(prices.map((view) => [view.text(), view.backColor()])).toEqual([
      ["400.00", "#2962ff"],
      ["300.00", "#2962ff"],
    ]);
    expect(times.map((view) => [view.text(), view.coordinate(), view.backColor()])).toEqual([
      ["1970-01-01 00:01", 100, "#2962ff"],
      ["1970-01-01 00:02", 150, "#2962ff"],
    ]);
    expect(plugin.primitive.timeAxisViews!()).toBe(times);
    selected = null;
    expect(plugin.primitive.priceAxisViews!()).toEqual([]);
    expect(plugin.primitive.timeAxisViews!()).toEqual([]);
    drawing.showPriceLabel = true;
    expect(plugin.primitive.priceAxisViews!().map((view) => view.backColor())).toEqual([
      "#ff0000",
      "#ff0000",
    ]);
    selected = drawing.id;
    drawing.hidden = true;
    expect(plugin.primitive.priceAxisViews!()).toEqual([]);
    expect(plugin.primitive.timeAxisViews!()).toEqual([]);
  });

  it("renders midpoint and real stats on selection, retains always-visible stats, and honors their position", () => {
    const { chart, series } = fixture();
    const drawing: ChartDrawing = {
      id: "line",
      kind: "trend",
      color: "#ff0000",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 400 },
        { time: 200 as Time, price: 300 },
      ],
      showMiddlePoint: true,
      stats: ["price", "ticks", "bars"],
      statsPosition: "center",
    };
    let selected: string | null = drawing.id;
    const plugin = createDrawingPrimitive(chart, series, () => ({ drawings: [drawing], selected }));
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      setLineDash: vi.fn(),
      textAlign: "",
    };
    const renderer = plugin.primitive.paneViews!()[0]!.renderer()!;
    const draw = () =>
      renderer.draw({
        useMediaCoordinateSpace: (callback: (scope: { context: typeof ctx }) => void) =>
          callback({ context: ctx }),
      } as unknown as Parameters<typeof renderer.draw>[0]);
    draw();
    expect(ctx.arc).toHaveBeenCalledWith(150, 150, 3, 0, Math.PI * 2);
    expect(ctx.fillText.mock.calls).toEqual([
      ["-100.00", 150, 110],
      ["-400 ticks", 150, 126],
      ["1 bars", 150, 142],
    ]);
    selected = null;
    ctx.fillText.mockClear();
    draw();
    expect(ctx.fillText).not.toHaveBeenCalled();
    drawing.alwaysShowStats = true;
    drawing.statsPosition = "left";
    draw();
    expect(ctx.textAlign).toBe("right");
    expect(ctx.fillText.mock.calls.at(-1)).toEqual(["1 bars", 92, 92]);
    drawing.hidden = true;
    ctx.fillText.mockClear();
    ctx.arc.mockClear();
    draw();
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it("renders styled line text and native horizontal-line annotations without repainting the native body", () => {
    const { chart, series } = fixture();
    const textCalls: Array<{
      value: string;
      x: number;
      y: number;
      font: string;
      color: string;
      align: string;
    }> = [];
    const ctx = {
      font: "",
      fillStyle: "",
      textAlign: "",
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      setLineDash: vi.fn(),
      fillText: (value: string, x: number, y: number) =>
        textCalls.push({ value, x, y, font: ctx.font, color: ctx.fillStyle, align: ctx.textAlign }),
    };
    const drawing: ChartDrawing = {
      id: "line",
      kind: "horizontal",
      anchors: [{ time: 100 as Time, price: 400 }],
      color: "#729bff",
      width: 2,
      text: "Support\nwatch",
      textColor: "#aabbcc",
      textFontSize: 20,
      textBold: true,
      textItalic: true,
      textPosition: "below",
      textAlignment: "center",
    };
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [drawing],
      selected: null,
    }));
    const renderer = plugin.primitive.paneViews!()[0]!.renderer()!;
    renderer.draw({
      useMediaCoordinateSpace: (callback: (scope: { context: typeof ctx }) => void) =>
        callback({ context: ctx }),
    } as unknown as Parameters<typeof renderer.draw>[0]);
    expect(textCalls).toEqual([
      {
        value: "Support",
        x: 500,
        y: 106,
        font: "italic bold 20px system-ui",
        color: "#aabbcc",
        align: "center",
      },
      {
        value: "watch",
        x: 500,
        y: 130,
        font: "italic bold 20px system-ui",
        color: "#aabbcc",
        align: "center",
      },
    ]);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("paints a continuous translucent highlighter and opaque arrow fill without leaking stroke style", () => {
    const { chart, series } = fixture();
    const strokes: Array<{ alpha: number; width: number }> = [];
    const fills: number[] = [];
    const ctx = {
      globalAlpha: 1,
      lineWidth: 1,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fillText: vi.fn(),
      arc: vi.fn(),
      setLineDash: vi.fn(),
      stroke: () => strokes.push({ alpha: ctx.globalAlpha, width: ctx.lineWidth }),
      fill: () => fills.push(ctx.globalAlpha),
    };
    const drawing: ChartDrawing = {
      id: "highlight",
      kind: "highlighter",
      anchors: [
        { time: 100 as Time, price: 400 },
        { time: 150 as Time, price: 450 },
        { time: 200 as Time, price: 400 },
      ],
      color: "#ffdd00",
      width: 2,
    };
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [
        drawing,
        {
          ...drawing,
          id: "arrow",
          kind: "arrow",
          anchors: [drawing.anchors[0]!, drawing.anchors[2]!],
        },
      ],
      selected: drawing.id,
    }));
    const renderer = plugin.primitive.paneViews!()[0]!.renderer()!;
    renderer.draw({
      useMediaCoordinateSpace: (callback: (scope: { context: typeof ctx }) => void) =>
        callback({ context: ctx }),
    } as unknown as Parameters<typeof renderer.draw>[0]);
    expect(strokes).toEqual([
      { alpha: 0.25, width: 16 },
      { alpha: 1, width: 2 },
      { alpha: 1, width: 2 },
      { alpha: 1, width: 2 },
    ]);
    expect(ctx.arc).toHaveBeenCalledTimes(2);
    expect(ctx.arc.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      [100, 100],
      [200, 100],
    ]);
    expect(fills).toEqual([1, 1, 1]);
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
    expect(ctx.fillText).toHaveBeenCalledWith("Entry", 100, 83.2);
    expect(ctx.arc).toHaveBeenCalledTimes(2);
    plugin.primitive.detached!();
    plugin.redraw();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
