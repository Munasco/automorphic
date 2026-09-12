import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_INDICATORS,
  DEFAULT_INITIAL_BALANCE,
  INDICATOR_CATALOG,
  getIndicatorInputs,
  getIndicatorLabel,
  findIndicators,
  isValidInitialBalanceSettings,
} from "./indicatorCatalog";
import { normalizeChartPreferences, useChartPreferences } from "./chartPreferences";

describe("indicator catalog and saved preferences", () => {
  it("does not fabricate an initial balance from non-time tick bars", () => {
    const ib = INDICATOR_CATALOG.find((item) => item.key === "ib")!;
    const result = ib.calculate({
      bars: [],
      inputs: {},
      interval: 0,
      session: DEFAULT_INITIAL_BALANCE,
    });
    expect(result.plots).toEqual([]);
    expect(result.sessionStats).toBeUndefined();
    expect(result.status).toContain("needs time-based bars");
  });
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
    expect(findIndicators("chaikin").map((entry) => entry.key)).toEqual(["cmf"]);
    expect(findIndicators("rate of change").map((entry) => entry.key)).toEqual(["roc"]);
    expect(findIndicators("stochastic rsi").map((entry) => entry.key)).toEqual(["stochRsi"]);
    expect(findIndicators("initial").map((entry) => entry.key)).toEqual(["ib"]);
    expect(findIndicators("overlays").map((entry) => entry.key)).toEqual([
      "sma",
      "ema",
      "bollinger",
      "donchian",
      "keltner",
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
    { sessionEndTime: "10:00" },
    { sessionEndTime: "25:00" },
    { showMidpoint: "no" },
    { startTime: "23:00", durationMinutes: 120 },
  ])("rejects invalid settings %j", (invalid) => {
    expect(isValidInitialBalanceSettings({ ...DEFAULT_INITIAL_BALANCE, ...invalid })).toBe(false);
  });
  it("restores older IB preferences and retains explicit visual toggles", () => {
    const legacy = normalizeChartPreferences({
      initialBalance: { startTime: "09:30", timeZone: "America/New_York", durationMinutes: 60 },
    });
    expect(legacy.initialBalance).toEqual(DEFAULT_INITIAL_BALANCE);
    const custom = {
      ...DEFAULT_INITIAL_BALANCE,
      sessionEndTime: "15:00",
      showLabels: false,
      showBox: false,
      showDashboard: false,
      showHistory: false,
    };
    expect(normalizeChartPreferences({ initialBalance: custom }).initialBalance).toEqual(custom);
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

describe("indicator inputs", () => {
  it("restores valid inputs while dropping unknown keys and repairing invalid stored values", () => {
    const restored = normalizeChartPreferences({
      indicators: { sma: true },
      indicatorInputs: {
        sma: { period: 50, unexpected: 99 },
        bollinger: { period: 5.5, deviations: 1.5 },
        keltner: { period: 0, atrPeriod: 8, multiplier: Infinity },
        stochRsi: { rsiPeriod: 10, smoothK: 2 },
        macd: { fast: 40, slow: 20, signalPeriod: 5 },
        missing: { period: 12 },
      },
    });
    expect(restored.indicatorInputs).toEqual({
      sma: { period: 50, source: 0 },
      bollinger: { period: 20, deviations: 1.5 },
      keltner: { period: 20, atrPeriod: 8, multiplier: 2 },
      stochRsi: { rsiPeriod: 10, stochasticPeriod: 14, smoothK: 2, periodD: 3 },
      macd: { fast: 12, slow: 26, signalPeriod: 5 },
    });
    expect(normalizeChartPreferences({ indicators: { sma: true } }).indicatorInputs).toEqual({});
    expect(getIndicatorInputs("sma")).toEqual({ period: 20, source: 0 });
    expect(getIndicatorLabel("sma", restored.indicatorInputs)).toBe("SMA 50");
    expect(getIndicatorLabel("stochRsi", restored.indicatorInputs)).toBe(
      "Stochastic RSI 10 / 14 / 2 / 3",
    );
  });

  it("applies valid edits atomically, persists them, and resets only the selected indicator", () => {
    const original = useChartPreferences.getState();
    try {
      const store = useChartPreferences.getState();
      store.setIndicatorInputs("sma", { period: 50 });
      store.setIndicatorInputs("bollinger", { deviations: 1.5 });
      store.setIndicatorInputs("macd", { fast: 30, slow: 40 });
      const before = useChartPreferences.getState().indicatorInputs;
      store.setIndicatorInputs("macd", { slow: 20 });
      store.setIndicatorInputs("sma", { period: 501 });
      store.setIndicatorInputs("bollinger", { period: 5, deviations: -1 });
      store.setIndicatorInputs("sma", { multiplier: 2 });
      expect(useChartPreferences.getState().indicatorInputs).toBe(before);
      const restored = normalizeChartPreferences(
        JSON.parse(JSON.stringify(useChartPreferences.getState())),
      );
      expect(restored.indicatorInputs).toEqual(before);
      store.resetIndicatorInputs("sma");
      expect(getIndicatorInputs("sma", useChartPreferences.getState().indicatorInputs)).toEqual({
        period: 20,
        source: 0,
      });
      expect(useChartPreferences.getState().indicatorInputs.bollinger).toEqual({
        period: 20,
        deviations: 1.5,
      });
      expect(useChartPreferences.getState().indicatorInputs.macd).toEqual({
        fast: 30,
        slow: 40,
        signalPeriod: 9,
      });
    } finally {
      useChartPreferences.setState(original, true);
    }
  });
});

describe("RSI price source inputs", () => {
  it("uses the selected source in the plotted RSI and defaults older settings to close", () => {
    const definition = INDICATOR_CATALOG.find((item) => item.key === "rsi")!;
    const bars = [10, 20, 30].map((close, index) => ({
      time: index + 1,
      open: 40 - close,
      high: 40,
      low: 0,
      close,
      volume: 1,
    }));
    const calculate = (source?: number) =>
      definition.calculate({
        bars,
        inputs: getIndicatorInputs("rsi", {
          rsi: { period: 2, ...(source === undefined ? {} : { source }) },
        }),
        interval: 1,
        session: DEFAULT_INITIAL_BALANCE,
      }).plots[0]!.points;
    expect(calculate()).toEqual([{ time: 3, value: 100 }]);
    expect(calculate(1)).toEqual([{ time: 3, value: 0 }]);
    expect(calculate(4)).toEqual([{ time: 3, value: 50 }]);
    expect(calculate(99)).toEqual(calculate());
  });
});

describe("moving-average price source inputs", () => {
  it("routes the selected source into both moving-average calculations", () => {
    const bars = [
      { time: 1, open: 10, high: 40, low: 0, close: 30, volume: 1 },
      { time: 2, open: 20, high: 80, low: 0, close: 60, volume: 1 },
    ];
    for (const key of ["sma", "ema"] as const) {
      const definition = INDICATOR_CATALOG.find((item) => item.key === key)!;
      const calculate = (source: number) =>
        definition
          .calculate({
            bars,
            inputs: getIndicatorInputs(key, { [key]: { period: 2, source } }),
            interval: 1,
            session: DEFAULT_INITIAL_BALANCE,
          })
          .plots[0]!.points.at(-1)!.value;
      expect(calculate(0)).toBe(45);
      expect(calculate(1)).toBe(15);
      expect(calculate(2)).toBe(60);
      expect(calculate(3)).toBe(0);
      expect(calculate(4)).toBe(30);
      expect(calculate(5)).toBe(35);
      expect(calculate(6)).toBe(30);
      expect(getIndicatorInputs(key, { [key]: { period: 50, source: 99 } })).toEqual({
        period: 50,
        source: 0,
      });
      expect(getIndicatorLabel(key, { [key]: { period: 50, source: 1 } })).toBe(
        `${key.toUpperCase()} 50`,
      );
    }
  });
});
