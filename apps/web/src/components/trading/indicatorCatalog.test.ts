import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_INDICATORS,
  DEFAULT_INITIAL_BALANCE,
  INDICATOR_CATALOG,
  getIndicatorInputs,
  updateIndicatorInputs,
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
      "keltner",
    ]);
    expect(findIndicators("chaikin").map((entry) => entry.key)).toEqual(["cmf"]);
    expect(findIndicators("money flow index").map((entry) => entry.key)).toEqual(["mfi"]);
    expect(findIndicators("bollinger %b").map((entry) => entry.key)).toEqual(["bbPercentB"]);
    expect(findIndicators("bandwidth").map((entry) => entry.key)).toEqual(["bbWidth"]);
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
      keltner: { period: 20, atrPeriod: 8, multiplier: 2, source: 0, basisType: 0, rangeType: 0 },
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
      macd: {
        fast: 12,
        slow: 26,
        signalPeriod: 5,
        source: 0,
        oscillatorMA: 0,
        signalMA: 0,
        histogramColors: 0,
      },
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
        histogramColors: 0,
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
    {
      oscillatorMA: 0,
      signalMA: 0,
      macd: 91 / 1944,
      signal: 221 / 972,
      histogram: -13 / 72,
    },
    { oscillatorMA: 0, signalMA: 1, macd: 91 / 1944, signal: 1741 / 3888, histogram: -1559 / 3888 },
    {
      oscillatorMA: 1,
      signalMA: 0,
      macd: 4 / 3,
      signal: 293 / 324,
      histogram: 139 / 324,
    },
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
        histogramColors: 0,
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
    ).toEqual({
      fast: 7,
      slow: 21,
      signalPeriod: 4,
      source: 0,
      oscillatorMA: 0,
      signalMA: 0,
      histogramColors: 0,
    });
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

describe.each(["rsi", "stochastic", "stochRsi", "mfi", "williams"] as const)(
  "%s oscillator levels",
  (key) => {
    const bars = Array.from({ length: 60 }, (_, index) => ({
      time: index + 1,
      open: 100 + (index % 5),
      high: 120 + ((index * 7) % 13),
      low: 90 - (index % 3),
      close: 100 + ((index * 3) % 11),
      volume: 1,
    }));
    const definition = INDICATOR_CATALOG.find((item) => item.key === key)!;
    const defaultLevels = key === "rsi" ? [30, 70] : key === "williams" ? [-80, -20] : [20, 80];
    const offset = key === "williams" ? -100 : 0;
    it("accepts negative-domain boundaries where supported and rejects invalid threshold edits", () => {
      const current = { [key]: getIndicatorInputs(key) };
      expect(
        updateIndicatorInputs(key, current, { lowerLevel: offset, upperLevel: 100 + offset }),
      ).toMatchObject({ [key]: { lowerLevel: offset, upperLevel: 100 + offset } });
      for (const patch of [
        { lowerLevel: offset - 0.1 },
        { upperLevel: 100.1 + offset },
        { lowerLevel: NaN },
        { upperLevel: Infinity },
        { showLevels: 2 },
        { lowerLevel: 50 + offset, upperLevel: 50 + offset },
        { lowerLevel: 90 + offset, upperLevel: 10 + offset },
      ])
        expect(updateIndicatorInputs(key, current, patch)).toBeNull();
    });
    it("changes and hides reference levels without changing oscillator points or legend", () => {
      const baseline = getIndicatorInputs(key);
      const custom = { ...baseline, lowerLevel: 12.5 + offset, upperLevel: 87.5 + offset };
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
      expect(changed[0]!.levels).toEqual([12.5 + offset, 87.5 + offset]);
      expect(changed.slice(1).every((plot) => !plot.levels?.length)).toBe(true);
      expect(changed.map((plot) => plot.points)).toEqual(initial.map((plot) => plot.points));
      const hidden = calculate({ ...custom, showLevels: 0 });
      expect(hidden[0]!.levels).toEqual([]);
      expect(hidden.map((plot) => plot.points)).toEqual(initial.map((plot) => plot.points));
      expect(getIndicatorLabel(key, { [key]: custom })).toBe(getIndicatorLabel(key));
      expect(
        calculate({ ...custom, lowerLevel: offset, upperLevel: 100 + offset })[0]!.levels,
      ).toEqual([offset, 100 + offset]);
    });

    it("defaults legacy levels and repairs reversed/equal saved pairs while retaining other inputs", () => {
      const length = key === "stochRsi" ? { rsiPeriod: 7 } : { period: 7 };
      const expected = { ...getIndicatorInputs(key), ...length };
      expect(getIndicatorInputs(key, { [key]: length })).toEqual(expected);
      for (const [lowerLevel, upperLevel] of [
        [90 + offset, 10 + offset],
        [50 + offset, 50 + offset],
      ]) {
        const saved = normalizeChartPreferences({
          indicatorInputs: { [key]: { ...length, lowerLevel, upperLevel, showLevels: 0 } },
        });
        expect(saved.indicatorInputs[key]).toEqual({ ...expected, showLevels: 0 });
      }
    });
  },
);

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

