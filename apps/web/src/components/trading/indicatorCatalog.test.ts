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
import { calculateStochasticRSI } from "./advancedIndicators";

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
      gridMode: "none",
      priceScaleMode: "logarithmic",
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
    expect(restored.gridMode).toBe("both");
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
    expect(findIndicators(" MOVING average ").map((entry) => entry.key)).toEqual([
      "sma",
      "ema",
      "wma",
      "hma",
    ]);
    expect(findIndicators("chaikin").map((entry) => entry.key)).toEqual(["cmf"]);
    expect(findIndicators("money flow index").map((entry) => entry.key)).toEqual(["mfi"]);
    expect(findIndicators("bollinger %b").map((entry) => entry.key)).toEqual(["bbPercentB"]);
    expect(findIndicators("awesome").map((entry) => entry.key)).toEqual(["ao"]);
    expect(findIndicators("rate of change").map((entry) => entry.key)).toEqual(["roc"]);
    expect(findIndicators("stochastic rsi").map((entry) => entry.key)).toEqual(["stochRsi"]);
    expect(findIndicators("initial").map((entry) => entry.key)).toEqual(["ib"]);
    expect(findIndicators("overlays").map((entry) => entry.key)).toEqual([
      "sar",
      "supertrend",
      "sma",
      "ema",
      "wma",
      "hma",
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
      bollinger: { period: 20, deviations: 1.5, source: 0, basisType: 0 },
      keltner: { period: 20, atrPeriod: 8, multiplier: 2 },
      stochRsi: {
        rsiPeriod: 10,
        stochasticPeriod: 14,
        smoothK: 2,
        periodD: 3,
        source: 0,
        lowerLevel: 20,
        upperLevel: 80,
        showLevels: 1,
      },
      macd: { fast: 12, slow: 26, signalPeriod: 5, source: 0, oscillatorMA: 0, signalMA: 0 },
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
        source: 0,
        basisType: 0,
      });
      expect(useChartPreferences.getState().indicatorInputs.macd).toEqual({
        fast: 30,
        slow: 40,
        signalPeriod: 9,
        source: 0,
        oscillatorMA: 0,
        signalMA: 0,
      });
    } finally {
      useChartPreferences.setState(original, true);
    }
  });
});

