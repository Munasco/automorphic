import { describe, expect, it } from "vite-plus/test";
import type { Time } from "lightweight-charts";
import { calculateDrawingStats, formatDrawingStats } from "./drawingStats";

describe("drawing statistics", () => {
  it("uses signed actual price changes, the instrument tick increment, and logical bar spacing", () => {
    const stats = calculateDrawingStats({
      anchors: [
        { time: 100 as Time, price: 100 },
        { time: 3700 as Time, price: 102.5 },
      ],
      points: [
        { x: 20, y: 40 },
        { x: 23, y: 36 },
      ],
      logical: [15.5, 20],
      minMove: 0.25,
    });
    expect(stats).toEqual({
      price: 2.5,
      percent: 2.5,
      ticks: 10,
      bars: 4.5,
      datetime: 3600,
      distance: 5,
      angle: expect.any(Number),
    });
    expect(stats.angle).toBeCloseTo(53.130102);
    expect(
      formatDrawingStats(
        stats,
        ["price", "percent", "ticks", "bars", "datetime", "distance", "angle"],
        (value) => value.toFixed(2),
      ),
    ).toEqual(["2.50", "2.5%", "10 ticks", "4.5 bars", "1h", "5 px", "53.13°"]);
  });

  it("keeps price direction while measuring positive elapsed time and bar range", () => {
    const stats = calculateDrawingStats({
      anchors: [
        { time: { year: 2026, month: 1, day: 3 }, price: 10 },
        { time: "2026-01-01", price: 8 },
      ],
      logical: [12, 2],
      minMove: 0.5,
    });
    expect(stats).toMatchObject({ price: -2, percent: -20, ticks: -4, bars: 10, datetime: 172800 });
    expect(formatDrawingStats(stats, ["datetime"], String)).toEqual(["2d"]);
  });

  it("does not invent percentages, tick sizes, logical bars or angles when inputs cannot define them", () => {
    const stats = calculateDrawingStats({
      anchors: [
        { time: 100 as Time, price: 0 },
        { time: 100 as Time, price: 10 },
      ],
      points: [
        { x: 20, y: 40 },
        { x: 20, y: 40 },
      ],
      logical: [null, 2],
      minMove: 0,
    });
    expect(stats).toEqual({
      price: 10,
      percent: null,
      ticks: null,
      bars: null,
      datetime: 0,
      distance: 0,
      angle: null,
    });
    expect(formatDrawingStats(stats, ["percent", "ticks", "bars", "angle"], String)).toEqual([
      "Percent: —",
      "Ticks: —",
      "Bars: —",
      "Angle: —",
    ]);
    expect(Object.values(calculateDrawingStats({ anchors: [] }))).toEqual(Array(7).fill(null));
  });

  it("uses screen geometry for distance and angle without changing price or time statistics", () => {
    const anchors = [
      { time: 100 as Time, price: 100 },
      { time: 160 as Time, price: 110 },
    ];
    const before = calculateDrawingStats({
      anchors,
      points: [
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ],
    });
    const zoomed = calculateDrawingStats({
      anchors,
      points: [
        { x: 0, y: 20 },
        { x: 10, y: 0 },
      ],
    });
    expect(before.angle).toBe(45);
    expect(zoomed.angle).toBeCloseTo(63.434949);
    expect(zoomed.distance).toBeCloseTo(Math.sqrt(500));
    expect(zoomed.price).toBe(before.price);
    expect(zoomed.datetime).toBe(before.datetime);
  });
});
