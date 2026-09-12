import { describe, expect, it } from "vite-plus/test";
import type { IChartApi, MouseEventParams } from "lightweight-charts";
import type { Candle } from "./chartIndicators";
import { createIndicatorRenderer } from "./chartIndicatorRenderer";
import {
  DEFAULT_INITIAL_BALANCE,
  DEFAULT_INDICATORS,
  type ChartIndicators,
} from "./indicatorCatalog";

type FakeSeries = {
  pane: number;
  options: Record<string, unknown>;
  data: { time: number; value: number }[];
  setData: (points: { time: number; value: number }[]) => void;
  seriesType: () => string;
  applyOptions: (options: Record<string, unknown>) => void;
  createPriceLine: (options: object) => void;
};
function chartHarness() {
  const series: FakeSeries[] = [];
  let paneCount = 1;
  const chart = {
    addSeries(definition: { type: string }, options: Record<string, unknown>, pane = 0) {
      paneCount = Math.max(paneCount, pane + 1);
      const next: FakeSeries = {
        pane,
        options,
        data: [],
        setData(points) {
          this.data = points;
        },
        seriesType: () => definition.type,
        applyOptions(update) {
          Object.assign(this.options, update);
        },
        createPriceLine() {},
      };
      series.push(next);
      return next;
    },
    removeSeries(target: FakeSeries) {
      const index = series.indexOf(target);
      if (index < 0) throw new Error("Removed an unknown series");
      series.splice(index, 1);
      if (target.pane > 0 && !series.some((item) => item.pane === target.pane)) {
        paneCount -= 1;
        for (const item of series) if (item.pane > target.pane) item.pane -= 1;
      }
    },
    panes: () => Array.from({ length: paneCount }, () => ({ setStretchFactor() {} })),
  };
  return { chart: chart as unknown as IChartApi, series, paneCount: () => paneCount };
}
const inputBars = (count = 80): Candle[] =>
  Array.from({ length: count }, (_, index) => ({
    time: 1_700_000_000 + index * 60,
    open: 100 + index,
    close: 100 + index,
    high: 101 + index,
    low: 99 + index,
    volume: 10,
  }));
const disabled = Object.fromEntries(
  Object.keys(DEFAULT_INDICATORS).map((key) => [key, false]),
) as ChartIndicators;

