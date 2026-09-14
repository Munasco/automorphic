import { describe, expect, it, vi } from "vite-plus/test";
import type { IChartApi, MouseEventParams } from "lightweight-charts";
import type { Candle } from "./chartIndicators";
import { createIndicatorRenderer } from "./chartIndicatorRenderer";
import { createIndicatorInstance } from "./chartIndicatorInstances";
import {
  DEFAULT_INITIAL_BALANCE,
  DEFAULT_INDICATORS,
  type ChartIndicators,
} from "./indicatorCatalog";

type FakePriceLine = {
  options: Record<string, unknown>;
  applyOptions: (options: Record<string, unknown>) => void;
  removed: boolean;
};
type FakeSeries = {
  pane: number;
  options: Record<string, unknown>;
  data: { time: number; value: number; color?: string }[];
  setData: (points: { time: number; value: number }[]) => void;
  seriesType: () => string;
  applyOptions: (options: Record<string, unknown>) => void;
  createPriceLine: (options: Record<string, unknown>) => FakePriceLine;
  removePriceLine: (line: FakePriceLine) => void;
  priceLines: FakePriceLine[];
  attachPrimitive: (primitive: object) => void;
  primitives: object[];
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
        primitives: [],
        priceLines: [],
        attachPrimitive(primitive) {
          this.primitives.push(primitive);
        },
        setData(points) {
          this.data = points;
        },
        seriesType: () => definition.type,
        applyOptions(update) {
          Object.assign(this.options, update);
        },
        createPriceLine: vi.fn((options) => {
          const line: FakePriceLine = {
            options: { ...options },
            removed: false,
            applyOptions: vi.fn((update) => {
              if (line.removed) throw new Error("Updated a removed price line");
              Object.assign(line.options, update);
            }),
          };
          next.priceLines.push(line);
          return line;
        }),
        removePriceLine: vi.fn((line) => {
          const index = next.priceLines.indexOf(line);
          if (index < 0) throw new Error("Removed a foreign or stale price line");
          next.priceLines.splice(index, 1);
          line.removed = true;
        }),
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
  it.each([0, 1])(
    "gaps Keltner basis %s through missing selected prices and reconnects a corrected bar",
    (basisType) => {
      const harness = chartHarness();
      const renderer = createIndicatorRenderer(harness.chart, 0.25);
      const bars = inputBars(8).map((bar, i) => (i === 3 ? { ...bar, open: NaN } : bar));
      const instance = {
        ...createIndicatorInstance("keltner", "base:keltner"),
        inputs: { period: 2, atrPeriod: 2, multiplier: 2, source: 1, basisType },
      };
      renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [instance]);
      const original = [...harness.series];
      expect(original).toHaveLength(3);
      for (const series of original) {
        expect(series.data[3]).toEqual({ time: bars[3]!.time });
        expect(series.data[4]).toEqual({ time: bars[4]!.time });
        expect(series.data[2]!.color).toBe("transparent");
      }
      renderer.update(
        bars.map((bar, i) => (i === 3 ? { ...bar, open: bar.close } : bar)),
        disabled,
        DEFAULT_INITIAL_BALANCE,
        1,
        {},
        {},
        undefined,
        [instance],
      );
      expect(harness.series).toEqual(original);
      for (const series of original) {
        expect(Number.isFinite(series.data[3]!.value)).toBe(true);
        expect(Number.isFinite(series.data[4]!.value)).toBe(true);
        expect(series.data[2]!.color).not.toBe("transparent");
      }
    },
  );

  it("updates CCI levels independently without replacing or altering oscillator data", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const bars = inputBars(6);
    const base = {
      ...createIndicatorInstance("cci", "base:cci"),
      inputs: { period: 2, lowerLevel: -200, middleLevel: 0, upperLevel: 200, showLevels: 1 },
    };
    const duplicate = {
      ...createIndicatorInstance("cci", "cci-extra"),
      inputs: { period: 3, lowerLevel: -150, middleLevel: 20, upperLevel: 250, showLevels: 1 },
    };
    const update = () =>
      renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [
        base,
        duplicate,
      ]);
    update();
    const [first, second] = harness.series;
    const original = first!.data;
    const oldLines = [...first!.priceLines];
    expect(oldLines.map((line) => line.options.price)).toEqual([-200, 0, 200]);
    expect(second!.priceLines.map((line) => line.options.price)).toEqual([-150, 20, 250]);
    base.inputs.middleLevel = 10;
    update();
    expect(first!.priceLines[1]).toBe(oldLines[1]);
    expect(first!.priceLines[1]!.options.price).toBe(10);
    expect(first!.data).toEqual(original);
    base.inputs.showLevels = 0;
    update();
    expect(first!.priceLines).toEqual([]);
    expect(oldLines.every((line) => line.removed)).toBe(true);
    expect(second!.priceLines.map((line) => line.options.price)).toEqual([-150, 20, 250]);
    base.inputs.showLevels = 1;
    update();
    expect(first!.priceLines.map((line) => line.options.price)).toEqual([-200, 10, 200]);
    expect(first!.priceLines.every((line) => !oldLines.includes(line))).toBe(true);
    expect(first!.data).toEqual(original);
    expect(harness.series).toEqual([first, second]);
  });

  it("updates Williams levels independently without replacing or altering oscillator data", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const bars = inputBars(6);
    const base = {
      ...createIndicatorInstance("williams", "base:williams"),
      inputs: { period: 2, lowerLevel: -90, upperLevel: -10, showLevels: 1 },
    };
    const duplicate = {
      ...createIndicatorInstance("williams", "williams-extra"),
      inputs: { period: 3, lowerLevel: -75, upperLevel: -25, showLevels: 1 },
    };
    const update = () =>
      renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [
        base,
        duplicate,
      ]);
    update();
    const [first, second] = harness.series;
    const original = first!.data;
    const oldLines = [...first!.priceLines];
    expect(oldLines.map((line) => line.options.price)).toEqual([-90, -10]);
    expect(second!.priceLines.map((line) => line.options.price)).toEqual([-75, -25]);
    base.inputs.lowerLevel = -85;
    update();
    expect(first!.priceLines[0]).toBe(oldLines[0]);
    expect(first!.priceLines[0]!.options.price).toBe(-85);
    expect(first!.data).toEqual(original);
    base.inputs.showLevels = 0;
    update();
    expect(first!.priceLines).toEqual([]);
    expect(oldLines.every((line) => line.removed)).toBe(true);
    expect(second!.priceLines.map((line) => line.options.price)).toEqual([-75, -25]);
    base.inputs.showLevels = 1;
    update();
    expect(first!.priceLines.map((line) => line.options.price)).toEqual([-85, -10]);
    expect(first!.priceLines.every((line) => !oldLines.includes(line))).toBe(true);
    expect(first!.data).toEqual(original);
    expect(harness.series).toEqual([first, second]);
  });

  it("leaves a Williams gap for a flat range and restores it after a bar revision", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const bars = inputBars(5).map((bar, i) =>
      i === 1 || i === 2 ? { ...bar, open: 10, high: 10, low: 10, close: 10 } : bar,
    );
    const instance = {
      ...createIndicatorInstance("williams", "base:williams"),
      inputs: { period: 2 },
    };
    renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [instance]);
    const series = harness.series[0]!;
    expect(series.data[2]).toEqual({ time: bars[2]!.time });
    expect(series.data[1]!.color).toBe("transparent");
    renderer.update(
      bars.map((b, i) => (i === 2 ? { ...b, high: 11 } : b)),
      disabled,
      DEFAULT_INITIAL_BALANCE,
      1,
      {},
      {},
      undefined,
      [instance],
    );
    expect(harness.series[0]).toBe(series);
    expect(series.data[2]!.value).toBe(-100);
    expect(series.data[1]!.color).not.toBe("transparent");
  });

  it("leaves a CCI gap through invalid selected prices and reconnects a corrected window", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const bars = inputBars(7).map((bar, i) => ({ ...bar, open: i === 3 ? NaN : i + 1 }));
    const instance = {
      ...createIndicatorInstance("cci", "base:cci"),
      inputs: { period: 2, source: 1 },
    };
    renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [instance]);
    const series = harness.series[0]!;
    expect(series.pane).toBe(1);
    expect(series.data[2]!.value).toBeCloseTo(100 / 1.5, 10);
    expect(series.data[2]!.color).toBe("transparent");
    expect(series.data[3]).toEqual({ time: bars[3]!.time });
    expect(series.data[4]).toEqual({ time: bars[4]!.time });
    expect(series.data[5]!.value).toBeCloseTo(100 / 1.5, 10);
    expect(series.priceLines.map((line) => line.options.price)).toEqual([-100, 0, 100]);
    const revised = bars.map((bar, i) => (i === 3 ? { ...bar, open: 4 } : bar));
    renderer.update(revised, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [instance]);
    expect(harness.series[0]).toBe(series);
    expect(series.data[3]!.value).toBeCloseTo(100 / 1.5, 10);
    expect(series.data[2]!.color).not.toBe("transparent");
  });

  it("breaks ROC at a zero source baseline and restores the line on revision", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const values = [10, 20, 0, 40, 50, 60];
    const bars = inputBars(values.length).map((bar, i) => ({ ...bar, open: values[i]! }));
    const instance = {
      ...createIndicatorInstance("roc", "base:roc"),
      inputs: { period: 1, source: 1 },
    };
    renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [instance]);
    const series = harness.series[0]!;
    expect(series.pane).toBe(1);
    expect(series.data[1]!.value).toBe(100);
    expect(series.data[2]!.value).toBe(-100);
    expect(series.data[2]!.color).toBe("transparent");
    expect(series.data[3]).toEqual({ time: bars[3]!.time });
    expect(series.data[4]!.value).toBe(25);
    expect(series.priceLines.map((line) => line.options.price)).toEqual([0]);
    const revised = bars.map((bar, i) => (i === 2 ? { ...bar, open: 25 } : bar));
    renderer.update(revised, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [instance]);
    expect(harness.series[0]).toBe(series);
    expect(series.data[3]!.value).toBe(60);
    expect(series.data[2]!.color).not.toBe("transparent");
  });

  it("shares the volume scale with optional averages while duplicate panes stay independent", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const bars = inputBars(5).map((bar, i) => ({ ...bar, volume: [10, 20, 30, 40, 50][i]! }));
    const base = { ...createIndicatorInstance("volume", "base:volume"), inputs: { period: 2 } };
    const duplicate = {
      ...createIndicatorInstance("volume", "volume-extra"),
      inputs: { period: 3 },
      appearance: { plots: { average: { visible: true, color: "#abcdef", lineWidth: 3 } } },
    };
    const update = () =>
      renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [
        base,
        duplicate,
      ]);
    expect(update().readings).toEqual({ volume: 50, "volume-extra": 50 });
    expect(harness.series.filter((s) => s.options.title === "Volume MA")).toHaveLength(1);
    const extra = harness.series.find((s) => s.options.title === "Volume MA")!;
    expect(extra.pane).toBe(1);
    expect(extra.data.filter((p) => Number.isFinite(p.value)).map((p) => p.value)).toEqual([
      20, 30, 40,
    ]);
    expect(extra.options.color).toBe("#abcdef");
    base.appearance = { plots: { average: { visible: true } } };
    update();
    const main = harness.series.find((s) => s.options.priceScaleId === "volume" && s.pane === 0)!;
    expect(main.options.priceScaleId).toBe("volume");
    expect(main.data.filter((p) => Number.isFinite(p.value)).map((p) => p.value)).toEqual([
      15, 25, 35, 45,
    ]);
    expect(harness.series.filter((s) => s.pane === 1)).toHaveLength(2);
    const readings = renderer.readCrosshair({
      seriesData: new Map([
        [main, { value: 15 }],
        [extra, { value: 20 }],
      ]),
    } as unknown as MouseEventParams);
    expect(readings).toEqual({});
    base.appearance = { plots: { average: { visible: false } } };
    update();
    expect(harness.series).not.toContain(main);
    expect(harness.series).toContain(extra);
    renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, []);
    expect(harness.series).toHaveLength(0);
    expect(harness.paneCount()).toBe(1);
  });

  it("keeps Bollinger %B unbounded and breaks its line across zero-width windows", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const values = [1, 2, 3, 3, 3, 2, 1];
    const bars = inputBars(values.length).map((bar, i) => ({ ...bar, close: values[i]! }));
    const instance = {
      ...createIndicatorInstance("bbPercentB", "base:bbPercentB"),
      inputs: {
        period: 3,
        source: 0,
        deviations: 0.5,
        showLevels: 1,
        lowerLevel: 0,
        upperLevel: 1,
      },
    };
    renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [instance]);
    const series = harness.series[0]!;
    expect(series.pane).toBe(1);
    expect(series.data[2]!.value).toBeGreaterThan(1);
    expect(series.data[6]!.value).toBeLessThan(0);
    expect(series.data[4]).toEqual({ time: bars[4]!.time });
    expect(series.data[3]!.color).toBe("transparent");
    expect(series.priceLines.map((line) => line.options.price)).toEqual([0, 1]);
    const revised = bars.map((bar, i) => (i === 4 ? { ...bar, close: 4 } : bar));
    renderer.update(revised, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [instance]);
    expect(harness.series[0]).toBe(series);
    expect(series.data[4]!.value).toBeGreaterThan(1);
    expect(series.data[3]!.color).not.toBe("transparent");
  });

  it("colors AO by momentum rather than sign and updates revisions, gaps and appearance", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const values = [0, 6, 10, 8, 4, 2, 2, 4];
    const bars = inputBars(values.length).map((bar, i) => ({
      ...bar,
      high: values[i]!,
      low: values[i]!,
    }));
    const instance = {
      ...createIndicatorInstance("ao", "base:ao"),
      inputs: { fast: 1, slow: 2 },
      appearance: { plots: { growing: { color: "#123456" }, falling: { color: "#abcdef" } } },
    };
    const update = (input: Candle[]) =>
      renderer.update(input, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [instance]);
    expect(update(bars).readings).toEqual({ ao: 1 });
    const series = harness.series[0]!;
    expect(series.pane).toBe(1);
    expect(series.data.map((point) => point.value)).toEqual([3, 2, -1, -2, -1, 0, 1]);
    expect(series.data.map((point) => point.color)).toEqual([
      "#abcdef",
      "#abcdef",
      "#abcdef",
      "#abcdef",
      "#123456",
      "#123456",
      "#123456",
    ]);
    const revised = bars.map((bar, i) => (i === 7 ? { ...bar, high: 0, low: 0 } : bar));
    expect(update(revised).readings).toEqual({ ao: -1 });
    expect(harness.series[0]).toBe(series);
    expect(series.data.at(-1)).toMatchObject({ value: -1, color: "#abcdef" });
    const gap = bars.map((bar, i) => (i === 5 ? { ...bar, high: NaN } : bar));
    update(gap);
    expect(series.data.at(-1)).toMatchObject({ value: 1, color: "#abcdef" });
    expect(series.data).toHaveLength(5);
  });
  it("keeps duplicate moving-average plots, inputs, styles, and crosshair readings independent", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const a = { ...createIndicatorInstance("sma", "base:sma"), inputs: { period: 2 } };
    const b = {
      ...createIndicatorInstance("sma", "sma-second"),
      inputs: { period: 5 },
      appearance: { color: "#ff0000" },
    };
    const bars = inputBars();
    const update = (instances: (typeof a)[]) =>
      renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, instances);
    expect(update([a, b]).readings).toEqual({ sma: 178.5, "sma-second": 177 });
    expect(harness.series).toHaveLength(2);
    const [first, second] = harness.series;
    const originalFirstData = first!.data;
    expect(second!.options.color).toBe("#ff0000");
    update([a, { ...b, inputs: { period: 3 }, appearance: { color: "#00ff00" } }]);
    expect(harness.series).toEqual([first, second]);
    expect(first!.data).toEqual(originalFirstData);
    expect(second!.data.at(-1)?.value).toBe(178);
    expect(second!.options.color).toBe("#00ff00");
    expect(
      renderer.readCrosshair({
        seriesData: new Map([
          [first, { value: 123 }],
          [second, { value: 456 }],
        ]),
      } as unknown as MouseEventParams),
    ).toEqual({ sma: 123, "sma-second": 456 });
    expect(update([{ ...a, hidden: true }, b]).readings).toEqual({ "sma-second": 177 });
    expect(harness.series).toEqual([second]);
    update([]);
    expect(harness.series).toHaveLength(0);
  });

  it("gives duplicate oscillators their own panes and compacts panes after removal", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const instances = [
      createIndicatorInstance("rsi", "base:rsi"),
      createIndicatorInstance("rsi", "rsi-second"),
      createIndicatorInstance("macd", "macd-second"),
    ];
    const update = (active: typeof instances) =>
      renderer.update(inputBars(), disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, active);
    update(instances);
    expect(harness.series.map((series) => series.pane)).toEqual([1, 2, 3, 3, 3]);
    update(instances.slice(1));
    expect(harness.series.map((series) => series.pane)).toEqual([1, 2, 2, 2]);
    expect(harness.paneCount()).toBe(3);
    update([]);
    expect(harness.paneCount()).toBe(1);
  });

  it.each(["rsi", "stochastic", "stochRsi"] as const)(
    "updates %s reference levels without recreating series or churning unchanged lines",
    (key) => {
      const harness = chartHarness();
      const renderer = createIndicatorRenderer(harness.chart, 0.25);
      const original = createIndicatorInstance(key, `base:${key}`);
      const update = (instance: typeof original) =>
        renderer.update(inputBars(), disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [
          instance,
        ]);
      update(original);
      const series = [...harness.series];
      const host = series.find((item) => item.priceLines.length)!;
      const handles = [...host.priceLines];
      expect(handles.map((line) => line.options.price)).toEqual(
        key === "rsi" ? [30, 70] : [20, 80],
      );
      update({ ...original, inputs: { ...original.inputs } });
      expect(host.createPriceLine).toHaveBeenCalledTimes(2);
      expect(host.removePriceLine).not.toHaveBeenCalled();
      for (const line of handles) expect(line.applyOptions).not.toHaveBeenCalled();
      const edited = {
        ...original,
        inputs: { ...original.inputs, lowerLevel: 25, upperLevel: 75 },
      };
      update(edited);
      expect(harness.series).toEqual(series);
      expect(host.priceLines).toEqual(handles);
      expect(host.priceLines.map((line) => line.options.price)).toEqual([25, 75]);
      for (const line of handles) expect(line.applyOptions).toHaveBeenCalledTimes(1);
      update({ ...edited, inputs: { ...edited.inputs, upperLevel: 85 } });
      expect(handles[0]!.applyOptions).toHaveBeenCalledTimes(1);
      expect(handles[1]!.applyOptions).toHaveBeenCalledTimes(2);
      update({ ...edited, inputs: { ...edited.inputs, showLevels: 0 } });
      expect(harness.series).toEqual(series);
      expect(host.priceLines).toEqual([]);
      expect(host.removePriceLine).toHaveBeenCalledTimes(2);
      expect(handles.every((line) => line.removed)).toBe(true);
      update(edited);
      expect(harness.series).toEqual(series);
      expect(host.createPriceLine).toHaveBeenCalledTimes(4);
      expect(host.priceLines.map((line) => line.options.price)).toEqual([25, 75]);
      expect(host.priceLines[0]).not.toBe(handles[0]);
      update(edited);
      expect(host.createPriceLine).toHaveBeenCalledTimes(4);
      for (const line of host.priceLines) expect(line.applyOptions).not.toHaveBeenCalled();
    },
  );

  it("isolates duplicate reference lines and cleans old handles when oscillator panes rebuild", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const a = createIndicatorInstance("rsi", "base:rsi");
    const b = {
      ...createIndicatorInstance("rsi", "second-rsi"),
      inputs: { ...a.inputs, lowerLevel: 10, upperLevel: 90 },
    };
    const update = (instances: (typeof a)[]) =>
      renderer.update(
        inputBars(),
        disabled,
        DEFAULT_INITIAL_BALANCE,
        1,
        {},
        {},
        undefined,
        instances,
      );
    update([a, b]);
    const [first, second] = harness.series;
    const secondLines = [...second!.priceLines];
    update([{ ...a, inputs: { ...a.inputs, lowerLevel: 25, upperLevel: 75 } }, b]);
    expect(harness.series).toEqual([first, second]);
    expect(second!.priceLines.map((line) => line.options.price)).toEqual([10, 90]);
    expect(second!.createPriceLine).toHaveBeenCalledTimes(2);
    expect(second!.removePriceLine).not.toHaveBeenCalled();
    for (const line of secondLines) expect(line.applyOptions).not.toHaveBeenCalled();
    update([{ ...a, inputs: { ...a.inputs, showLevels: 0 } }, b]);
    expect(first!.priceLines).toEqual([]);
    expect(second!.priceLines).toEqual(secondLines);
    update([b]);
    expect(harness.series).toHaveLength(1);
    const rebuilt = harness.series[0]!;
    expect(rebuilt).not.toBe(second);
    expect(second!.priceLines).toEqual([]);
    expect(second!.removePriceLine).toHaveBeenCalledTimes(2);
    expect(secondLines.every((line) => line.removed)).toBe(true);
    expect(rebuilt.priceLines.map((line) => line.options.price)).toEqual([10, 90]);
    update([b]);
    expect(rebuilt.createPriceLine).toHaveBeenCalledTimes(2);
    for (const line of rebuilt.priceLines) expect(line.applyOptions).not.toHaveBeenCalled();
    update([]);
    expect(harness.series).toEqual([]);
    expect(rebuilt.priceLines).toEqual([]);
    expect(rebuilt.removePriceLine).toHaveBeenCalledTimes(2);
    update([]);
    expect(rebuilt.removePriceLine).toHaveBeenCalledTimes(2);
  });

  it("renders additional volume in its own pane with independently configured bar colors", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const bars = inputBars(2);
    bars[1]!.close = bars[1]!.open - 1;
    const instance = {
      ...createIndicatorInstance("volume", "volume-second"),
      volumeColors: { up: "#123456", down: "#abcdef" },
    };
    const result = renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [
      createIndicatorInstance("volume", "base:volume"),
      instance,
    ]);
    expect(harness.series).toHaveLength(1);
    expect(harness.series[0]!.pane).toBe(1);
    expect(harness.series[0]!.data).toMatchObject([{ color: "#123456" }, { color: "#abcdef" }]);
    expect(result.readings).toEqual({ volume: 10, "volume-second": 10 });
  });

  it("calculates duplicate IB sessions separately and chooses the first visible dashboard", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const start = Date.parse("2026-09-14T13:30:00Z") / 1000;
    const bars = inputBars(80).map((bar, index) => ({ ...bar, time: start + index * 60 }));
    const first = createIndicatorInstance("ib", "base:ib");
    const second = {
      ...createIndicatorInstance("ib", "ib-second"),
      initialBalance: { ...DEFAULT_INITIAL_BALANCE, startTime: "10:00", durationMinutes: 30 },
    };
    const result = renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [
      first,
      second,
    ]);
    expect(harness.series).toHaveLength(6);
    expect(result.readings.ib).not.toBe(result.readings[second.id]);
    expect(result.initialBalanceStatuses[first.id]).toContain("09:30");
    expect(result.initialBalanceStatuses[second.id]).toContain("10:00");
    const remaining = renderer.update(
      bars,
      disabled,
      DEFAULT_INITIAL_BALANCE,
      1,
      {},
      {},
      undefined,
      [{ ...first, hidden: true }, second],
    );
    expect(remaining.initialBalanceStats?.midpoint).toBe(result.readings[second.id]);
    expect(remaining.readings.ib).toBeUndefined();
    expect(harness.series).toHaveLength(3);
  });

  it("autoscales IB from visible overlays instead of its hidden data series", () => {
    const harness = chartHarness();
    const start = Date.parse("2026-09-14T13:30:00Z") / 1000;
    Object.assign(harness.chart, {
      timeScale: () => ({
        getVisibleLogicalRange: () => ({ from: 0, to: 79 }),
        timeToCoordinate: (time: number) => (time - start) / 60,
        logicalToCoordinate: (logical: number) => logical,
        width: () => 80,
      }),
    });
    const renderer = createIndicatorRenderer(harness.chart, 0.25);
    const bars = Array.from({ length: 80 }, (_, index) => ({
      time: start + index * 60,
      open: 105,
      close: 105,
      high: 110,
      low: 100,
      volume: 1,
    }));
    const enabled = { ...disabled, ib: true };
    const hidden = {
      high: { visible: false },
      low: { visible: false },
      internal: { visible: false },
    };
    const ranges = () =>
      harness.series.map((series) => {
        const provider = series.options.autoscaleInfoProvider as (
          original: () => { priceRange: { minValue: number; maxValue: number } },
        ) => unknown;
        return provider(() => ({ priceRange: { minValue: 100, maxValue: 110 } }));
      });
    renderer.update(bars, enabled, { ...DEFAULT_INITIAL_BALANCE, showBox: false }, 1, {
      ib: { plots: hidden },
    });
    expect(harness.series).toHaveLength(3);
    expect(harness.series.every((series) => series.data.length > 0)).toBe(true);
    expect(ranges()).toEqual([null, null, null]);
    renderer.update(bars, enabled, { ...DEFAULT_INITIAL_BALANCE, showBox: false }, 1, {
      ib: { plots: { ...hidden, high: { opacity: 0.5 } } },
    });
    expect(ranges()).toEqual([{ priceRange: { minValue: 110, maxValue: 120 } }, null, null]);
    renderer.update(bars, enabled, DEFAULT_INITIAL_BALANCE, 1, { ib: { plots: hidden } });
    expect(ranges()).toEqual([{ priceRange: { minValue: 100, maxValue: 110 } }, null, null]);
  });

  it("renders default VWAP bands immediately, adds configured pairs, and keeps fills independent of line visibility", () => {
    const harness = chartHarness(),
      renderer = createIndicatorRenderer(harness.chart, 0.1);
    const input = inputBars(4),
      enabled = { ...disabled, vwap: true };
    renderer.update(input, enabled, DEFAULT_INITIAL_BALANCE, 1);
    expect(harness.series).toHaveLength(3);
    expect(harness.series[0]?.options.color).toBe("#2962ff");
    expect(
      harness.series
        .slice(1)
        .every((series) => series.options.color === "#81c784" && series.data.length === 4),
    ).toBe(true);
    expect(harness.series.flatMap((series) => series.primitives)).toHaveLength(1);
    const host = harness.series[0]!;
    renderer.update(
      input,
      enabled,
      DEFAULT_INITIAL_BALANCE,
      1,
      {
        vwap: { plots: { upper1: { visible: false }, fill1: { opacity: 0.4, color: "#abcdef" } } },
      },
      { vwap: { band2Enabled: 1, band3Enabled: 1, band3Multiplier: 4 } },
    );
    expect(harness.series).toHaveLength(7);
    expect(harness.series[1]?.options.lineVisible).toBe(false);
    expect(host.primitives).toHaveLength(1);
    renderer.update(input, enabled, DEFAULT_INITIAL_BALANCE, 1, {}, { vwap: { band1Enabled: 0 } });
    expect(harness.series).toEqual([host]);
    renderer.update(input, disabled, DEFAULT_INITIAL_BALANCE, 1);
    expect(harness.series).toHaveLength(0);
  });

  it("calculates IB from minute history without adding minute timestamps to the seconds chart", () => {
    const start = Date.parse("2026-09-14T13:30:00Z") / 1000;
    const minuteBars = Array.from({ length: 66 }, (_, index) => ({
      time: start + index * 60,
      open: 100,
      close: 105,
      high: index < 60 ? 110 : 999,
      low: index < 60 ? 90 : 1,
      volume: 2,
    }));
    const chartBars = Array.from({ length: 30 }, (_, index) => ({
      time: start + 3701 + index * 5,
      open: 105,
      close: 115,
      high: 116,
      low: 104,
      volume: 1,
    }));
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.1);
    const result = renderer.update(
      chartBars,
      { ...disabled, ib: true },
      DEFAULT_INITIAL_BALANCE,
      5 / 60,
      {},
      {},
      { bars: minuteBars, status: "" },
    );
    expect(result.initialBalanceStats).toMatchObject({
      high: 110,
      low: 90,
      volume: 120,
      status: "Locked",
      position: "Above IBH",
      distance: 5,
    });
    expect(result.initialBalanceStats?.atr).toBeCloseTo(12);
    expect(result.readings.ib).toBe(100);
    const chartTimes = new Set(chartBars.map((bar) => bar.time));
    expect(
      harness.series.every((series) =>
        series.data.every((point) => chartTimes.has(Number(point.time))),
      ),
    ).toBe(true);
    expect(harness.series.flatMap((series) => series.primitives)).toHaveLength(1);
    const loading = renderer.update(
      chartBars,
      { ...disabled, ib: true },
      DEFAULT_INITIAL_BALANCE,
      5 / 60,
      {},
      {},
      { bars: [], status: "Loading minute history" },
    );
    expect(loading.initialBalanceStats).toBeNull();
    expect(loading.initialBalanceStatus).toBe("Loading minute history");
    expect(harness.series).toHaveLength(0);
  });
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
    expect(
      harness.series.every((series) => series.data.every((point) => !Number.isFinite(point.value))),
    ).toBe(true);
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
    expect(harness.paneCount()).toBe(15);
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

  it("applies independent signal and histogram styles without recreating series", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.1);
    const enabled = { ...disabled, macd: true };
    renderer.update(inputBars(), enabled, DEFAULT_INITIAL_BALANCE, 1);
    const original = harness.series.slice();
    renderer.update(inputBars(), enabled, DEFAULT_INITIAL_BALANCE, 1, {
      macd: {
        plots: {
          signal: { color: "#abcdef", lineWidth: 4 },
          positive: { color: "#123456" },
          negative: { color: "#654321" },
        },
      },
    });
    expect(harness.series).toEqual(original);
    expect(
      harness.series.find((series) => series.options.title === "Signal")?.options,
    ).toMatchObject({ color: "#abcdef", lineWidth: 4 });
    expect(harness.series.find((series) => series.options.title === "MACD")?.options.color).toBe(
      "#60a5fa",
    );
    const histogram = harness.series.find((series) => series.options.title === "Histogram")!;
    expect(histogram.data.length).toBeGreaterThan(0);
    for (const point of histogram.data)
      expect(point).toMatchObject({ color: point.value >= 0 ? "#12345690" : "#65432190" });
    renderer.update(inputBars(), enabled, DEFAULT_INITIAL_BALANCE, 1);
    expect(harness.series.find((series) => series.options.title === "Signal")?.options.color).toBe(
      "#fb923c",
    );
  });

  it("keeps the locked IB reading after session close, bounds projections, and hides old history", () => {
    const harness = chartHarness();
    const renderer = createIndicatorRenderer(harness.chart, 0.01);
    const start = Date.parse("2026-09-14T13:30:00Z") / 1000;
    const first = Array.from({ length: 13 }, (_, i) => ({
      ...inputBars(1)[0]!,
      time: start + i * 300,
      high: 110,
      low: 100,
      close: 105,
    }));
    const second = first.map((bar) => ({
      ...bar,
      time: bar.time + 86400,
      high: 120,
      low: 100,
      close: 110,
    }));
    const afterClose = {
      ...second.at(-1)!,
      time: start + 86400 + 8 * 3600,
      close: 130,
      high: 140,
      volume: 90000,
    };
    const input = [...first, ...second, afterClose];
    const result = renderer.update(input, { ...disabled, ib: true }, DEFAULT_INITIAL_BALANCE, 5);
    expect(result.readings.ib).toBe(110);
    expect(result.initialBalanceStats).toMatchObject({
      status: "Locked",
      high: 120,
      low: 100,
      range: 20,
      volume: 120,
      position: "Above IBH",
      distance: 10,
    });
    expect(harness.series).toHaveLength(6);
    expect(harness.series.every((series) => series.options.lineVisible === false)).toBe(true);
    expect(harness.series.flatMap((series) => series.primitives)).toHaveLength(2);
    expect(
      harness.series.every((series) =>
        series.data.every((point) => point.time !== afterClose.time),
      ),
    ).toBe(true);
    const sourceTimes = new Set(input.map((bar) => bar.time));
    expect(
      harness.series.every((series) => series.data.every((point) => sourceTimes.has(point.time))),
    ).toBe(true);
    renderer.update(
      input,
      { ...disabled, ib: true },
      { ...DEFAULT_INITIAL_BALANCE, showHistory: false, showMidpoint: false },
      5,
    );
    expect(harness.series).toHaveLength(3);
    expect(harness.series.flatMap((series) => series.primitives)).toHaveLength(1);
    const premarket = { ...afterClose, time: start + 2 * 86400 - 3600 };
    renderer.update(
      [...input, premarket],
      { ...disabled, ib: true },
      { ...DEFAULT_INITIAL_BALANCE, showHistory: false },
      5,
    );
    expect(harness.series).toHaveLength(0);
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

it("renders Supertrend reversals as gaps using two stable overlay series", () => {
  const harness = chartHarness();
  const renderer = createIndicatorRenderer(harness.chart, 0.25);
  const bars = inputBars(60).map((bar, index) => {
    const price = 100 + Math.sin(index / 3) * 10;
    return { ...bar, open: price, close: price, high: price + 1, low: price - 1 };
  });
  const instance = {
    ...createIndicatorInstance("supertrend", "base:supertrend"),
    inputs: { period: 2, multiplier: 0.5 },
  };
  const result = renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [
    instance,
  ]);
  expect(harness.series).toHaveLength(2);
  const [up, down] = harness.series;
  expect(up!.pane).toBe(0);
  expect(down!.pane).toBe(0);
  expect(up!.data).toHaveLength(bars.length);
  expect(down!.data).toHaveLength(bars.length);
  expect(up!.data.some((point) => Number.isFinite(point.value))).toBe(true);
  expect(down!.data.some((point) => Number.isFinite(point.value))).toBe(true);
  for (let index = 0; index < bars.length; index++) {
    const a = up!.data[index]!;
    const b = down!.data[index]!;
    expect(a.time).toBe(bars[index]!.time);
    expect(b.time).toBe(a.time);
    expect(Number.isFinite(a.value) && Number.isFinite(b.value)).toBe(false);
    const value = Number.isFinite(a.value) ? a.value : b.value;
    const reading = renderer.readCrosshair({
      seriesData: new Map([
        [up, a],
        [down, b],
      ]),
    } as unknown as MouseEventParams);
    expect(reading).toEqual(Number.isFinite(value) ? { supertrend: value } : {});
  }
  for (const series of [up!, down!]) {
    const plotted = series.data.filter((point) => Number.isFinite(point.value));
    expect(plotted.some((point) => point.color === "transparent")).toBe(true);
    for (let index = 0; index < plotted.length - 1; index++) {
      const point = plotted[index]!;
      const next = plotted[index + 1]!;
      const candleIndex = bars.findIndex((bar) => bar.time === point.time);
      expect(point.color === "transparent").toBe(next.time !== bars[candleIndex + 1]?.time);
    }
    expect(series.options.crosshairMarkerBackgroundColor).toBe(series.options.color);
  }
  const lastUp = up!.data.at(-1)!;
  const lastDown = down!.data.at(-1)!;
  expect(result.readings.supertrend).toBe(
    Number.isFinite(lastUp.value) ? lastUp.value : lastDown.value,
  );
  renderer.update(bars.slice(0, 30), disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [
    instance,
  ]);
  expect(harness.series).toEqual([up, down]);
  expect(up!.data).toHaveLength(30);
  renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [
    { ...instance, hidden: true },
  ]);
  expect(harness.series).toHaveLength(0);
});

