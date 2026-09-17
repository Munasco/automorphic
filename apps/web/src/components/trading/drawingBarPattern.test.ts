import { describe, expect, it } from "vite-plus/test";
import { captureBarPattern, normalizeBarPattern, barPatternGeometry } from "./drawingBarPattern";
import { parseChartDrawings, type ChartDrawing, type DrawingAnchor } from "./drawingGeometry";
import type { Candle } from "./chartIndicators";
const bars: Candle[] = [100, 200, 300].map((time, index) => ({
  time,
  open: 10 + index,
  high: 14 + index,
  low: 8 + index,
  close: 12 + index,
  volume: 1,
}));
const shape = (): ChartDrawing => ({
  id: "pattern",
  kind: "bars-pattern",
  anchors: [
    { time: 100 as DrawingAnchor["time"], price: 12 },
    { time: 300 as DrawingAnchor["time"], price: 14 },
  ],
  pattern: captureBarPattern(bars, 100, 300)!,
  color: "#123456",
  width: 2,
});
const project = ({ time, price }: DrawingAnchor) => ({ x: Number(time), y: 500 - price });
it("freezes actual OHLC, persists exact values, and moves the copied pattern independently", () => {
  const drawing = shape();
  const saved = JSON.stringify(drawing.pattern);
  const geometry = barPatternGeometry(drawing, project);
  expect(geometry.lines).toHaveLength(9);
  expect(geometry.lines[0]).toEqual({ from: { x: 100, y: 486 }, to: { x: 100, y: 492 } });
  const moved = {
    ...drawing,
    anchors: drawing.anchors.map((anchor) => ({
      time: (Number(anchor.time) + 300) as DrawingAnchor["time"],
      price: anchor.price + 20,
    })),
  };
  expect(barPatternGeometry(moved, project).lines[0]).toEqual({
    from: { x: 400, y: 466 },
    to: { x: 400, y: 472 },
  });
  const restored = parseChartDrawings(JSON.stringify([drawing]));
  expect(restored).toEqual([drawing]);
  bars[0]!.close = 11;
  expect(JSON.stringify(drawing.pattern)).toBe(saved);
  bars[0]!.close = 12;
});
it("rejects malformed snapshots, excessive ranges, absent history and impossible OHLC", () => {
  for (const value of [
    null,
    [],
    [[1, 2, 0, 1]],
    [
      [1, 0, 2, 3],
      [1, 2, 0, 1],
    ],
    [
      [1, 2, 0, NaN],
      [1, 2, 0, 1],
    ],
    Array.from({ length: 101 }, () => [1, 2, 0, 1]),
  ])
    expect(normalizeBarPattern(value)).toBeNull();
  expect(captureBarPattern(bars, 0, 300)).toBeNull();
  expect(captureBarPattern(bars, 100, 400)).toBeNull();
  expect(parseChartDrawings(JSON.stringify([{ ...shape(), pattern: [[1, 0, 2, 3]] }]))).toEqual([]);
});

describe("frozen bars pattern display sources", () => {
  const asymmetric = (): ChartDrawing => ({
    ...shape(),
    anchors: [
      { time: 100 as DrawingAnchor["time"], price: 14 },
      { time: 300 as DrawingAnchor["time"], price: 18 },
    ],
    pattern: [
      [10, 18, 6, 14],
      [20, 32, 12, 24],
      [16, 30, 8, 18],
    ],
  });

  it("preserves legacy OHLC sticks when mode is absent or explicitly bars", () => {
    const drawing = asymmetric();
    const before = structuredClone(drawing);
    const legacy = barPatternGeometry(drawing, project);
    expect(legacy.lines).toHaveLength(9);
    expect(barPatternGeometry({ ...drawing, patternMode: "bars" }, project)).toEqual(legacy);
    expect(legacy.lines[0]).toEqual({ from: { x: 100, y: 482 }, to: { x: 100, y: 494 } });
    expect(drawing).toEqual(before);
  });

  it.each([
    ["open", [10, 20, 16]],
    ["high", [18, 32, 30]],
    ["low", [6, 12, 8]],
    ["close", [14, 24, 18]],
  ] as const)(
    "connects frozen %s values using the same placement and resize transform",
    (patternMode, values) => {
      const drawing = { ...asymmetric(), patternMode };
      const before = structuredClone(drawing);
      const result = barPatternGeometry(drawing, project);
      expect(result.lines).toHaveLength(2);
      expect(result.lines.map((line) => ({ from: line.from, to: line.to }))).toEqual([
        { from: { x: 100, y: 500 - values[0] }, to: { x: 200, y: 500 - values[1] } },
        { from: { x: 200, y: 500 - values[1] }, to: { x: 300, y: 500 - values[2] } },
      ]);
      expect(result.handles).toEqual([
        { x: 100, y: 486 },
        { x: 300, y: 482 },
      ]);
      const resized: ChartDrawing = {
        ...drawing,
        anchors: [
          { time: 400 as DrawingAnchor["time"], price: 34 },
          { time: 800 as DrawingAnchor["time"], price: 42 },
        ],
      };
      const resizedLines = barPatternGeometry(resized, project).lines;
      expect(resizedLines.map((line) => ({ from: line.from, to: line.to }))).toEqual([
        { from: { x: 400, y: 494 - 2 * values[0] }, to: { x: 600, y: 494 - 2 * values[1] } },
        { from: { x: 600, y: 494 - 2 * values[1] }, to: { x: 800, y: 494 - 2 * values[2] } },
      ]);
      expect(parseChartDrawings(JSON.stringify([drawing]))).toEqual([drawing]);
      expect(drawing).toEqual(before);
      expect(resized.pattern).toEqual(before.pattern);
    },
  );
});
