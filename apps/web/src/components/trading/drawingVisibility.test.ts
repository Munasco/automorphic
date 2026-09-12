import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_DRAWING_VISIBILITY,
  isDrawingVisibleAtInterval,
  sanitizeDrawingVisibility,
} from "./drawingVisibility";

describe("drawing visibility", () => {
  it("uses the tick flag independently of same-sized second and minute groups", () => {
    const settings = sanitizeDrawingVisibility({
      ticks: false,
      seconds: { enabled: true, min: 5, max: 30 },
      minutes: { enabled: false },
    });
    expect(isDrawingVisibleAtInterval(settings, { unit: "tick", value: 10 })).toBe(false);
    expect(isDrawingVisibleAtInterval(settings, { unit: "second", value: 10 })).toBe(true);
    expect(isDrawingVisibleAtInterval(settings, { unit: "minute", value: 10 })).toBe(false);
    settings.ticks = true;
    expect(isDrawingVisibleAtInterval(settings, { unit: "tick", value: 1000 })).toBe(true);
  });
  it("restores missing legacy settings and malformed records with independent defaults", () => {
    for (const input of [undefined, null, [], "invalid", 42]) {
      expect(sanitizeDrawingVisibility(input)).toEqual(DEFAULT_DRAWING_VISIBILITY);
    }
    const restored = sanitizeDrawingVisibility(undefined);
    restored.minutes.enabled = false;
    expect(sanitizeDrawingVisibility(undefined).minutes.enabled).toBe(true);
    expect(DEFAULT_DRAWING_VISIBILITY.minutes.enabled).toBe(true);
  });

  it("preserves disabled groups while bounding, ordering and validating saved ranges", () => {
    const restored = sanitizeDrawingVisibility({
      ticks: false,
      ranges: false,
      seconds: { enabled: false, min: -100, max: 1_000 },
      minutes: { enabled: "false", min: 30, max: 5 },
      hours: { enabled: false, min: 2.4, max: 5.6 },
      days: { min: Number.NaN, max: Number.POSITIVE_INFINITY },
      weeks: { min: "2", max: null },
      months: { min: 100, max: 200 },
    });
    expect(restored).toEqual({
      ticks: false,
      ranges: false,
      seconds: { enabled: false, min: 1, max: 59 },
      minutes: { enabled: true, min: 5, max: 30 },
      hours: { enabled: false, min: 2, max: 6 },
      days: { enabled: true, min: 1, max: 366 },
      weeks: { enabled: true, min: 1, max: 52 },
      months: { enabled: true, min: 12, max: 12 },
    });
    expect(sanitizeDrawingVisibility(JSON.parse(JSON.stringify(restored)))).toEqual(restored);
  });

  it("normalizes hour, day, week and month boundaries into their own enabled groups", () => {
    const only = (group: "seconds" | "minutes" | "hours" | "days" | "weeks" | "months") => {
      const settings = sanitizeDrawingVisibility(undefined);
      for (const key of ["seconds", "minutes", "hours", "days", "weeks", "months"] as const) {
        settings[key].enabled = key === group;
      }
      return settings;
    };
    for (const [group, duration, before] of [
      ["minutes", 1, 59 / 60],
      ["hours", 60, 59],
      ["days", 1_440, 1_439],
      ["weeks", 10_080, 8_640],
      ["months", 43_200, 41_760],
    ] as const) {
      expect(isDrawingVisibleAtInterval(only(group), duration)).toBe(true);
      expect(isDrawingVisibleAtInterval(only(group), before)).toBe(false);
    }
    expect(isDrawingVisibleAtInterval(only("weeks"), 20_160)).toBe(true);
    expect(isDrawingVisibleAtInterval(only("months"), 86_400)).toBe(true);
    expect(isDrawingVisibleAtInterval(only("days"), 11_520)).toBe(true);
    expect(isDrawingVisibleAtInterval(only("days"), 43_200)).toBe(false);
  });

  it("uses inclusive range bounds and respects disabled groups and fractional durations", () => {
    const settings = sanitizeDrawingVisibility({
      seconds: { min: 5, max: 30 },
      minutes: { min: 5, max: 15 },
      hours: { min: 1, max: 2 },
      days: { enabled: false },
    });
    for (const duration of [5 / 60, 30 / 60, 5, 15, 60, 90, 120]) {
      expect(isDrawingVisibleAtInterval(settings, duration)).toBe(true);
    }
    for (const duration of [4 / 60, 31 / 60, 4, 16, 121, 1_440]) {
      expect(isDrawingVisibleAtInterval(settings, duration)).toBe(false);
    }
  });

  it("rejects invalid durations without interpreting them as tick or range charts", () => {
    for (const duration of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(isDrawingVisibleAtInterval(undefined, duration)).toBe(false);
    }
    expect(isDrawingVisibleAtInterval(undefined, 15)).toBe(true);
    expect(isDrawingVisibleAtInterval(undefined, 13 * 43_200)).toBe(false);
  });
});
