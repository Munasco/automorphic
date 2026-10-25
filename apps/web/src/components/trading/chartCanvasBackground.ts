import { ColorType, type Background } from "lightweight-charts";

export type ChartBackgroundMode = "solid" | "gradient";

export function chartCanvasBackground(
  mode: ChartBackgroundMode,
  topColor: string,
  bottomColor: string,
): Background {
  return mode === "gradient"
    ? { type: ColorType.VerticalGradient, topColor, bottomColor }
    : { type: ColorType.Solid, color: topColor };
}