describe("CCI reference levels", () => {
  const definition = INDICATOR_CATALOG.find((item) => item.key === "cci")!;
  const defaults = {
    period: 20,
    source: 5,
    showLevels: 1,
    lowerLevel: -100,
    middleLevel: 0,
    upperLevel: 100,
  };
  const bars = Array.from({ length: 30 }, (_, index) => ({
    time: index + 1,
    open: 100 + index,
    high: 110 + index,
    low: 90 + index,
    close: 100 + index + (index % 3),
    volume: 10,
  }));
  const calculate = (inputs: typeof defaults) =>
    definition.calculate({ bars, inputs, interval: 5, session: DEFAULT_INITIAL_BALANCE });

  it("provides decimal unbounded-oscillator levels without including them in the legend", () => {
    expect(getIndicatorInputs("cci")).toEqual(defaults);
    for (const key of ["lowerLevel", "middleLevel", "upperLevel"])
      expect(definition.inputs.find((input) => input.key === key)).toMatchObject({
        min: -10000,
        max: 10000,
        step: 0.1,
        legend: false,
      });
    expect(definition.inputs.find((input) => input.key === "showLevels")).toMatchObject({
      kind: "boolean",
      defaultValue: 1,
      legend: false,
    });
    const initial = calculate(defaults);
    expect(initial.plots[0]!.levels).toEqual([-100, 0, 100]);
    expect(initial.plots[0]!.bounds).toBeUndefined();
    expect(initial.plots[0]!.breakOnGaps).toBe(true);
  });

  it("accepts decimal and range-boundary triples and rejects invalid edits atomically", () => {
    const current = { cci: { ...defaults, period: 7, source: 1 }, rsi: { period: 9 } };
    const snapshot = structuredClone(current);
    expect(
      updateIndicatorInputs("cci", current, {
        lowerLevel: -10000,
        middleLevel: -12.5,
        upperLevel: 10000,
      }),
    ).toEqual({
      ...current,
      cci: { ...current.cci, lowerLevel: -10000, middleLevel: -12.5, upperLevel: 10000 },
    });
    for (const patch of [
      { lowerLevel: -10000.1 },
      { middleLevel: 10000.1 },
      { upperLevel: 10000.1 },
      { lowerLevel: NaN },
      { middleLevel: Infinity },
      { upperLevel: -Infinity },
      { lowerLevel: 0 },
      { upperLevel: 0 },
      { middleLevel: -100 },
      { middleLevel: 100 },
      { lowerLevel: 50, middleLevel: 0, upperLevel: -50 },
      { showLevels: 2 },
      { showLevels: 0.5 },
      { period: 5, lowerLevel: 1 },
    ])
      expect(updateIndicatorInputs("cci", current, patch)).toBeNull();
    expect(current).toEqual(snapshot);
  });

  it("changes and hides all three lines without changing oscillator points or legend", () => {
    const custom = { ...defaults, lowerLevel: -175.5, middleLevel: 12.5, upperLevel: 250.5 };
    const initial = calculate(defaults);
    expect(initial.plots[0]!.points.length).toBeGreaterThan(0);
    const changed = calculate(custom);
    expect(changed.plots[0]!.levels).toEqual([-175.5, 12.5, 250.5]);
    expect(changed.plots[0]!.points).toEqual(initial.plots[0]!.points);
    expect(changed).toEqual({
      ...initial,
      plots: initial.plots.map((plot) => ({ ...plot, levels: [-175.5, 12.5, 250.5] })),
    });
    const hidden = calculate({ ...custom, showLevels: 0 });
    expect(hidden.plots[0]!.levels).toEqual([]);
    expect(hidden.plots[0]!.points).toEqual(initial.plots[0]!.points);
    expect(getIndicatorLabel("cci", { cci: custom })).toBe(getIndicatorLabel("cci"));
    expect(getIndicatorLabel("cci", { cci: { ...custom, showLevels: 0 } })).toBe(
      getIndicatorLabel("cci"),
    );
  });

  it("defaults legacy levels and repairs unordered saved triples while preserving other inputs", () => {
    const otherInputs = { period: 7, source: 1, showLevels: 0 };
    const expected = { ...defaults, ...otherInputs };
    expect(getIndicatorInputs("cci", { cci: otherInputs })).toEqual(expected);
    for (const [lowerLevel, middleLevel, upperLevel] of [
      [0, 0, 100],
      [-100, 100, 100],
      [50, 0, -50],
      [-100, -200, 100],
      [-100, 200, 100],
    ]) {
      const restored = normalizeChartPreferences({
        indicatorInputs: {
          cci: { ...otherInputs, lowerLevel, middleLevel, upperLevel },
          rsi: { period: 9 },
        },
      });
      expect(restored.indicatorInputs.cci).toEqual(expected);
      expect(restored.indicatorInputs.rsi?.period).toBe(9);
    }
    expect(
      getIndicatorInputs("cci", {
        cci: { ...otherInputs, lowerLevel: NaN, middleLevel: Infinity, upperLevel: 10001 },
      }),
    ).toEqual(expected);
    expect(
      getIndicatorInputs("cci", {
        cci: { ...otherInputs, lowerLevel: -140.5, middleLevel: -0.5, upperLevel: 210.5 },
      }),
    ).toEqual({
      ...otherInputs,
      lowerLevel: -140.5,
      middleLevel: -0.5,
      upperLevel: 210.5,
    });
  });
});

