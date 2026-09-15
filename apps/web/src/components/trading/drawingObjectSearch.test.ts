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
  expect(drawingMatchesSearch({ ...drawing, name: undefined }, "Trendline")).toBe(true);
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
