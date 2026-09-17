import { expect, it } from "vite-plus/test";
import { ghostFeedGeometry } from "./ghostFeedGeometry";
import {
  parseChartDrawings,
  sanitizeDrawingSettings,
  type ChartDrawing,
  type DrawingAnchor,
} from "./drawingGeometry";
const drawing: ChartDrawing = {
  id: "ghost",
  kind: "ghost-feed",
  anchors: [
    { time: 100 as DrawingAnchor["time"], price: 10 },
    { time: 200 as DrawingAnchor["time"], price: 20 },
    { time: 300 as DrawingAnchor["time"], price: 15 },
  ],
  color: "#123456",
  width: 2,
  ghostRange: 4,
  ghostVariance: 1,
  ghostBars: 4,
};
const project = ({ time, price }: DrawingAnchor) => ({ x: Number(time), y: 100 - price });
it("generates deterministic hypothetical candles following editable path endpoints", () => {
  const before = structuredClone(drawing);
  const result = ghostFeedGeometry(drawing, project);
  expect(result.handles).toHaveLength(3);
  expect(result.polygons).toHaveLength(8);
  expect(result.polygons?.[3]?.points[2]?.y).toBe(80);
  expect(result.polygons?.[7]?.points[2]?.y).toBe(85);
  expect(result.lines.at(-1)?.label).toBe("Hypothetical candles");
  expect(ghostFeedGeometry(drawing, project)).toEqual(result);
  expect(drawing).toEqual(before);
  expect(parseChartDrawings(JSON.stringify([drawing]))).toEqual([drawing]);
  expect(ghostFeedGeometry({ ...drawing, ghostBars: 2 }, project).polygons).toHaveLength(4);
  expect(ghostFeedGeometry({ ...drawing, hidden: true }, project).lines).toEqual([]);
});
it("normalizes finite bounded range, variance and candle count", () => {
  expect(sanitizeDrawingSettings({ ghostRange: 4, ghostVariance: 0, ghostBars: 3 })).toMatchObject({
    ghostRange: 4,
    ghostVariance: 0,
    ghostBars: 3,
  });
  expect(
    sanitizeDrawingSettings({ ghostRange: -1, ghostVariance: Infinity, ghostBars: 101 }),
  ).toEqual({});
});
