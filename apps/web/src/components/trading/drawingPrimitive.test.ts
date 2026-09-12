import { describe, expect, it, vi } from "vite-plus/test";
import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";
import {
  createDrawingPrimitive,
  drawingProjection,
  drawingTextPlacement,
  supportsInlineDrawingText,
} from "./drawingPrimitive";
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
  it("preserves subsecond spacing when extending a drawing beyond closely spaced trades", () => {
    const { chart, series } = fixture();
    const start = 1_789_160_399.712;
    const step = 0.000_01;
    const scale = {
      width: () => 1000,
      coordinateToTime: () => null,
      timeToCoordinate: (time: number) => ((time - start) / step) * 10,
    };
    chart.timeScale = () => scale as unknown as ReturnType<IChartApi["timeScale"]>;
    series.data = () => [{ time: start as Time }, { time: (start + step) as Time }];
    const projection = drawingProjection(chart, series);
    const a = projection.unproject({ x: 20, y: 200 })!;
    const b = projection.unproject({ x: 30, y: 200 })!;
    expect(Number(a.time)).toBeGreaterThan(start + step);
    expect(Number(b.time)).toBeGreaterThan(Number(a.time));
    expect(projection.project(a)?.x).toBeCloseTo(20, 0);
    expect(projection.project(b)?.x).toBeCloseTo(30, 0);
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

  it("shows only the time coordinate when a vertical line is selected", () => {
    const { chart, series } = fixture();
    const drawing: ChartDrawing = {
      id: "vertical-axis",
      kind: "vertical",
      anchors: [{ time: 100 as Time, price: 400 }],
      color: "#2962ff",
      width: 2,
    };
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [drawing],
      selected: drawing.id,
    }));
    expect(plugin.primitive.priceAxisViews!()).toEqual([]);
    expect(plugin.primitive.timeAxisViews!()).toHaveLength(1);
  });

  it("shows no time badge for a selected horizontal line but retains a ray's start time", () => {
    const { chart, series } = fixture();
    const drawing: ChartDrawing = {
      id: "horizontal-axis",
      kind: "horizontal",
      anchors: [{ time: 100 as Time, price: 400 }],
      color: "#2962ff",
      width: 2,
    };
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [drawing],
      selected: drawing.id,
    }));
    expect(plugin.primitive.timeAxisViews!()).toEqual([]);
    expect(plugin.primitive.priceAxisViews!()).toHaveLength(1);
    drawing.kind = "horizontal-ray";
    expect(plugin.primitive.timeAxisViews!()).toHaveLength(1);
    expect(plugin.primitive.priceAxisViews!()).toHaveLength(1);
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

  it.each(["vertical", "crossline"] as const)(
    "keeps %s time labels visible independently of an offscreen or unavailable anchor price",
    (kind) => {
      const { chart, series } = fixture();
      const drawing: ChartDrawing = {
        id: "axis-line",
        kind,
        anchors: [{ time: 100 as Time, price: 1000 }],
        color: "#ff0000",
        width: 2,
      };
      const plugin = createDrawingPrimitive(chart, series, () => ({
        drawings: [drawing],
        selected: null,
      }));
      const views = plugin.primitive.timeAxisViews!();
      expect(views).toHaveLength(1);
      expect(views[0]!.coordinate()).toBe(100);
      expect(views[0]!.visible!()).toBe(true);
      expect(views[0]!.backColor()).toBe(drawing.color);
      vi.spyOn(series, "priceToCoordinate").mockReturnValue(null);
      expect(views[0]!.visible!()).toBe(true);
      drawing.anchors[0]!.time = 1100 as Time;
      expect(plugin.primitive.timeAxisViews!()[0]!.visible!()).toBe(false);
      drawing.showTimeLabel = false;
      expect(plugin.primitive.timeAxisViews!()).toEqual([]);
    },
  );

  it.each(["horizontal-ray", "crossline"] as const)(
    "shows %s price labels by default even when anchor time is offscreen or unavailable",
    (kind) => {
      const { chart, series } = fixture();
      const drawing: ChartDrawing = {
        id: "axis-line",
        kind,
        anchors: [{ time: 1100 as Time, price: 300 }],
        color: "#ff0000",
        width: 2,
      };
      const plugin = createDrawingPrimitive(chart, series, () => ({
        drawings: [drawing],
        selected: null,
      }));
      const views = plugin.primitive.priceAxisViews!();
      expect(views).toHaveLength(1);
      expect(views[0]!.text()).toBe("300.00");
      expect(views[0]!.coordinate()).toBe(200);
      expect(views[0]!.visible!()).toBe(true);
      const scale = chart.timeScale();
      vi.spyOn(scale, "timeToCoordinate").mockReturnValue(null);
      vi.spyOn(chart, "timeScale").mockReturnValue(scale);
      expect(views[0]!.visible!()).toBe(true);
      drawing.anchors[0]!.price = 1000;
      expect(plugin.primitive.priceAxisViews!()[0]!.visible!()).toBe(false);
      drawing.showPriceLabel = false;
      expect(plugin.primitive.priceAxisViews!()).toEqual([]);
    },
  );

  it("keeps selected axis highlights separate from persistent crossline labels and hides both with the drawing", () => {
    const { chart, series } = fixture();
    const drawing: ChartDrawing = {
      id: "cross",
      kind: "crossline",
      anchors: [{ time: 100 as Time, price: 300 }],
      color: "#ff0000",
      width: 2,
      showTimeLabel: false,
      showPriceLabel: false,
    };
    let selected: string | null = drawing.id;
    let hidden = false;
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [drawing],
      selected,
      hidden,
    }));
    for (const views of [plugin.primitive.priceAxisViews!(), plugin.primitive.timeAxisViews!()]) {
      expect(views).toHaveLength(1);
      expect(views[0]!.backColor()).toBe("#2962ff");
    }
    selected = null;
    expect(plugin.primitive.priceAxisViews!()).toEqual([]);
    expect(plugin.primitive.timeAxisViews!()).toEqual([]);
    drawing.showTimeLabel = true;
    drawing.showPriceLabel = true;
    expect(plugin.primitive.timeAxisViews!()[0]!.backColor()).toBe(drawing.color);
    expect(plugin.primitive.priceAxisViews!()[0]!.backColor()).toBe(drawing.color);
    drawing.hidden = true;
    expect(plugin.primitive.timeAxisViews!()).toEqual([]);
    expect(plugin.primitive.priceAxisViews!()).toEqual([]);
    drawing.hidden = false;
    hidden = true;
    expect(plugin.primitive.timeAxisViews!()).toEqual([]);
    expect(plugin.primitive.priceAxisViews!()).toEqual([]);
  });

  it("does not duplicate a horizontal line's native persistent price label", () => {
    const { chart, series } = fixture();
    const drawing: ChartDrawing = {
      id: "horizontal",
      kind: "horizontal",
      anchors: [{ time: 100 as Time, price: 300 }],
      color: "#ff0000",
      width: 2,
    };
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [drawing],
      selected: null,
    }));
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
      translate: vi.fn(),
      rotate: vi.fn(),
      closePath: vi.fn(),
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

  it("renders horizontal bodies and styled annotations together in the primitive", () => {
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
      translate: vi.fn(),
      rotate: vi.fn(),
      closePath: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
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
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 100);
    expect(ctx.lineTo).toHaveBeenCalledWith(1000, 100);
  });

  it("paints a continuous translucent highlighter and open arrow without leaking stroke style", () => {
    const { chart, series } = fixture();
    const strokes: Array<{ alpha: number; width: number }> = [];
    const fills: number[] = [];
    const ctx = {
      globalAlpha: 1,
      lineWidth: 1,
      save: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      closePath: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
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
    expect(fills).toEqual([1, 1]);
    expect(ctx.lineTo).toHaveBeenCalledWith(200, 100);
    expect(ctx.lineTo).toHaveBeenCalledWith(190, 90);
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
      translate: vi.fn(),
      rotate: vi.fn(),
      closePath: vi.fn(),
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

describe("additional line primitive behavior", () => {
  function renderFixture(
    drawing: ChartDrawing,
    regressionSeries?: ISeriesApi<SeriesType>,
    extraDrawings: ChartDrawing[] = [],
  ) {
    const { chart, series } = fixture();
    let selected: string | null = null,
      hovered: string | null = null,
      preview: ChartDrawing | null = null,
      hidden = false;
    const plugin = createDrawingPrimitive(
      chart,
      series,
      () => ({ drawings: [drawing, ...extraDrawings], selected, hovered, preview, hidden }),
      regressionSeries ?? series,
    );
    const ctx = {
      font: "",
      measureText: vi.fn((text: string) => ({ width: text.length * 6 })),
      fillRect: vi.fn(),
      save: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      closePath: vi.fn(),
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
    };
    const renderer = plugin.primitive.paneViews!()[0]!.renderer()!;
    const draw = () => {
      ctx.fillText.mockClear();
      renderer.draw({
        useMediaCoordinateSpace: (callback: (scope: { context: typeof ctx }) => void) =>
          callback({ context: ctx }),
      } as unknown as Parameters<typeof renderer.draw>[0]);
    };
    return {
      draw,
      ctx,
      plugin,
      series,
      select: () => {
        selected = drawing.id;
      },
      hover: (id: string | null) => {
        hovered = id;
      },
      preview: (value: ChartDrawing | null) => {
        preview = value;
      },
      hide: (value: boolean) => {
        hidden = value;
      },
    };
  }
  const line = (kind: ChartDrawing["kind"]): ChartDrawing => ({
    id: "measurement",
    kind,
    color: "#729bff",
    width: 2,
    anchors: [
      { time: 100 as Time, price: 400 },
      { time: 200 as Time, price: 300 },
    ],
  });

  it.each([0, 0.5, 1])(
    "keeps standalone multiline canvas text aligned with its editor at opacity %s",
    (opacity) => {
      const drawing: ChartDrawing = {
        ...line("text"),
        anchors: [{ time: 100 as Time, price: 400 }],
        text: "Entry\nretest",
        textFontSize: 20,
        textColor: "#aabbcc",
        textBold: true,
        textItalic: true,
        textOpacity: opacity,
        textAlignment: "right",
        textPosition: "below",
      };
      const next: ChartDrawing = {
        ...drawing,
        id: "next-text",
        text: "Next",
        textOpacity: 1,
        textColor: "#ffffff",
        textBold: false,
        textItalic: false,
      };
      const { chart, series } = fixture();
      const placement = drawingTextPlacement(chart, series, drawing)!;
      expect(supportsInlineDrawingText("text")).toBe(true);
      expect(placement.fontSize).toBe(20);
      expect(placement.angle ?? 0).toBe(0);
      expect(placement.align).toBe("right");
      const rowHeight = 24;
      const top =
        placement.point.y -
        (placement.baseline === "top" ? 0 : placement.baseline === "middle" ? 24 : 48);
      const f = renderFixture(drawing, undefined, [next]);
      const painted: unknown[] = [];
      f.ctx.fillText.mockImplementation((value, x, y) => {
        const context = f.ctx as unknown as CanvasRenderingContext2D;
        painted.push({
          value,
          x,
          y,
          color: context.fillStyle,
          alpha: context.globalAlpha,
          font: context.font,
          align: context.textAlign,
        });
      });
      f.draw();
      expect(painted.slice(0, 2)).toEqual(
        ["Entry", "retest"].map((value, index) => ({
          value,
          x: placement.point.x,
          y: top + index * rowHeight,
          color: "#aabbcc",
          alpha: opacity,
          font: "italic bold 20px system-ui",
          align: "right",
        })),
      );
      expect(painted[2]).toMatchObject({
        value: "Next",
        color: "#ffffff",
        alpha: 1,
        font: "20px system-ui",
      });
      expect(f.ctx.rotate).not.toHaveBeenCalled();
    },
  );

  it("paints mixed horizontal and trend bodies in their shared persisted order", () => {
    const horizontal: ChartDrawing = {
      ...line("horizontal"),
      id: "horizontal",
      color: "#ff0000",
      lineOpacity: 0.4,
      anchors: [{ time: 100 as Time, price: 400 }],
    };
    const trend: ChartDrawing = { ...line("trend"), id: "trend", color: "#00ff00" };
    for (const drawings of [
      [horizontal, trend],
      [trend, horizontal],
    ]) {
      const f = renderFixture(drawings[0]!, undefined, [drawings[1]!]);
      const strokes: Array<[string, number]> = [];
      f.ctx.stroke.mockImplementation(() => {
        const ctx = f.ctx as unknown as CanvasRenderingContext2D;
        strokes.push([String(ctx.strokeStyle), ctx.globalAlpha]);
      });
      f.draw();
      expect(strokes).toEqual(drawings.map((drawing) => [drawing.color, drawing.lineOpacity ?? 1]));
    }
  });
  it("shows actual Info line price, percentage, chart bars and elapsed time by default", () => {
    const drawing = line("info-line");
    const f = renderFixture(drawing);
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual([
      "-100.00 (-25.00%), -400",
      "1 bars (1m 40s), distance: 141 px",
      "-45.00°",
    ]);
    drawing.anchors[1] = { time: 200 as Time, price: 450 };
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual([
      "50.00 (12.50%), 200",
      "1 bars (1m 40s), distance: 112 px",
      "26.57°",
    ]);
    drawing.alwaysShowStats = false;
    f.draw();
    expect(f.ctx.fillText).not.toHaveBeenCalled();
    f.select();
    f.draw();
    expect(f.ctx.fillText).toHaveBeenCalledTimes(3);
    drawing.stats = ["ticks"];
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual(["200"]);
    drawing.stats = [];
    f.draw();
    expect(f.ctx.fillText).not.toHaveBeenCalled();
  });

  it("shows default Info line statistics only while the unselected line is hovered when always-show is off", () => {
    const drawing = { ...line("info-line"), alwaysShowStats: false };
    const f = renderFixture(drawing);
    f.draw();
    expect(f.ctx.fillText).not.toHaveBeenCalled();
    f.hover(drawing.id);
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual([
      "-100.00 (-25.00%), -400",
      "1 bars (1m 40s), distance: 141 px",
      "-45.00°",
    ]);
    f.hover(null);
    f.draw();
    expect(f.ctx.fillText).not.toHaveBeenCalled();
    f.hover("another-line");
    f.draw();
    expect(f.ctx.fillText).not.toHaveBeenCalled();
    drawing.alwaysShowStats = true;
    f.draw();
    expect(f.ctx.fillText).toHaveBeenCalledTimes(3);
    drawing.alwaysShowStats = false;
    f.select();
    f.draw();
    expect(f.ctx.fillText).toHaveBeenCalledTimes(3);
  });

  it.each(["trend", "info-line", "extended-line", "trend-angle"] as const)(
    "honors the chosen statistics for a hovered %s without revealing hidden drawings",
    (kind) => {
      const drawing: ChartDrawing = {
        ...line(kind),
        alwaysShowStats: false,
        stats: ["ticks"],
      };
      const f = renderFixture(drawing);
      f.hover(drawing.id);
      f.draw();
      expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual([
        ...(kind === "trend-angle" ? ["-45°"] : []),
        kind === "info-line" ? "-400" : "-400 ticks",
      ]);
      drawing.stats = [];
      f.draw();
      expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual(
        kind === "trend-angle" ? ["-45°"] : [],
      );
      drawing.stats = ["ticks"];
      drawing.hidden = true;
      f.draw();
      expect(f.ctx.fillText).not.toHaveBeenCalled();
    },
  );

  it("measures an Info line during placement without showing an unrelated committed line's stats", () => {
    const drawing: ChartDrawing = {
      ...line("info-line"),
      id: "existing-line",
      alwaysShowStats: false,
      anchors: [
        { time: 100 as Time, price: 200 },
        { time: 200 as Time, price: 400 },
      ],
    };
    const preview = { ...line("info-line"), id: "preview", alwaysShowStats: false };
    const f = renderFixture(drawing);
    f.preview(preview);
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual([
      "-100.00 (-25.00%), -400",
      "1 bars (1m 40s), distance: 141 px",
      "-45.00°",
    ]);
    preview.anchors[1] = { time: 200 as Time, price: 450 };
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual([
      "50.00 (12.50%), 200",
      "1 bars (1m 40s), distance: 112 px",
      "26.57°",
    ]);
    f.preview(null);
    f.draw();
    expect(f.ctx.fillText).not.toHaveBeenCalled();
  });

  it("honors explicit, empty and hidden statistics while placing a line", () => {
    const drawing = { ...line("info-line"), id: "existing-line", alwaysShowStats: false };
    const preview: ChartDrawing = {
      ...line("info-line"),
      id: "preview",
      alwaysShowStats: false,
      stats: ["ticks"],
    };
    const f = renderFixture(drawing);
    f.preview(preview);
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual(["-400"]);
    preview.stats = [];
    f.draw();
    expect(f.ctx.fillText).not.toHaveBeenCalled();
    preview.stats = ["ticks"];
    preview.hidden = true;
    f.draw();
    expect(f.ctx.fillText).not.toHaveBeenCalled();
    preview.hidden = false;
    f.hide(true);
    f.draw();
    expect(f.ctx.fillText).not.toHaveBeenCalled();
    f.hide(false);
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual(["-400"]);
  });

  it("shows a locked Info line's hover statistics without drawing editable anchor handles", () => {
    const drawing = { ...line("info-line"), alwaysShowStats: false, locked: true };
    const f = renderFixture(drawing);
    f.hover(drawing.id);
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual([
      "-100.00 (-25.00%), -400",
      "1 bars (1m 40s), distance: 141 px",
      "-45.00°",
    ]);
    // The panel's angle glyph has an arc; no endpoint handles should be painted.
    expect(f.ctx.arc.mock.calls.map((call) => call[2])).toEqual([5]);
    expect(f.plugin.primitive.priceAxisViews!()).toEqual([]);
    expect(f.plugin.primitive.timeAxisViews!()).toEqual([]);
    f.hover(null);
    f.draw();
    expect(f.ctx.fillText).not.toHaveBeenCalled();
  });

  it("renders regression boundaries with independent colors, widths and styles, and Pearson in the lower color", () => {
    const drawing: ChartDrawing = {
      id: "regression-style",
      lineOpacity: 0,
      textOpacity: 0,
      kind: "regression-trend",
      color: "#ffffff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 9999 },
        { time: 300 as Time, price: -9999 },
      ],
      regressionBaseLine: { visible: true, color: "#ff0000", width: 4, lineStyle: "dotted" },
      regressionUpperLine: { visible: true, color: "#00ff00", width: 3, lineStyle: "solid" },
      regressionLowerLine: { visible: true, color: "#0000ff", width: 1, lineStyle: "dashed" },
    };
    const source = {
      data: () =>
        [400, 300, 200].map((close, index) => ({
          time: (100 + index * 100) as Time,
          open: close,
          high: close,
          low: close,
          close,
        })),
    } as unknown as ISeriesApi<SeriesType>;
    const f = renderFixture(drawing, source);
    const strokes: Array<[string, number]> = [];
    const fills: Array<[string, number]> = [];
    f.ctx.fill.mockImplementation(() => {
      const ctx = f.ctx as unknown as CanvasRenderingContext2D;
      fills.push([String(ctx.fillStyle), ctx.globalAlpha]);
    });
    f.ctx.stroke.mockImplementation(() => {
      const ctx = f.ctx as unknown as CanvasRenderingContext2D;
      strokes.push([String(ctx.strokeStyle), ctx.lineWidth]);
    });
    f.draw();
    expect(fills).toEqual([
      ["#00ff00", 0.3],
      ["#ff0000", 0.3],
    ]);
    expect((f.ctx as unknown as CanvasRenderingContext2D).globalAlpha).toBe(1);
    expect(strokes).toEqual([
      ["#ff0000", 4],
      ["#00ff00", 3],
      ["#0000ff", 1],
    ]);
    expect(f.ctx.setLineDash.mock.calls).toContainEqual([[2, 4]]);
    expect(f.ctx.setLineDash.mock.calls).toContainEqual([[8, 5]]);
    expect(f.ctx.fillText.mock.calls).toEqual([["1", 100, 106]]);
    expect((f.ctx as unknown as CanvasRenderingContext2D).fillStyle).toBe("#0000ff");
  });

  it.each([
    [0, 0.5],
    [0.5, 0],
  ] as const)(
    "keeps line opacity %s and text opacity %s independent from handles and the next drawing",
    (lineOpacity, textOpacity) => {
      const drawing: ChartDrawing = {
        ...line("trend"),
        id: "opacity-first",
        lineOpacity,
        textOpacity,
        text: "First",
      };
      const next: ChartDrawing = { ...line("trend"), id: "opacity-next", text: "Second" };
      const f = renderFixture(drawing, undefined, [next]),
        strokes: number[] = [],
        texts: Array<[string, number]> = [];
      f.ctx.stroke.mockImplementation(() => {
        strokes.push((f.ctx as unknown as CanvasRenderingContext2D).globalAlpha);
      });
      f.ctx.fillText.mockImplementation((value: string) => {
        texts.push([value, (f.ctx as unknown as CanvasRenderingContext2D).globalAlpha]);
      });
      f.select();
      f.draw();
      expect(strokes).toEqual([lineOpacity, 1, 1, 1]);
      expect(texts).toEqual([
        ["First", textOpacity],
        ["Second", 1],
      ]);
      expect(
        f.plugin.primitive.priceAxisViews!().every((view) => view.backColor() === "#2962ff"),
      ).toBe(true);
    },
  );

  it("keeps open endpoint arrows at line opacity without dimming independent annotation text", () => {
    const drawing: ChartDrawing = {
      ...line("trend"),
      endMarker: "arrow",
      lineOpacity: 0,
      text: "Visible",
    };
    const f = renderFixture(drawing),
      strokes: number[] = [],
      fills: number[] = [],
      texts: number[] = [];
    f.ctx.stroke.mockImplementation(() => {
      strokes.push((f.ctx as unknown as CanvasRenderingContext2D).globalAlpha);
    });
    f.ctx.fill.mockImplementation(() => {
      fills.push((f.ctx as unknown as CanvasRenderingContext2D).globalAlpha);
    });
    f.ctx.fillText.mockImplementation(() => {
      texts.push((f.ctx as unknown as CanvasRenderingContext2D).globalAlpha);
    });
    f.draw();
    expect(strokes).toEqual([0]);
    expect(fills).toEqual([]);
    expect(f.ctx.lineTo).toHaveBeenCalledTimes(3);
    expect(texts).toEqual([1]);
  });

  it("isolates zero and partial Fibonacci level opacity from later strokes and labels", () => {
    const drawing: ChartDrawing = {
      id: "time-opacity",
      lineOpacity: 0,
      textOpacity: 0,
      kind: "fib-trend-time",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 400 },
        { time: 200 as Time, price: 300 },
        { time: 300 as Time, price: 350 },
      ],
      background: false,
      trendLine: { color: "#2962ff", width: 2, lineStyle: "solid", opacity: 0.6 },
      levels: [
        { value: 0, visible: true, opacity: 0 },
        { value: 1, visible: true, opacity: 0.4 },
        { value: 2, visible: true },
      ],
    };
    const f = renderFixture(drawing),
      strokes: number[] = [],
      labels: number[] = [];
    f.ctx.stroke.mockImplementation(() => {
      strokes.push((f.ctx as unknown as CanvasRenderingContext2D).globalAlpha);
    });
    f.ctx.fillText.mockImplementation(() => {
      labels.push((f.ctx as unknown as CanvasRenderingContext2D).globalAlpha);
    });
    f.draw();
    expect(strokes).toEqual([0.6, 0, 0.4, 1]);
    expect(labels).toEqual([0, 0.4, 1]);
    expect((f.ctx as unknown as CanvasRenderingContext2D).globalAlpha).toBe(1);
    drawing.kind = "trend";
    delete drawing.lineOpacity;
    delete drawing.textOpacity;
    drawing.anchors = drawing.anchors.slice(0, 2);
    f.draw();
    expect(strokes.at(-1)).toBe(1);
  });

  it("renders Fibonacci time construction and per-level line widths and styles", () => {
    const drawing: ChartDrawing = {
      id: "time-styles",
      kind: "fib-trend-time",
      color: "#ffffff",
      width: 1,
      anchors: [
        { time: 100 as Time, price: 400 },
        { time: 200 as Time, price: 300 },
        { time: 300 as Time, price: 350 },
      ],
      background: false,
      trendLine: { color: "#808080", width: 1, lineStyle: "dashed" },
      levels: [
        { value: 0, visible: true, color: "#ff0000", width: 4, lineStyle: "dotted" },
        { value: 1, visible: true, color: "#00ff00", width: 2, lineStyle: "solid" },
      ],
    };
    const f = renderFixture(drawing);
    const strokes: Array<[string, number]> = [];
    f.ctx.stroke.mockImplementation(() => {
      const ctx = f.ctx as unknown as CanvasRenderingContext2D;
      strokes.push([String(ctx.strokeStyle), ctx.lineWidth]);
    });
    f.draw();
    expect(strokes).toEqual([
      ["#808080", 1],
      ["#ff0000", 4],
      ["#00ff00", 2],
    ]);
    expect(f.ctx.fillText.mock.calls).toEqual([
      ["0", 305, 495],
      ["1", 405, 495],
    ]);
    expect(f.plugin.hitTest({ x: 400, y: 100 })?.drawing.id).toBe(drawing.id);
    expect(f.plugin.hitTest({ x: 300, y: 150 })).toMatchObject({ handle: 2 });
  });

  it("distinguishes the disjoint vertical-only square handle from its three round corners", () => {
    const drawing: ChartDrawing = {
      id: "channel-handles",
      kind: "disjoint-channel",
      color: "#729bff",
      width: 2,
      background: false,
      anchors: [
        { time: 100 as Time, price: 250 },
        { time: 350 as Time, price: 310 },
        { time: 900 as Time, price: 40 },
      ],
    };
    const f = renderFixture(drawing);
    f.select();
    f.draw();
    expect(f.ctx.rect.mock.calls).toEqual([
      [0, 0, 1000, 500],
      [346, 456, 8, 8],
    ]);
    expect(f.ctx.arc.mock.calls.map(([x, y, radius]) => [x, y, radius])).toEqual([
      [100, 250, 4],
      [350, 190, 4],
      [100, 400, 4],
    ]);
    f.ctx.rect.mockClear();
    f.ctx.arc.mockClear();
    drawing.kind = "flat-channel";
    f.draw();
    expect(f.ctx.rect.mock.calls).toEqual([[0, 0, 1000, 500]]);
    expect(f.ctx.arc).toHaveBeenCalledTimes(4);
  });

  it("renders four independently styled corner price labels and clears them when disabled", () => {
    const drawing: ChartDrawing = {
      id: "channel-prices",
      background: false,
      kind: "disjoint-channel",
      color: "#729bff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 250 },
        { time: 350 as Time, price: 310 },
        { time: 900 as Time, price: 40 },
      ],
      showPriceLabel: true,
      priceLabelColor: "#ff0000",
      priceLabelFontSize: 16,
      priceLabelBold: true,
      priceLabelItalic: true,
    };
    const f = renderFixture(drawing);
    f.draw();
    expect(f.ctx.fillText.mock.calls).toEqual([
      ["250.00", 95, 250],
      ["310.00", 355, 190],
      ["40.00", 355, 460],
      ["100.00", 95, 400],
    ]);
    expect(f.ctx.font).toContain("italic bold 16px");
    expect(f.plugin.primitive.priceAxisViews!()).toEqual([]);
    drawing.showPriceLabel = false;
    f.draw();
    expect(f.ctx.fillText).not.toHaveBeenCalled();
  });

  it("recalculates the trend angle after scale changes without showing legacy custom text", () => {
    const drawing = { ...line("trend-angle"), text: "Slope" };
    const f = renderFixture(drawing);
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual(["-45°"]);
    vi.spyOn(f.series, "priceToCoordinate").mockImplementation(
      (price) => ((500 - price) * 2) as ReturnType<typeof f.series.priceToCoordinate>,
    );
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual(["-63.43°"]);
  });

  it("paints both crossline arms and exposes its enabled price label without selection", () => {
    const drawing = {
      ...line("crossline"),
      anchors: line("crossline").anchors.slice(0, 1),
      showPriceLabel: true,
    };
    const f = renderFixture(drawing);
    f.draw();
    expect(f.ctx.moveTo.mock.calls).toEqual([
      [0, 100],
      [100, 0],
    ]);
    expect(f.ctx.lineTo.mock.calls).toEqual([
      [1000, 100],
      [100, 500],
    ]);
    expect(f.plugin.primitive.priceAxisViews!().map((view) => view.text())).toEqual(["400.00"]);
    drawing.showPriceLabel = false;
    expect(f.plugin.primitive.priceAxisViews!()).toEqual([]);
  });
});

