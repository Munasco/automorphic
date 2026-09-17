import { describe, expect, it } from "vite-plus/test";
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

describe("anchored VWAP price sources", () => {
  const asymmetric: Candle[] = [
    { time: 100, open: 10, high: 18, low: 6, close: 14, volume: 2 },
    { time: 200, open: 20, high: 32, low: 12, close: 24, volume: 3 },
    { time: 300, open: 16, high: 30, low: 8, close: 18, volume: 5 },
  ];

  it.each([
    ["open", 10, 16, 16],
    ["high", 18, 26.4, 28.2],
    ["low", 6, 9.6, 8.8],
    ["close", 14, 20, 19],
    ["hl2", 12, 18, 18.5],
    ["hlc3", 38 / 3, 56 / 3, 56 / 3],
    ["ohlc4", 12, 18, 18],
  ] as const)("weights %s by actual unequal candle volumes", (vwapSource, first, second, last) => {
    const before = structuredClone(asymmetric);
    const result = anchoredVwapGeometry(
      { ...drawing, vwapSource },
      asymmetric,
      project,
      drawingTimeValue,
    );
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]!.from.x).toBe(100);
    expect(result.lines[0]!.from.y).toBeCloseTo(first);
    expect(result.lines[0]!.to.y).toBeCloseTo(second);
    expect(result.lines[1]!.to.y).toBeCloseTo(last);
    expect(result.lines.map((line) => line.to.x)).toEqual([200, 300]);
    expect(asymmetric).toEqual(before);
  });

  it("preserves the legacy HLC3 curve and recomputes source and volume corrections", () => {
    const build = (input: Candle[], vwapSource?: ChartDrawing["vwapSource"]) =>
      anchoredVwapGeometry(
        { ...drawing, ...(vwapSource ? { vwapSource } : {}) },
        input,
        project,
        drawingTimeValue,
      );
    expect(build(asymmetric)).toEqual(build(asymmetric, "hlc3"));
    const revised = asymmetric.map((bar, index) =>
      index === 2 ? { ...bar, open: 28, volume: 10 } : bar,
    );
    // Previous weighted opens total 80 over volume 5; the revised last bar adds 280 / 10.
    expect(build(revised, "open").lines.at(-1)!.to.y).toBeCloseTo(24);
    // Changing only the selected source uses the same revised volume weights.
    expect(build(revised, "close").lines.at(-1)!.to.y).toBeCloseTo(280 / 15);
    expect(build(asymmetric, "open").lines.at(-1)!.to.y).toBeCloseTo(16);
  });

  it.each([
    ["open", "open"],
    ["high", "high"],
    ["low", "low"],
    ["close", "close"],
    ["hl2", "low"],
    ["hlc3", "close"],
    ["ohlc4", "open"],
  ] as const)(
    "stops %s at a missing required %s rather than bridging cumulative weights",
    (vwapSource, field) => {
      const input = asymmetric.map((bar, index) => (index === 1 ? { ...bar, [field]: NaN } : bar));
      expect(
        anchoredVwapGeometry({ ...drawing, vwapSource }, input, project, drawingTimeValue).lines,
      ).toEqual([]);
    },
  );

  it("ignores unused price components but still requires real volume and valid time", () => {
    const invalidClose = asymmetric.map((bar) => ({ ...bar, close: NaN }));
    expect(
      anchoredVwapGeometry(
        { ...drawing, vwapSource: "open" },
        invalidClose,
        project,
        drawingTimeValue,
      ).lines.at(-1)!.to.y,
    ).toBeCloseTo(16);
    const invalidOpen = asymmetric.map((bar) => ({ ...bar, open: NaN }));
    expect(anchoredVwapGeometry(drawing, invalidOpen, project, drawingTimeValue)).toEqual(
      anchoredVwapGeometry(drawing, asymmetric, project, drawingTimeValue),
    );
    for (const patch of [{ volume: NaN }, { volume: -1 }, { time: NaN }]) {
      const input = [asymmetric[0]!, { ...asymmetric[1]!, ...patch }, asymmetric[2]!];
      expect(
        anchoredVwapGeometry({ ...drawing, vwapSource: "open" }, input, project, drawingTimeValue)
          .lines,
      ).toEqual([]);
    }
  });
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