it("keeps Keltner lines and fills separate when its selected source is missing", () => {
  const definition = INDICATOR_CATALOG.find((i) => i.key === "keltner")!;
  const bars = Array.from({ length: 10 }, (_, i) => ({
    time: i + 1,
    open: i === 4 ? NaN : 100 + i,
    close: 100 + i,
    high: 102 + i,
    low: 98 + i,
    volume: 10,
  }));
  const inputs = { ...getIndicatorInputs("keltner"), period: 2, atrPeriod: 2, source: 1 };
  const result = definition.calculate({
    bars,
    inputs,
    interval: 5,
    session: DEFAULT_INITIAL_BALANCE,
  });
  expect(result.plots.map((p) => p.points.map((p) => p.time))).toEqual(
    Array.from({ length: 3 }, () => [2, 3, 4, 7, 8, 9, 10]),
  );
  expect(result.plots.every((p) => p.breakOnGaps)).toBe(true);
  expect(result.fills?.map((f) => f.upper.map((p) => p.time))).toEqual([
    [2, 3, 4],
    [7, 8, 9, 10],
  ]);
  expect(getIndicatorLabel("keltner", { keltner: inputs })).toBe(
    getIndicatorLabel("keltner", { keltner: { ...inputs, source: 0 } }),
  );
  expect(updateIndicatorInputs("keltner", { keltner: inputs }, { source: 7 })).toBeNull();
});