describe("level colors and labels", () => {
  it("renders extended channel level appearance independently and restores inherited stroke settings", () => {
    const { chart, series } = fixture();
    const shape: ChartDrawing = {
      id: "channel",
      kind: "channel",
      color: "#0000ff",
      width: 2,
      lineOpacity: 0.2,
      anchors: [
        { time: 100 as Time, price: 400 },
        { time: 200 as Time, price: 300 },
        { time: 200 as Time, price: 200 },
      ],
      levels: [
        { value: 0, visible: true, color: "#ff0000", width: 5, lineStyle: "dashed", opacity: 0.8 },
        { value: 1, visible: false },
        { value: 0.5, visible: true },
      ],
      extendLeft: true,
      background: true,
      backgroundColor: "#00ff00",
      backgroundOpacity: 0.4,
    };
    const strokes: Array<{ color: string; opacity: number; width: number; dash: number[] }> = [],
      fills: Array<[string, number]> = [];
    let dash: number[] = [];
    const ctx = {
      strokeStyle: "",
      fillStyle: "",
      globalAlpha: 1,
      lineWidth: 1,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      setLineDash: (value: number[]) => {
        dash = value;
      },
      stroke: () =>
        strokes.push({
          color: ctx.strokeStyle,
          opacity: ctx.globalAlpha,
          width: ctx.lineWidth,
          dash,
        }),
      fill: () => fills.push([ctx.fillStyle, ctx.globalAlpha]),
    };
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [shape],
      selected: null,
    }));
    const renderer = plugin.primitive.paneViews!()[0]!.renderer()!;
    renderer.draw({
      useMediaCoordinateSpace: (callback: (scope: { context: typeof ctx }) => void) =>
        callback({ context: ctx }),
    } as unknown as Parameters<typeof renderer.draw>[0]);
    expect(fills).toEqual([["#00ff00", 0.4]]);
    expect(strokes).toEqual([
      { color: "#ff0000", opacity: 0.8, width: 5, dash: [8, 5] },
      { color: "#0000ff", opacity: 0.2, width: 2, dash: [] },
    ]);
  });
  it.each(["rectangle", "circle", "ellipse", "triangle", "rotated-rectangle"] as const)(
    "paints %s backgrounds independently from borders, then removes only the fill",
    (kind) => {
      const { chart, series } = fixture();
      const shape: ChartDrawing = {
        id: "shape",
        kind,
        color: "#ff0000",
        width: 2,
        lineOpacity: 0.25,
        backgroundColor: "#00ff00",
        backgroundOpacity: 1,
        anchors: [
          { time: 100 as Time, price: 400 },
          { time: 200 as Time, price: 300 },
        ],
      };
      if (kind === "triangle" || kind === "rotated-rectangle")
        shape.anchors.push({ time: 100 as Time, price: 200 });
      const strokes: Array<[string, number]> = [],
        fills: Array<[string, number]> = [];
      const ctx = {
        strokeStyle: "",
        fillStyle: "",
        globalAlpha: 1,
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        setLineDash: vi.fn(),
        stroke: () => strokes.push([ctx.strokeStyle, ctx.globalAlpha]),
        fill: () => fills.push([ctx.fillStyle, ctx.globalAlpha]),
        fillRect: () => fills.push([ctx.fillStyle, ctx.globalAlpha]),
      };
      const plugin = createDrawingPrimitive(chart, series, () => ({
        drawings: [shape],
        selected: null,
      }));
      const renderer = plugin.primitive.paneViews!()[0]!.renderer()!;
      const draw = () =>
        renderer.draw({
          useMediaCoordinateSpace: (callback: (scope: { context: typeof ctx }) => void) =>
            callback({ context: ctx }),
        } as unknown as Parameters<typeof renderer.draw>[0]);
      draw();
      expect(fills).toEqual([["#00ff00", 1]]);
      expect(strokes).toEqual([["#ff0000", 0.25]]);
      fills.length = 0;
      strokes.length = 0;
      shape.background = false;
      draw();
      expect(fills).toEqual([]);
      expect(strokes).toEqual([["#ff0000", 0.25]]);
    },
  );

  it("paints individual Fibonacci colors and background opacity, formats real prices, and restores the next drawing style", () => {
    const { chart, series } = fixture();
    const strokes: string[] = [];
    const fills: Array<[string, number]> = [];
    const texts: Array<[string, string, number, number]> = [];
    const ctx = {
      strokeStyle: "",
      fillStyle: "",
      globalAlpha: 1,
      save: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      closePath: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      setLineDash: vi.fn(),
      stroke: () => strokes.push(ctx.strokeStyle),
      fill: () => fills.push([ctx.fillStyle, ctx.globalAlpha]),
      fillText: (value: string, x: number, y: number) => texts.push([value, ctx.fillStyle, x, y]),
    };
    const fib: ChartDrawing = {
      id: "fib",
      kind: "fib",
      color: "#729bff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 400 },
        { time: 200 as Time, price: 300 },
      ],
      levels: [
        { value: 0, visible: true, color: "#ff0000" },
        { value: 0.5, visible: false },
        { value: 1, visible: true, color: "#00ff00" },
      ],
      background: true,
      backgroundOpacity: 0.25,
      showPrices: true,
      levelLabelFormat: "value",
      levelLabelPosition: "left",
      levelLabelAlignment: "middle",
    };
    const next: ChartDrawing = { ...fib, id: "trend", kind: "trend" };
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [fib, next],
      selected: null,
    }));
    const renderer = plugin.primitive.paneViews!()[0]!.renderer()!;
    const draw = () =>
      renderer.draw({
        useMediaCoordinateSpace: (callback: (scope: { context: typeof ctx }) => void) =>
          callback({ context: ctx }),
      } as unknown as Parameters<typeof renderer.draw>[0]);
    draw();
    expect(strokes).toEqual(["#ff0000", "#00ff00", "#729bff"]);
    expect(fills).toEqual([["#00ff00", 0.25]]);
    expect(texts).toEqual([
      ["0  300.00", "#ff0000", 106, 200],
      ["1  400.00", "#00ff00", 106, 100],
    ]);
    strokes.length = 0;
    fills.length = 0;
    texts.length = 0;
    fib.background = false;
    fib.showLevels = false;
    fib.showPrices = false;
    draw();
    expect(fills).toEqual([]);
    expect(texts).toEqual([]);
  });
});

