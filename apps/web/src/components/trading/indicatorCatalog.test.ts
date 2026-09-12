import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_INDICATORS,
  DEFAULT_INITIAL_BALANCE,
  INDICATOR_CATALOG,
  findIndicators,
  isValidInitialBalanceSettings,
} from "./indicatorCatalog";
import { normalizeChartPreferences, useChartPreferences } from "./chartPreferences";

describe("indicator catalog and saved preferences", () => {
  it("preserves old chart choices and merges new indicators disabled", () => {
    const restored = normalizeChartPreferences({
      style: "area",
      indicators: { sma: true, rsi: true, volume: false },
      showGrid: false,
      logScale: true,
    });
    expect(restored).toMatchObject({
      style: "area",
      showGrid: false,
      logScale: true,
      initialBalance: DEFAULT_INITIAL_BALANCE,
    });
    expect(restored.indicators).toEqual({
      ...DEFAULT_INDICATORS,
      sma: true,
      rsi: true,
      volume: false,
    });
    expect(Object.keys(restored.indicators).sort()).toEqual(
      INDICATOR_CATALOG.map((item) => item.key).sort(),
    );
  });
  it("keeps valid custom session settings and rejects invalid persisted data", () => {
    const initialBalance = {
      startTime: "08:20",
      timeZone: "America/Chicago",
      durationMinutes: 90,
    } as const;
    expect(normalizeChartPreferences({ initialBalance, indicators: { ib: true } })).toMatchObject({
      initialBalance,
      indicators: { ib: true },
    });
    const restored = normalizeChartPreferences({
      style: "invalid",
      indicators: { macd: "yes", rsi: true },
      showGrid: "false",
      initialBalance: { ...initialBalance, durationMinutes: -1 },
    });
    expect(restored.style).toBe("candles");
    expect(restored.indicators.macd).toBe(false);
    expect(restored.indicators.rsi).toBe(true);
    expect(restored.showGrid).toBe(true);
    expect(restored.initialBalance).toEqual(DEFAULT_INITIAL_BALANCE);
  });
  it("keeps visibility separate from membership and restores per-workspace styles", () => {
    const original = useChartPreferences.getState();
    useChartPreferences.getState().toggleIndicatorVisibility("volume");
    expect(useChartPreferences.getState().indicators.volume).toBe(true);
    expect(useChartPreferences.getState().hiddenIndicators.volume).toBe(true);
    useChartPreferences
      .getState()
      .setIndicatorAppearance("rsi", { color: "#123456", lineWidth: 3 });
    useChartPreferences.getState().setVolumeColors({ up: "#112233", down: "#445566" });
    const restored = normalizeChartPreferences(
      JSON.parse(JSON.stringify(useChartPreferences.getState())),
    );
    expect(restored.hiddenIndicators.volume).toBe(true);
    expect(restored.appearance.rsi).toEqual({ color: "#123456", lineWidth: 3 });
    expect(restored.volumeColors).toEqual({ up: "#112233", down: "#445566" });
    useChartPreferences.getState().toggleIndicator("volume");
    useChartPreferences.getState().toggleIndicator("volume");
    expect(useChartPreferences.getState().hiddenIndicators.volume).toBe(false);
    useChartPreferences.getState().resetIndicatorAppearance("rsi");
    expect(useChartPreferences.getState().appearance.rsi).toBeUndefined();
    useChartPreferences.setState(original, true);
  });
  it("rejects malformed appearance while preserving valid settings", () => {
    const restored = normalizeChartPreferences({
      hiddenIndicators: { sma: "yes", ema: true },
      appearance: {
        sma: { color: "url(secret)", lineWidth: 99 },
        ema: { color: "#abcdef", lineWidth: 2 },
      },
    });
    expect(restored.hiddenIndicators.sma).toBe(false);
    expect(restored.hiddenIndicators.ema).toBe(true);
    expect(restored.appearance).toEqual({ ema: { color: "#abcdef", lineWidth: 2 } });
  });
  it("searches labels, indicator names and categories without case sensitivity", () => {
    expect(findIndicators(" MOVING average ").map((entry) => entry.key)).toEqual(["sma", "ema"]);
    expect(findIndicators("initial").map((entry) => entry.key)).toEqual(["ib"]);
    expect(findIndicators("overlays").map((entry) => entry.key)).toEqual([
      "sma",
      "ema",
      "bollinger",
      "donchian",
    ]);
    expect(findIndicators("not an indicator")).toEqual([]);
  });
});

describe("initial balance settings validation", () => {
  it.each([
    { startTime: "24:00" },
    { startTime: "9:30" },
    { startTime: "09:60" },
    { timeZone: "unsupported" },
    { durationMinutes: 0 },
    { durationMinutes: 241 },
    { durationMinutes: 3.5 },
    { durationMinutes: Number.NaN },
  ])("rejects invalid settings %j", (invalid) => {
    expect(isValidInitialBalanceSettings({ ...DEFAULT_INITIAL_BALANCE, ...invalid })).toBe(false);
  });
  it("allows midnight and a configured session within supported bounds", () => {
    expect(
      isValidInitialBalanceSettings({ startTime: "00:00", timeZone: "UTC", durationMinutes: 240 }),
    ).toBe(true);
    expect(isValidInitialBalanceSettings(DEFAULT_INITIAL_BALANCE)).toBe(true);
  });
  it("does not replace the active settings with an invalid edit", () => {
    const before = useChartPreferences.getState().initialBalance;
    useChartPreferences.getState().setInitialBalance({ ...before, startTime: "" });
    expect(useChartPreferences.getState().initialBalance).toBe(before);
    useChartPreferences
      .getState()
      .setInitialBalance({ ...before, timeZone: "UTC", startTime: "08:00" });
    expect(useChartPreferences.getState().initialBalance).toMatchObject({
      timeZone: "UTC",
      startTime: "08:00",
    });
    useChartPreferences.getState().setInitialBalance(before);
  });
});
