import { sanitizeDrawingVisibility, type DrawingVisibility } from "./drawingVisibility";
import { getIndicatorDefinition, type IndicatorKey } from "./indicatorCatalog";
import type { IndicatorStyle } from "./indicatorDefinition";

export type IndicatorAppearance = IndicatorStyle & {
  displayName?: string;
  plots?: Record<string, IndicatorStyle>;
  histogramPriceLabel?: boolean;
  timeframeVisibility?: DrawingVisibility;
};
const validColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value);
function normalizeStyle(value: unknown): IndicatorStyle {
  if (!value || typeof value !== "object") return {};
  const input = value as IndicatorStyle;
  return {
    ...(validColor(input.color) ? { color: input.color } : {}),
    ...(typeof input.visible === "boolean" ? { visible: input.visible } : {}),
    ...(typeof input.showPriceLabel === "boolean" ? { showPriceLabel: input.showPriceLabel } : {}),
    ...(typeof input.opacity === "number" &&
    Number.isFinite(input.opacity) &&
    input.opacity >= 0 &&
    input.opacity <= 1
      ? { opacity: input.opacity }
      : {}),
    ...(typeof input.lineWidth === "number" && [1, 2, 3, 4].includes(input.lineWidth)
      ? { lineWidth: input.lineWidth }
      : {}),
  };
}
/** Preserve old overall styles; accept saved overrides only for plots declared by the indicator. */
export function normalizeIndicatorAppearance(
  key: IndicatorKey,
  value: unknown,
): IndicatorAppearance {
  const next: IndicatorAppearance = normalizeStyle(value);
  if (!value || typeof value !== "object") return next;
  if (
    "displayName" in value &&
    typeof value.displayName === "string" &&
    value.displayName.trim().length <= 80
  )
    next.displayName = value.displayName.trim();
  if ("timeframeVisibility" in value)
    next.timeframeVisibility = sanitizeDrawingVisibility(value.timeframeVisibility);
  const histogramPriceLabel = (value as IndicatorAppearance).histogramPriceLabel;
  if (typeof histogramPriceLabel === "boolean") next.histogramPriceLabel = histogramPriceLabel;
  const plots = (value as IndicatorAppearance).plots;
  if (plots && typeof plots === "object") {
    const result: Record<string, IndicatorStyle> = {};
    for (const style of getIndicatorDefinition(key).styles) {
      const cleaned = normalizeStyle(plots[style.key]);
      if (Object.keys(cleaned).length) result[style.key] = cleaned;
    }
    if (Object.keys(result).length) next.plots = result;
  }
  return next;
}
export function resolveIndicatorStyle(
  key: IndicatorKey,
  plot: string,
  appearance: IndicatorAppearance = {},
) {
  const definition = getIndicatorDefinition(key);
  const defaults = definition.styles.find((style) => style.key === plot);
  const saved = appearance.plots?.[plot];
  const showPriceLabel = saved?.showPriceLabel ?? appearance.showPriceLabel;
  return {
    visible: saved?.visible ?? appearance.visible ?? defaults?.visible ?? true,
    ...(showPriceLabel === undefined ? {} : { showPriceLabel }),
    opacity: saved?.opacity ?? appearance.opacity ?? defaults?.opacity ?? 1,
    color:
      saved?.color ??
      (defaults?.primary || defaults?.legacyColor ? appearance.color : undefined) ??
      defaults?.color ??
      "#9299a7",
    lineWidth: saved?.lineWidth ?? appearance.lineWidth ?? defaults?.lineWidth ?? 1,
  };
}

export function indicatorStyleColor(style: { color: string; opacity: number; visible?: boolean }) {
  const opacity = style.visible === false ? 0 : style.opacity;
  return opacity >= 1
    ? style.color
    : `${style.color}${Math.round(Math.max(0, opacity) * 255)
        .toString(16)
        .padStart(2, "0")}`;
}
