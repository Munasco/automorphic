/** The native pane element spans the plot and its axes, in viewport coordinates. */
export function chartContextTarget(
  x: number,
  y: number,
  pane: { left: number; top: number; width: number; height: number },
  rightScaleWidth: number,
): "price-axis" | "chart" {
  if (
    ![x, y, pane.left, pane.top, pane.width, pane.height, rightScaleWidth].every(Number.isFinite) ||
    pane.width <= 0 ||
    pane.height <= 0 ||
    rightScaleWidth <= 0 ||
    rightScaleWidth > pane.width
  )
    return "chart";
  const right = pane.left + pane.width;
  return x >= right - rightScaleWidth && x < right && y >= pane.top && y < pane.top + pane.height
    ? "price-axis"
    : "chart";
}