it("renders SAR as independent markers and retains readings and instance ownership", () => {
  const harness = chartHarness();
  const renderer = createIndicatorRenderer(harness.chart, 0.25);
  const bars = inputBars(30);
  const first = createIndicatorInstance("sar", "base:sar");
  const second = {
    ...createIndicatorInstance("sar", "sar-copy"),
    inputs: { start: 0.1, increment: 0.05, maximum: 0.3 },
  };
  const result = renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [
    first,
    second,
  ]);
  expect(harness.series).toHaveLength(2);
  const [base, copy] = harness.series;
  expect(base!.options.lineVisible).toBe(false);
  expect(base!.options.crosshairMarkerVisible).toBe(true);
  expect(base!.primitives).toHaveLength(1);
  expect(base!.data).not.toEqual(copy!.data);
  expect(result.readings.sar).toBe(base!.data.at(-1)!.value);
  expect(
    renderer.readCrosshair({
      seriesData: new Map([
        [base, base!.data.at(-1)],
        [copy, copy!.data.at(-1)],
      ]),
    } as unknown as MouseEventParams),
  ).toEqual(result.readings);
  renderer.update(bars.slice(0, 12), disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [
    first,
  ]);
  expect(harness.series).toEqual([base]);
  expect(base!.primitives).toHaveLength(1);
  expect(base!.data.at(-1)!.time).toBe(bars[11]!.time);
  renderer.update(bars, disabled, DEFAULT_INITIAL_BALANCE, 1, {}, {}, undefined, [
    { ...first, hidden: true },
  ]);
  expect(harness.series).toHaveLength(0);
});