describe("native primitive hover hits", () => {
  const line = (id: string, price = 400): ChartDrawing => ({
    id,
    kind: "trend",
    color: "#ff0000",
    width: 2,
    anchors: [
      { time: 100 as Time, price },
      { time: 300 as Time, price },
    ],
  });
  it("reports exact distance, stable external IDs, endpoint priority and the native pointer cursors", () => {
    const { chart, series } = fixture();
    const first = line("first"),
      second = line("second", 396);
    let hidden = false,
      interactive = true;
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [first, second],
      selected: null,
      hidden,
      interactive,
    }));
    expect(plugin.primitive.hitTest!(180, 101)).toMatchObject({
      externalId: "first",
      distance: 1,
      hitTestPriority: 1,
      cursorStyle: "pointer",
      zOrder: "top",
    });
    expect(plugin.primitive.hitTest!(100, 100)).toMatchObject({
      externalId: "first",
      distance: 0,
      hitTestPriority: 2,
      cursorStyle: "default",
    });
    expect(plugin.primitive.hitTest!(180, 102)?.externalId).toBe("second");
    first.locked = true;
    expect(plugin.hitTest({ x: 100, y: 100 })).toMatchObject({
      handle: -1,
      cursorStyle: "default",
    });
    expect(plugin.primitive.hitTest!(180, 100)?.cursorStyle).toBe("pointer");
    expect(plugin.primitive.hitTest!(-1, 100)).toBeNull();
    interactive = false;
    expect(plugin.primitive.hitTest!(180, 100)).toBeNull();
    interactive = true;
    hidden = true;
    expect(plugin.primitive.hitTest!(180, 100)).toBeNull();
  });

  it("shows dim blue hover handles without selection labels and tiny locked handles only after selection", () => {
    const { chart, series } = fixture();
    const drawing = line("hover");
    let hovered: string | null = drawing.id,
      selected: string | null = null;
    const strokes: Array<[string, number, number]> = [];
    const ctx = {
      strokeStyle: "",
      globalAlpha: 1,
      lineWidth: 1,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      stroke: () => strokes.push([ctx.strokeStyle, ctx.globalAlpha, ctx.lineWidth]),
    };
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [drawing],
      hovered,
      selected,
    }));
    const renderer = plugin.primitive.paneViews!()[0]!.renderer()!;
    const draw = () => {
      ctx.arc.mockClear();
      strokes.length = 0;
      renderer.draw({
        useMediaCoordinateSpace: (callback: (scope: { context: typeof ctx }) => void) =>
          callback({ context: ctx }),
      } as unknown as Parameters<typeof renderer.draw>[0]);
    };
    draw();
    expect(strokes).toEqual([
      ["#ff0000", 1, 2],
      ["#2962ff", 0.6, 1],
      ["#2962ff", 0.6, 1],
    ]);
    expect(ctx.arc.mock.calls.map((call) => call[2])).toEqual([6, 6]);
    expect(plugin.primitive.priceAxisViews!()).toEqual([]);
    expect(plugin.primitive.timeAxisViews!()).toEqual([]);
    hovered = null;
    draw();
    expect(ctx.arc).not.toHaveBeenCalled();
    hovered = drawing.id;
    drawing.locked = true;
    draw();
    expect(ctx.arc).not.toHaveBeenCalled();
    selected = drawing.id;
    draw();
    expect(ctx.arc.mock.calls.map((call) => call[2])).toEqual([3, 3]);
    expect(strokes.slice(1).every(([color]) => color === "#2962ff")).toBe(true);
  });
});

