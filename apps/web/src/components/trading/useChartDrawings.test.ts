import { describe, expect, it, vi } from "vite-plus/test";
import type {
  CandlestickData,
  Coordinate,
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { createChartDrawingSession } from "./useChartDrawings";

function fixture(symbol: string, initial: string | null = null, candles: CandlestickData[] = []) {
  let listener: ((event: MouseEventParams<Time>) => void) | undefined;
  const priceLines: unknown[] = [];
  const lines: Array<{ options: Record<string, unknown>; data: unknown[] }> = [];
  const series = {
    coordinateToPrice: (y: number) => 5000 - y,
    priceToCoordinate: (price: number) => 5000 - price,
    attachPrimitive: vi.fn(),
    detachPrimitive: vi.fn(),
    data: () => candles,
    dataByIndex: (index: number) => candles.find((candle) => candle.time === index * 100) ?? null,
    options: () => ({ priceScaleId: "right" }),
    getPane: () => ({ paneIndex: () => 0, getHeight: () => 500 }),
    createPriceLine: (options: unknown) => {
      priceLines.push(options);
      return options;
    },
    removePriceLine: (line: unknown) => {
      priceLines.splice(priceLines.indexOf(line), 1);
    },
  } as unknown as ISeriesApi<SeriesType>;
  const chart = {
    timeScale: () => ({
      width: () => 1000,
      timeToCoordinate: (time: number) => time,
      coordinateToTime: (x: number) => x,
      coordinateToLogical: (x: number) => x / 100,
    }),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    subscribeClick: (callback: typeof listener) => {
      listener = callback;
    },
    unsubscribeClick: (callback: typeof listener) => {
      if (listener === callback) listener = undefined;
    },
    addSeries: (_definition: unknown, options: Record<string, unknown>) => {
      const line = {
        options,
        data: [] as unknown[],
        setData(data: unknown[]) {
          this.data = data;
        },
      };
      lines.push(line);
      return line;
    },
    removeSeries: (line: (typeof lines)[number]) => {
      lines.splice(lines.indexOf(line), 1);
    },
  } as unknown as IChartApi;
  let saved = initial;
  const controls = new Map<string, string>();
  const storage = {
    getItem: (key: string) =>
      key === "automorphic:drawing-controls:v1" ? (controls.get(key) ?? null) : saved,
    setItem: (key: string, value: string) => {
      if (key === "automorphic:drawing-controls:v1") controls.set(key, value);
      else saved = value;
    },
  };
  const change = vi.fn();
  const open = () => createChartDrawingSession(chart, series, symbol, change, storage);
  const click = (time: number | undefined, y = 100, paneIndex = 0, x = 50) =>
    listener?.({
      ...(time === undefined ? {} : { time: time as UTCTimestamp }),
      point: { x: x as Coordinate, y: y as Coordinate },
      paneIndex,
      seriesData: new Map(),
    });
  return { open, click, priceLines, lines, change, saved: () => saved, listener: () => listener };
}

describe("native chart drawing lifecycle", () => {
  it("places a horizontal line at the clicked price and restores it after chart recreation", () => {
    const f = fixture("draw-test-horizontal");
    const first = f.open();
    first.setTool("horizontal");
    f.click(undefined, 125);
    expect(f.priceLines).toMatchObject([{ price: 4875 }]);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "cursor", count: 1, pending: false }),
    );
    first.dispose();
    expect(f.priceLines).toEqual([]);
    expect(f.listener()).toBeUndefined();
    const second = f.open();
    expect(f.priceLines).toMatchObject([{ price: 4875 }]);
    second.clear();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    second.dispose();
  });

  it("retains backwards trend anchors, ignores same-candle clicks, and avoids inserting artificial series data", () => {
    const f = fixture("draw-test-trend"),
      session = f.open();
    session.setTool("trend");
    f.click(200, 100);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "trend", count: 0, pending: true }),
    );
    f.click(200, 130);
    expect(f.lines).toHaveLength(0);
    f.click(100, 150);
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 200, price: 4900 },
      { time: 100, price: 4850 },
    ]);
    expect(f.lines).toHaveLength(0);
    session.dispose();
  });

  it("cancels an unfinished trend without removing a committed drawing, then undoes it", () => {
    const f = fixture("draw-test-undo"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100);
    session.setTool("trend");
    f.click(100);
    session.undo();
    expect(f.priceLines).toHaveLength(1);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "cursor", count: 1, pending: false }),
    );
    session.undo();
    expect(f.priceLines).toHaveLength(0);
    expect(JSON.parse(f.saved()!)).toEqual([]);
    session.dispose();
  });

  it("ignores other panes; cancelling never persists half a drawing", () => {
    const f = fixture("draw-test-cancel"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100, 1);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "trend", count: 0, pending: false }),
    );
    f.click(100);
    session.cancel();
    f.click(200);
    expect(f.lines).toEqual([]);
    expect(f.saved()).toBeNull();
    session.dispose();
  });

  it("rejects corrupt records and equal-time trends during persistence restore", () => {
    const f = fixture(
      "draw-test-invalid",
      JSON.stringify([
        { kind: "horizontal", price: "NaN" },
        { kind: "horizontal", price: 4200 },
        {
          kind: "trend",
          from: { time: "2026-02-30", price: 1 },
          to: { time: "2026-03-01", price: 2 },
        },
        { kind: "trend", from: { time: 100, price: 1 }, to: { time: 100, price: 2 } },
      ]),
    );
    const session = f.open();
    expect(f.priceLines).toHaveLength(1);
    expect(f.lines).toHaveLength(0);
    session.dispose();
    session.dispose();
    expect(f.listener()).toBeUndefined();
  });
  it("creates every new tool with the right anchor count and restores it after recreation", () => {
    const f = fixture("drawing-tools"),
      session = f.open();
    for (const kind of [
      "ray",
      "horizontal-ray",
      "vertical",
      "rectangle",
      "fib",
      "channel",
      "text",
    ] as const) {
      session.setTool(kind);
      f.click(100, 100);
      if (["ray", "rectangle", "fib", "channel"].includes(kind)) f.click(200, 200);
      if (kind === "channel") {
        expect(f.change).toHaveBeenLastCalledWith(
          expect.objectContaining({ tool: "channel", pending: true }),
        );
        f.click(150, 250);
      }
    }
    expect(JSON.parse(f.saved()!).map((item: { kind: string }) => item.kind)).toEqual([
      "ray",
      "horizontal-ray",
      "vertical",
      "rectangle",
      "fib",
      "channel",
      "text",
    ]);
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 7 }));
    restored.dispose();
  });

  it("selects a drawing, persists edits and repositioning, and supports delete/undo/clear/undo", () => {
    const f = fixture("drawing-edits"),
      session = f.open();
    session.setTool("rectangle");
    f.click(100, 100);
    f.click(200, 200);
    f.click(400, 400, 0, 400);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ selected: null }));
    f.click(150, 100, 0, 150);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ kind: "rectangle" }) }),
    );
    session.updateSelected({ color: "#ff0000", width: 3 });
    const before = JSON.parse(f.saved()!)[0];
    session.redrawSelected();
    f.click(300, 120);
    expect(JSON.parse(f.saved()!)[0].anchors[0].time).toBe(100);
    f.click(500, 220);
    expect(JSON.parse(f.saved()!)[0]).toMatchObject({
      id: before.id,
      color: "#ff0000",
      width: 3,
      anchors: [{ time: 300 }, { time: 500 }],
    });
    session.deleteSelected();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    session.undo();
    expect(JSON.parse(f.saved()!)).toHaveLength(1);
    session.clear();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 0, canUndo: true }));
    session.undo();
    expect(JSON.parse(f.saved()!)).toHaveLength(1);
    session.dispose();
  });

  it("persists text annotations and ignores degenerate ray clicks", () => {
    const f = fixture("drawing-text"),
      session = f.open();
    session.setTool("ray");
    f.click(100, 100);
    f.click(100, 100);
    expect(f.saved()).toBeNull();
    session.cancel();
    session.setTool("text");
    f.click(100, 100);
    session.updateSelected({ text: "Buy only above range" });
    expect(JSON.parse(f.saved()!)[0].text).toBe("Buy only above range");
    session.dispose();
  });

  it("moves a complete drawing without changing its shape, commits once, and restores undo/redo", () => {
    const f = fixture("drawing-drag"),
      session = f.open();
    session.setTool("rectangle");
    f.click(100, 100);
    f.click(200, 200);
    const before = f.saved();
    expect(session.beginDrag({ x: 150, y: 100 })).toBe(true);
    session.dragTo({ x: 175, y: 125 });
    session.dragTo({ x: 200, y: 150 });
    expect(f.saved()).toBe(before);
    session.endDrag();
    const after = f.saved();
    expect(JSON.parse(after!)[0].anchors).toEqual([
      { time: 150, price: 4850 },
      { time: 250, price: 4750 },
    ]);
    session.undo();
    expect(f.saved()).toBe(before);
    session.redo();
    expect(f.saved()).toBe(after);
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 1 }));
    restored.dispose();
  });

  it("resizes only the chosen handle, rejects collapsed anchors, and cancels without persistence", () => {
    const f = fixture("drawing-resize"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    const before = f.saved();
    expect(session.beginDrag({ x: 200, y: 200 })).toBe(true);
    session.dragTo({ x: 100, y: 250 });
    session.endDrag();
    expect(f.saved()).toBe(before);
    session.beginDrag({ x: 200, y: 200 });
    session.dragTo({ x: 300, y: 250 });
    session.cancel();
    expect(f.saved()).toBe(before);
    session.beginDrag({ x: 200, y: 200 });
    session.dragTo({ x: 300, y: 250 });
    session.endDrag();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 100, price: 4900 },
      { time: 300, price: 4750 },
    ]);
    session.dispose();
  });

  it("persists locks and line styles, makes hidden drawings inert, and invalidates redo on new edits", () => {
    const f = fixture("drawing-lock"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    session.updateSelected({ locked: true, lineStyle: "dotted" });
    expect(session.beginDrag({ x: 300, y: 100 })).toBe(false);
    session.dispose();
    const restored = f.open();
    f.click(100, 100);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selected: expect.objectContaining({ locked: true, lineStyle: "dotted" }),
      }),
    );
    restored.updateSelected({ locked: false });
    restored.toggleHidden();
    expect(f.priceLines).toHaveLength(0);
    expect(restored.beginDrag({ x: 300, y: 100 })).toBe(false);
    restored.toggleHidden();
    expect(f.priceLines).toHaveLength(1);
    expect(restored.beginDrag({ x: 300, y: 100 })).toBe(true);
    restored.dragTo({ x: 400, y: 150 });
    restored.endDrag();
    expect(f.priceLines).toMatchObject([{ price: 4850 }]);
    restored.undo();
    expect(f.priceLines).toMatchObject([{ price: 4900 }]);
    restored.setTool("text");
    f.click(200, 200);
    restored.redo();
    expect(JSON.parse(f.saved()!).map((drawing: { kind: string }) => drawing.kind)).toEqual([
      "horizontal",
      "text",
    ]);
    restored.dispose();
  });

  it("snaps placement to nearby OHLC only while magnet is enabled and leaves gaps free", () => {
    const f = fixture("drawing-magnet-placement", null, [
      { time: 100 as UTCTimestamp, open: 4890, high: 4940, low: 4840, close: 4870 },
    ]);
    const session = f.open();
    session.setTool("horizontal");
    f.click(100, 115, 0, 100);
    expect(f.priceLines).toMatchObject([{ price: 4885 }]);
    session.toggleMagnet();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ magnet: true }));
    for (const [y, price] of [
      [115, 4890],
      [55, 4940],
      [165, 4840],
      [135, 4870],
    ]) {
      session.setTool("horizontal");
      f.click(100, y, 0, 104);
      expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 100, price }]);
    }
    session.setTool("text");
    f.click(100, 10, 0, 100);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 100, price: 4990 }]);
    session.setTool("text");
    f.click(300, 115, 0, 300);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 300, price: 4885 }]);
    session.toggleMagnet();
    session.setTool("horizontal");
    f.click(100, 115, 0, 100);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 100, price: 4885 }]);
    session.dispose();
  });

  it("snaps dragged handles and translates whole drawings without distorting their shape", () => {
    const f = fixture("drawing-magnet-drag", null, [
      { time: 200 as UTCTimestamp, open: 4860, high: 4900, low: 4800, close: 4840 },
      { time: 300 as UTCTimestamp, open: 4760, high: 4790, low: 4740, close: 4750 },
    ]);
    const session = f.open();
    session.setTool("rectangle");
    f.click(100, 100);
    f.click(200, 200);
    session.toggleMagnet();
    expect(session.beginDrag({ x: 150, y: 100 })).toBe(true);
    session.dragTo({ x: 253, y: 137 });
    session.endDrag();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 200, price: 4860 },
      { time: 300, price: 4760 },
    ]);
    session.undo();
    expect(session.beginDrag({ x: 200, y: 200 })).toBe(true);
    // First click selects the object; a second gesture addresses its resize handle.
    session.endDrag();
    expect(session.beginDrag({ x: 200, y: 200 })).toBe(true);
    session.dragTo({ x: 304, y: 246 });
    session.endDrag();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 100, price: 4900 },
      { time: 300, price: 4750 },
    ]);
    session.undo();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 100, price: 4900 },
      { time: 200, price: 4800 },
    ]);
    session.dispose();
  });
  it("manages object names, visibility and locks independently and restores them", () => {
    const f = fixture("object-manager"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    const firstId = JSON.parse(f.saved()!)[0].id;
    session.setTool("rectangle");
    f.click(200, 200);
    f.click(300, 300);
    const secondId = JSON.parse(f.saved()!)[1].id;
    session.selectDrawing(firstId);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objects: expect.arrayContaining([
          expect.objectContaining({ id: firstId }),
          expect.objectContaining({ id: secondId }),
        ]),
        selected: expect.objectContaining({ id: firstId }),
      }),
    );
    session.updateDrawing(firstId, { name: "  Entry  ", hidden: true, locked: true });
    expect(f.priceLines).toHaveLength(0);
    expect(session.beginDrag({ x: 50, y: 100 })).toBe(false);
    session.selectDrawing(secondId);
    session.updateDrawing(secondId, { hidden: true });
    expect(session.beginDrag({ x: 250, y: 200 })).toBe(false);
    session.undo();
    expect(session.beginDrag({ x: 250, y: 200 })).toBe(true);
    session.endDrag(false);
    session.redo();
    expect(session.beginDrag({ x: 250, y: 200 })).toBe(false);
    session.dispose();
    const restored = f.open();
    expect(f.priceLines).toHaveLength(0);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objects: expect.arrayContaining([
          expect.objectContaining({ id: firstId, name: "Entry", hidden: true, locked: true }),
          expect.objectContaining({ id: secondId, hidden: true }),
        ]),
      }),
    );
    restored.updateDrawing(firstId, { hidden: false });
    expect(f.priceLines).toHaveLength(1);
    expect(restored.beginDrag({ x: 50, y: 100 })).toBe(false);
    restored.updateDrawing(firstId, { locked: false });
    expect(restored.beginDrag({ x: 50, y: 100 })).toBe(true);
    restored.endDrag(false);
    restored.dispose();
  });

  it("duplicates independent objects and undoes deletion without losing metadata", () => {
    const f = fixture("object-copy"),
      session = f.open();
    session.setTool("text");
    f.click(100, 100);
    const originalId = JSON.parse(f.saved()!)[0].id;
    session.updateDrawing(originalId, { name: "Plan", text: "Wait for breakout", locked: true });
    session.duplicateDrawing(originalId);
    const objects = JSON.parse(f.saved()!);
    const copyId = objects[1].id;
    expect(copyId).not.toBe(originalId);
    expect(objects[1]).toMatchObject({
      name: "Plan copy",
      text: "Wait for breakout",
      locked: false,
      anchors: objects[0].anchors,
    });
    session.updateDrawing(copyId, { name: "Alternate", text: "Wait for retest" });
    expect(JSON.parse(f.saved()!)[0]).toMatchObject({ name: "Plan", text: "Wait for breakout" });
    session.deleteDrawing(originalId);
    expect(JSON.parse(f.saved()!).map((item: { id: string }) => item.id)).toEqual([copyId]);
    session.undo();
    expect(JSON.parse(f.saved()!)).toHaveLength(2);
    session.redo();
    expect(JSON.parse(f.saved()!)).toHaveLength(1);
    session.selectDrawing(copyId);
    session.redrawSelected();
    f.click(300, 200);
    expect(JSON.parse(f.saved()!)[0]).toMatchObject({
      name: "Alternate",
      text: "Wait for retest",
      anchors: [{ time: 300, price: 4800 }],
    });
    const saved = f.saved();
    session.deleteDrawing("missing");
    session.updateDrawing("missing", { name: "Invalid" });
    expect(f.saved()).toBe(saved);
    session.dispose();
  });
  it("places all fixed geometric tools with complete anchors and round-trips them", () => {
    const f = fixture("geometric-placement"),
      session = f.open();
    const examples = [
      ["arrow-marker", 2],
      ["arrow", 2],
      ["arrow-up", 1],
      ["arrow-down", 1],
      ["rotated-rectangle", 3],
      ["circle", 2],
      ["ellipse", 2],
      ["triangle", 3],
      ["arc", 3],
      ["curve", 3],
      ["double-curve", 4],
    ] as const;
    for (const [kind, count] of examples) {
      const before = f.saved();
      session.setTool(kind);
      const points = [
        [100, 100],
        [200, 200],
        [150, 250],
        [250, 100],
      ] as const;
      points.slice(0, count).forEach(([time, y], index) => {
        f.click(time, y, 0, time);
        if (index < count - 1) expect(f.saved()).toBe(before);
      });
      expect(JSON.parse(f.saved()!).at(-1)).toMatchObject({ kind, anchors: expect.any(Array) });
      expect(JSON.parse(f.saved()!).at(-1).anchors).toHaveLength(count);
    }
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objects: expect.arrayContaining(
          examples.map(([kind]) => expect.objectContaining({ kind })),
        ),
      }),
    );
    restored.dispose();
  });

  it("finishes variable paths explicitly, ignores double-click duplicate endpoints, and cancels partial replacements", () => {
    const f = fixture("variable-path"),
      session = f.open();
    for (const kind of ["path", "polyline"] as const) {
      session.setTool(kind);
      f.click(100, 100, 0, 100);
      expect(session.finishDrawing()).toBe(false);
      f.click(200, 200, 0, 200);
      f.click(300, 150, 0, 300);
      f.click(300, 150, 0, 300);
      expect(f.change).toHaveBeenLastCalledWith(
        expect.objectContaining({ pending: true, tool: kind }),
      );
      expect(session.finishDrawing()).toBe(true);
      expect(JSON.parse(f.saved()!).at(-1).anchors).toHaveLength(3);
      expect(session.finishDrawing()).toBe(false);
    }
    const before = f.saved();
    session.redrawSelected();
    f.click(400, 150, 0, 400);
    session.cancel();
    expect(f.saved()).toBe(before);
    session.undo();
    expect(JSON.parse(f.saved()!)).toHaveLength(1);
    session.redo();
    expect(f.saved()).toBe(before);
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 2 }));
    restored.dispose();
  });

  it("samples freehand gestures, commits once on release, and edits their original handles", () => {
    const f = fixture("freehand"),
      session = f.open();
    for (const kind of ["brush", "highlighter"] as const) {
      const before = f.saved();
      session.setTool(kind);
      f.click(100, 100, 0, 100);
      expect(f.saved()).toBe(before);
      expect(session.beginDrag({ x: 100, y: 100 })).toBe(true);
      session.dragTo({ x: 101, y: 100 });
      session.dragTo({ x: 120, y: 100 });
      session.dragTo({ x: 140, y: 120 });
      expect(f.saved()).toBe(before);
      session.endDrag();
      const after = f.saved();
      expect(JSON.parse(after!).at(-1).anchors).toEqual([
        { time: 100, price: 4900 },
        { time: 120, price: 4900 },
        { time: 140, price: 4880 },
      ]);
      session.undo();
      expect(JSON.parse(f.saved()!)).toEqual(JSON.parse(before ?? "[]"));
      session.redo();
      expect(f.saved()).toBe(after);
    }
    const latest = JSON.parse(f.saved()!).at(-1);
    session.selectDrawing(latest.id);
    expect(session.beginDrag({ x: 140, y: 120 })).toBe(true);
    session.dragTo({ x: 160, y: 140 });
    session.endDrag();
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([
      { time: 100, price: 4900 },
      { time: 120, price: 4900 },
      { time: 160, price: 4860 },
    ]);
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 2 }));
    restored.dispose();
  });

  it("discards cancelled and point-only strokes without consuming undo history", () => {
    const f = fixture("cancel-stroke"),
      session = f.open();
    session.setTool("brush");
    session.beginDrag({ x: 100, y: 100 });
    session.endDrag();
    expect(f.saved()).toBeNull();
    session.beginDrag({ x: 100, y: 100 });
    session.dragTo({ x: 200, y: 200 });
    session.endDrag(false);
    expect(f.saved()).toBeNull();
    session.beginDrag({ x: 100, y: 100 });
    session.dragTo({ x: 200, y: 200 });
    session.cancel();
    session.endDrag();
    expect(f.saved()).toBeNull();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ pending: false, canUndo: false, tool: "cursor" }),
    );
    session.dispose();
  });

  it("distinguishes weak, strong and off magnets without inventing candles in gaps", () => {
    const f = fixture("magnet-modes", null, [
        { time: 100 as UTCTimestamp, open: 4890, high: 4940, low: 4840, close: 4870 },
      ]),
      session = f.open();
    session.setKeepDrawing(true);
    session.setTool("horizontal");
    session.setMagnetMode("weak");
    f.click(105, 10, 0, 105);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 105, price: 4990 }]);
    session.setMagnetMode("strong");
    f.click(105, 10, 0, 105);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 100, price: 4940 }]);
    f.click(300, 10, 0, 300);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 300, price: 4990 }]);
    session.toggleMagnet();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ magnet: false, magnetMode: "off" }),
    );
    f.click(105, 115, 0, 105);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 105, price: 4885 }]);
    session.toggleMagnet();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ magnet: true, magnetMode: "strong" }),
    );
    session.setMagnetMode("weak");
    f.click(105, 115, 0, 105);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 100, price: 4890 }]);
    session.dispose();
  });

  it("repeats completed fixed, path and freehand tools while repositioning remains a single edit", () => {
    const f = fixture("keep-drawing"),
      session = f.open();
    session.setKeepDrawing(true);
    session.setTool("arrow-up");
    f.click(100, 100);
    f.click(200, 100);
    expect(JSON.parse(f.saved()!)).toHaveLength(2);
    session.setTool("path");
    for (let n = 0; n < 2; n++) {
      f.click(100, 100);
      f.click(200, 200);
      expect(session.finishDrawing()).toBe(true);
      expect(f.change).toHaveBeenLastCalledWith(
        expect.objectContaining({ tool: "path", pending: false }),
      );
    }
    session.setTool("highlighter");
    for (let n = 0; n < 2; n++) {
      session.beginDrag({ x: 100, y: 100 });
      session.dragTo({ x: 200, y: 200 });
      session.endDrag();
      expect(f.change).toHaveBeenLastCalledWith(
        expect.objectContaining({ tool: "highlighter", pending: false }),
      );
    }
    expect(JSON.parse(f.saved()!)).toHaveLength(6);
    session.redrawSelected();
    session.beginDrag({ x: 300, y: 100 });
    session.dragTo({ x: 400, y: 200 });
    session.endDrag();
    expect(JSON.parse(f.saved()!)).toHaveLength(6);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "cursor", keepDrawing: true }),
    );
    session.setKeepDrawing(false);
    session.setTool("arrow-down");
    f.click(100, 100);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "cursor", keepDrawing: false }),
    );
    session.dispose();
  });
  it("restores control preferences across chart recreation and remembers a disabled strong magnet", () => {
    const f = fixture("drawing-controls"),
      session = f.open();
    session.setMagnetMode("strong");
    session.setKeepDrawing(true);
    session.toggleMagnet();
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ magnetMode: "off", magnet: false, keepDrawing: true }),
    );
    restored.toggleMagnet();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ magnetMode: "strong", magnet: true, keepDrawing: true }),
    );
    expect(f.saved()).toBeNull();
    restored.dispose();
  });
});
