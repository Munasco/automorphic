import { describe, expect, it, vi } from "vite-plus/test";
import type { IChartApi, ISeriesApi, Logical } from "lightweight-charts";
import type { InitialBalanceRange } from "./initialBalance";
import { DEFAULT_INITIAL_BALANCE } from "./indicatorCatalog";
import {
  createInitialBalancePrimitive,
  initialBalanceGeometry,
  initialBalanceLevels,
  projectInitialBalanceTime,
} from "./initialBalancePrimitive";

const range: InitialBalanceRange = {
  session: "2026-09-14",
  startTime: 0,
  endTime: 3600,
  sessionEndTime: 23400,
  lastTime: 3900,
  high: 110,
  low: 100,
  volume: 1200,
  status: "complete",
};

describe("initial balance visual geometry", () => {
  it("projects quarter and expansion levels from the observed IB range", () => {
    const levels = initialBalanceLevels(range, DEFAULT_INITIAL_BALANCE);
    expect(levels.map((level) => [level.label, level.price])).toEqual([
      ["IBH", 110],
      ["IBL", 100],
      ["50%", 105],
      ["25%", 102.5],
      ["75%", 107.5],
      ["+0.5x", 115],
      ["-0.5x", 95],
      ["+1.0x", 120],
      ["-1.0x", 90],
    ]);
    expect(levels.slice(0, 2).map((level) => [level.dashed, level.width])).toEqual([
      [false, 2],
      [false, 2],
    ]);
    expect(levels.slice(2).every((level) => level.dashed && level.width === 1)).toBe(true);
    const shape = initialBalanceGeometry(
      range,
      DEFAULT_INITIAL_BALANCE,
      (time) => time / 60,
      (price) => 200 - price,
      500,
    )!;
    expect(shape.box).toEqual({ left: 0, right: 60, top: 90, bottom: 100 });
    expect(shape.right).toBe(390);
    expect(
      initialBalanceGeometry(
        { ...range, status: "incomplete" },
        DEFAULT_INITIAL_BALANCE,
        (time) => time,
        (price) => price,
        500,
      ),
    ).toBeNull();
  });

  it("clips projections to the resized viewport without moving session or box boundaries", () => {
    const original = initialBalanceGeometry(
      range,
      DEFAULT_INITIAL_BALANCE,
      (time) => time / 60,
      (price) => price,
      300,
    )!;
    const expanded = initialBalanceGeometry(
      range,
      DEFAULT_INITIAL_BALANCE,
      (time) => time / 60,
      (price) => price,
      800,
    )!;
    expect(original.right).toBe(296);
    expect(expanded.right).toBe(390);
    expect(expanded.box).toEqual(original.box);
    expect(
      initialBalanceGeometry(
        range,
        DEFAULT_INITIAL_BALANCE,
        (time) => time / 60 - 400,
        (price) => price,
        300,
      ),
    ).toBeNull();
  });

  it("extends time coordinates into empty future space without creating timeline bars", () => {
    const bars = Object.freeze(
      [1000, 1300].map((time) =>
        Object.freeze({ time, open: 100, close: 100, high: 101, low: 99, volume: 1 }),
      ),
    );
    const chart = {
      timeScale: () => ({
        timeToCoordinate: (time: number) => (time === 1000 ? 0 : time === 1300 ? 10 : null),
        coordinateToLogical: (x: number) => x / 10,
        logicalToCoordinate: (logical: number) => logical * 10,
      }),
    } as unknown as IChartApi;
    expect(projectInitialBalanceTime(chart, bars, 5, 2200)).toBe(40);
    expect(projectInitialBalanceTime(chart, bars, 5, 1150)).toBe(5);
    expect(projectInitialBalanceTime(chart, bars, 5, 700)).toBe(-10);
    expect(bars.map((bar) => bar.time)).toEqual([1000, 1300]);
  });

  it("draws the shaded opening hour and attached labels, and honors all visibility switches", () => {
    const chart = {
      timeScale: () => ({
        width: () => 1000,
        timeToCoordinate: (time: number) => time / 6,
        logicalToCoordinate: (logical: number) => logical,
      }),
      options: () => ({ layout: { fontFamily: "Inter" } }),
    } as unknown as IChartApi;
    const series = {
      priceToCoordinate: (price: number) => 500 - price,
      priceFormatter: () => ({ format: (price: number) => price.toFixed(2) }),
      getPane: () => ({ getHeight: () => 500 }),
    } as unknown as ISeriesApi<"Line">;
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
      setLineDash: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      measureText: (label: string) => ({ width: label.length * 6 }),
    };
    const plugin = createInitialBalancePrimitive(chart, series);
    plugin.update(range, DEFAULT_INITIAL_BALANCE, [], 5);
    const draw = () => {
      for (const view of plugin.primitive.paneViews!()) {
        const renderer = view.renderer()!;
        renderer.draw({
          useMediaCoordinateSpace: (callback: (scope: { context: typeof ctx }) => void) =>
            callback({ context: ctx }),
        } as unknown as Parameters<typeof renderer.draw>[0]);
      }
    };
    draw();
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 390, 600, 10);
    expect(ctx.stroke).toHaveBeenCalledTimes(9);
    expect(ctx.fillText.mock.calls.map((call) => call[0])).toEqual([
      "IBH 110.00",
      "IBL 100.00",
      "50%",
      "25%",
      "75%",
      "+0.5x",
      "-0.5x",
      "+1.0x",
      "-1.0x",
    ]);
    expect(plugin.primitive.autoscaleInfo!(0 as Logical, 1000 as Logical)?.priceRange).toEqual({
      minValue: 90,
      maxValue: 120,
    });
    ctx.fillRect.mockClear();
    ctx.stroke.mockClear();
    ctx.fillText.mockClear();
    plugin.update(
      range,
      {
        ...DEFAULT_INITIAL_BALANCE,
        showBox: false,
        showLabels: false,
        showMidpoint: false,
        showQuarters: false,
        showExpansions: false,
      },
      [],
      5,
    );
    draw();
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(plugin.primitive.autoscaleInfo!(0 as Logical, 1000 as Logical)?.priceRange).toEqual({
      minValue: 100,
      maxValue: 110,
    });
  });
});
