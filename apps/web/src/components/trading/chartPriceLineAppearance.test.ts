import { expect, it } from "vite-plus/test";
import { LineStyle } from "lightweight-charts";
import {
  DEFAULT_PRICE_LINE_APPEARANCE,
  normalizePriceLineAppearance,
  priceLineAppearanceOptions,
  updatePriceLineAppearance,
} from "./chartPriceLineAppearance";

it.each([undefined, null, [], "bad", 12])("restores legacy defaults for %j", (value) => {
  expect(normalizePriceLineAppearance(value)).toEqual(DEFAULT_PRICE_LINE_APPEARANCE);
});
it("normalizes fields independently without retaining unknown settings", () => {
  expect(
    normalizePriceLineAppearance({ color: "#ABCDEF", width: 9, style: "solid", hidden: true }),
  ).toEqual({ color: "#ABCDEF", width: 1, style: "solid" });
  expect(normalizePriceLineAppearance({ color: "red", width: 4, style: "bad" })).toEqual({
    color: null,
    width: 4,
    style: "dashed",
  });
});
it.each([
  { color: "red" },
  { color: undefined },
  { width: 0 },
  { width: 2.5 },
  { width: "2" },
  { style: "bad" },
  { other: true },
])("rejects invalid edits atomically: %j", (patch) => {
  expect(updatePriceLineAppearance(DEFAULT_PRICE_LINE_APPEARANCE, patch as never)).toBeNull();
});
it("preserves other fields during edits and restores automatic color", () => {
  const current = { color: "#123456", width: 3, style: "dotted" } as const;
  expect(updatePriceLineAppearance(current, { color: null })).toEqual({ ...current, color: null });
  expect(updatePriceLineAppearance(current, { width: 4 })).toEqual({ ...current, width: 4 });
  expect(current.width).toBe(3);
});
it.each([
  ["solid", LineStyle.Solid],
  ["dotted", LineStyle.Dotted],
  ["dashed", LineStyle.Dashed],
] as const)("maps %s for both native and quote price lines", (style, lineStyle) => {
  expect(priceLineAppearanceOptions({ color: "#123456", width: 3, style }, "#ff0000")).toEqual({
    color: "#123456",
    lineWidth: 3,
    lineStyle,
  });
  expect(priceLineAppearanceOptions({ color: null, width: 1, style }, "").color).toBe("");
  expect(priceLineAppearanceOptions({ color: null, width: 1, style }, "#ff0000").color).toBe(
    "#ff0000",
  );
});