it("changes Keltner basis without changing its ATR spread or legend and rejects invalid types", () => {
  const definition = INDICATOR_CATALOG.find((i) => i.key === "keltner")!;
  const bars = [10, 14, 13, 18, 11].map((close, i) => ({
    time: i + 1,
    open: close,
    close,
    high: close + 2,
    low: close - 2,
    volume: 10,
  }));
  const inputs = { ...getIndicatorInputs("keltner"), period: 3, atrPeriod: 2, source: 0 };
  const calculate = (basisType: number) =>
    definition.calculate({
      bars,
      inputs: { ...inputs, basisType },
      interval: 5,
      session: DEFAULT_INITIAL_BALANCE,
    });
  const ema = calculate(0),
    sma = calculate(1);
  expect(sma.plots[1]!.points.map((p) => p.value)).toEqual([37 / 3, 15, 14]);
  expect(ema.plots[1]!.points.at(-1)!.value).not.toBe(14);
  sma.plots[0]!.points.forEach((p, i) =>
    expect(p.value - sma.plots[1]!.points[i]!.value).toBeCloseTo(
      ema.plots[0]!.points[i]!.value - ema.plots[1]!.points[i]!.value,
      10,
    ),
  );
  expect(getIndicatorLabel("keltner", { keltner: { ...inputs, basisType: 0 } })).toBe(
    getIndicatorLabel("keltner", { keltner: { ...inputs, basisType: 1 } }),
  );
  for (const basisType of [-1, 2, 0.5, NaN, Infinity])
    expect(updateIndicatorInputs("keltner", { keltner: inputs }, { basisType })).toBeNull();
  expect(getIndicatorInputs("keltner", { keltner: { period: 3, basisType: 99 } }).basisType).toBe(
    0,
  );
});

it("selects Keltner range calculations without changing its basis and rejects invalid modes", () => {
  const definition = INDICATOR_CATALOG.find((i) => i.key === "keltner")!;
  const bars = [10, 20, 15, 25, 24].map((close, i) => ({
    time: i + 1,
    open: close,
    close,
    high: close + 2,
    low: close - 2,
    volume: 10,
  }));
  const inputs = { ...getIndicatorInputs("keltner"), period: 2, atrPeriod: 2, multiplier: 1 };
  const calculate = (rangeType: number) =>
    definition.calculate({
      bars,
      inputs: { ...inputs, rangeType },
      interval: 5,
      session: DEFAULT_INITIAL_BALANCE,
    });
  const results = [0, 1, 2].map(calculate);
  const widths = [
    [8, 7.5, 9.75, 6.875],
    [12, 7, 12, 4],
    [4, 4, 4, 4],
  ];
  for (let mode = 0; mode < 3; mode++) {
    const result = results[mode]!;
    expect(result.plots[1]!.points).toEqual(results[0]!.plots[1]!.points);
    result.plots[0]!.points.forEach((point, i) => {
      expect(point.value - result.plots[1]!.points[i]!.value).toBeCloseTo(widths[mode]![i]!, 10);
      expect(result.plots[1]!.points[i]!.value - result.plots[2]!.points[i]!.value).toBeCloseTo(
        widths[mode]![i]!,
        10,
      );
    });
    expect(getIndicatorLabel("keltner", { keltner: { ...inputs, rangeType: mode } })).toBe(
      getIndicatorLabel("keltner", { keltner: inputs }),
    );
  }
  for (const rangeType of [-1, 3, 0.5, NaN, Infinity]) {
    expect(updateIndicatorInputs("keltner", { keltner: inputs }, { rangeType })).toBeNull();
    expect(getIndicatorInputs("keltner", { keltner: { rangeType } }).rangeType).toBe(0);
  }
});

