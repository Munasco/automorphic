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
      translate: vi.fn(),
      rotate: vi.fn(),
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
      translate: vi.fn(),
      rotate: vi.fn(),
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
      translate: vi.fn(),
      rotate: vi.fn(),
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
      translate: vi.fn(),
      rotate: vi.fn(),
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
  function renderFixture(drawing: ChartDrawing) {
    const { chart, series } = fixture();
    let selected: string | null = null;
    const plugin = createDrawingPrimitive(chart, series, () => ({ drawings: [drawing], selected }));
    const ctx = {
      font: "",
      save: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
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

  it("shows actual Info line price, percentage, chart bars and elapsed time by default", () => {
    const drawing = line("info-line");
    const f = renderFixture(drawing);
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual([
      "-100.00",
      "-25%",
      "1 bars",
      "1m 40s",
    ]);
    drawing.anchors[1] = { time: 200 as Time, price: 450 };
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual([
      "50.00",
      "12.5%",
      "1 bars",
      "1m 40s",
    ]);
    drawing.alwaysShowStats = false;
    f.draw();
    expect(f.ctx.fillText).not.toHaveBeenCalled();
    f.select();
    f.draw();
    expect(f.ctx.fillText).toHaveBeenCalledTimes(4);
    drawing.stats = ["ticks"];
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual(["200 ticks"]);
    drawing.stats = [];
    f.draw();
    expect(f.ctx.fillText).not.toHaveBeenCalled();
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

  it("recalculates the trend angle after scale changes and retains an independent text label", () => {
    const drawing = { ...line("trend-angle"), text: "Slope" };
    const f = renderFixture(drawing);
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual(["-45°", "Slope"]);
    vi.spyOn(f.series, "priceToCoordinate").mockImplementation(
      (price) => ((500 - price) * 2) as ReturnType<typeof f.series.priceToCoordinate>,
    );
    f.draw();
    expect(f.ctx.fillText.mock.calls.map((call) => call[0])).toEqual(["-63.43°", "Slope"]);
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
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
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
