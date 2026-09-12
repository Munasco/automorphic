import { DRAWING_DEFAULTS_KEY } from "./drawingDefaults";
import { defaultDrawingTemplateSettings } from "./drawingTemplates";
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
import { sanitizeDrawingVisibility } from "./drawingVisibility";

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
  let savedWrites = 0;
  const controls = new Map<string, string>();
  const storage = {
    getItem: (key: string) =>
      key === "automorphic:drawing-controls:v1" || key === DRAWING_DEFAULTS_KEY
        ? (controls.get(key) ?? null)
        : saved,
    setItem: (key: string, value: string) => {
      if (key === "automorphic:drawing-controls:v1" || key === DRAWING_DEFAULTS_KEY)
        controls.set(key, value);
      else {
        saved = value;
        savedWrites++;
      }
    },
  };
  const change = vi.fn();
  const open = (intervalMinutes = 1, directPlacement = false) =>
    createChartDrawingSession(
      chart,
      series,
      symbol,
      change,
      storage,
      intervalMinutes,
      undefined,
      directPlacement,
    );
  const click = (time: number | undefined, y = 100, paneIndex = 0, x = 50) =>
    listener?.({
      ...(time === undefined ? {} : { time: time as UTCTimestamp }),
      point: { x: x as Coordinate, y: y as Coordinate },
      paneIndex,
      seriesData: new Map(),
    });
  return {
    open,
    click,
    priceLines,
    lines,
    change,
    saved: () => saved,
    controls,
    writes: () => savedWrites,
    listener: () => listener,
  };
}

describe("direct drawing placement", () => {
  it("ignores chart placement clicks and commits two consecutive rectangle points exactly once", () => {
    const f = fixture("direct-rectangle"),
      session = f.open(1, true);
    session.setTool("rectangle");
    f.click(900, 400, 0, 900);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 0, pending: false }),
    );
    expect(session.placeAt({ x: 100, y: 120 })).toBe(true);
    // A chart-generated click between native pointer events must not add another anchor.
    f.click(500, 300, 0, 500);
    expect(f.saved()).toBeNull();
    expect(session.placeAt({ x: 450, y: 175 })).toBe(true);
    expect(f.writes()).toBe(1);
    const saved = f.saved();
    expect(JSON.parse(saved!)).toEqual([
      expect.objectContaining({
        kind: "rectangle",
        anchors: [
          { time: 100, price: 4880 },
          { time: 450, price: 4825 },
        ],
      }),
    ]);
    expect(session.placeAt({ x: 700, y: 250 })).toBe(false);
    expect(f.saved()).toBe(saved);
    expect(f.writes()).toBe(1);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ canUndo: false }));
    session.redo();
    expect(f.saved()).toBe(saved);
    session.dispose();
    const restored = f.open(1, true);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 1 }));
    expect(f.saved()).toBe(saved);
    restored.dispose();
  });

  it("uses actual point projection and candle OHLC magnet snapping for direct anchors", () => {
    const f = fixture("direct-magnet", null, [
      { time: 100 as UTCTimestamp, open: 4890, high: 4940, low: 4840, close: 4870 },
      { time: 300 as UTCTimestamp, open: 4790, high: 4810, low: 4750, close: 4760 },
    ]);
    const session = f.open(1, true);
    session.toggleMagnet();
    session.setTool("rectangle");
    session.placeAt({ x: 104, y: 115 });
    session.placeAt({ x: 304, y: 205 });
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 100, price: 4890 },
      { time: 300, price: 4790 },
    ]);
    expect(f.writes()).toBe(1);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    session.redo();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 100, price: 4890 },
      { time: 300, price: 4790 },
    ]);
    session.dispose();
  });

  it("leaves cursor selection to chart clicks while direct cursor placement is inert", () => {
    const f = fixture("direct-cursor"),
      session = f.open(1, true);
    session.setTool("rectangle");
    session.placeAt({ x: 100, y: 100 });
    session.placeAt({ x: 200, y: 200 });
    const saved = f.saved();
    f.click(800, 400, 0, 800);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ selected: null }));
    const emissions = f.change.mock.calls.length;
    expect(session.placeAt({ x: 100, y: 100 })).toBe(false);
    expect(f.change.mock.calls).toHaveLength(emissions);
    f.click(100, 100, 0, 100);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ kind: "rectangle" }) }),
    );
    expect(f.saved()).toBe(saved);
    expect(f.writes()).toBe(1);
    session.dispose();
  });
});

describe("bulk drawing controls", () => {
  it("locks mixed drawings together, preserves individual state on one undo, and restores locks", () => {
    const f = fixture("bulk-lock"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    session.setTool("horizontal");
    f.click(200, 200);
    const [first, second] = JSON.parse(f.saved()!);
    session.updateDrawing(first.id, { locked: true });
    const original = f.saved();
    const writes = f.writes();
    session.toggleLocked();
    expect(f.writes()).toBe(writes + 1);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ allLocked: true }));
    expect(JSON.parse(f.saved()!).map((item: { locked: boolean }) => item.locked)).toEqual([
      true,
      true,
    ]);
    session.undo();
    expect(f.saved()).toBe(original);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ allLocked: false }));
    session.redo();
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ allLocked: true }));
    restored.toggleLocked();
    expect(JSON.parse(f.saved()!).map((item: { locked: boolean }) => item.locked)).toEqual([
      false,
      false,
    ]);
    restored.selectDrawing(second.id);
    expect(restored.beginDrag({ x: 50, y: 200 })).toBe(true);
    restored.endDrag(false);
    restored.dispose();
  });

  it("removes only unlocked drawings by default, keeps a locked selection, and permits explicit removal", () => {
    const f = fixture("bulk-remove"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    session.setTool("horizontal");
    f.click(200, 200);
    const [first] = JSON.parse(f.saved()!);
    session.updateDrawing(first.id, { locked: true });
    session.selectDrawing(first.id);
    const original = f.saved();
    const writes = f.writes();
    session.removeDrawings();
    expect(f.writes()).toBe(writes + 1);
    expect(JSON.parse(f.saved()!)).toHaveLength(1);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selected: expect.objectContaining({ id: first.id }),
        allLocked: true,
      }),
    );
    session.removeDrawings();
    expect(f.writes()).toBe(writes + 1);
    session.undo();
    expect(f.saved()).toBe(original);
    session.removeDrawings(true);
    expect(f.saved()).toBe("[]");
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: null, allLocked: false }),
    );
    session.undo();
    expect(f.saved()).toBe(original);
    session.clear();
    expect(f.saved()).toBe("[]");
    session.dispose();
  });

  it("discards uncommitted settings before bulk decisions and preserves the canonical values in undo", () => {
    for (const action of ["lock", "remove"] as const) {
      const f = fixture(`bulk-draft-${action}`),
        session = f.open();
      session.setTool("horizontal");
      f.click(100, 100);
      const original = f.saved();
      session.openSettings();
      session.previewSettings({ locked: true, color: "#ff0000" });
      if (action === "lock") session.toggleLocked();
      else session.removeDrawings();
      expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ settingsOpen: false }));
      if (action === "lock")
        expect(JSON.parse(f.saved()!)[0]).toMatchObject({
          color: JSON.parse(original!)[0].color,
          locked: true,
        });
      else expect(f.saved()).toBe("[]");
      session.undo();
      expect(f.saved()).toBe(original);
      session.dispose();
    }
  });

  it("persists the removal preference alongside magnet and keep-drawing settings with safe legacy defaults", () => {
    const key = "automorphic:drawing-controls:v1";
    const f = fixture("bulk-controls");
    f.controls.set(
      key,
      JSON.stringify({ magnetMode: "strong", keepDrawing: true, alwaysRemoveLocked: "true" }),
    );
    const session = f.open();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        alwaysRemoveLocked: false,
        magnetMode: "strong",
        keepDrawing: true,
      }),
    );
    session.setAlwaysRemoveLocked(true);
    session.toggleMagnet();
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ alwaysRemoveLocked: true, magnetMode: "off", keepDrawing: true }),
    );
    restored.toggleMagnet();
    restored.setAlwaysRemoveLocked(false);
    expect(JSON.parse(f.controls.get(key)!)).toEqual({
      magnetMode: "strong",
      lastMagnetMode: "strong",
      keepDrawing: true,
      alwaysRemoveLocked: false,
    });
    expect(f.writes()).toBe(0);
    restored.dispose();
  });
});

