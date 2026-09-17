import type { DrawingPoint } from "./drawingGeometry";

export interface DrawingTextBoxPlacement {
  point: DrawingPoint;
  align?: "left" | "center" | "right";
  baseline?: "top" | "middle" | "bottom";
  angle?: number;
}

/** Fit the scrollable editor viewport, never the font, inside the rotated pane bounds. */
export function fitDrawingInlineTextSize(
  width: number,
  height: number,
  angle: number,
  paneWidth: number,
  paneHeight: number,
): { width: number; height: number } {
  if (![paneWidth, paneHeight].every(Number.isFinite) || paneWidth <= 0 || paneHeight <= 0)
    return { width: 0, height: 0 };
  const requestedWidth = Number.isFinite(width) && width > 0 ? width : 1;
  const requestedHeight = Number.isFinite(height) && height > 0 ? height : 1;
  const margin = Math.min(6, paneWidth / 2, paneHeight / 2);
  const availableWidth = paneWidth - 2 * margin;
  const availableHeight = paneHeight - 2 * margin;
  if (availableWidth <= 0 || availableHeight <= 0) return { width: 0, height: 0 };
  const cosine = Math.abs(Math.cos(Number.isFinite(angle) ? angle : 0));
  const sine = Math.abs(Math.sin(Number.isFinite(angle) ? angle : 0));
  if (
    cosine * requestedWidth + sine * requestedHeight <= availableWidth &&
    sine * requestedWidth + cosine * requestedHeight <= availableHeight
  )
    return { width: requestedWidth, height: requestedHeight };

  // For any height, the widest feasible rectangle is bounded by three straight lines.
  // Area is quadratic on each interval: its maximum is at an endpoint or parabola vertex.
  const heights = [requestedHeight];
  if (sine > 0) {
    heights.push(availableWidth / sine, availableWidth / (2 * sine));
    heights.push((availableWidth - cosine * requestedWidth) / sine);
  }
  if (cosine > 0) {
    heights.push(availableHeight / cosine, availableHeight / (2 * cosine));
    heights.push((availableHeight - sine * requestedWidth) / cosine);
  }
  const determinant = cosine * cosine - sine * sine;
  if (determinant !== 0)
    heights.push((cosine * availableHeight - sine * availableWidth) / determinant);
  let best = { width: 0, height: 0 };
  let bestArea = -Infinity;
  for (const candidate of heights) {
    if (!Number.isFinite(candidate) || candidate <= 0) continue;
    const h = Math.min(requestedHeight, candidate);
    const w = Math.min(
      requestedWidth,
      cosine > 0 ? (availableWidth - sine * h) / cosine : Infinity,
      sine > 0 ? (availableHeight - cosine * h) / sine : Infinity,
    );
    if (!Number.isFinite(w) || w <= 0) continue;
    const area = Math.log(w) + Math.log(h);
    if (area <= bestArea) continue;
    bestArea = area;
    // Remove roundoff at a tight boundary without changing the chosen proportions.
    const correction = Math.min(
      1,
      availableWidth / (cosine * w + sine * h),
      availableHeight / (sine * w + cosine * h),
    );
    best = { width: w * correction, height: h * correction };
  }
  return best;
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
