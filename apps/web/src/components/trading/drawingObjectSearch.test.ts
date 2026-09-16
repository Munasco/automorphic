import { expect, it } from "vite-plus/test";
import { drawingMatchesSearch, drawingLabel, objectTreeMatches } from "./drawingObjectSearch";
import type { ChartDrawing } from "./drawingGeometry";
const drawing = {
  id: "one",
  kind: "trend",
  name: "NQ support",
  anchors: [
    { time: 1, price: 2 },
    { time: 2, price: 3 },
  ],
} as ChartDrawing;
it("matches names, tool types and annotation text with case-insensitive multiword search", () => {
  expect(drawingMatchesSearch(drawing, "  SUPPORT nq ")).toBe(true);
  expect(drawingMatchesSearch(drawing, "trend support")).toBe(true);
  expect(drawingMatchesSearch(drawing, "trendline support")).toBe(true);
  const unnamed = { ...drawing };
  delete unnamed.name;
  expect(drawingMatchesSearch(unnamed, "Trendline")).toBe(true);
  expect(
    drawingMatchesSearch({ ...drawing, kind: "text", text: "Wait for the retest" }, "retest"),
  ).toBe(true);
  expect(drawingMatchesSearch(drawing, "gold")).toBe(false);
  expect(drawingMatchesSearch(drawing, "  ")).toBe(true);
  expect(drawingLabel(drawing)).toBe("NQ support");
});
it("finds indicator periods and preserves hidden/locked objects without changing records", () => {
  expect(objectTreeMatches("rsi 14", "RSI 14")).toBe(true);
  expect(objectTreeMatches("rsi 7", "RSI 14")).toBe(false);
  const object = { ...drawing, hidden: true, locked: true };
  const before = structuredClone(object);
  expect(drawingMatchesSearch(object, "support")).toBe(true);
  expect(object).toEqual(before);
});

it("combines type filters with search without excluding hidden objects or changing order", async () => {
  const { filterChartObjects } = await import("./drawingObjectSearch");
  const hidden = { ...drawing, id: "hidden", hidden: true, name: "NQ support two" };
  const objects = [drawing, hidden];
  const indicators = [
    { label: "RSI 14", hidden: true },
    { label: "SMA 20", hidden: false },
  ];
  expect(filterChartObjects(objects, indicators, "", "all")).toEqual({
    drawings: objects,
    indicators,
  });
  expect(filterChartObjects(objects, indicators, "support", "drawings")).toEqual({
    drawings: objects,
    indicators: [],
  });
  expect(filterChartObjects(objects, indicators, "rsi 14", "drawings")).toEqual({
    drawings: [],
    indicators: [],
  });
  expect(filterChartObjects(objects, indicators, "rsi 14", "indicators")).toEqual({
    drawings: [],
    indicators: [indicators[0]],
  });
  const result = filterChartObjects(objects, indicators, "two", "all");
  expect(result.drawings).toEqual([hidden]);
  expect(result.drawings[0]).toBe(hidden);
  expect(objects).toEqual([drawing, hidden]);
});