describe("native chart drawing lifecycle", () => {
  it("places a horizontal line at the clicked price and restores it after chart recreation", () => {
    const f = fixture("draw-test-horizontal");
    const first = f.open();
    first.setTool("horizontal");
    f.click(undefined, 125);
    expect(f.priceLines).toMatchObject([
      { price: 4875, lineVisible: false, axisLabelVisible: true },
    ]);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "cursor", count: 1, pending: false }),
    );
    first.dispose();
    expect(f.priceLines).toEqual([]);
    expect(f.listener()).toBeUndefined();
    const second = f.open();
    expect(f.priceLines).toMatchObject([
      { price: 4875, lineVisible: false, axisLabelVisible: true },
    ]);
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
      if (kind === "text") session.commitText("Annotation");
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
    session.commitText("Buy only above range");
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
    restored.commitText("New annotation");
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
    session.commitText("Above candle");
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 100, price: 4990 }]);
    session.setTool("text");
    f.click(300, 115, 0, 300);
    session.commitText("Future annotation");
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
    session.commitText("Wait for breakout");
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

describe("drawing settings interactions", () => {
  it("opens settings only on a drawing and selects right-click targets", () => {
    const f = fixture("settings-hit");
    const session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    expect(session.openSettings({ x: 150, y: 150 })).toBe(true);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ settingsOpen: true }));
    session.closeSettings();
    expect(session.openSettings({ x: 700, y: 400 })).toBe(false);
    expect(session.openContextMenu({ x: 150, y: 150 }, { x: 650, y: 450 })).toBe(true);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contextPoint: { x: 650, y: 450 },
        selected: expect.objectContaining({ kind: "trend" }),
      }),
    );
    session.closeContextMenu();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ contextPoint: null }));
    session.dispose();
  });
  it("persists one settings edit, undoes it atomically and rejects invalid coordinates", () => {
    const f = fixture("settings-save");
    const session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    const before = JSON.parse(f.saved()!)[0];
    session.updateSelected({
      extendLeft: true,
      endMarker: "arrow",
      text: "A+ setup",
      textFontSize: 18,
      textBold: true,
      showPriceLabel: true,
      anchors: [
        { time: 100 as UTCTimestamp, price: 4900 },
        { time: 250 as UTCTimestamp, price: 4750 },
      ],
    });
    expect(JSON.parse(f.saved()!)[0]).toMatchObject({
      extendLeft: true,
      endMarker: "arrow",
      text: "A+ setup",
      textFontSize: 18,
      anchors: [
        { time: 100, price: 4900 },
        { time: 250, price: 4750 },
      ],
    });
    session.undo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(before);
    session.redo();
    session.selectDrawing(before.id);
    const valid = f.saved();
    session.updateSelected({ anchors: [{ time: 100 as UTCTimestamp, price: 4900 }] });
    expect(f.saved()).toBe(valid);
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objects: [
          expect.objectContaining({ text: "A+ setup", extendLeft: true, endMarker: "arrow" }),
        ],
      }),
    );
    restored.dispose();
  });
  it("respects horizontal price label settings without losing the price line", () => {
    const f = fixture("settings-price-label");
    const session = f.open();
    session.setTool("horizontal");
    f.click(undefined, 125);
    session.updateSelected({ showPriceLabel: false });
    expect(f.priceLines).toMatchObject([{ price: 4875, axisLabelVisible: false }]);
    session.updateSelected({ showPriceLabel: true });
    expect(f.priceLines).toMatchObject([{ price: 4875, axisLabelVisible: true }]);
    session.dispose();
  });
});