describe("Bollinger Bands price source inputs", () => {
  it("plots both the basis and spread from the selected price source", () => {
    const definition = INDICATOR_CATALOG.find((item) => item.key === "bollinger")!;
    const bars = [
      { time: 1, open: 4, high: 14, low: 0, close: 10, volume: 1 },
      { time: 2, open: 8, high: 26, low: 2, close: 12, volume: 1 },
    ];
    const calculate = (source?: number) =>
      definition
        .calculate({
          bars,
          interval: 1,
          session: DEFAULT_INITIAL_BALANCE,
          inputs: getIndicatorInputs("bollinger", {
            bollinger: { period: 2, deviations: 2, ...(source === undefined ? {} : { source }) },
          }),
        })
        .plots.map((plot) => plot.points.at(-1)!.value);
    expect(calculate(0)).toEqual([13, 11, 9]);
    expect(calculate(1)).toEqual([10, 6, 2]);
    expect(calculate()).toEqual(calculate(0));
    expect(calculate(99)).toEqual(calculate(0));
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

describe("MACD source and moving-average inputs", () => {
  it.each([
    { oscillatorMA: 0, signalMA: 0, macd: 91 / 1944, signal: 221 / 972, histogram: -13 / 72 },
    { oscillatorMA: 0, signalMA: 1, macd: 91 / 1944, signal: 1741 / 3888, histogram: -1559 / 3888 },
    { oscillatorMA: 1, signalMA: 0, macd: 4 / 3, signal: 293 / 324, histogram: 139 / 324 },
    { oscillatorMA: 1, signalMA: 1, macd: 4 / 3, signal: 1 / 2, histogram: 5 / 6 },
  ])(
    "routes source and oscillator=$oscillatorMA/signal=$signalMA selectors to plotted values",
    ({ oscillatorMA, signalMA, ...expected }) => {
      const definition = INDICATOR_CATALOG.find((item) => item.key === "macd")!;
      const bars = [2, 5, 3, 8, 4, 10, 6].map((open, index) => ({
        time: index + 1,
        open,
        high: 100,
        low: 0,
        close: 50,
        volume: 1,
      }));
      const inputs = getIndicatorInputs("macd", {
        macd: { fast: 2, slow: 3, signalPeriod: 2, source: 1, oscillatorMA, signalMA },
      });
      const plots = definition.calculate({
        bars,
        inputs,
        interval: 1,
        session: DEFAULT_INITIAL_BALANCE,
      }).plots;
      for (const id of ["macd", "signal", "histogram"] as const) {
        const points = plots.find((plot) => plot.id === id)!.points;
        expect(points[0]?.time).toBe(id === "macd" ? 3 : 4);
        expect(points.at(-1)?.time).toBe(7);
        expect(points.at(-1)?.value).toBeCloseTo(expected[id], 10);
      }
      const legacyInputs = getIndicatorInputs("macd", {
        macd: { fast: 2, slow: 3, signalPeriod: 2 },
      });
      expect(legacyInputs).toEqual({
        fast: 2,
        slow: 3,
        signalPeriod: 2,
        source: 0,
        oscillatorMA: 0,
        signalMA: 0,
      });
      const legacy = definition.calculate({
        bars,
        inputs: legacyInputs,
        interval: 1,
        session: DEFAULT_INITIAL_BALANCE,
      });
      expect(legacy.plots.map((plot) => plot.points.at(-1)?.value)).toEqual([0, 0, 0]);
      expect(getIndicatorLabel("macd", { macd: inputs })).toBe("MACD 2 / 3 / 2");
    },
  );

  it("repairs invalid stored selector values without discarding valid lengths", () => {
    expect(
      getIndicatorInputs("macd", {
        macd: { fast: 7, slow: 21, signalPeriod: 4, source: 99, oscillatorMA: 0.5, signalMA: -1 },
      }),
    ).toEqual({ fast: 7, slow: 21, signalPeriod: 4, source: 0, oscillatorMA: 0, signalMA: 0 });
  });
});

describe("ATR smoothing inputs", () => {
  const bars = [2, 6, 3, 9, 4].map((range, index) => ({
    time: index + 1,
    open: 0,
    high: range,
    low: 0,
    close: 0,
    volume: 1,
  }));
  const definition = INDICATOR_CATALOG.find((item) => item.key === "atr")!;
  const calculate = (smoothing?: number) =>
    definition.calculate({
      bars,
      inputs: getIndicatorInputs("atr", {
        atr: { period: 3, ...(smoothing === undefined ? {} : { smoothing }) },
      }),
      interval: 1,
      session: DEFAULT_INITIAL_BALANCE,
    }).plots[0]!.points;

  it.each([
    { smoothing: 0, name: "RMA", expected: [11 / 3, 49 / 9, 134 / 27] },
    { smoothing: 1, name: "SMA", expected: [11 / 3, 6, 16 / 3] },
    { smoothing: 2, name: "EMA", expected: [11 / 3, 19 / 3, 31 / 6] },
    { smoothing: 3, name: "WMA", expected: [23 / 6, 13 / 2, 11 / 2] },
  ])("plots $name true-range smoothing with the selected length", ({ smoothing, expected }) => {
    const points = calculate(smoothing);
    expect(points.map((point) => point.time)).toEqual([3, 4, 5]);
    points.forEach((point, index) => expect(point.value).toBeCloseTo(expected[index]!, 10));
  });

  it("defaults legacy ATR inputs to RMA and repairs invalid saved smoothing without losing length", () => {
    expect(getIndicatorInputs("atr")).toEqual({ period: 14, smoothing: 0 });
    expect(getIndicatorInputs("atr", { atr: { period: 3 } })).toEqual({
      period: 3,
      smoothing: 0,
    });
    expect(calculate()).toEqual(calculate(0));
    for (const smoothing of [-1, 4, 0.5, NaN, Infinity]) {
      expect(
        normalizeChartPreferences({ indicatorInputs: { atr: { period: 7, smoothing } } })
          .indicatorInputs.atr,
      ).toEqual({ period: 7, smoothing: 0 });
      expect(calculate(smoothing)).toEqual(calculate(0));
    }
  });
});

describe("Stochastic RSI source inputs", () => {
  const definition = INDICATOR_CATALOG.find((item) => item.key === "stochRsi")!;
  const bars = Array.from({ length: 40 }, (_, index) => ({
    time: index + 1,
    open: 100 + (index % 5),
    high: 120 + ((index * 7) % 13),
    low: 90 - (index % 3),
    close: 100 + ((index * 3) % 11),
    volume: 1,
  }));
  it("routes the selected RSI source to both K and D without changing smoothing or legend", () => {
    const values = { rsiPeriod: 3, stochasticPeriod: 3, smoothK: 2, periodD: 2 };
    const close = calculateStochasticRSI(bars, 3, 3, 2, 2);
    const high = calculateStochasticRSI(bars, 3, 3, 2, 2, "high");
    expect(high.k).not.toEqual(close.k);
    expect(high.d).not.toEqual(close.d);
    const inputs = getIndicatorInputs("stochRsi", { stochRsi: { ...values, source: 2 } });
    const result = definition.calculate({
      bars,
      inputs,
      interval: 5,
      session: DEFAULT_INITIAL_BALANCE,
    });
    expect(result.plots.find((plot) => plot.id === "k")?.points).toEqual(high.k);
    expect(result.plots.find((plot) => plot.id === "d")?.points).toEqual(high.d);
    expect(getIndicatorLabel("stochRsi", { stochRsi: inputs })).toBe(
      "Stochastic RSI 3 / 3 / 2 / 2",
    );
  });
  it("repairs missing or invalid saved sources to Close while retaining lengths", () => {
    for (const source of [undefined, -1, 7, 1.5, NaN]) {
      const inputs = getIndicatorInputs("stochRsi", {
        stochRsi: {
          rsiPeriod: 7,
          stochasticPeriod: 9,
          smoothK: 1,
          periodD: 2,
          ...(source === undefined ? {} : { source }),
        },
      });
      expect(inputs).toEqual({
        rsiPeriod: 7,
        stochasticPeriod: 9,
        smoothK: 1,
        periodD: 2,
        source: 0,
        lowerLevel: 20,
        upperLevel: 80,
        showLevels: 1,
      });
    }
  });
});

describe.each(["rsi", "stochastic", "stochRsi", "mfi"] as const)("%s oscillator levels", (key) => {
  const bars = Array.from({ length: 60 }, (_, index) => ({
    time: index + 1,
    open: 100 + (index % 5),
    high: 120 + ((index * 7) % 13),
    low: 90 - (index % 3),
    close: 100 + ((index * 3) % 11),
    volume: 1,
  }));
  const definition = INDICATOR_CATALOG.find((item) => item.key === key)!;
  const defaultLevels = key === "rsi" ? [30, 70] : [20, 80];
  it("changes and hides reference levels without changing oscillator points or legend", () => {
    const baseline = getIndicatorInputs(key);
    const custom = { ...baseline, lowerLevel: 12.5, upperLevel: 87.5 };
    const calculate = (inputs: typeof baseline) =>
      definition.calculate({
        bars,
        inputs,
        interval: 5,
        session: DEFAULT_INITIAL_BALANCE,
      }).plots;
    const initial = calculate(baseline);
    expect(initial[0]!.points.length).toBeGreaterThan(0);
    expect(initial[0]!.levels).toEqual(defaultLevels);
    const changed = calculate(custom);
    expect(changed[0]!.levels).toEqual([12.5, 87.5]);
    expect(changed.slice(1).every((plot) => !plot.levels?.length)).toBe(true);
    expect(changed.map((plot) => plot.points)).toEqual(initial.map((plot) => plot.points));
    const hidden = calculate({ ...custom, showLevels: 0 });
    expect(hidden[0]!.levels).toEqual([]);
    expect(hidden.map((plot) => plot.points)).toEqual(initial.map((plot) => plot.points));
    expect(getIndicatorLabel(key, { [key]: custom })).toBe(getIndicatorLabel(key));
    expect(calculate({ ...custom, lowerLevel: 0, upperLevel: 100 })[0]!.levels).toEqual([0, 100]);
  });

  it("defaults legacy levels and repairs reversed/equal saved pairs while retaining other inputs", () => {
    const length = key === "stochRsi" ? { rsiPeriod: 7 } : { period: 7 };
    const expected = { ...getIndicatorInputs(key), ...length };
    expect(getIndicatorInputs(key, { [key]: length })).toEqual(expected);
    for (const [lowerLevel, upperLevel] of [
      [90, 10],
      [50, 50],
    ]) {
      const saved = normalizeChartPreferences({
        indicatorInputs: { [key]: { ...length, lowerLevel, upperLevel, showLevels: 0 } },
      });
      expect(saved.indicatorInputs[key]).toEqual({ ...expected, showLevels: 0 });
    }
  });
});

it("keeps Bollinger fills separate across VWMA windows with no volume", () => {
  const definition = INDICATOR_CATALOG.find((i) => i.key === "bollinger")!;
  const bars = [1, 1, 1, 0, 0, 1, 1].map((volume, i) => ({
    time: i + 1,
    open: i + 5,
    high: i + 7,
    low: i + 3,
    close: i + 5,
    volume,
  }));
  const result = definition.calculate({
    bars,
    inputs: getIndicatorInputs("bollinger", { bollinger: { period: 2, basisType: 4 } }),
    interval: 5,
    session: DEFAULT_INITIAL_BALANCE,
  });
  expect(result.plots[1]!.points.map((p) => p.time)).toEqual([2, 3, 4, 6, 7]);
  expect(result.fills?.map((f) => f.upper.map((p) => p.time))).toEqual([
    [2, 3, 4],
    [6, 7],
  ]);
  expect(result.fills?.map((f) => f.lower.map((p) => p.time))).toEqual([
    [2, 3, 4],
    [6, 7],
  ]);
});
