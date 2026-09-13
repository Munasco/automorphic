import type { DrawingPoint } from "./drawingGeometry";

export interface DrawingTextBoxPlacement {
  point: DrawingPoint;
  align?: "left" | "center" | "right";
  baseline?: "top" | "middle" | "bottom";
  angle?: number;
}

/** The label's aligned rectangle, rotated around its canvas text origin. */
export function drawingInlineTextBox(
  placement: DrawingTextBoxPlacement,
  width: number,
  height: number,
): DrawingPoint[] | null {
  const angle = placement.angle ?? 0;
  if (
    ![placement.point.x, placement.point.y, width, height, angle].every(Number.isFinite) ||
    width < 0 ||
    height <= 0
  )
    return null;
  const left = placement.align === "right" ? -width : placement.align === "center" ? -width / 2 : 0;
  const top =
    placement.baseline === "top" ? 0 : placement.baseline === "middle" ? -height / 2 : -height;
  const cosine = Math.cos(angle),
    sine = Math.sin(angle);
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ].map((point) => ({
    x: placement.point.x + point.x * cosine - point.y * sine,
    y: placement.point.y + point.x * sine + point.y * cosine,
  }));
}

/** SAT avoids treating a rotated box's empty bounding-box corners as visible text. */
export function drawingInlineTextIntersectsPane(
  box: readonly DrawingPoint[],
  paneWidth: number,
  paneHeight: number,
): boolean {
  if (
    box.length !== 4 ||
    ![paneWidth, paneHeight].every(Number.isFinite) ||
    paneWidth <= 0 ||
    paneHeight <= 0
  )
    return false;
  const pane = [
    { x: 0, y: 0 },
    { x: paneWidth, y: 0 },
    { x: paneWidth, y: paneHeight },
    { x: 0, y: paneHeight },
  ];
  const axes = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  for (const index of [0, 1]) {
    const from = box[index]!,
      to = box[index + 1]!;
    axes.push({ x: -(to.y - from.y), y: to.x - from.x });
  }
  return axes.every((axis) => {
    const project = (points: readonly DrawingPoint[]) =>
      points.map((point) => point.x * axis.x + point.y * axis.y);
    const labelRange = project(box),
      paneRange = project(pane);
    return (
      Math.max(...labelRange) >= Math.min(...paneRange) &&
      Math.max(...paneRange) >= Math.min(...labelRange)
    );
  });
}

/** Translate only the editing overlay, leaving the drawing's stored anchors untouched. */
export function clampDrawingInlineTextOrigin(
  point: DrawingPoint,
  box: readonly DrawingPoint[],
  paneWidth: number,
  paneHeight: number,
): DrawingPoint {
  const margin = Math.min(6, paneWidth / 2, paneHeight / 2);
  const offset = (min: number, max: number, limit: number) =>
    max - min > limit - 2 * margin
      ? margin - min
      : Math.max(margin - min, Math.min(0, limit - margin - max));
  return {
    x:
      point.x +
      offset(Math.min(...box.map((p) => p.x)), Math.max(...box.map((p) => p.x)), paneWidth),
    y:
      point.y +
      offset(Math.min(...box.map((p) => p.y)), Math.max(...box.map((p) => p.y)), paneHeight),
  };
}
