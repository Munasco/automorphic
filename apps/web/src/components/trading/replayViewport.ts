type Range = { from: number; to: number };

/** Keep candle width stable; follow the replay head only while it remains in view. */
export function replayViewport(
  range: Range | null,
  previousCount: number,
  nextCount: number,
  seek: boolean,
  rightOffsetBars = 5,
): Range {
  const valid =
    range && Number.isFinite(range.from) && Number.isFinite(range.to) && range.to > range.from;
  const current = valid ? range : { from: -5, to: 100 };
  const width = current.to - current.from;
  if (seek) {
    const margin =
      Number.isInteger(rightOffsetBars) && rightOffsetBars >= 0 && rightOffsetBars <= 100
        ? rightOffsetBars
        : 5;
    const to = Math.max(0, nextCount - 1) + margin;
    return { from: to - width, to };
  }
  const previousHead = previousCount - 1;
  if (current.from <= previousHead && current.to >= previousHead) {
    const shift = nextCount - previousCount;
    return { from: current.from + shift, to: current.to + shift };
  }
  return { ...current };
}
