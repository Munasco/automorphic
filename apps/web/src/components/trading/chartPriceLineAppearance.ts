import { LineStyle } from "lightweight-charts";

export type ChartPriceLineAppearance = {
  color: string | null;
  width: 1 | 2 | 3 | 4;
  style: "solid" | "dotted" | "dashed";
};
export const DEFAULT_PRICE_LINE_APPEARANCE: Readonly<ChartPriceLineAppearance> = Object.freeze({
  color: null,
  width: 1,
  style: "dashed",
});
const validColor = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value));
const validWidth = (value: unknown): value is ChartPriceLineAppearance["width"] =>
  value === 1 || value === 2 || value === 3 || value === 4;
const validStyle = (value: unknown): value is ChartPriceLineAppearance["style"] =>
  value === "solid" || value === "dotted" || value === "dashed";
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function normalizePriceLineAppearance(value: unknown): ChartPriceLineAppearance {
  const saved = record(value) ? value : {};
  return {
    color: validColor(saved.color) ? saved.color : null,
    width: validWidth(saved.width) ? saved.width : 1,
    style: validStyle(saved.style) ? saved.style : "dashed",
  };
}

export function updatePriceLineAppearance(
  current: ChartPriceLineAppearance,
  patch: Partial<ChartPriceLineAppearance>,
): ChartPriceLineAppearance | null {
  if (!record(patch)) return null;
  for (const [key, value] of Object.entries(patch)) {
    if (
      !(key === "color"
        ? validColor(value)
        : key === "width"
          ? validWidth(value)
          : key === "style" && validStyle(value))
    )
      return null;
  }
  return { ...current, ...patch };
}

/** Empty native color inherits the series color; quote guides supply their current trade color. */
export function priceLineAppearanceOptions(
  appearance: ChartPriceLineAppearance,
  fallbackColor: string,
) {
  return {
    color: appearance.color ?? fallbackColor,
    lineWidth: appearance.width,
    lineStyle: { solid: LineStyle.Solid, dotted: LineStyle.Dotted, dashed: LineStyle.Dashed }[
      appearance.style
    ],
  };
}
