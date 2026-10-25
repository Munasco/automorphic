import type { Candle } from "./chartIndicators";

export const CHART_DATE_NAVIGATION_KEY = "automorphic:chart-date-navigation:v1";
const MAX_SYMBOLS = 100;
const validTime = (time: unknown): time is number =>
  typeof time === "number" && Number.isFinite(time) && Math.abs(time) <= 8.64e12;
const validSymbol = (symbol: unknown): symbol is string =>
  typeof symbol === "string" && /^@?[A-Z0-9][A-Z0-9._-]{0,79}$/.test(symbol);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Resolve exchange time while retaining the logical order of unique native chart keys. */
export function chartNavigationIndex(bars: readonly Candle[], target: number): number | null {
  if (!validTime(target)) return null;
  const ordered = [
    ...new Map(bars.filter((bar) => validTime(bar.time)).map((bar) => [bar.time, bar])).values(),
  ].sort((a, b) => a.time - b.time);
  let minimum = Infinity,
    maximum = -Infinity,
    bestTime = -Infinity;
  let selected: number | null = null;
  ordered.forEach((bar, index) => {
    const time = bar.actualTime ?? bar.time;
    if (!validTime(time)) return;
    minimum = Math.min(minimum, time);
    maximum = Math.max(maximum, time);
    if (time <= target && time >= bestTime) {
      bestTime = time;
      selected = index;
    }
  });
  return target < minimum || target > maximum ? null : selected;
}

export function centerChartNavigationRange(
  index: number,
  current: { from: number; to: number } | null,
): { from: number; to: number } | null {
  if (!Number.isSafeInteger(index) || index < 0) return null;
  const difference = current ? current.to - current.from : NaN;
  const span =
    current &&
    Number.isFinite(current.from) &&
    Number.isFinite(current.to) &&
    Number.isFinite(difference) &&
    difference > 0
      ? difference
      : 100;
  const from = index - span / 2,
    to = index + span / 2;
  return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
}

function readTimes(storage: Pick<Storage, "getItem">): Map<string, number> {
  try {
    const raw = storage.getItem(CHART_DATE_NAVIGATION_KEY);
    const value: unknown = raw === null ? null : JSON.parse(raw);
    if (!record(value) || !record(value.times)) return new Map();
    return new Map(
      Object.entries(value.times)
        .filter((entry): entry is [string, number] => validSymbol(entry[0]) && validTime(entry[1]))
        .slice(-MAX_SYMBOLS),
    );
  } catch {
    return new Map();
  }
}

export function readChartNavigationTime(
  storage: Pick<Storage, "getItem">,
  symbol: string,
): number | null {
  return validSymbol(symbol) ? (readTimes(storage).get(symbol) ?? null) : null;
}

/** Call only after navigation succeeds. Updating a symbol moves it to the newest saved position. */
export function writeChartNavigationTime(
  storage: Pick<Storage, "getItem" | "setItem">,
  symbol: string,
  time: number,
): void {
  if (!validSymbol(symbol) || !validTime(time)) return;
  const times = readTimes(storage);
  if (times.get(symbol) === time) return;
  times.delete(symbol);
  times.set(symbol, time);
  storage.setItem(
    CHART_DATE_NAVIGATION_KEY,
    JSON.stringify({ times: Object.fromEntries([...times].slice(-MAX_SYMBOLS)) }),
  );
}
