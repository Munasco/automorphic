import { expect, it } from "vite-plus/test";
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