describe("drawing settings preview transactions", () => {
  it("previews immediately while keeping persisted drawings and undo history unchanged until OK", () => {
    const f = fixture("settings-preview-apply");
    const session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    const before = f.saved();
    const beforeWrites = f.writes();
    expect(session.openSettings()).toBe(true);
    expect(
      session.previewSettings({
        color: "#ff0000",
        width: 3,
        anchors: [{ time: 100 as UTCTimestamp, price: 4800 }],
      }),
    ).toBe(true);
    expect(session.previewSettings({ showPriceLabel: false, text: "Range" })).toBe(true);
    expect(f.priceLines).toMatchObject([
      { price: 4800, color: "#ff0000", lineWidth: 3, axisLabelVisible: false },
    ]);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selected: expect.objectContaining({ color: "#ff0000" }),
        objects: [expect.objectContaining({ color: "#2962ff" })],
      }),
    );
    expect(f.saved()).toBe(before);
    expect(f.writes()).toBe(beforeWrites);
    expect(session.applySettings({ textBold: true })).toBe(true);
    expect(f.writes()).toBe(beforeWrites + 1);
    const after = f.saved();
    expect(JSON.parse(after!)[0]).toMatchObject({
      color: "#ff0000",
      width: 3,
      text: "Range",
      textBold: true,
      showPriceLabel: false,
    });
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ settingsOpen: false }));
    session.undo();
    expect(f.saved()).toBe(before);
    session.redo();
    expect(f.saved()).toBe(after);
    expect(session.applySettings({ color: "#00ff00" })).toBe(false);
    session.dispose();
  });

  it.each(["close", "escape", "tool", "undo", "drag-miss", "context-miss"])(
    "discards preview on %s without committing an undo step",
    (action) => {
      const f = fixture(`settings-preview-${action}`);
      const session = f.open();
      session.setTool("horizontal");
      f.click(100, 100);
      const before = f.saved(),
        beforeWrites = f.writes();
      session.openSettings();
      session.previewSettings({ color: "#ff0000", showPriceLabel: false });
      if (action === "close") session.closeSettings();
      else if (action === "escape") session.cancel();
      else if (action === "tool") session.setTool("circle");
      else if (action === "drag-miss") session.beginDrag({ x: 700, y: 400 });
      else if (action === "context-miss")
        session.openContextMenu({ x: 700, y: 400 }, { x: 700, y: 400 });
      else session.undo();
      expect(f.saved()).toBe(before);
      expect(f.writes()).toBe(beforeWrites);
      expect(f.priceLines).toMatchObject([{ color: "#2962ff", axisLabelVisible: true }]);
      expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ settingsOpen: false }));
      session.undo();
      expect(JSON.parse(f.saved()!)).toEqual([]);
      session.dispose();
    },
  );

  it("keeps redo after cancelled previews and avoids a history entry for unchanged OK", () => {
    const f = fixture("settings-preview-redo");
    const session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    session.updateSelected({ color: "#ff0000" });
    const edited = f.saved();
    session.undo();
    f.click(100, 100);
    session.openSettings();
    session.previewSettings({ color: "#00ff00" });
    session.closeSettings();
    session.redo();
    expect(f.saved()).toBe(edited);
    f.click(100, 100);
    session.openSettings();
    const beforeWrites = f.writes();
    expect(
      session.applySettings({
        color: "#ff0000",
        anchors: [{ time: 100 as UTCTimestamp, price: 4900 }],
      }),
    ).toBe(true);
    expect(f.writes()).toBe(beforeWrites);
    session.undo();
    expect(JSON.parse(f.saved()!)[0].color).toBe("#2962ff");
    f.click(100, 100);
    session.openSettings();
    session.previewSettings({ color: "#00ff00" });
    session.applySettings({});
    const green = f.saved();
    session.redo();
    expect(f.saved()).toBe(green);
    session.dispose();
  });

  it("rejects invalid coordinates atomically and sanitizes unsupported settings during preview", () => {
    const f = fixture("settings-preview-invalid");
    const session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    const before = f.saved();
    session.openSettings();
    expect(
      session.previewSettings({
        color: "#ff0000",
        anchors: [{ time: 100 as UTCTimestamp, price: 4900 }],
      }),
    ).toBe(false);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ color: "#2962ff" }) }),
    );
    expect(session.previewSettings({ color: "#ff0000", textFontSize: 999 })).toBe(true);
    expect(
      session.applySettings({
        anchors: [
          { time: 100 as UTCTimestamp, price: 4900 },
          { time: 100 as UTCTimestamp, price: 4800 },
        ],
      }),
    ).toBe(false);
    expect(f.saved()).toBe(before);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        settingsOpen: true,
        selected: expect.objectContaining({ color: "#ff0000" }),
      }),
    );
    session.closeSettings();
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ objects: [expect.objectContaining({ color: "#2962ff" })] }),
    );
    restored.dispose();
  });

  it("never persists a preview through other object actions or session disposal", () => {
    const f = fixture("settings-preview-exit");
    const session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    const id = JSON.parse(f.saved()!)[0].id as string;
    session.openSettings();
    session.previewSettings({ color: "#ff0000" });
    session.duplicateDrawing(id);
    expect(JSON.parse(f.saved()!).map((drawing: { color: string }) => drawing.color)).toEqual([
      "#2962ff",
      "#2962ff",
    ]);
    session.openSettings();
    session.previewSettings({ color: "#ff0000" });
    session.clear();
    session.undo();
    expect(JSON.parse(f.saved()!).map((drawing: { color: string }) => drawing.color)).toEqual([
      "#2962ff",
      "#2962ff",
    ]);
    session.selectDrawing(id);
    session.openSettings();
    session.previewSettings({ color: "#ff0000" });
    const beforeDispose = f.saved();
    session.dispose();
    expect(f.saved()).toBe(beforeDispose);
    const restored = f.open();
    expect(f.priceLines.every((line) => (line as { color: string }).color === "#2962ff")).toBe(
      true,
    );
    restored.dispose();
  });

  it("filters interval visibility for rendering and hit selection while retaining saved objects", () => {
    const visibility = sanitizeDrawingVisibility({
      minutes: { enabled: true, min: 1, max: 5 },
      hours: { enabled: false },
    });
    const drawing = {
      id: "range-only",
      kind: "horizontal",
      color: "#729bff",
      width: 2,
      anchors: [{ time: 100, price: 4900 }],
      visibility,
    };
    const f = fixture("drawing-interval-visibility", JSON.stringify([drawing]));
    const session = f.open(15);
    expect(f.priceLines).toEqual([]);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 1, objects: [expect.objectContaining({ id: drawing.id })] }),
    );
    f.click(100, 100);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ selected: null }));
    expect(session.beginDrag({ x: 200, y: 100 })).toBe(false);
    session.selectDrawing(drawing.id);
    session.openSettings();
    expect(
      session.previewSettings({
        visibility: sanitizeDrawingVisibility({
          minutes: { enabled: true, min: 1, max: 30 },
          hours: { enabled: false },
        }),
      }),
    ).toBe(true);
    expect(f.priceLines).toHaveLength(1);
    session.closeSettings();
    expect(f.priceLines).toHaveLength(0);
    expect(JSON.parse(f.saved()!)[0].visibility).toEqual(visibility);
    session.dispose();
    const fiveMinute = f.open(5);
    expect(f.priceLines).toHaveLength(1);
    expect(fiveMinute.isVisible(JSON.parse(f.saved()!)[0])).toBe(true);
    fiveMinute.dispose();
  });
});

