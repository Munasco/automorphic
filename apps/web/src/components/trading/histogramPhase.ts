/** Classify a finite histogram value by its sign and movement from the previous bar. */
export function histogramPhase(
  value: number,
  previous: number | undefined,
): "positive" | "positiveFalling" | "negative" | "negativeRising" {
  if (previous === undefined || !Number.isFinite(previous))
    return value >= 0 ? "positive" : "negative";
  if (value >= 0) return value > previous ? "positive" : "positiveFalling";
  return value > previous ? "negativeRising" : "negative";
}
