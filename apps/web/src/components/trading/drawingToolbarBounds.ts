type Size = { width: number; height: number };

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
