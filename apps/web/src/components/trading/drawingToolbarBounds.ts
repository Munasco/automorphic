type Size = { width: number; height: number };

/** Top-left toolbar position, using measured dimensions and viewport-pixel drag deltas. */
export function clampFavoriteToolbarPosition(
  position: { x: number; y: number },
  chart: Size,
  toolbar: Size,
  scale: number,
) {
  const remainingX = Math.max(0, chart.width - toolbar.width * scale);
  const remainingY = Math.max(0, chart.height - toolbar.height * scale);
  const insetX = Math.min(8, remainingX / 2);
  const insetY = Math.min(8, remainingY / 2);
  return {
    x: Math.max(insetX, Math.min(remainingX - insetX, position.x)),
    y: Math.max(insetY, Math.min(remainingY - insetY, position.y)),
  };
}

/** Offsets are viewport pixels; toolbar dimensions are its unscaled layout size. */
export function clampDrawingToolbarOffset(
  offset: { x: number; y: number },
  chart: Size,
  toolbar: Size,
  scale: number,
) {
  const limit = Math.max(0, (chart.width - toolbar.width * scale) / 2 - 8);
  const bottom = Math.max(0, chart.height - toolbar.height * scale - 20);
  return {
    x: Math.max(-limit, Math.min(limit, offset.x)),
    y: Math.max(0, Math.min(bottom, offset.y)),
  };
}
