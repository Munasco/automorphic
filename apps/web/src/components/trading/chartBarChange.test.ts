import { expect, it } from "vite-plus/test";
import { chartBarChange, formatChartBarChange } from "./chartBarChange";

it.each([
  [105, 100, 5, 5, "+5.00 (+5.00%)"],
  [95, 100, -5, -5, "-5.00 (-5.00%)"],
  [100, 100, 0, 0, "0.00 (0.00%)"],
  [-90, -100, 10, 10, "+10.00 (+10.00%)"],
  [-110, -100, -10, -10, "-10.00 (-10.00%)"],
  [10, 0, 10, null, "+10.00 (—)"],
  [0, 0, 0, null, "0.00 (—)"],
  [101.25, 100, 1.25, 1.25, "+1.25 (+1.25%)"],
] as const)("compares close %s to previous close %s", (close, previous, points, percent, label) => {
  const change = chartBarChange(close, previous);
  expect(change).toEqual({ points, percent });
  expect(formatChartBarChange(change)).toBe(label);
});
it.each([
  [100, undefined],
  [NaN, 100],
  [100, Infinity],
  [Infinity, 100],
  [Number.MAX_VALUE, -Number.MAX_VALUE],
] as const)("omits missing or non-finite changes", (close, previous) => {
  expect(chartBarChange(close, previous)).toBeNull();
  expect(formatChartBarChange(chartBarChange(close, previous))).toBe("—");
});
it("does not display a negative zero or infinite percentage", () => {
  expect(formatChartBarChange(chartBarChange(100, 100.00001))).toBe("0.00 (0.00%)");
  expect(chartBarChange(1, Number.MIN_VALUE)).toEqual({ points: 1, percent: null });
});