describe("drawing template transactions", () => {
  it("previews a sparse replacement without leaking old styling or changing object metadata, then cancels", () => {
    const f = fixture("template-preview"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    session.updateSelected({
      name: "Setup",
      locked: true,
      hidden: true,
      text: "Old label",
      textBold: true,
      extendRight: true,
      levels: [{ value: 0.5, visible: true }],
    });
    const original = JSON.parse(f.saved()!)[0];
    const writes = f.writes();
    session.openSettings();
    expect(
      session.previewSettings(
        { color: "#123456", width: 3, anchors: [], name: "Injected", locked: false, hidden: false },
        { replace: true },
      ),
    ).toBe(true);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selected: {
          id: original.id,
          kind: original.kind,
          anchors: original.anchors,
          name: "Setup",
          locked: true,
          hidden: true,
          color: "#123456",
          width: 3,
          lineStyle: "solid",
        },
      }),
    );
    expect(f.writes()).toBe(writes);
    session.closeSettings();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: original, settingsOpen: false }),
    );
    expect(JSON.parse(f.saved()!)[0]).toEqual(original);
    session.dispose();
  });

  it("applies replacement plus later edits atomically, preserves edited coordinates, and undoes the entire transaction", () => {
    const f = fixture("template-apply"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    session.updateSelected({
      textBold: true,
      text: "Old label",
      extendRight: true,
      color: "#ff0000",
    });
    const original = JSON.parse(f.saved()!)[0];
    const writes = f.writes();
    const anchors = [
      { time: 150 as UTCTimestamp, price: 4850 },
      { time: 250 as UTCTimestamp, price: 4750 },
    ];
    session.openSettings();
    session.previewSettings({ anchors });
    session.previewSettings({ color: "#123456", width: 2 }, { replace: true });
    session.previewSettings({ text: "After template" });
    expect(
      session.applySettings(
        { color: "#123456", width: 2, lineStyle: "dotted", text: "After template" },
        { replace: true },
      ),
    ).toBe(true);
    const result = JSON.parse(f.saved()!)[0];
    expect(result).toEqual({
      id: original.id,
      kind: "trend",
      anchors,
      color: "#123456",
      width: 2,
      lineStyle: "dotted",
      text: "After template",
    });
    expect(f.writes()).toBe(writes + 1);
    session.undo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(original);
    session.redo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(result);
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ objects: [result] }));
    restored.dispose();
  });

  it("rejects incomplete or invalid replacements without altering the current preview or committing history", () => {
    const f = fixture("template-invalid"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    const original = JSON.parse(f.saved()!)[0];
    const writes = f.writes();
    session.openSettings();
    session.previewSettings({ text: "Draft" });
    expect(session.previewSettings({ color: "#123456" }, { replace: true })).toBe(false);
    expect(session.applySettings({ color: "invalid", width: 2 }, { replace: true })).toBe(false);
    expect(f.writes()).toBe(writes);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ settingsOpen: true, selected: { ...original, text: "Draft" } }),
    );
    expect(session.applySettings({})).toBe(true);
    expect(JSON.parse(f.saved()!)[0]).toEqual({ ...original, text: "Draft" });
    session.undo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(original);
    session.dispose();
  });
});

describe("drawing hover state", () => {
  const line = {
    id: "hover-line",
    kind: "horizontal",
    color: "#729bff",
    width: 2,
    anchors: [{ time: 100, price: 4900 }],
  };
  it("emits only when the hovered object changes, never selects or persists from idle movement", () => {
    const f = fixture("hover-state", JSON.stringify([line])),
      session = f.open();
    f.change.mockClear();
    session.hover({ x: 400, y: 100 });
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hovered: expect.objectContaining({ id: line.id }),
        selected: null,
      }),
    );
    for (let x = 410; x < 600; x++) session.hover({ x, y: 100 });
    expect(f.change).toHaveBeenCalledTimes(1);
    expect(f.writes()).toBe(0);
    session.hover(null);
    session.hover(null);
    expect(f.change).toHaveBeenCalledTimes(2);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ hovered: null }));
    session.hover({ x: 400, y: 100 });
    session.setTool("circle");
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ hovered: null }));
    session.hover({ x: 400, y: 100 });
    expect(f.change).toHaveBeenCalledTimes(4);
    session.dispose();
  });
  it("keeps locked drawing hits from panning without moving anchors and clears hover during settings", () => {
    const f = fixture("hover-lock", JSON.stringify([{ ...line, locked: true }])),
      session = f.open();
    session.hover({ x: 400, y: 100 });
    expect(session.beginDrag({ x: 400, y: 100 })).toBe(false);
    expect(session.blocksChartPan({ x: 400, y: 100 })).toBe(true);
    expect(session.blocksChartPan({ x: 400, y: 300 })).toBe(false);
    session.dragTo({ x: 500, y: 200 });
    session.endDrag();
    expect(f.writes()).toBe(0);
    session.openSettings();
    session.hover({ x: 400, y: 100 });
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ hovered: null, settingsOpen: true }),
    );
    session.closeSettings();
    session.toggleHidden();
    session.hover({ x: 400, y: 100 });
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ hovered: null, hidden: true }),
    );
    session.dispose();
  });
});

