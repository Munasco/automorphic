import { describe, expect, it } from "vite-plus/test";
import { formatReplayDateTime, parseReplayDateTime } from "./replayDateTime";

const epoch = (iso: string) => Date.parse(iso) / 1000;

describe("replay date/time in the chart zone", () => {
  it.each([
    ["UTC", "2026-01-15T12:34:56", "2026-01-15T12:34:56Z"],
    ["America/Chicago", "2026-01-15T12:34:56", "2026-01-15T18:34:56Z"],
    ["America/Chicago", "2026-07-15T12:34:56", "2026-07-15T17:34:56Z"],
    ["Asia/Tokyo", "2026-01-15T00:34:56", "2026-01-14T15:34:56Z"],
    ["Asia/Tokyo", "2026-07-15T00:34:56", "2026-07-14T15:34:56Z"],
    ["Australia/Sydney", "2026-01-15T12:34:56", "2026-01-15T01:34:56Z"],
    ["Australia/Sydney", "2026-07-15T12:34:56", "2026-07-15T02:34:56Z"],
    ["America/New_York", "2026-07-15T12:34:56", "2026-07-15T16:34:56Z"],
    ["America/Los_Angeles", "2026-07-15T12:34:56", "2026-07-15T19:34:56Z"],
    ["Europe/London", "2026-07-15T12:34:56", "2026-07-15T11:34:56Z"],
    ["Europe/Berlin", "2026-07-15T12:34:56", "2026-07-15T10:34:56Z"],
    ["Asia/Hong_Kong", "2026-07-15T12:34:56", "2026-07-15T04:34:56Z"],
  ])("roundtrips %s wall time %s to explicit UTC %s", (zone, wall, utc) => {
    expect(parseReplayDateTime(wall!, zone!)).toBe(epoch(utc!));
    expect(formatReplayDateTime(epoch(utc!), zone!)).toBe(wall);
  });

  it("accepts optional seconds without allowing Date.parse to choose a system zone", () => {
    expect(parseReplayDateTime("2026-07-15T12:34", "America/New_York")).toBe(
      epoch("2026-07-15T16:34:00Z"),
    );
    expect(formatReplayDateTime(epoch("2026-07-15T16:34:00Z"), "America/New_York")).toBe(
      "2026-07-15T12:34:00",
    );
  });

  it("rejects New York's nonexistent spring hour and ambiguous fall hour", () => {
    expect(parseReplayDateTime("2026-03-08T02:30:00", "America/New_York")).toBeNull();
    expect(parseReplayDateTime("2026-11-01T01:30:00", "America/New_York")).toBeNull();
    expect(formatReplayDateTime(epoch("2026-11-01T05:30:00Z"), "America/New_York")).toBe(
      "2026-11-01T01:30:00",
    );
    expect(formatReplayDateTime(epoch("2026-11-01T06:30:00Z"), "America/New_York")).toBe(
      "2026-11-01T01:30:00",
    );
    expect(parseReplayDateTime("2026-03-08T01:59:59", "America/New_York")).toBe(
      epoch("2026-03-08T06:59:59Z"),
    );
    expect(parseReplayDateTime("2026-03-08T03:00:00", "America/New_York")).toBe(
      epoch("2026-03-08T07:00:00Z"),
    );
    expect(parseReplayDateTime("2026-11-01T02:00:00", "America/New_York")).toBe(
      epoch("2026-11-01T07:00:00Z"),
    );
  });

  it("rejects southern hemisphere DST overlaps and gaps", () => {
    expect(parseReplayDateTime("2026-04-05T02:30:00", "Australia/Sydney")).toBeNull();
    expect(parseReplayDateTime("2026-10-04T02:30:00", "Australia/Sydney")).toBeNull();
  });

  it("validates leap years and actual calendar dates rather than rolling them forward", () => {
    expect(parseReplayDateTime("2024-02-29T23:59:59", "UTC")).toBe(epoch("2024-02-29T23:59:59Z"));
    expect(parseReplayDateTime("2000-02-29T00:00:00", "UTC")).toBe(epoch("2000-02-29T00:00:00Z"));
    for (const value of [
      "2026-02-29T12:00",
      "1900-02-29T12:00",
      "2026-04-31T12:00",
      "2026-00-10T12:00",
      "2026-13-10T12:00",
      "2026-01-00T12:00",
      "2026-01-32T12:00",
      "0000-01-01T12:00",
      "2026-01-01T24:00",
      "2026-01-01T12:60",
      "2026-01-01T12:00:60",
    ])
      expect(parseReplayDateTime(value, "UTC")).toBeNull();
  });

  it("strictly rejects malformed values and unknown zones", () => {
    for (const value of [
      "",
      "2026-01-01",
      "2026-1-1T12:00",
      "2026-01-01 12:00",
      "2026-01-01T12:00Z",
      "2026-01-01T12:00+02:00",
      "2026-01-01T12:00:00.5",
      " 2026-01-01T12:00",
      "2026-01-01T12:00 ",
    ])
      expect(parseReplayDateTime(value, "UTC")).toBeNull();
    for (const zone of ["", "Not/A_Zone", undefined, null]) {
      expect(parseReplayDateTime("2026-01-01T12:00", zone as string)).toBeNull();
      expect(formatReplayDateTime(epoch("2026-01-01T12:00:00Z"), zone as string)).toBe("");
    }
    for (const seconds of [NaN, Infinity, -Infinity, 1e20])
      expect(formatReplayDateTime(seconds, "UTC")).toBe("");
  });

  it("supports years below100 without the Date.UTC1900 offset and keeps repeated calls independent", () => {
    for (const value of ["0001-01-01T00:00:00", "0099-12-31T23:59:59", "9999-12-31T23:59:59"])
      expect(formatReplayDateTime(parseReplayDateTime(value, "UTC")!, "UTC")).toBe(value);
    const time = epoch("2026-07-15T12:00:00Z");
    expect(formatReplayDateTime(time, "Asia/Tokyo")).toBe("2026-07-15T21:00:00");
    expect(formatReplayDateTime(time, "America/Chicago")).toBe("2026-07-15T07:00:00");
    expect(formatReplayDateTime(time, "Asia/Tokyo")).toBe("2026-07-15T21:00:00");
  });
});
