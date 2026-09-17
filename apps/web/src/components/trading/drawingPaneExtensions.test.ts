import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type {
  IChartApi,
  IPaneApi,
  IPanePrimitive,
  ISeriesApi,
  SeriesType,
  Time,
} from "lightweight-charts";
import type { ChartDrawing } from "./drawingGeometry";
import { createDrawingPaneExtensions, drawingPaneTimeAtCoordinate } from "./drawingPaneExtensions";

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  let mutation: (() => void) | undefined;
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(callback: () => void) {
        mutation = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const pane = () => {
    const primitives = new Set<IPanePrimitive<Time>>();
    const requestUpdate = vi.fn();
    const api = {
      attachPrimitive: vi.fn((primitive: IPanePrimitive<Time>) => {
        primitives.add(primitive);
        primitive.attached?.({ chart, requestUpdate });
      }),
      detachPrimitive: vi.fn((primitive: IPanePrimitive<Time>) => {
        primitives.delete(primitive);
        primitive.detached?.();
      }),
    } as unknown as IPaneApi<Time>;
    return { api, primitives, requestUpdate };
  };
  const main = pane();
  const indicator = pane();
  let panes = [main.api, indicator.api];
  let sourcePane = main.api;
  let drawings: ChartDrawing[] = [
    {
      id: "vertical",
      kind: "vertical",
      anchors: [{ time: 120 as Time, price: -99999 }],
      color: "#2962ff",
      width: 2,
    },
  ];
  const scale = { timeToCoordinate: (time: Time) => Number(time), width: () => 800 };
  const chart = {
    paneSize: () => ({ width: chart.timeScale().width(), height: 150 }),
    chartElement: () => ({}),
    panes: () => panes,
    timeScale: () => scale,
  } as unknown as IChartApi;
  const series = { getPane: () => sourcePane, data: () => [] } as unknown as ISeriesApi<SeriesType>;
  const extension = createDrawingPaneExtensions(chart, series, () => drawings);
  const render = (target = indicator, height = 150) => {
    const strokes: Array<{
      from: number[];
      to: number[];
      color: string;
      width: number;
      opacity: number;
      dash: number[];
    }> = [];
    let from: number[] = [],
      to: number[] = [],
      dash: number[] = [];
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      globalAlpha: 1,
      lineCap: "",
      setLineDash: (value: number[]) => {
        dash = value;
      },
      moveTo: (...value: number[]) => {
        from = value;
      },
      lineTo: (...value: number[]) => {
        to = value;
      },
      stroke: () =>
        strokes.push({
          from,
          to,
          color: context.strokeStyle,
          width: context.lineWidth,
          opacity: context.globalAlpha,
          dash,
        }),
    };
    for (const primitive of target.primitives) {
      const renderer = primitive.paneViews!()[0]!.renderer()!;
      renderer.draw({
        useMediaCoordinateSpace: (callback: (scope: unknown) => void) =>
          callback({ context, mediaSize: { width: 800, height } }),
      } as unknown as Parameters<typeof renderer.draw>[0]);
    }
    return strokes;
  };
  return {
    extension,
    main,
    indicator,
    pane,
    chart,
    series,
    scale,
    render,
    observe,
    disconnect,
    mutation: () => mutation?.(),
    drawings: () => drawings,
    setDrawings: (value: ChartDrawing[]) => {
      drawings = value;
    },
    setPanes: (value: IPaneApi<Time>[]) => {
      panes = value;
    },
    setSource: (value: IPaneApi<Time>) => {
      sourcePane = value;
    },
  };
}