describe("inline drawing text transactions", () => {
  it("creates standalone text as one undoable edit without persisting an empty placeholder", () => {
    const f = fixture("standalone-text-create"),
      session = f.open();
    session.setTool("text");
    f.click(100, 120);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        textEditing: true,
        settingsOpen: false,
        tool: "cursor",
        canUndo: false,
        selected: expect.objectContaining({
          kind: "text",
          text: "",
          anchors: [{ time: 100, price: 4880 }],
        }),
      }),
    );
    session.previewText("Entry\nwait for retest");
    expect(f.saved()).toBeNull();
    expect(f.writes()).toBe(0);
    expect(session.commitText()).toBe(true);
    expect(f.writes()).toBe(1);
    const saved = f.saved();
    expect(JSON.parse(saved!)).toEqual([
      expect.objectContaining({ kind: "text", text: "Entry\nwait for retest" }),
    ]);
    expect(session.commitText("duplicate blur")).toBe(false);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ canUndo: false }));
    session.redo();
    expect(f.saved()).toBe(saved);
    session.dispose();
  });

  it.each(["escape", "cancel", "empty", "tool", "dispose"])(
    "discards a new standalone text draft on %s without saving or adding undo history",
    (action) => {
      const f = fixture(`standalone-text-abandon-${action}`),
        session = f.open();
      session.setTool("text");
      f.click(100, 100);
      session.previewText("Unsaved note");
      if (action === "escape") session.cancel();
      else if (action === "cancel") session.cancelTextEdit();
      else if (action === "empty") session.commitText("");
      else if (action === "tool") session.setTool("trend");
      else session.dispose();
      expect(f.saved()).toBeNull();
      expect(f.writes()).toBe(0);
      if (action !== "dispose") {
        expect(f.change).toHaveBeenLastCalledWith(
          expect.objectContaining({ textEditing: false, count: 0, canUndo: false }),
        );
        session.undo();
        expect(f.writes()).toBe(0);
      }
      session.dispose();
    },
  );

  it("reopens saved standalone text, cancels drafts and commits a separate undoable revision", () => {
    const f = fixture("standalone-text-reedit"),
      session = f.open();
    session.setTool("text");
    f.click(100, 100);
    session.commitText("Original note");
    const original = f.saved();
    expect(session.beginTextEdit()).toBe(true);
    session.previewText("Cancelled revision");
    session.cancelTextEdit();
    expect(f.saved()).toBe(original);
    expect(f.writes()).toBe(1);
    expect(session.beginTextEdit()).toBe(true);
    session.previewText("Saved revision");
    expect(session.commitText()).toBe(true);
    expect(f.writes()).toBe(2);
    const edited = f.saved();
    expect(JSON.parse(edited!)[0]).toEqual({
      ...JSON.parse(original!)[0],
      text: "Saved revision",
    });
    session.undo();
    expect(f.saved()).toBe(original);
    session.redo();
    expect(f.saved()).toBe(edited);
    session.dispose();
  });

  it("resumes repeated Text placement after committing, but leaves it after cancelling", () => {
    const f = fixture("standalone-text-repeat"),
      session = f.open();
    session.setKeepDrawing(true);
    session.setTool("text");
    f.click(100, 100);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "cursor", textEditing: true }),
    );
    session.commitText("First note");
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "text", textEditing: false }),
    );
    f.click(200, 200);
    session.previewText("Cancel second");
    session.cancel();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "cursor", textEditing: false }),
    );
    expect(JSON.parse(f.saved()!)).toHaveLength(1);
    expect(f.writes()).toBe(1);
    session.dispose();
  });

  it("previews multiline text without opening settings, commits once and restores it atomically with undo", () => {
    const f = fixture("inline-text-commit"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    const before = f.saved(),
      writes = f.writes();
    expect(session.beginTextEdit()).toBe(true);
    expect(session.previewText("Watch")).toBe(true);
    expect(session.previewText("Watch\nretest")).toBe(true);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        textEditing: true,
        settingsOpen: false,
        selected: expect.objectContaining({ text: "Watch\nretest" }),
      }),
    );
    expect(f.saved()).toBe(before);
    expect(f.writes()).toBe(writes);
    expect(session.previewSettings({ color: "#ff0000" })).toBe(false);
    expect(session.commitText()).toBe(true);
    expect(f.writes()).toBe(writes + 1);
    const after = f.saved();
    expect(JSON.parse(after!)[0].text).toBe("Watch\nretest");
    expect(session.commitText("duplicate blur")).toBe(false);
    session.undo();
    expect(f.saved()).toBe(before);
    session.redo();
    expect(f.saved()).toBe(after);
    session.dispose();
  });

  it.each(["escape", "cancel", "tool", "settings", "context", "dispose"])(
    "discards inline text on %s without saving the draft",
    (action) => {
      const f = fixture(`inline-text-${action}`),
        session = f.open();
      session.setTool("horizontal");
      f.click(100, 100);
      const before = f.saved(),
        writes = f.writes();
      session.beginTextEdit();
      session.previewText("Unfinished");
      if (action === "escape") session.cancel();
      else if (action === "cancel") session.cancelTextEdit();
      else if (action === "tool") session.setTool("trend");
      else if (action === "settings") session.openSettings();
      else if (action === "context")
        session.openContextMenu({ x: 400, y: 100 }, { x: 400, y: 100 });
      else session.dispose();
      expect(f.saved()).toBe(before);
      expect(f.writes()).toBe(writes);
      if (action !== "dispose")
        expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ textEditing: false }));
      session.dispose();
    },
  );

  it("does not create an empty-text history entry and rejects commits from another drawing", () => {
    const f = fixture("inline-text-empty"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    const before = f.saved(),
      writes = f.writes();
    session.beginTextEdit();
    session.previewText("");
    expect(session.commitText("")).toBe(true);
    expect(f.saved()).toBe(before);
    expect(f.writes()).toBe(writes);
    session.beginTextEdit();
    session.previewText("x".repeat(200));
    expect(session.commitText("wrong", "other-id")).toBe(false);
    expect(session.commitText()).toBe(true);
    expect(JSON.parse(f.saved()!)[0].text).toHaveLength(140);
    session.undo();
    expect(f.saved()).toBe(before);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    session.dispose();
  });

  it("edits locked annotation text undoably while keeping body and endpoint drags locked", () => {
    const f = fixture("inline-text-locked"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    session.updateSelected({ locked: true });
    const before = f.saved(),
      original = JSON.parse(before!)[0],
      writes = f.writes();
    for (const point of [
      { x: 150, y: 150 },
      { x: 100, y: 100 },
    ]) {
      expect(session.beginDrag(point)).toBe(false);
      session.dragTo({ x: 300, y: 300 });
      session.endDrag();
    }
    expect(f.saved()).toBe(before);
    expect(f.writes()).toBe(writes);
    expect(session.beginTextEdit()).toBe(true);
    expect(session.previewText("Locked price level")).toBe(true);
    expect(f.saved()).toBe(before);
    expect(session.commitText()).toBe(true);
    expect(f.writes()).toBe(writes + 1);
    expect(JSON.parse(f.saved()!)[0]).toEqual({ ...original, text: "Locked price level" });
    const after = f.saved();
    session.undo();
    expect(f.saved()).toBe(before);
    session.redo();
    expect(f.saved()).toBe(after);
    expect(session.beginDrag({ x: 100, y: 100 })).toBe(false);
    session.dragTo({ x: 400, y: 400 });
    session.endDrag();
    expect(f.saved()).toBe(after);
    session.dispose();
  });

  it("requires a visible line and keeps inline and settings editors mutually exclusive", () => {
    const f = fixture("inline-text-eligibility"),
      session = f.open();
    expect(session.beginTextEdit()).toBe(false);
    session.setTool("rectangle");
    f.click(100, 100);
    f.click(200, 200);
    expect(session.beginTextEdit()).toBe(false);
    session.setTool("horizontal");
    f.click(300, 100);
    session.updateSelected({ hidden: true });
    expect(session.beginTextEdit()).toBe(false);
    session.updateSelected({ hidden: false });
    session.openSettings();
    expect(session.beginTextEdit()).toBe(false);
    session.closeSettings();
    expect(session.beginTextEdit()).toBe(true);
    session.previewText("Draft");
    session.undo();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ textEditing: false, count: 2 }),
    );
    expect(JSON.parse(f.saved()!).at(-1).text).toBeUndefined();
    session.dispose();
  });
});

