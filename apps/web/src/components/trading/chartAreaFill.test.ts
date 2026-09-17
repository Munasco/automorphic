import { expect, it } from "vite-plus/test";
import { chartAreaFillColors, normalizeChartAreaFill, updateChartAreaFill } from "./chartAreaFill";

it("normalizes independent endpoints and rejects invalid patches without losing siblings", () => {
  const fill = normalizeChartAreaFill({
    topColor: "#ff8800",
    bottomColor: "bad",
    topOpacity: 101,
    bottomOpacity: 0,
  });
  expect(fill).toEqual({
    topColor: "#ff8800",
    bottomColor: null,
    topOpacity: 33,
    bottomOpacity: 0,
  });
  for (const patch of [
    null,
    [],
    { topColor: "red" },
    { topOpacity: NaN },
    { bottomOpacity: 1.5 },
    { bottomOpacity: -1 },
    { unknown: 1 },
  ])
    expect(updateChartAreaFill(fill, patch)).toBeNull();
  expect(updateChartAreaFill(fill, { bottomColor: "#2233aa", bottomOpacity: 100 })).toEqual({
    ...fill,
    bottomColor: "#2233aa",
    bottomOpacity: 100,
  });
  expect(fill.bottomColor).toBeNull();
});
it("keeps explicit colors while inherited endpoints follow the current line color, including zero opacity", () => {
  const fill = normalizeChartAreaFill({ topColor: "#ff8800", topOpacity: 75, bottomOpacity: 0 });
  expect(chartAreaFillColors(fill, "#2233aa")).toEqual({
    topColor: "rgba(255, 136, 0, 0.75)",
    bottomColor: "rgba(34, 51, 170, 0)",
  });
  expect(chartAreaFillColors(fill, "#55aa77")).toEqual({
    topColor: "rgba(255, 136, 0, 0.75)",
    bottomColor: "rgba(85, 170, 119, 0)",
  });
});