describe("native indicator renderer", () => {
  it("recalculates configured inputs in place and restores original warmups on reset", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.1);
    const input = inputBars(6);
    const enabled = {
      ...disabled,
      sma: true,
      ema: true,
      rsi: true,
      bollinger: true,
      keltner: true,
      cmf: true,
      roc: true,
    };
    expect(renderer.update(input, enabled, DEFAULT_INITIAL_BALANCE, 1).readings).toEqual({});
    const originalSeries = harness.series.slice();
    const result = renderer.update(
      input,
      enabled,
      DEFAULT_INITIAL_BALANCE,
      1,
      {},
      {
        sma: { period: 3 },
        ema: { period: 3 },
        rsi: { period: 2 },
        bollinger: { period: 3, deviations: 0.5 },
        keltner: { period: 3, atrPeriod: 2, multiplier: 0.5 },
        cmf: { period: 3 },
        roc: { period: 2 },
      },
    );
    expect(result.readings).toMatchObject({
      sma: 104,
      ema: 104,
      rsi: 100,
      bollinger: 104,
      keltner: 104,
      cmf: 0,
    });
    expect(result.readings.roc).toBeCloseTo(200 / 103);
    expect(harness.series).toEqual(originalSeries);
    const overlayValues = harness.series
      .filter((series) => series.pane === 0)
      .map((series) => series.data.at(-1)!.value);
    expect(overlayValues).toEqual([
      104,
      104,
      104 + Math.sqrt(2 / 3) * 0.5,
      104,
      104 - Math.sqrt(2 / 3) * 0.5,
      105,
      104,
      103,
    ]);
    expect(renderer.update(input, enabled, DEFAULT_INITIAL_BALANCE, 1).readings).toEqual({});
    expect(harness.series.every((series) => series.data.length === 0)).toBe(true);
  });

  it("uses all four Stochastic RSI inputs when determining its smoothing warmup", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.1);
    const input = inputBars(12).map((bar, index) => ({ ...bar, close: 100 + Math.sin(index) }));
    const result = renderer.update(
      input,
      { ...disabled, stochRsi: true },
      DEFAULT_INITIAL_BALANCE,
      1,
      {},
      {
        stochRsi: { rsiPeriod: 2, stochasticPeriod: 3, smoothK: 2, periodD: 2 },
      },
    );
    expect(harness.series.find((series) => series.options.title === "%K")?.data[0]?.time).toBe(
      input[5]?.time,
    );
    expect(harness.series.find((series) => series.options.title === "%D")?.data[0]?.time).toBe(
      input[6]?.time,
    );
    expect(result.readings.stochRsi).toBeTypeOf("number");
  });

  it("renders new indicators with independent panes and retained overlay series", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.1);
    const input = inputBars().map((bar, index) => ({
      ...bar,
      close: 100 + index + Math.sin(index) * 3,
      high: 105 + index,
      low: 95 + index,
    }));
    const enabled = { ...disabled, keltner: true, stochRsi: true, cmf: true, roc: true };
    const result = renderer.update(input, enabled, DEFAULT_INITIAL_BALANCE, 1);
    expect(harness.paneCount()).toBe(4);
    expect(harness.series.filter((series) => series.pane === 0)).toHaveLength(3);
    expect(
      harness.series.filter((series) => series.pane === 1).map((series) => series.options.title),
    ).toEqual(["%K", "%D"]);
    expect(harness.series.find((series) => series.options.title === "CMF")?.pane).toBe(2);
    expect(harness.series.find((series) => series.options.title === "ROC")?.pane).toBe(3);
    expect(Object.keys(result.readings).sort()).toEqual(["cmf", "keltner", "roc", "stochRsi"]);
    expect(harness.series.every((series) => series.data.length > 0)).toBe(true);
    const overlays = harness.series.filter((series) => series.pane === 0);
    renderer.update(input, { ...enabled, stochRsi: false }, DEFAULT_INITIAL_BALANCE, 1);
    expect(harness.paneCount()).toBe(3);
    expect(harness.series.find((series) => series.options.title === "CMF")?.pane).toBe(1);
    expect(harness.series.filter((series) => series.pane === 0)).toEqual(overlays);
  });

  it("accepts empty initial history with every indicator enabled", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.1);
    const all = Object.fromEntries(
      Object.keys(DEFAULT_INDICATORS).map((key) => [key, true]),
    ) as ChartIndicators;
    const result = renderer.update([], all, DEFAULT_INITIAL_BALANCE, 15);
    expect(result.readings).toEqual({});
    expect(result.initialBalanceStatus).toContain("waiting");
    expect(harness.paneCount()).toBe(12);
    expect(harness.series.every((series) => series.data.length === 0)).toBe(true);
    expect(() => renderer.update([], disabled, DEFAULT_INITIAL_BALANCE, 15)).not.toThrow();
    expect(harness.series).toHaveLength(0);
    expect(harness.paneCount()).toBe(1);
  });

  it("keeps independent oscillator scales and preserves main overlays across pane changes", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.1);
    const settings = { ...disabled, sma: true, rsi: true, macd: true, atr: true };
    const result = renderer.update(inputBars(), settings, DEFAULT_INITIAL_BALANCE, 1);
    expect(harness.paneCount()).toBe(4);
    expect(
      harness.series.filter((series) => series.pane === 2).map((series) => series.options.title),
    ).toEqual(["Histogram", "MACD", "Signal"]);
    const overlay = harness.series.find((series) => series.pane === 0)!;
    const macd = harness.series.find((series) => series.options.title === "MACD")!;
    const signal = harness.series.find((series) => series.options.title === "Signal")!;
    expect(
      renderer.readCrosshair({
        seriesData: new Map([
          [macd, { value: 5 }],
          [signal, { value: 9 }],
        ]),
      } as unknown as MouseEventParams),
    ).toEqual({ macd: 5 });
    expect(result.readings.atr).toBeCloseTo(2);
    renderer.update(inputBars(), { ...settings, rsi: false }, DEFAULT_INITIAL_BALANCE, 1);
    expect(harness.series).toContain(overlay);
    expect(harness.paneCount()).toBe(3);
    expect(harness.series.find((series) => series.options.title === "MACD")?.pane).toBe(1);
    expect(harness.series.find((series) => series.options.title === "ATR")?.pane).toBe(2);
    expect(
      harness.series.every((series) => series.data.every((point) => Number.isFinite(point.value))),
    ).toBe(true);
  });

  it("updates appearance without rebuilding plots and resets to default", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.1);
    const enabled = { ...disabled, sma: true, macd: true };
    renderer.update(inputBars(), enabled, DEFAULT_INITIAL_BALANCE, 1);
    const sma = harness.series.find((series) => series.pane === 0)!;
    const originalColor = sma.options.color;
    const signal = harness.series.find((series) => series.options.title === "Signal")!;
    const signalColor = signal.options.color;
    renderer.update(inputBars(), enabled, DEFAULT_INITIAL_BALANCE, 1, {
      sma: { color: "#123456", lineWidth: 3 },
      macd: { color: "#abcdef", lineWidth: 2 },
    });
    expect(harness.series).toContain(sma);
    expect(sma.options).toMatchObject({ color: "#123456", lineWidth: 3 });
    expect(signal.options.color).toBe(signalColor);
    renderer.update(inputBars(), enabled, DEFAULT_INITIAL_BALANCE, 1);
    expect(sma.options).toMatchObject({ color: originalColor, lineWidth: 1 });
  });

  it("bounds IB rendering to20 independent sessions without overnight lines", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.1);
    const sessions = Array.from({ length: 22 }, (_, day) =>
      Array.from({ length: 3 }, (_, index) => ({
        ...inputBars(1)[0]!,
        time: Date.UTC(2026, 0, day + 1, 9, 30 + index * 30) / 1000,
        high: 110 + day + index,
        low: 90 + day - index,
      })),
    ).flat();
    const result = renderer.update(
      sessions,
      { ...disabled, ib: true },
      { startTime: "09:30", timeZone: "UTC", durationMinutes: 60 },
      30,
    );
    expect(result.initialBalanceStatus).toContain("complete");
    expect(harness.series).toHaveLength(60);
    for (const series of harness.series) {
      expect(new Set(series.data.map((point) => Math.floor(point.time / 86400))).size).toBe(1);
      expect(series.data[0]!.time).toBeGreaterThanOrEqual(Date.UTC(2026, 0, 3) / 1000);
    }
    renderer.update(sessions, disabled, DEFAULT_INITIAL_BALANCE, 30);
    expect(harness.series).toHaveLength(0);
  });
});