describe("channel corner editing", () => {
  const shape = (kind: "flat-channel" | "disjoint-channel") => ({
    id: "channel",
    kind,
    color: "#729bff",
    width: 2,
    anchors: [
      { time: 100, price: 4750 },
      { time: 350, price: 4810 },
      { time: 900, price: 4540 },
    ],
  });
  it.each([
    {
      kind: "flat-channel",
      from: [100, 460],
      to: [150, 500],
      expected: [
        [150, 4750],
        [350, 4810],
        [900, 4500],
      ],
    },
    {
      kind: "flat-channel",
      from: [350, 460],
      to: [400, 500],
      expected: [
        [100, 4750],
        [400, 4810],
        [900, 4500],
      ],
    },
    {
      kind: "disjoint-channel",
      from: [100, 400],
      to: [150, 470],
      expected: [
        [150, 4820],
        [350, 4810],
        [900, 4540],
      ],
    },
    {
      kind: "disjoint-channel",
      from: [350, 460],
      to: [450, 510],
      expected: [
        [100, 4750],
        [350, 4810],
        [900, 4490],
      ],
    },
    {
      kind: "disjoint-channel",
      from: [100, 250],
      to: [150, 280],
      expected: [
        [150, 4720],
        [350, 4810],
        [900, 4540],
      ],
    },
    {
      kind: "disjoint-channel",
      from: [350, 190],
      to: [450, 230],
      expected: [
        [100, 4750],
        [450, 4770],
        [900, 4580],
      ],
    },
  ] as const)(
    "couples $kind corner $from correctly in one undoable write",
    ({ kind, from, to, expected }) => {
      const original = shape(kind);
      const f = fixture(`corner-${kind}`, JSON.stringify([original]));
      const session = f.open();
      expect(session.beginDrag({ x: from[0], y: from[1] })).toBe(true);
      session.dragTo({ x: to[0], y: to[1] });
      expect(f.writes()).toBe(0);
      session.endDrag();
      expect(f.writes()).toBe(1);
      expect(JSON.parse(f.saved()!)[0].anchors).toEqual(
        expected.map(([time, price]) => ({ time, price })),
      );
      session.undo();
      expect(JSON.parse(f.saved()!)[0]).toEqual(original);
      session.redo();
      expect(JSON.parse(f.saved()!)[0].anchors).toEqual(
        expected.map(([time, price]) => ({ time, price })),
      );
      session.dispose();
    },
  );
  it("snaps a derived corner at its visible candle rather than the ignored third timestamp", () => {
    const original = shape("flat-channel");
    const f = fixture("channel-magnet", JSON.stringify([original]), [
      { time: 200 as UTCTimestamp, open: 4550, high: 4570, low: 4500, close: 4560 },
    ]);
    const session = f.open();
    session.setMagnetMode("strong");
    session.beginDrag({ x: 100, y: 460 });
    session.dragTo({ x: 205, y: 452 });
    session.endDrag();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 200, price: 4750 },
      { time: 350, price: 4810 },
      { time: 900, price: 4550 },
    ]);
    session.dispose();
  });
});

describe("regression bar-range interaction", () => {
  it("ignores clicked prices and vertical drag, then edits either fitted endpoint in one undoable write", () => {
    const initial = {
      id: "regression",
      kind: "regression-trend",
      color: "#ffffff",
      width: 2,
      anchors: [
        { time: 100, price: 9999 },
        { time: 300, price: -9999 },
      ],
    };
    const candles = [100, 200, 300, 400].map((time, index) => ({
      time: time as UTCTimestamp,
      open: 4900 - index * 100,
      high: 4900 - index * 100,
      low: 4900 - index * 100,
      close: 4900 - index * 100,
    }));
    const f = fixture("regression-drag", JSON.stringify([initial]), candles),
      session = f.open();
    expect(session.beginDrag({ x: 100, y: 100 })).toBe(true);
    session.dragTo({ x: 100, y: 180 });
    session.endDrag();
    expect(f.writes()).toBe(0);
    expect(session.beginDrag({ x: 300, y: 300 })).toBe(true);
    session.dragTo({ x: 400, y: 450 });
    session.endDrag();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 100, price: 9999 },
      { time: 400, price: -9999 },
    ]);
    expect(f.writes()).toBe(1);
    session.undo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(initial);
    session.dispose();
  });
});

describe("Fibonacci time placement and editing", () => {
  it.each(["fib-time-zone", "fib-trend-time"] as const)(
    "places %s with its own anchor count, then drags and restores its baseline",
    (kind) => {
      const f = fixture(`fib-time-${kind}`),
        session = f.open();
      session.setTool(kind);
      f.click(100, 100);
      f.click(200, 200);
      if (kind === "fib-trend-time") {
        expect(f.writes()).toBe(0);
        f.click(400, 150);
      }
      expect(f.writes()).toBe(1);
      const original = JSON.parse(f.saved()!)[0];
      expect(original.anchors).toHaveLength(kind === "fib-time-zone" ? 2 : 3);
      expect(session.beginDrag({ x: 100, y: 100 })).toBe(true);
      session.dragTo({ x: 150, y: 130 });
      session.endDrag();
      expect(JSON.parse(f.saved()!)[0].anchors[0]).toEqual({ time: 150, price: 4870 });
      session.undo();
      expect(JSON.parse(f.saved()!)[0]).toEqual(original);
      session.dispose();
    },
  );
});

