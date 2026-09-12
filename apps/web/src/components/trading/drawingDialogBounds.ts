export interface DrawingDialogBounds {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/** Keep the measured top pinned across tabs, reserving usable space when the viewport shrinks. */
export function getDrawingDialogBounds(
  position: { left: number; top: number },
  preferredWidth: number,
  viewport: { width: number; height: number },
  { margin = 12, minHeight = 240 }: { margin?: number; minHeight?: number } = {},
): DrawingDialogBounds | null {
  if (
    ![
      position.left,
      position.top,
      preferredWidth,
      viewport.width,
      viewport.height,
      margin,
      minHeight,
    ].every(Number.isFinite) ||
    preferredWidth <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    margin < 0 ||
    minHeight < 0
  )
    return null;

  const horizontalMargin = Math.min(margin, viewport.width / 2);
  const verticalMargin = Math.min(margin, viewport.height / 2);
  const width = Math.min(preferredWidth, viewport.width - horizontalMargin * 2);
  const usableHeight = Math.min(minHeight, viewport.height - verticalMargin * 2);
  const left = Math.max(
    horizontalMargin,
    Math.min(position.left, viewport.width - horizontalMargin - width),
  );
  const top = Math.max(
    verticalMargin,
    Math.min(position.top, viewport.height - verticalMargin - usableHeight),
  );
  return { left, top, width, maxHeight: viewport.height - verticalMargin - top };
}