describe("derived channel corner handles", () => {
  it("returns each derived corner and its visible point for coupled editing and snapping", () => {
    const { chart, series } = fixture();
    const drawing: ChartDrawing = {
      id: "channel",
      kind: "disjoint-channel",
      color: "#729bff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 250 },
        { time: 350 as Time, price: 310 },
        { time: 900 as Time, price: 40 },
      ],
    };
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [drawing],
      selected: drawing.id,
    }));
    expect(plugin.hitTest({ x: 100, y: 400 })).toMatchObject({
      handle: 3,
      handlePoint: { x: 100, y: 400 },
      distance: 0,
      hitTestPriority: 2,
    });
    expect(plugin.hitTest({ x: 350, y: 460 })).toMatchObject({
      handle: 2,
      handlePoint: { x: 350, y: 460 },
      distance: 0,
      hitTestPriority: 2,
    });
    expect(plugin.hitTest({ x: 100, y: 250 })).toMatchObject({ handle: 0 });
    expect(plugin.hitTest({ x: 350, y: 190 })).toMatchObject({ handle: 1 });
    expect(plugin.primitive.hitTest!(900, 460)).toBeNull();
  });
});

describe("regression data integration", () => {
  it("caches inclusive OHLC fits across hover and style redraws, invalidates on candle updates, and detaches subscriptions", () => {
    const { chart, series } = fixture();
    let bars = [
      { time: 100 as Time, open: 380, high: 410, low: 370, close: 400 },
      { time: 200 as Time, open: 300, high: 330, low: 290, close: 300 },
      { time: 300 as Time, open: 240, high: 260, low: 180, close: 200 },
    ];
    let change: (() => void) | undefined;
    const data = vi.fn(() => bars);
    const unsubscribeDataChanged = vi.fn();
    const source = {
      data,
      subscribeDataChanged: vi.fn((fn: () => void) => {
        change = fn;
      }),
      unsubscribeDataChanged,
    } as unknown as ISeriesApi<SeriesType>;
    const drawing: ChartDrawing = {
      id: "regression",
      kind: "regression-trend",
      color: "#ffffff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 9999 },
        { time: 300 as Time, price: -9999 },
      ],
    };
    let selected: string | null = null;
    const plugin = createDrawingPrimitive(
      chart,
      series,
      () => ({ drawings: [drawing], selected }),
      source,
    );
    const requestUpdate = vi.fn();
    plugin.primitive.attached!({ requestUpdate } as unknown as Parameters<
      NonNullable<typeof plugin.primitive.attached>
    >[0]);
    expect(plugin.hitTest({ x: 200, y: 200 })?.drawing.id).toBe(drawing.id);
    plugin.hitTest({ x: 200, y: 200 });
    drawing.color = "#ff0000";
    plugin.hitTest({ x: 200, y: 200 });
    expect(data).toHaveBeenCalledTimes(1);
    selected = drawing.id;
    expect(plugin.primitive.priceAxisViews!().map((view) => view.text())).toEqual([
      "400.00",
      "200.00",
    ]);
    drawing.regressionSource = "open";
    expect(plugin.hitTest({ x: 100, y: 123.33333333333331 })).toMatchObject({ handle: 0 });
    expect(data).toHaveBeenCalledTimes(1);
    bars = bars.map((bar) => ({ ...bar, open: bar.open - 100, close: bar.close - 100 }));
    change!();
    expect(requestUpdate).toHaveBeenCalledOnce();
    expect(plugin.hitTest({ x: 100, y: 223.33333333333331 })).toMatchObject({ handle: 0 });
    expect(data).toHaveBeenCalledTimes(2);
    bars = bars.slice(1);
    change!();
    expect(plugin.hitTest({ x: 200, y: 300 })).toBeNull();
    expect(plugin.primitive.priceAxisViews!()).toEqual([]);
    plugin.primitive.detached!();
    expect(unsubscribeDataChanged).toHaveBeenCalledWith(change);
  });
  it("does not invent a regression from close-only display data or a range with missing OHLC", () => {
    const { chart, series } = fixture();
    const drawing: ChartDrawing = {
      id: "missing",
      kind: "regression-trend",
      color: "#fff000",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 400 },
        { time: 200 as Time, price: 300 },
      ],
    };
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [drawing],
      selected: drawing.id,
    }));
    expect(plugin.hitTest({ x: 150, y: 150 })).toBeNull();
    expect(plugin.primitive.priceAxisViews!()).toEqual([]);
  });
});

describe("Fibonacci time logical projection", () => {
  it("keeps future verticals bar-spaced after irregular timestamps are projected by the chart", () => {
    const { chart, series } = fixture();
    const scale = chart.timeScale();
    vi.spyOn(chart, "timeScale").mockReturnValue({
      ...scale,
      timeToCoordinate: (time: number) =>
        new Map([
          [100, 100],
          [200, 200],
          [10000, 300],
        ]).get(time) ?? null,
    } as ReturnType<typeof chart.timeScale>);
    const drawing: ChartDrawing = {
      id: "gap-time",
      kind: "fib-time-zone",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 400 },
        { time: 10000 as Time, price: 300 },
      ],
      levels: [{ value: 2, visible: true }],
    };
    const plugin = createDrawingPrimitive(chart, series, () => ({
      drawings: [drawing],
      selected: null,
    }));
    expect(plugin.hitTest({ x: 500, y: 450 })?.drawing.id).toBe(drawing.id);
    expect(plugin.hitTest({ x: 400, y: 450 })).toBeNull();
    expect(plugin.hitTest({ x: 300, y: 200 })).toMatchObject({ handle: 1 });
  });
});
