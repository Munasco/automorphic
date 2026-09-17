import { expect, it } from "vite-plus/test";
import { anchoredVwapGeometry, positionForecastGeometry } from "./drawingMarketGeometry";
import { drawingTimeValue, type ChartDrawing, type DrawingAnchor } from "./drawingGeometry";
import type { Candle } from "./chartIndicators";
const drawing: ChartDrawing = {
  id: "vwap",
  kind: "anchored-vwap",
  anchors: [{ time: 100 as DrawingAnchor["time"], price: 10 }],
  color: "#123456",
  width: 2,
};
const project = ({ time, price }: DrawingAnchor) => ({ x: Number(time), y: price });
const bars: Candle[] = [10, 20, 30].map((price, index) => ({
  time: 100 + index * 100,
  open: price,
  high: price,
  low: price,
  close: price,
  volume: index + 1,
}));
it("uses the anchored source volume and recomputes corrections without modifying candles", () => {
  const before = structuredClone(bars);
  const result = anchoredVwapGeometry(drawing, bars, project, drawingTimeValue);
  expect(result.lines).toHaveLength(2);
  expect(result.lines[0]!.from.y).toBe(10);
  expect(result.lines[0]!.to.y).toBeCloseTo(50 / 3);
  expect(result.lines[1]!.to.y).toBeCloseTo(140 / 6);
  const later = { ...drawing, anchors: [{ time: 200 as DrawingAnchor["time"], price: 20 }] };
  expect(anchoredVwapGeometry(later, bars, project, drawingTimeValue).lines[0]!.to.y).toBeCloseTo(
    130 / 5,
  );
  const revised = bars.map((bar, index) => (index === 2 ? { ...bar, volume: 0 } : bar));
  expect(
    anchoredVwapGeometry(drawing, revised, project, drawingTimeValue).lines[1]!.to.y,
  ).toBeCloseTo(50 / 3);
  expect(bars).toEqual(before);
});
it("does not fabricate missing anchor history or weights for absent volume", () => {
  expect(anchoredVwapGeometry(drawing, bars.slice(1), project, drawingTimeValue).lines).toEqual([]);
  expect(
    anchoredVwapGeometry(
      drawing,
      bars.map((bar) => ({ ...bar, volume: 0 })),
      project,
      drawingTimeValue,
    ).lines,
  ).toEqual([]);
  expect(
    anchoredVwapGeometry(
      drawing,
      [bars[0]!, { ...bars[1]!, volume: NaN }, bars[2]!],
      project,
      drawingTimeValue,
    ).lines,
  ).toEqual([]);
});

it("evaluates forecasts only from available chart history and preserves pending future projections", () => {
  const forecast: ChartDrawing = {
    ...drawing,
    kind: "position-forecast",
    anchors: [
      { time: 100 as DrawingAnchor["time"], price: 10 },
      { time: 300 as DrawingAnchor["time"], price: 25 },
    ],
  };
  const build = (input: Candle[]) =>
    positionForecastGeometry(forecast, input, project, drawingTimeValue, String).lines[0]!.label;
  expect(build(bars.slice(0, 2))).toContain("Pending");
  expect(build(bars)).toContain("Target not reached");
  expect(build([bars[0]!, { ...bars[1]!, high: 26 }, bars[2]!])).toContain("Target reached");
  expect(build(bars.slice(1))).toContain("History unavailable");
});