it("adds RSI moving averages without replacing its original values or levels", () => {
  const definition = INDICATOR_CATALOG.find((i) => i.key === "rsi")!;
  const bars = [10, 12, 11, 15, 12, 16, 11, 14, 10, 17].map((close, i) => ({
    time: i + 1,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
  }));
  const inputs = { ...getIndicatorInputs("rsi"), period: 2, smoothingPeriod: 3 };
  const run = (smoothingType: number) =>
    definition.calculate({
      bars,
      inputs: { ...inputs, smoothingType },
      interval: 5,
      session: DEFAULT_INITIAL_BALANCE,
    });
  const original = run(0);
  expect(original.plots).toHaveLength(1);
  const values = original.plots[0]!.points;
  for (const smoothingType of [1, 2, 3, 4]) {
    const result = run(smoothingType);
    expect(result.plots[0]).toEqual(original.plots[0]);
    const smoothed = result.plots[1]!;
    expect(smoothed.primary).toBe(false);
    expect(smoothed.breakOnGaps).toBe(true);
    expect(smoothed.points).toHaveLength(values.length - 2);
    const seed = values.slice(0, 3).reduce((sum, p) => sum + p.value, 0) / 3;
    if (smoothingType !== 4) expect(smoothed.points[0]!.value).toBeCloseTo(seed, 10);
    if (smoothingType === 1)
      smoothed.points.forEach((p, i) =>
        expect(p.value).toBeCloseTo(
          values.slice(i, i + 3).reduce((sum, v) => sum + v.value, 0) / 3,
          10,
        ),
      );
    if (smoothingType === 4)
      smoothed.points.forEach((p, i) =>
        expect(p.value).toBeCloseTo(
          values.slice(i, i + 3).reduce((sum, v, j) => sum + v.value * (j + 1), 0) / 6,
          10,
        ),
      );
    expect(getIndicatorLabel("rsi", { rsi: { ...inputs, smoothingType } })).toBe(
      getIndicatorLabel("rsi", { rsi: inputs }),
    );
  }
  expect(
    getIndicatorInputs("rsi", { rsi: { smoothingType: 99, smoothingPeriod: 0 } }),
  ).toMatchObject({ smoothingType: 0, smoothingPeriod: 14 });
});

it("shades RSI between its configured levels independently of the level lines", () => {
  const definition = INDICATOR_CATALOG.find((i) => i.key === "rsi")!;
  const bars = [10, 12, 11, 15, 12, 16, 13].map((close, i) => ({
    time: i + 1,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
  }));
  const inputs = { ...getIndicatorInputs("rsi"), period: 2, lowerLevel: 25, upperLevel: 65 };
  const run = (showLevels: number) =>
    definition.calculate({
      bars,
      inputs: { ...inputs, showLevels },
      interval: 5,
      session: DEFAULT_INITIAL_BALANCE,
    });
  const result = run(1),
    hidden = run(0);
  expect(result.fills).toHaveLength(1);
  expect(result.fills![0]!.upper).toEqual(
    result.plots[0]!.points.map((p) => ({ time: p.time, value: 65 })),
  );
  expect(result.fills![0]!.lower).toEqual(
    result.plots[0]!.points.map((p) => ({ time: p.time, value: 25 })),
  );
  expect(hidden.fills).toEqual(result.fills);
  expect(hidden.plots[0]!.levels).toEqual([]);
  expect(hidden.plots[0]!.points).toEqual(result.plots[0]!.points);
});

