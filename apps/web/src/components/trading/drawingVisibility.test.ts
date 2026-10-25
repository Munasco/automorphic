import { describe, expect, it } from "vite-plus/test";
import { CHART_INTERVALS, type ChartInterval } from "./tradingIntervals";

import {
  DEFAULT_DRAWING_VISIBILITY,
  isDrawingVisibleAtInterval,
  sanitizeDrawingVisibility,
  createDrawingVisibilityPreset,
} from "./drawingVisibility";

describe("drawing visibility presets", () => {
  const disabled = {
    ticks: false,
    seconds: { enabled: false, min: 1, max: 59 },
    minutes: { enabled: false, min: 1, max: 59 },
    hours: { enabled: false, min: 1, max: 24 },
    days: { enabled: false, min: 1, max: 366 },
    weeks: { enabled: false, min: 1, max: 52 },
    months: { enabled: false, min: 1, max: 12 },
    ranges: false,
  };
  it("matches the observed 5m only, above and below presets with inclusive bounds", () => {
    expect(createDrawingVisibilityPreset(5, "only")).toEqual({
      ...disabled,
      minutes: { enabled: true, min: 5, max: 5 },
    });
    const above = createDrawingVisibilityPreset({ unit: "minute", value: 5 }, "above")!;
    expect(above).toEqual({
      ...DEFAULT_DRAWING_VISIBILITY,
      ticks: false,
      seconds: { enabled: false, min: 1, max: 59 },
      minutes: { enabled: true, min: 5, max: 59 },
    });
    const below = createDrawingVisibilityPreset(5, "below")!;
    expect(below).toEqual({
      ...disabled,
      ticks: true,
      seconds: { enabled: true, min: 1, max: 59 },
      minutes: { enabled: true, min: 1, max: 5 },
    });
    expect(isDrawingVisibleAtInterval(above, 4)).toBe(false);
    expect(isDrawingVisibleAtInterval(above, 5)).toBe(true);
    expect(isDrawingVisibleAtInterval(above, 60)).toBe(true);
    expect(isDrawingVisibleAtInterval(below, 5)).toBe(true);
    expect(isDrawingVisibleAtInterval(below, 6)).toBe(false);
  });

  it.each([
    [60, "hours", 1],
    [120, "hours", 2],
    [1440, "days", 1],
    [10080, "weeks", 1],
    [43200, "months", 1],
    [86400, "months", 2],
    [30 / 60, "seconds", 30],
  ] as const)(
    "classifies legacy %s-minute intervals as %s without changing matching",
    (interval, group, value) => {
      const preset = createDrawingVisibilityPreset(interval, "only")!;
      expect(preset).toEqual({ ...disabled, [group]: { enabled: true, min: value, max: value } });
      expect(isDrawingVisibleAtInterval(preset, interval)).toBe(true);
    },
  );

  it("keeps explicit calendar units separate from duration normalization", () => {
    const onlyMonth = createDrawingVisibilityPreset({ unit: "month", value: 3 }, "only")!;
    expect(onlyMonth).toEqual({ ...disabled, months: { enabled: true, min: 3, max: 3 } });
    expect(isDrawingVisibleAtInterval(onlyMonth, { unit: "month", value: 3 })).toBe(true);
    expect(isDrawingVisibleAtInterval(onlyMonth, { unit: "day", value: 3 })).toBe(false);
    const belowWeek = createDrawingVisibilityPreset({ unit: "week", value: 1 }, "below")!;
    expect(belowWeek).toEqual({
      ...DEFAULT_DRAWING_VISIBILITY,
      weeks: { enabled: true, min: 1, max: 1 },
      months: disabled.months,
      ranges: false,
    });
    const aboveDay = createDrawingVisibilityPreset({ unit: "day", value: 3 }, "above")!;
    expect(aboveDay).toEqual({
      ...disabled,
      days: { enabled: true, min: 3, max: 366 },
      weeks: DEFAULT_DRAWING_VISIBILITY.weeks,
      months: DEFAULT_DRAWING_VISIBILITY.months,
      ranges: true,
    });
    expect(createDrawingVisibilityPreset({ unit: "month", value: 12 }, "above")).toEqual({
      ...disabled,
      months: { enabled: true, min: 12, max: 12 },
      ranges: true,
    });
  });

  it("keeps every supported time interval visible at its own inclusive preset boundary", () => {
    for (const interval of CHART_INTERVALS.filter((item) => item.unit !== "tick")) {
      for (const preset of ["only", "above", "below"] as const) {
        const settings = createDrawingVisibilityPreset(interval, preset);
        expect(settings).not.toBeNull();
        expect(isDrawingVisibleAtInterval(settings!, interval)).toBe(true);
        expect(sanitizeDrawingVisibility(settings)).toEqual(settings);
      }
    }
  });

  it("rejects count-specific tick presets that the boolean tick visibility cannot represent", () => {
    for (const value of [10, 100, 1000] as const) {
      for (const preset of ["only", "above", "below"] as const)
        expect(createDrawingVisibilityPreset({ unit: "tick", value }, preset)).toBeNull();
      expect(createDrawingVisibilityPreset({ unit: "tick", value }, "all")).toEqual(
        DEFAULT_DRAWING_VISIBILITY,
      );
    }
    expect(isDrawingVisibleAtInterval(undefined, { unit: "tick", value: 10 })).toBe(true);
  });

  it("rejects unsupported or fractional range bounds instead of rounding or clamping them", () => {
    const intervals: Array<number | ChartInterval> = [
      0,
      -1,
      Number.NaN,
      Infinity,
      90,
      1441,
      0.001,
      31 / 60,
      13 * 43200,
      { unit: "minute", value: 7 } as unknown as ChartInterval,
      { unit: "second", value: 60 } as unknown as ChartInterval,
      { unit: "month", value: 13 } as unknown as ChartInterval,
      { unit: "unknown", value: 5 } as unknown as ChartInterval,
      null as unknown as ChartInterval,
    ];
    for (const interval of intervals)
      for (const preset of ["above", "below", "only"] as const)
        expect(createDrawingVisibilityPreset(interval, preset)).toBeNull();
  });

  it("always resets all groups independently and never mutates defaults or an earlier preset", () => {
    const first = createDrawingVisibilityPreset(5, "only")!;
    const all = createDrawingVisibilityPreset(Number.NaN, "all")!;
    const next = createDrawingVisibilityPreset(5, "only")!;
    first.minutes.min = 40;
    all.hours.enabled = false;
    expect(next.minutes).toEqual({ enabled: true, min: 5, max: 5 });
    expect(DEFAULT_DRAWING_VISIBILITY.hours.enabled).toBe(true);
    expect(createDrawingVisibilityPreset(5, "all")).toEqual(DEFAULT_DRAWING_VISIBILITY);
  });
});

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
  it("uses calendar units directly instead of confusing months with minutes", () => {
    const settings = sanitizeDrawingVisibility({
      minutes: { enabled: false },
      days: { enabled: true, min: 2, max: 3 },
      weeks: { enabled: false },
      months: { enabled: true, min: 3, max: 6 },
    });
    expect(isDrawingVisibleAtInterval(settings, { unit: "day", value: 3 })).toBe(true);
    expect(isDrawingVisibleAtInterval(settings, { unit: "day", value: 1 })).toBe(false);
    expect(isDrawingVisibleAtInterval(settings, { unit: "week", value: 1 })).toBe(false);
    expect(isDrawingVisibleAtInterval(settings, { unit: "month", value: 3 })).toBe(true);
    expect(isDrawingVisibleAtInterval(settings, { unit: "month", value: 12 })).toBe(false);
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
