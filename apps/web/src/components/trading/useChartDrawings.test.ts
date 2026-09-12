import { describe, expect, it, vi } from "vite-plus/test";
import type {
  Coordinate,
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { createChartDrawingSession } from "./useChartDrawings";

function fixture(symbol: string, initial: string | null = null) {
  let listener: ((event: MouseEventParams<Time>) => void) | undefined;
  const priceLines: unknown[] = [];
  const lines: Array<{ options: Record<string, unknown>; data: unknown[] }> = [];
  const series = {
    coordinateToPrice: (y: number) => 5000 - y,
    options: () => ({ priceScaleId: "right" }),
    getPane: () => ({ paneIndex: () => 0 }),
    createPriceLine: (options: unknown) => {
      priceLines.push(options);
      return options;
    },
    removePriceLine: (line: unknown) => {
      priceLines.splice(priceLines.indexOf(line), 1);
    },
  } as unknown as ISeriesApi<SeriesType>;
  const chart = {
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
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  const change = vi.fn();
  const open = () => createChartDrawingSession(chart, series, symbol, change, storage);
  const click = (time: number | undefined, y = 100, paneIndex = 0) =>
    listener?.({
      ...(time === undefined ? {} : { time: time as UTCTimestamp }),
      point: { x: 50 as Coordinate, y: y as Coordinate },
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
    expect(f.change).toHaveBeenLastCalledWith({ tool: "cursor", count: 1, pending: false });
    first.dispose();
    expect(f.priceLines).toEqual([]);
    expect(f.listener()).toBeUndefined();
    const second = f.open();
    expect(f.priceLines).toMatchObject([{ price: 4875 }]);
    second.clear();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    second.dispose();
  });

  it("sorts backward trend clicks, ignores same-candle clicks, and excludes the line from autoscaling", () => {
    const f = fixture("draw-test-trend"),
      session = f.open();
    session.setTool("trend");
    f.click(200, 100);
    expect(f.change).toHaveBeenLastCalledWith({ tool: "trend", count: 0, pending: true });
    f.click(200, 130);
    expect(f.lines).toHaveLength(0);
    f.click(100, 150);
    expect(f.lines[0]?.data).toEqual([
      { time: 100, value: 4850 },
      { time: 200, value: 4900 },
    ]);
    const trend = f.lines[0];
    if (!trend) throw new Error("Expected a rendered trend");
    expect((trend.options.autoscaleInfoProvider as () => null)()).toBeNull();
    expect(f.lines[0]?.options.priceScaleId).toBe("right");
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
    expect(f.change).toHaveBeenLastCalledWith({ tool: "cursor", count: 1, pending: false });
    session.undo();
    expect(f.priceLines).toHaveLength(0);
    expect(JSON.parse(f.saved()!)).toEqual([]);
    session.dispose();
  });

  it("ignores other panes and missing trend times; cancelling never persists half a drawing", () => {
    const f = fixture("draw-test-cancel"),
      session = f.open();
    session.setTool("trend");
    f.click(undefined);
    f.click(100, 100, 1);
    expect(f.change).toHaveBeenLastCalledWith({ tool: "trend", count: 0, pending: false });
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
});