describe("selected drawing template application", () => {
  const original = {
    id: "template-target",
    kind: "trend",
    anchors: [
      { time: 100, price: 4900 },
      { time: 300, price: 4800 },
    ],
    color: "#729bff",
    width: 2,
    lineStyle: "dotted",
    name: "Research line",
    locked: true,
    hidden: true,
    text: "Old text",
    extendLeft: true,
    showPriceLabel: true,
  };
  it("atomically replaces sparse appearance on locked drawings while preserving identity, placement and metadata", () => {
    const f = fixture("selected-template", JSON.stringify([original])),
      session = f.open();
    session.selectDrawing(original.id);
    const patch = {
      color: "#ff0000",
      width: 3,
      id: "malicious",
      kind: "rectangle",
      anchors: [{ time: 900 as Time, price: 0 }],
      locked: false,
      hidden: false,
      name: "Changed",
    };
    expect(session.applySelectedTemplate(patch)).toBe(true);
    expect(f.writes()).toBe(1);
    const updated = JSON.parse(f.saved()!)[0];
    expect(updated).toEqual({
      id: original.id,
      kind: original.kind,
      anchors: original.anchors,
      color: "#ff0000",
      width: 3,
      lineStyle: "solid",
      name: original.name,
      locked: true,
      hidden: true,
    });
    session.undo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(original);
    session.redo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(updated);
    const writes = f.writes();
    expect(session.applySelectedTemplate({ color: "#ff0000", width: 3 })).toBe(false);
    expect(f.writes()).toBe(writes);
    session.dispose();
  });
  it("discards uncommitted settings and coordinates before applying and cannot restore them on later cancellation", () => {
    const f = fixture("selected-template-draft", JSON.stringify([original])),
      session = f.open();
    session.selectDrawing(original.id);
    session.openSettings();
    session.previewSettings({
      color: "#00ff00",
      anchors: [
        { time: 200 as Time, price: 4700 },
        { time: 400 as Time, price: 4600 },
      ],
    });
    expect(session.applySelectedTemplate({ color: "#ff0000", width: 1 })).toBe(true);
    expect(f.writes()).toBe(1);
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual(original.anchors);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ settingsOpen: false, textEditing: false }),
    );
    session.closeSettings();
    expect(f.writes()).toBe(1);
    session.undo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(original);
    session.dispose();
  });
  it("does nothing for invalid templates, missing selection or disposal", () => {
    const f = fixture("selected-template-invalid", JSON.stringify([original])),
      session = f.open();
    expect(session.applySelectedTemplate({ color: "#ff0000", width: 2 })).toBe(false);
    session.selectDrawing(original.id);
    session.openSettings();
    expect(session.applySelectedTemplate({ color: "#ff0000" })).toBe(false);
    expect(session.applySelectedTemplate({ color: "invalid", width: 2 })).toBe(false);
    expect(f.writes()).toBe(0);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ settingsOpen: true }));
    session.dispose();
    expect(session.applySelectedTemplate({ color: "#ff0000", width: 2 })).toBe(false);
    expect(f.writes()).toBe(0);
  });
});