describe("vertical drawing pane extensions", () => {
  it("hits the topmost visible extended stroke only inside an attached indicator pane", () => {
    const f = fixture();
    const original = f.drawings()[0]!;
    const top = { ...original, id: "top" };
    f.setDrawings([original, top]);
    expect(f.extension.hitTest(124, 1)?.id).toBe("top");
    expect(f.extension.hitTest(128, 1)).toBeNull();
    expect(f.extension.hitTest(120, 0)).toBeNull();
    expect(f.extension.hitTest(120, 8)).toBeNull();
    expect(f.extension.hitTest(NaN, 1)).toBeNull();
    top.hidden = true;
    expect(f.extension.hitTest(120, 1)?.id).toBe(original.id);
    original.extendAcrossPanes = false;
    expect(f.extension.hitTest(120, 1)).toBeNull();
    f.extension.dispose();
    expect(f.extension.hitTest(120, 1)).toBeNull();
  });

  it("projects drag time into empty chart space without consulting a price scale", () => {
    const chart = {
      timeScale: () => ({
        coordinateToTime: () => null,
        timeToCoordinate: (time: Time) => Number(time) / 2,
      }),
    } as unknown as IChartApi;
    const series = {
      data: () => [{ time: 100 as Time }, { time: 200 as Time }],
      coordinateToPrice: vi.fn(() => null),
    } as unknown as ISeriesApi<SeriesType>;
    expect(drawingPaneTimeAtCoordinate(chart, series, 150)).toBe(300);
    expect(drawingPaneTimeAtCoordinate(chart, series, 25)).toBe(50);
    expect(series.coordinateToPrice).not.toHaveBeenCalled();
  });
  it("paints matching vertical styles across indicator heights independently of source price", () => {
    const f = fixture();
    expect(f.main.primitives.size).toBe(0);
    expect(f.indicator.primitives.size).toBe(1);
    expect(f.render()).toEqual([
      { from: [120, 0], to: [120, 150], color: "#2962ff", width: 2, opacity: 1, dash: [] },
    ]);
    Object.assign(f.drawings()[0]!, {
      color: "#ff0000",
      width: 4,
      lineStyle: "dotted",
      lineOpacity: 0.35,
    });
    f.extension.redraw();
    expect(f.render(f.indicator, 280)).toEqual([
      { from: [120, 0], to: [120, 280], color: "#ff0000", width: 4, opacity: 0.35, dash: [2, 4] },
    ]);
    f.scale.timeToCoordinate = () => 900;
    expect(f.render()).toEqual([]);
    f.extension.dispose();
  });

  it("responds to pane creation, removal, reordering and source movement through mutation callbacks", () => {
    const f = fixture();
    const added = f.pane();
    f.setPanes([added.api, f.indicator.api, f.main.api]);
    f.mutation();
    expect(added.primitives.size).toBe(1);
    expect(f.main.primitives.size).toBe(0);
    expect(f.indicator.api.attachPrimitive).toHaveBeenCalledTimes(1);
    f.setSource(added.api);
    f.mutation();
    expect(added.primitives.size).toBe(0);
    expect(f.main.primitives.size).toBe(1);
    f.setPanes([added.api, f.main.api]);
    f.mutation();
    expect(f.indicator.primitives.size).toBe(0);
    const updates = f.main.requestUpdate.mock.calls.length;
    f.mutation();
    expect(f.main.requestUpdate).toHaveBeenCalledTimes(updates);
    expect(f.observe).toHaveBeenCalledWith(expect.anything(), { childList: true, subtree: true });
    f.extension.dispose();
    expect(f.main.primitives.size).toBe(0);
    expect(f.disconnect).toHaveBeenCalledTimes(1);
    f.mutation();
    f.extension.redraw();
    expect(f.main.primitives.size).toBe(0);
  });

  it("cleans attachments for toggle-off, hidden, deleted or filtered drawings and restores them on undo", () => {
    const f = fixture();
    const vertical = f.drawings()[0]!;
    for (const drawings of [
      [{ ...vertical, extendAcrossPanes: false }],
      [{ ...vertical, hidden: true }],
      [{ ...vertical, kind: "crossline" as const }],
      [],
    ]) {
      f.setDrawings(drawings);
      f.extension.redraw();
      expect(f.indicator.primitives.size).toBe(0);
      f.setDrawings([vertical]);
      f.extension.redraw();
      expect(f.indicator.primitives.size).toBe(1);
      expect(f.render()).toHaveLength(1);
    }
    f.extension.dispose();
  });

  it("releases retained primitives even when chart teardown happens before owner cleanup", () => {
    const f = fixture();
    const stale = [...f.indicator.primitives][0]!;
    vi.spyOn(f.series, "getPane").mockImplementation(() => {
      throw Error("Disposed chart");
    });
    expect(f.mutation).not.toThrow();
    expect(f.indicator.primitives.size).toBe(0);
    const renderer = stale.paneViews!()[0]!.renderer()!;
    const paint = vi.fn();
    renderer.draw({ useMediaCoordinateSpace: paint } as unknown as Parameters<
      typeof renderer.draw
    >[0]);
    expect(paint).not.toHaveBeenCalled();
    f.extension.dispose();
    f.extension.dispose();
    expect(f.disconnect).toHaveBeenCalledTimes(1);
  });
});
