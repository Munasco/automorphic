import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  expirationDateText,
  expirationMonthDays,
  parseExpirationDate,
  parseExpirationDateTime,
} from "./drawingAlertDates";

beforeEach(() => vi.stubEnv("TZ", "America/Toronto"));
afterEach(() => vi.unstubAllEnvs());

describe("custom alert expiration dates", () => {
  it.each([
    "",
    "2026-",
    "2026-2-01",
    "2026-02-29",
    "2026-04-31",
    "2026-00-12",
    "0000-01-01",
    "2026-13-01",
  ])("rejects incomplete or normalized date %s", (text) =>
    expect(parseExpirationDate(text)).toBeNull(),
  );

  it("preserves leap days and local dates instead of converting through UTC", () => {
    expect(expirationDateText(parseExpirationDate("2028-02-29")!)).toBe("2028-02-29");
    const timestamp = parseExpirationDateTime("2026-09-12", "23:45")!;
    expect(expirationDateText(new Date(timestamp))).toBe("2026-09-12");
    expect(new Date(timestamp).toISOString()).toBe("2026-09-13T03:45:00.000Z");
  });

  it.each(["", "5:30", "12:", "24:00", "13:60", "-1:30", "09:20:30"])(
    "rejects incomplete or out-of-range time %s",
    (time) => expect(parseExpirationDateTime("2026-09-12", time)).toBeNull(),
  );

  it("rejects a nonexistent spring-forward time without changing the user's draft", () => {
    expect(parseExpirationDateTime("2027-03-14", "02:30")).toBeNull();
    expect(new Date(parseExpirationDateTime("2027-03-14", "03:30")!).getHours()).toBe(3);
  });

  it.each([
    ["2026-06-01", 0, 30],
    ["2026-02-01", 6, 28],
    ["2028-02-01", 1, 29],
  ] as const)("lays out %s in a fixed Monday-first six-week calendar", (text, offset, count) => {
    const days = expirationMonthDays(parseExpirationDate(text)!);
    expect(days).toHaveLength(42);
    expect(days.slice(0, offset)).toEqual(Array(offset).fill(null));
    expect(days[offset]?.getDate()).toBe(1);
    expect(days.filter(Boolean)).toHaveLength(count);
    expect(days[offset + count - 1]?.getDate()).toBe(count);
    expect(days.slice(offset + count).every((day) => day === null)).toBe(true);
  });
});