describe("native horizontal opacity", () => {
  it("keeps the native body hidden while retaining an opaque axis label and persists template opacity", () => {
    const f = fixture("horizontal-opacity"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    session.updateSelected({ color: "#ff8000", lineOpacity: 0.5 });
    expect(f.priceLines[0]).toMatchObject({
      color: "rgba(255, 128, 0, 0.5)",
      axisLabelColor: "#ff8000",
      lineVisible: false,
      axisLabelVisible: true,
    });
    session.updateSelected({ lineOpacity: 0 });
    expect(f.priceLines[0]).toMatchObject({
      color: "rgba(255, 128, 0, 0)",
      axisLabelColor: "#ff8000",
      lineVisible: false,
    });
    expect(
      session.applySelectedTemplate({
        color: "#123456",
        width: 2,
        lineOpacity: 0.5,
        textOpacity: 0,
      }),
    ).toBe(true);
    expect(JSON.parse(f.saved()!)[0]).toMatchObject({ lineOpacity: 0.5, textOpacity: 0 });
    session.dispose();
    const restored = f.open();
    expect(f.priceLines[0]).toMatchObject({
      color: "rgba(18, 52, 86, 0.5)",
      axisLabelColor: "#123456",
      lineVisible: false,
    });
    restored.dispose();
  });
});

describe("drawing tool appearance inheritance", () => {
  it("does not replace recent defaults when an older differently styled object's coordinates or lock change", () => {
    const f = fixture("defaults-old-object"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    session.setTool("trend");
    f.click(300, 100);
    f.click(400, 200);
    session.updateSelected({ color: "#00ff00", width: 4 });
    const remembered = f.controls.get(DRAWING_DEFAULTS_KEY);
    expect(session.openSettings({ x: 150, y: 150 })).toBe(true);
    session.applySettings({
      locked: true,
      anchors: [
        { time: 120 as UTCTimestamp, price: 4900 },
        { time: 220 as UTCTimestamp, price: 4800 },
      ],
    });
    expect(f.controls.get(DRAWING_DEFAULTS_KEY)).toBe(remembered);
    session.dispose();
  });
  it("inherits committed appearance on the next object without copying text or identity", () => {
    const f = fixture("defaults-inherit"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    const first = JSON.parse(f.saved()!)[0];
    expect(first.color).toBe("#2962ff");
    session.updateSelected({
      color: "#ff0000",
      width: 4,
      lineStyle: "dotted",
      text: "Secret note",
      name: "Named",
      locked: true,
      textBold: true,
      textFontSize: 22,
    });
    session.setTool("trend");
    f.click(300, 100);
    f.click(400, 200);
    const next = JSON.parse(f.saved()!)[1];
    expect(next).toMatchObject({
      kind: "trend",
      color: "#ff0000",
      width: 4,
      lineStyle: "dotted",
      textBold: true,
      textFontSize: 22,
    });
    expect(next.id).not.toBe(first.id);
    expect(next.text).toBeUndefined();
    expect(next.name).toBeUndefined();
    expect(next.locked).toBeUndefined();
    expect(next.hidden).toBeUndefined();
    session.setTool("horizontal");
    f.click(500, 150);
    expect(JSON.parse(f.saved()!).at(-1).color).toBe("#2962ff");
    session.dispose();
    const restored = f.open();
    restored.setTool("trend");
    f.click(600, 100);
    f.click(700, 200);
    expect(JSON.parse(f.saved()!).at(-1).color).toBe("#ff0000");
    restored.dispose();
  });
  it("remembers explicit templates/reset only on apply and ignores cancelled edits and placement changes", () => {
    const f = fixture("defaults-transactions"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    session.updateSelected({ color: "#ff0000", width: 3 });
    const remembered = f.controls.get(DRAWING_DEFAULTS_KEY);
    session.openSettings();
    session.previewSettings({ color: "#00ff00", width: 4 });
    session.closeSettings();
    expect(f.controls.get(DRAWING_DEFAULTS_KEY)).toBe(remembered);
    session.updateSelected({
      locked: true,
      name: "Renamed",
      text: "Only note",
      anchors: [
        { time: 150 as UTCTimestamp, price: 4900 },
        { time: 250 as UTCTimestamp, price: 4800 },
      ],
    });
    expect(f.controls.get(DRAWING_DEFAULTS_KEY)).toBe(remembered);
    session.applySelectedTemplate({ color: "#123456", width: 1, lineStyle: "dashed" });
    expect(JSON.parse(f.controls.get(DRAWING_DEFAULTS_KEY)!).trend.color).toBe("#123456");
    session.openSettings();
    session.previewSettings(defaultDrawingTemplateSettings("trend"), { replace: true });
    session.closeSettings();
    expect(JSON.parse(f.controls.get(DRAWING_DEFAULTS_KEY)!).trend.color).toBe("#123456");
    session.openSettings();
    session.applySettings(defaultDrawingTemplateSettings("trend"), { replace: true });
    expect(JSON.parse(f.controls.get(DRAWING_DEFAULTS_KEY)!).trend.color).toBe("#2962ff");
    session.setTool("trend");
    f.click(300, 100);
    f.click(400, 200);
    expect(JSON.parse(f.saved()!).at(-1)).toMatchObject({
      color: "#2962ff",
      width: 2,
      lineStyle: "solid",
    });
    session.dispose();
  });
});

describe("drawing visual order", () => {
  const objects = ["a", "b", "c", "d"].map((id) => ({
    id,
    kind: "trend",
    anchors: [
      { time: 100, price: 4900 },
      { time: 200, price: 4800 },
    ],
    color: "#2962ff",
    width: 2,
    lineStyle: "solid",
    name: `Drawing ${id}`,
    ...(id === "c" ? { locked: true } : {}),
  }));
  it.each([
    ["front", ["a", "b", "d", "c"]],
    ["forward", ["a", "b", "d", "c"]],
    ["backward", ["a", "c", "b", "d"]],
    ["back", ["c", "a", "b", "d"]],
  ] as const)(
    "persists %s in one undo step while preserving object identity and selection",
    (direction, expected) => {
      const f = fixture(`order-${direction}`, JSON.stringify(objects)),
        session = f.open();
      session.selectDrawing("c");
      expect(session.reorderSelected(direction)).toBe(true);
      expect(f.writes()).toBe(1);
      const reordered = JSON.parse(f.saved()!);
      expect(reordered.map((item: { id: string }) => item.id)).toEqual(expected);
      for (const original of objects)
        expect(reordered.find((item: { id: string }) => item.id === original.id)).toEqual(original);
      expect(f.change).toHaveBeenLastCalledWith(
        expect.objectContaining({ selected: expect.objectContaining({ id: "c", locked: true }) }),
      );
      session.undo();
      expect(JSON.parse(f.saved()!)).toEqual(objects);
      session.redo();
      expect(JSON.parse(f.saved()!)).toEqual(reordered);
      session.dispose();
      const restored = f.open();
      expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ objects: reordered }));
      restored.dispose();
    },
  );
  it("moves exactly one position and preserves hidden and locked flags", () => {
    const f = fixture("order-single", JSON.stringify(objects)),
      session = f.open();
    session.selectDrawing("a");
    session.reorderSelected("forward");
    expect(JSON.parse(f.saved()!).map((item: { id: string }) => item.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
    session.selectDrawing("d");
    session.reorderSelected("backward");
    expect(JSON.parse(f.saved()!).map((item: { id: string }) => item.id)).toEqual([
      "b",
      "a",
      "d",
      "c",
    ]);
    session.selectDrawing("c");
    session.updateSelected({ hidden: true });
    session.reorderSelected("back");
    expect(JSON.parse(f.saved()!)[0]).toMatchObject({ id: "c", hidden: true, locked: true });
    session.dispose();
  });
  it("does not write, clear redo, or create undo entries at either boundary", () => {
    const f = fixture("order-boundaries", JSON.stringify(objects)),
      session = f.open();
    expect(session.reorderSelected("front")).toBe(false);
    session.selectDrawing("d");
    expect(session.reorderSelected("front")).toBe(false);
    expect(session.reorderSelected("forward")).toBe(false);
    session.selectDrawing("a");
    expect(session.reorderSelected("back")).toBe(false);
    expect(session.reorderSelected("backward")).toBe(false);
    expect(f.writes()).toBe(0);
    session.reorderSelected("front");
    session.undo();
    session.selectDrawing("a");
    session.reorderSelected("back");
    session.redo();
    expect(JSON.parse(f.saved()!).map((item: { id: string }) => item.id)).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
    session.dispose();
    expect(session.reorderSelected("back")).toBe(false);
  });
  it("hit-selects the topmost overlapping object after reordering", () => {
    const f = fixture("order-hit", JSON.stringify(objects)),
      session = f.open();
    f.click(150, 150, 0, 150);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ id: "d" }) }),
    );
    session.reorderSelected("back");
    f.click(150, 150, 0, 150);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ id: "c" }) }),
    );
    session.selectDrawing("a");
    session.reorderSelected("front");
    f.click(150, 150, 0, 150);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ id: "a" }) }),
    );
    session.dispose();
  });
  it("cancels drafts and a live drag before recording only the order change", () => {
    const f = fixture("order-cancel", JSON.stringify(objects)),
      session = f.open();
    session.selectDrawing("b");
    session.openSettings();
    session.previewSettings({ color: "#ff0000", text: "Draft" });
    session.reorderSelected("front");
    expect(JSON.parse(f.saved()!).at(-1)).toEqual(objects[1]);
    expect(f.controls.get(DRAWING_DEFAULTS_KEY)).toBeUndefined();
    expect(session.beginDrag({ x: 150, y: 150 })).toBe(true);
    session.dragTo({ x: 180, y: 180 });
    session.reorderSelected("back");
    expect(JSON.parse(f.saved()!)[0]).toEqual(objects[1]);
    expect(f.writes()).toBe(2);
    session.undo();
    expect(JSON.parse(f.saved()!).map((item: { id: string }) => item.id)).toEqual([
      "a",
      "c",
      "d",
      "b",
    ]);
    expect(JSON.parse(f.saved()!).at(-1)).toEqual(objects[1]);
    session.dispose();
  });
});
