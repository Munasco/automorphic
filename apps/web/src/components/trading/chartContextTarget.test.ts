import { describe, expect, it } from "vite-plus/test";
import { chartContextTarget } from "./chartContextTarget";
const pane = { left: 500, top: 180, width: 640, height: 400 };
describe("native chart context target", () => {
  it("routes only the primary right price axis to its menu", () => {
    expect(chartContextTarget(1100, 300, pane, 70)).toBe("price-axis");
    expect(chartContextTarget(1070, 180, pane, 70)).toBe("price-axis");
    for (const [x, y] of [
      [1069.9, 300],
      [800, 300],
      [1140, 300],
      [1100, 179],
      [1100, 580],
      [1100, 720],
    ])
      expect(chartContextTarget(x!, y!, pane, 70)).toBe("chart");
  });
  it("uses scrolled viewport offsets and fractional dimensions", () => {
    const scrolled = { left: -100.5, top: -40.25, width: 400.75, height: 300.5 };
    expect(chartContextTarget(299.5, 10, scrolled, 60.25)).toBe("price-axis");
    expect(chartContextTarget(239.9, 10, scrolled, 60.25)).toBe("chart");
    expect(chartContextTarget(299.5, 260.25, scrolled, 60.25)).toBe("chart");
  });
  it.each([0, -1, 641, NaN, Infinity])("rejects invalid or hidden axis width %s", (width) => {
    expect(chartContextTarget(1100, 300, pane, width)).toBe("chart");
  });
  it("rejects non-finite pointers and unusable pane rectangles", () => {
    expect(chartContextTarget(NaN, 300, pane, 70)).toBe("chart");
    expect(chartContextTarget(1100, Infinity, pane, 70)).toBe("chart");
    for (const invalid of [
      { width: 0 },
      { height: 0 },
      { height: -1 },
      { left: NaN },
      { top: Infinity },
      { width: Infinity },
    ])
      expect(chartContextTarget(1100, 300, { ...pane, ...invalid }, 70)).toBe("chart");
  });
});
