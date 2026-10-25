import {
  defaultDrawingLevels,
  defaultRegressionDrawingSettings,
  type ChartDrawing,
} from "./drawingGeometry";

export type DrawingGroupLineAppearance = {
  color: string;
  width: number;
  lineStyle: NonNullable<ChartDrawing["lineStyle"]>;
  lineOpacity: number;
};

export type DrawingGroupAppearance = {
  appearance: DrawingGroupLineAppearance;
  mixed: Record<keyof DrawingGroupLineAppearance, boolean>;
};

function effectiveAppearances(drawing: ChartDrawing): DrawingGroupLineAppearance[] {
  const ordinary: DrawingGroupLineAppearance = {
    color: drawing.color,
    width: drawing.width,
    lineStyle: drawing.lineStyle ?? "solid",
    lineOpacity: drawing.lineOpacity ?? 1,
  };
  if (drawing.kind === "channel") {
    const levels = drawing.levels ?? defaultDrawingLevels("channel");
    // Group appearance edits affect every stored level, including disabled levels.
    return levels.length
      ? levels.map((level) => ({
          color: level.color ?? ordinary.color,
          width: level.width ?? ordinary.width,
          lineStyle: level.lineStyle ?? ordinary.lineStyle,
          lineOpacity: level.opacity ?? ordinary.lineOpacity,
        }))
      : [ordinary];
  }
  if (drawing.kind === "regression-trend") {
    const settings = { ...defaultRegressionDrawingSettings(), ...drawing };
    return [
      settings.regressionBaseLine,
      settings.regressionUpperLine,
      settings.regressionLowerLine,
    ].map((line) => ({
      color: line.color,
      width: line.width,
      lineStyle: line.lineStyle,
      // Regression rail opacity controls band fills, not the opaque strokes.
      // Preserve the existing toolbar opacity behavior rather than conflating them.
      lineOpacity: ordinary.lineOpacity,
    }));
  }
  return [ordinary];
}

/** Derives the same effective rail appearances changed by a group toolbar edit. */
export function getDrawingGroupAppearance(
  drawings: readonly ChartDrawing[],
): DrawingGroupAppearance | null {
  const appearances = drawings.flatMap(effectiveAppearances);
  const appearance = appearances[0];
  if (!appearance) return null;
  const mixed = (key: keyof DrawingGroupLineAppearance) =>
    appearances.some((candidate) => candidate[key] !== appearance[key]);
  return {
    appearance,
    mixed: {
      color: mixed("color"),
      width: mixed("width"),
      lineStyle: mixed("lineStyle"),
      lineOpacity: mixed("lineOpacity"),
    },
  };
}