it("adds RSI Bollinger smoothing around its SMA without changing RSI or level shading", () => {
  const definition = INDICATOR_CATALOG.find((i) => i.key === "rsi")!;
  const bars = [10, 12, 11, 15, 12, 16, 11, 14, 10, 17].map((close, i) => ({
    time: i + 1,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
  }));
  const inputs = { ...getIndicatorInputs("rsi"), period: 2, smoothingPeriod: 3 };
  const run = (smoothingType: number, smoothingDeviations = 2) =>
    definition.calculate({
      bars,
      inputs: { ...inputs, smoothingType, smoothingDeviations },
      interval: 5,
      session: DEFAULT_INITIAL_BALANCE,
    });
  const baseline = run(0),
    sma = run(1);
  for (const deviations of [0, 1.5, 2, 5]) {
    const result = run(5, deviations);
    expect(result.plots[0]).toEqual(baseline.plots[0]);
    expect(result.plots).toHaveLength(4);
    const middle = result.plots.find((p) => p.id === "smoothing")!;
    const upper = result.plots.find((p) => p.id === "smoothingUpper")!;
    const lower = result.plots.find((p) => p.id === "smoothingLower")!;
    expect(middle.primary).toBe(false);
    middle.points.forEach((p, i) => {
      expect(p.value).toBeCloseTo(sma.plots[1]!.points[i]!.value, 10);
      const window = baseline.plots[0]!.points.slice(i, i + 3);
      const sd = Math.sqrt(window.reduce((sum, v) => sum + (v.value - p.value) ** 2, 0) / 3);
      expect(upper.points[i]!.value).toBeCloseTo(p.value + deviations * sd, 10);
      expect(lower.points[i]!.value).toBeCloseTo(p.value - deviations * sd, 10);
    });
    expect(result.fills?.filter((f) => f.styleKey === "background")).toEqual(baseline.fills);
    expect(result.fills?.filter((f) => f.styleKey === "smoothingBackground")).toEqual([
      expect.objectContaining({ upper: upper.points, lower: lower.points }),
    ]);
    expect(
      getIndicatorLabel("rsi", {
        rsi: { ...inputs, smoothingType: 5, smoothingDeviations: deviations },
      }),
    ).toBe(getIndicatorLabel("rsi", { rsi: inputs }));
  }
  expect(run(1).fills).toEqual(baseline.fills);
  for (const smoothingDeviations of [-1, 21, NaN, Infinity]) {
    expect(updateIndicatorInputs("rsi", { rsi: inputs }, { smoothingDeviations })).toBeNull();
    expect(getIndicatorInputs("rsi", { rsi: { smoothingDeviations } }).smoothingDeviations).toBe(2);
  }
});

it("weights RSI smoothing by matching candle volumes while retaining original RSI values", () => {
  const definition = INDICATOR_CATALOG.find((i) => i.key === "rsi")!;
  const bars = [10, 12, 11, 15, 12, 16, 11, 14, 10, 17].map((close, i) => ({
    time: i + 1,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: i % 2 ? 100 : 10,
  }));
  const inputs = { ...getIndicatorInputs("rsi"), period: 2, smoothingPeriod: 3 };
  const run = (smoothingType: number, candles = bars) =>
    definition.calculate({
      bars: candles,
      inputs: { ...inputs, smoothingType },
      interval: 5,
      session: DEFAULT_INITIAL_BALANCE,
    });
  const original = run(0),
    result = run(6);
  expect(result.plots).toHaveLength(2);
  expect(result.plots[0]).toEqual(original.plots[0]);
  expect(result.fills).toEqual(original.fills);
  const ma = result.plots[1]!;
  expect(ma).toMatchObject({ id: "smoothing", primary: false, breakOnGaps: true });
  const readings = original.plots[0]!.points;
  expect(ma.points).toHaveLength(readings.length - 2);
  ma.points.forEach((p, i) => {
    const window = readings.slice(i, i + 3);
    const sumVolume = window.reduce((s, v) => s + bars.find((b) => b.time === v.time)!.volume, 0);
    expect(p.value).toBeCloseTo(
      window.reduce((s, v) => s + v.value * bars.find((b) => b.time === v.time)!.volume, 0) /
        sumVolume,
      10,
    );
  });
  const withoutVolume = run(
    6,
    bars.map((b) => ({ ...b, volume: 0 })),
  );
  expect(withoutVolume.plots[0]).toEqual(original.plots[0]);
  expect(withoutVolume.plots[1]!.points).toEqual([]);
  expect(getIndicatorLabel("rsi", { rsi: { ...inputs, smoothingType: 6 } })).toBe(
    getIndicatorLabel("rsi", { rsi: inputs }),
  );
});
