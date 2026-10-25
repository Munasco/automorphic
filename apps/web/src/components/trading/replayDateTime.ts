type WallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};
const formats = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat | null {
  if (typeof timeZone !== "string" || !timeZone) return null;
  const cached = formats.get(timeZone);
  if (cached) return cached;
  try {
    const result = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      hourCycle: "h23",
      era: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formats.set(timeZone, result);
    return result;
  } catch {
    return null;
  }
}

function wallTime(seconds: number, format: Intl.DateTimeFormat): WallTime | null {
  if (!Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(
    format.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  if (parts.era !== "AD") return null;
  const year = Number(parts.year);
  if (year < 1 || year > 9999) return null;
  return {
    year,
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function utcSeconds(wall: WallTime): number | null {
  const { year, month, day, hour, minute, second } = wall;
  if (
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  )
    return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date.getTime() / 1000;
}

function serialize(wall: WallTime): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(wall.year).padStart(4, "0")}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`;
}

/** A datetime-local value in the chart's zone; invalid inputs yield an empty value. */
export function formatReplayDateTime(seconds: number, timeZone: string): string {
  const format = formatter(timeZone);
  const wall = format ? wallTime(seconds, format) : null;
  return wall ? serialize(wall) : "";
}

/** Resolve a wall-clock value only when exactly one UTC instant matches it. */
export function parseReplayDateTime(value: string, timeZone: string): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const wall: WallTime = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
  };
  const localSeconds = utcSeconds(wall);
  const format = formatter(timeZone);
  if (localSeconds === null || !format) return null;
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = localSeconds + hours * 3600;
    const sampledWall = wallTime(sample, format);
    const projected = sampledWall && utcSeconds(sampledWall);
    if (projected !== null) offsets.add(projected - sample);
  }
  const expected = serialize(wall);
  const candidates = new Set<number>();
  for (const offset of offsets) {
    const candidate = localSeconds - offset;
    const candidateWall = wallTime(candidate, format);
    if (candidateWall && serialize(candidateWall) === expected) candidates.add(candidate);
  }
  return candidates.size === 1 ? [...candidates][0]! : null;
}
