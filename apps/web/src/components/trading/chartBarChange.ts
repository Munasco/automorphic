export function chartBarChange(close: number, previousClose: number | undefined) {
  if (!Number.isFinite(close) || previousClose === undefined || !Number.isFinite(previousClose))
    return null;
  const points = close - previousClose;
  if (!Number.isFinite(points)) return null;
  const percent = previousClose === 0 ? null : (points / Math.abs(previousClose)) * 100;
  return { points, percent: percent !== null && Number.isFinite(percent) ? percent : null };
}

export function formatChartBarChange(change: ReturnType<typeof chartBarChange>): string {
  if (!change) return "—";
  const signed = (value: number) => {
    const rounded = Number(value.toFixed(2));
    return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}`;
  };
  return `${signed(change.points)} (${change.percent === null ? "—" : `${signed(change.percent)}%`})`;
}
