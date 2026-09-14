import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    registerHydrator: vi.fn(),
  },
}));

import {
  useChartPreferences,
  normalizeChartPreferences,
  type ChartCrosshairMode,
  type ChartCrosshairLineStyle,
  type ChartCrosshairLineWidth,
  type ChartGridMode,
  type ChartGridLineStyle,
  type ChartPriceScaleMode,
  type ChartReplaySpeed,
  type ChartLineWidth,
  type ChartLineShape,
  type ChartLineMarkerRadius,
} from "./chartPreferences";
import { PRICE_SOURCES, type PriceSource } from "./chartIndicators";
import { CHART_TIME_ZONES } from "./chartTimeZones";
import { DEFAULT_INITIAL_BALANCE } from "./initialBalanceSettings";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import { getIndicatorInputs } from "./indicatorCatalog";
import {
  DEFAULT_VOLUME_COLORS,
  MAX_CHART_INDICATORS,
  getChartIndicatorInstances,
  indicatorReadingKey,
} from "./chartIndicatorInstances";

beforeEach(() => {
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(null);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
});

function configure() {
  const store = useChartPreferences.getState();
  store.toggleIndicator("sma");
  store.toggleIndicator("ib");
  store.toggleIndicatorVisibility("rsi");
  store.setIndicatorInputs("sma", { period: 42 });
  store.setIndicatorAppearance("sma", { color: "#123456", lineWidth: 3 });
  store.setInitialBalance({ ...store.initialBalance, startTime: "09:45" });
  store.setVolumeColors({ up: "#123456", down: "#654321" });
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  return useChartPreferences.getState();
}

it("preserves Bollinger sources through independent edits, duplication, and workspace reload", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("bollinger")!;
  store.setIndicatorInstanceInputs(base, { period: 10, deviations: 1.5, source: 4 });
  const duplicate = store.duplicateIndicatorInstance(base)!;
  store.setIndicatorInstanceInputs(duplicate, { source: 6 });
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const inputs = () =>
    getChartIndicatorInstances(useChartPreferences.getState())
      .filter((i) => i.key === "bollinger")
      .map((i) => i.inputs);
  expect(inputs()).toEqual([
    { period: 10, deviations: 1.5, source: 4, basisType: 0 },
    { period: 10, deviations: 1.5, source: 6, basisType: 0 },
  ]);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  useChartPreferences.getState().setIndicatorInstanceInputs(duplicate, { source: 99 });
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(inputs()).toEqual([
    { period: 10, deviations: 1.5, source: 4, basisType: 0 },
    { period: 20, deviations: 2, source: 0, basisType: 0 },
  ]);
});

it("persists independent RSI sources and smoothing and resets only the selected instance", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("rsi")!;
  const duplicate = store.addIndicator("rsi")!;
  store.setIndicatorInstanceInputs(base, {
    period: 7,
    source: 1,
    smoothingType: 2,
    smoothingPeriod: 5,
  });
  store.setIndicatorInstanceInputs(duplicate, {
    period: 21,
    source: 5,
    smoothingType: 4,
    smoothingPeriod: 3,
  });
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const instances = () =>
    getChartIndicatorInstances(useChartPreferences.getState()).filter((i) => i.key === "rsi");
  expect(instances().map((i) => i.inputs)).toEqual([
    {
      period: 7,
      source: 1,
      smoothingType: 2,
      smoothingPeriod: 5,
      smoothingDeviations: 2,
      lowerLevel: 30,
      upperLevel: 70,
      showLevels: 1,
    },
    {
      period: 21,
      source: 5,
      smoothingType: 4,
      smoothingPeriod: 3,
      smoothingDeviations: 2,
      lowerLevel: 30,
      upperLevel: 70,
      showLevels: 1,
    },
  ]);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  useChartPreferences.getState().setIndicatorInstanceInputs(duplicate, { source: 99 });
  expect(
    useChartPreferences.getState().setIndicatorInstanceInputs(base, { smoothingType: 7 }),
  ).toBe(false);
  expect(
    useChartPreferences.getState().setIndicatorInstanceInputs(base, { smoothingPeriod: 0 }),
  ).toBe(false);
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(instances().map((i) => i.inputs)).toEqual([
    {
      period: 7,
      source: 1,
      smoothingType: 2,
      smoothingPeriod: 5,
      smoothingDeviations: 2,
      lowerLevel: 30,
      upperLevel: 70,
      showLevels: 1,
    },
    {
      period: 14,
      source: 0,
      smoothingType: 0,
      smoothingPeriod: 14,
      smoothingDeviations: 2,
      lowerLevel: 30,
      upperLevel: 70,
      showLevels: 1,
    },
  ]);
});

it("persists independent Keltner sources, bases and band styles, rejects invalid edits and resets one instance", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("keltner")!;
  store.setIndicatorInstanceInputs(base, {
    period: 5,
    source: 1,
    basisType: 1,
    rangeType: 2,
    atrPeriod: 3,
    multiplier: 1.5,
  });
  const duplicate = store.duplicateIndicatorInstance(base)!;
  store.setIndicatorInstanceInputs(duplicate, {
    period: 12,
    source: 5,
    basisType: 0,
    rangeType: 1,
    atrPeriod: 3,
    multiplier: 1.5,
  });
  const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const inputs = () =>
    getChartIndicatorInstances(useChartPreferences.getState())
      .filter((i) => i.key === "keltner")
      .map((i) => i.inputs);
  expect(inputs()).toEqual([
    { period: 5, source: 1, basisType: 1, rangeType: 2, atrPeriod: 3, multiplier: 1.5 },
    { period: 12, source: 5, basisType: 0, rangeType: 1, atrPeriod: 3, multiplier: 1.5 },
  ]);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  useChartPreferences.getState().setIndicatorInstanceInputs(duplicate, { source: 99 });
  expect(useChartPreferences.getState().setIndicatorInstanceInputs(base, { basisType: 2 })).toBe(
    false,
  );
  expect(useChartPreferences.getState().setIndicatorInstanceInputs(base, { rangeType: 3 })).toBe(
    false,
  );
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(inputs()).toEqual([
    { period: 5, source: 1, basisType: 1, rangeType: 2, atrPeriod: 3, multiplier: 1.5 },
    { period: 20, source: 0, basisType: 0, rangeType: 0, atrPeriod: 10, multiplier: 2 },
  ]);
  expect(
    getIndicatorInputs(
      "keltner",
      normalizeChartPreferences({ indicatorInputs: { keltner: { period: 18 } } }).indicatorInputs,
    ),
  ).toEqual({ period: 18, source: 0, basisType: 0, rangeType: 0, atrPeriod: 10, multiplier: 2 });
});

it("persists independent ROC sources, rejects invalid edits and resets one instance", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("roc")!;
  store.setIndicatorInstanceInputs(base, { period: 5, source: 1 });
  const duplicate = store.duplicateIndicatorInstance(base)!;
  store.setIndicatorInstanceInputs(duplicate, { period: 12, source: 5 });
  const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const inputs = () =>
    getChartIndicatorInstances(useChartPreferences.getState())
      .filter((i) => i.key === "roc")
      .map((i) => i.inputs);
  expect(inputs()).toEqual([
    { period: 5, source: 1 },
    { period: 12, source: 5 },
  ]);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  useChartPreferences.getState().setIndicatorInstanceInputs(duplicate, { source: 99 });
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(inputs()).toEqual([
    { period: 5, source: 1 },
    { period: 9, source: 0 },
  ]);
  expect(
    getIndicatorInputs(
      "roc",
      normalizeChartPreferences({ indicatorInputs: { roc: { period: 18 } } }).indicatorInputs,
    ),
  ).toEqual({ period: 18, source: 0 });
});

it("persists independent CCI sources and reference levels, rejects invalid edits and resets one instance", async () => {
  const store = useChartPreferences.getState();
  const defaults = { lowerLevel: -100, middleLevel: 0, upperLevel: 100, showLevels: 1 };
  const custom = { lowerLevel: -200, middleLevel: 10, upperLevel: 250, showLevels: 0 };
  const base = store.addIndicator("cci")!;
  store.setIndicatorInstanceInputs(base, { period: 5, source: 1, ...custom });
  const duplicate = store.duplicateIndicatorInstance(base)!;
  store.setIndicatorInstanceInputs(duplicate, { period: 12, source: 5, ...defaults });
  const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const inputs = () =>
    getChartIndicatorInstances(useChartPreferences.getState())
      .filter((i) => i.key === "cci")
      .map((i) => i.inputs);
  expect(inputs()).toEqual([
    { period: 5, source: 1, ...custom },
    { period: 12, source: 5, ...defaults },
  ]);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  useChartPreferences.getState().setIndicatorInstanceInputs(duplicate, { source: 99 });
  expect(
    useChartPreferences.getState().setIndicatorInstanceInputs(base, { middleLevel: 300 }),
  ).toBe(false);
  expect(useChartPreferences.getState().setIndicatorInstanceInputs(base, { lowerLevel: 10 })).toBe(
    false,
  );
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(inputs()).toEqual([
    { period: 5, source: 1, ...custom },
    { period: 20, source: 5, ...defaults },
  ]);
  expect(
    getIndicatorInputs(
      "cci",
      normalizeChartPreferences({ indicatorInputs: { cci: { period: 18 } } }).indicatorInputs,
    ),
  ).toEqual({ period: 18, source: 5, ...defaults });
});

describe("global indicator actions", () => {
  it("hides and shows enabled indicators atomically while retaining disabled states and configuration", () => {
    const original = configure();
    const changes = vi.fn();
    const unsubscribe = useChartPreferences.subscribe(changes);
    try {
      original.setIndicatorsHidden(true);
      const hidden = useChartPreferences.getState();
      expect(hidden.hiddenIndicators).toMatchObject({
        volume: true,
        sma: true,
        ib: true,
        rsi: true,
        ema: false,
      });
      expect(hidden.indicators).toBe(original.indicators);
      expect(hidden.indicatorInputs).toBe(original.indicatorInputs);
      expect(hidden.appearance).toBe(original.appearance);
      expect(hidden.initialBalance).toBe(original.initialBalance);
      expect(hidden.volumeColors).toBe(original.volumeColors);
      expect(changes).toHaveBeenCalledTimes(1);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
      hidden.setIndicatorsHidden(false);
      expect(useChartPreferences.getState().hiddenIndicators).toMatchObject({
        volume: false,
        sma: false,
        ib: false,
        rsi: true,
        ema: false,
      });
      expect(changes).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
  });

  it("removes all indicators in one write, restores that state, and re-adds indicators with their configuration", async () => {
    const original = configure();
    original.setIndicatorsHidden(true);
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    const changes = vi.fn();
    const unsubscribe = useChartPreferences.subscribe(changes);
    try {
      useChartPreferences.getState().removeAllIndicators();
      const removed = useChartPreferences.getState();
      expect(Object.values(removed.indicators).every((enabled) => !enabled)).toBe(true);
      expect(Object.values(removed.hiddenIndicators).every((hidden) => !hidden)).toBe(true);
      expect(removed.indicatorInputs).toBe(original.indicatorInputs);
      expect(removed.appearance).toBe(original.appearance);
      expect(removed.initialBalance).toBe(original.initialBalance);
      expect(removed.volumeColors).toBe(original.volumeColors);
      expect(changes).toHaveBeenCalledTimes(1);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
      const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls[0]![1];
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
      await useChartPreferences.persist.rehydrate();
      const restored = useChartPreferences.getState();
      expect(Object.values(restored.indicators).every((enabled) => !enabled)).toBe(true);
      restored.toggleIndicator("sma");
      restored.toggleIndicator("ib");
      const added = useChartPreferences.getState();
      expect(added.indicators).toMatchObject({ sma: true, ib: true, volume: false });
      expect(added.hiddenIndicators).toMatchObject({ sma: false, ib: false });
      expect(added.indicatorInputs.sma).toEqual({ period: 42, source: 0 });
      expect(added.appearance.sma).toEqual({ color: "#123456", lineWidth: 3 });
      expect(added.initialBalance.startTime).toBe("09:45");
    } finally {
      unsubscribe();
    }
  });
});

describe("initial balance background preferences", () => {
  it("migrates older session settings without changing their schedule or visibility", () => {
    const legacy = {
      startTime: "08:30",
      timeZone: "America/Chicago",
      durationMinutes: 60,
      showBox: false,
      showQuarters: false,
    };
    expect(normalizeChartPreferences({ initialBalance: legacy }).initialBalance).toMatchObject({
      ...legacy,
      backgroundColor: DEFAULT_INITIAL_BALANCE.backgroundColor,
      backgroundOpacity: DEFAULT_INITIAL_BALANCE.backgroundOpacity,
    });
  });
  it("persists independent background settings and restores transparent or disabled boxes", async () => {
    const store = useChartPreferences.getState();
    const appearance = store.appearance;
    store.setInitialBalance({
      ...store.initialBalance,
      backgroundColor: "#aabbcc",
      backgroundOpacity: 0,
      showBox: false,
    });
    expect(useChartPreferences.getState().appearance).toBe(appearance);
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    useChartPreferences.setState(useChartPreferences.getInitialState(), true);
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    await useChartPreferences.persist.rehydrate();
    expect(useChartPreferences.getState().initialBalance).toMatchObject({
      backgroundColor: "#aabbcc",
      backgroundOpacity: 0,
      showBox: false,
    });
  });
  it("rejects malformed background values without overwriting valid preferences", () => {
    const store = useChartPreferences.getState();
    const initial = store.initialBalance;
    for (const backgroundOpacity of [-1, 1.1, NaN, Infinity])
      store.setInitialBalance({ ...initial, backgroundOpacity });
    store.setInitialBalance({ ...initial, backgroundColor: "not-a-color" });
    expect(useChartPreferences.getState().initialBalance).toBe(initial);
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });
});

describe("independent indicator instances", () => {
  it("keeps legacy indicator configuration and reading IDs unchanged", () => {
    const saved = normalizeChartPreferences({
      indicators: { sma: true },
      indicatorInputs: { sma: { period: 42 } },
      appearance: { sma: { color: "#123456" } },
      hiddenIndicators: { sma: true },
    });
    expect(saved.extraIndicators).toEqual([]);
    const base = getChartIndicatorInstances(saved).find((instance) => instance.key === "sma")!;
    expect(base).toMatchObject({
      id: "base:sma",
      hidden: true,
      inputs: { period: 42 },
      appearance: { color: "#123456" },
    });
    expect(indicatorReadingKey(base)).toBe("sma");
  });

  it("adds duplicates with fresh defaults and edits, hides, resets, removes, and reloads them independently", async () => {
    const store = useChartPreferences.getState();
    expect(store.addIndicator("sma")).toBe("base:sma");
    store.setIndicatorInstanceInputs("base:sma", { period: 42 });
    store.setIndicatorInstanceAppearance("base:sma", { color: "#123456" });
    const id = store.addIndicator("sma")!;
    let duplicate = getChartIndicatorInstances(useChartPreferences.getState()).find(
      (instance) => instance.id === id,
    )!;
    expect(duplicate.inputs.period).toBe(getIndicatorInputs("sma").period);
    expect(duplicate.appearance).toEqual({});
    expect(indicatorReadingKey(duplicate)).toBe(id);
    expect(store.setIndicatorInstanceInputs(id, { period: 12 })).toBe(true);
    store.setIndicatorInstanceAppearance(id, { color: "#abcdef", lineWidth: 3 });
    store.toggleIndicatorInstanceVisibility(id);
    let state = useChartPreferences.getState();
    expect(state.indicatorInputs.sma?.period).toBe(42);
    expect(state.appearance.sma).toEqual({ color: "#123456" });
    expect(state.hiddenIndicators.sma).toBe(false);
    duplicate = state.extraIndicators[0]!;
    expect(duplicate).toMatchObject({
      id,
      hidden: true,
      inputs: { period: 12 },
      appearance: { color: "#abcdef", lineWidth: 3 },
    });
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    useChartPreferences.setState(useChartPreferences.getInitialState(), true);
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    await useChartPreferences.persist.rehydrate();
    state = useChartPreferences.getState();
    expect(state.extraIndicators).toEqual([duplicate]);
    state.resetIndicatorInstanceInputs(id);
    state.resetIndicatorInstanceAppearance(id);
    expect(useChartPreferences.getState().extraIndicators[0]).toMatchObject({
      inputs: getIndicatorInputs("sma"),
      appearance: {},
      hidden: true,
    });
    state.removeIndicatorInstance("base:sma");
    expect(useChartPreferences.getState().indicators.sma).toBe(false);
    expect(useChartPreferences.getState().extraIndicators).toHaveLength(1);
    state.removeIndicatorInstance(id);
    expect(useChartPreferences.getState().extraIndicators).toEqual([]);
    expect(state.addIndicator("sma")).toBe("base:sma");
    expect(useChartPreferences.getState().indicatorInputs.sma?.period).toBe(42);
  });

  it("rejects invalid instance input transactions without changing siblings or writing storage", () => {
    const store = useChartPreferences.getState();
    store.addIndicator("macd");
    const id = store.addIndicator("macd")!;
    const original = useChartPreferences.getState();
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    expect(store.setIndicatorInstanceInputs(id, { fast: 40, slow: 12 })).toBe(false);
    expect(store.setIndicatorInstanceInputs(id, { period: NaN })).toBe(false);
    expect(store.setIndicatorInstanceInputs("missing", { period: 10 })).toBe(false);
    expect(useChartPreferences.getState()).toBe(original);
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });

  it("merges individual plot styles on only the selected duplicate", () => {
    const store = useChartPreferences.getState();
    store.addIndicator("macd");
    const id = store.addIndicator("macd")!;
    store.setIndicatorInstanceAppearance(id, {
      plots: { main: { color: "#123456", opacity: 0.5 }, signal: { lineWidth: 3 } },
    });
    store.setIndicatorInstanceAppearance(id, { plots: { main: { lineWidth: 4 } } });
    expect(useChartPreferences.getState().extraIndicators[0]?.appearance).toEqual({
      plots: { main: { color: "#123456", opacity: 0.5, lineWidth: 4 }, signal: { lineWidth: 3 } },
    });
    expect(useChartPreferences.getState().appearance.macd).toBeUndefined();
    store.resetIndicatorInstanceAppearance(id);
    expect(useChartPreferences.getState().extraIndicators[0]?.appearance).toEqual({});
  });

  it("isolates initial balance schedules and volume colors and includes extras in global actions", () => {
    const store = useChartPreferences.getState();
    store.addIndicator("ib");
    const ib = store.addIndicator("ib")!;
    const volume = store.addIndicator("volume")!;
    store.setIndicatorInstanceInitialBalance(ib, {
      ...DEFAULT_INITIAL_BALANCE,
      startTime: "08:30",
      backgroundColor: "#123456",
    });
    store.setIndicatorInstanceVolumeColors(volume, { up: "#abcdef", down: "#123456" });
    expect(useChartPreferences.getState().initialBalance.startTime).toBe(
      DEFAULT_INITIAL_BALANCE.startTime,
    );
    expect(useChartPreferences.getState().volumeColors).toEqual(DEFAULT_VOLUME_COLORS);
    const original = useChartPreferences.getState().extraIndicators;
    expect(normalizeChartPreferences(useChartPreferences.getState()).extraIndicators).toEqual(
      original,
    );
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    store.setIndicatorsHidden(true);
    expect(
      useChartPreferences.getState().extraIndicators.every((instance) => instance.hidden),
    ).toBe(true);
    expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
    store.setIndicatorsHidden(false);
    expect(useChartPreferences.getState().extraIndicators).toEqual(original);
    store.resetIndicatorInstanceAppearance(volume);
    expect(
      useChartPreferences.getState().extraIndicators.find((instance) => instance.id === volume)
        ?.volumeColors,
    ).toEqual(DEFAULT_VOLUME_COLORS);
    store.removeAllIndicators();
    expect(getChartIndicatorInstances(useChartPreferences.getState())).toEqual([]);
  });

  it("filters malformed and duplicate instance metadata while repairing known saved inputs and appearance", () => {
    const valid = {
      id: "one",
      key: "sma",
      hidden: false,
      inputs: { period: 42 },
      appearance: { color: "#123456" },
    };
    const normalized = normalizeChartPreferences({
      extraIndicators: [
        valid,
        { ...valid, inputs: { period: 99 } },
        { ...valid, id: "base:sma" },
        { ...valid, id: "bad-key", key: "constructor" },
        { ...valid, id: "bad-hidden", hidden: "false" },
        { ...valid, id: "bad-inputs", inputs: [] },
        {
          ...valid,
          id: "repaired",
          inputs: { period: -1 },
          appearance: { color: "url(untrusted)", plots: { unknown: { color: "#123456" } } },
        },
      ],
    });
    expect(normalized.extraIndicators.map((instance) => instance.id)).toEqual(["one", "repaired"]);
    expect(normalized.extraIndicators[0]).toEqual({
      ...valid,
      inputs: { ...valid.inputs, source: 0 },
    });
    expect(normalized.extraIndicators[1]).toMatchObject({
      inputs: getIndicatorInputs("sma"),
      appearance: {},
    });
  });

  it("caps active instances at100 without losing existing extras on reload", () => {
    const store = useChartPreferences.getState();
    while (getChartIndicatorInstances(useChartPreferences.getState()).length < MAX_CHART_INDICATORS)
      expect(store.addIndicator("volume")).not.toBeNull();
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    expect(store.addIndicator("volume")).toBeNull();
    expect(store.addIndicator("sma")).toBeNull();
    store.toggleIndicator("sma");
    expect(useChartPreferences.getState().indicators.sma).toBe(false);
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
    const state = useChartPreferences.getState();
    expect(getChartIndicatorInstances(normalizeChartPreferences(state))).toHaveLength(
      MAX_CHART_INDICATORS,
    );
    const ids = getChartIndicatorInstances(state).map((instance) => instance.id);
    expect(new Set(ids).size).toBe(MAX_CHART_INDICATORS);
  });
});

describe("duplicating configured indicators", () => {
  it("clones configured base and extra indicators independently and restores both copies", async () => {
    const store = useChartPreferences.getState();
    store.addIndicator("macd");
    store.setIndicatorInstanceInputs("base:macd", { fast: 4, slow: 10 });
    store.setIndicatorInstanceAppearance("base:macd", {
      plots: { main: { color: "#123456", lineWidth: 3 } },
    });
    store.toggleIndicatorInstanceVisibility("base:macd");
    const source = getChartIndicatorInstances(useChartPreferences.getState()).find(
      (instance) => instance.id === "base:macd",
    )!;
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    const firstId = store.duplicateIndicatorInstance(source.id)!;
    let first = useChartPreferences.getState().extraIndicators[0]!;
    expect(first).toEqual({ ...source, id: firstId });
    expect(first.id).not.toBe(source.id);
    expect(first.inputs).not.toBe(source.inputs);
    expect(first.appearance.plots?.main).not.toBe(source.appearance.plots?.main);
    expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
    store.setIndicatorInstanceInputs(firstId, { fast: 5 });
    store.setIndicatorInstanceAppearance(firstId, { plots: { main: { color: "#abcdef" } } });
    store.toggleIndicatorInstanceVisibility(firstId);
    first = useChartPreferences.getState().extraIndicators[0]!;
    expect(first).toMatchObject({
      hidden: false,
      inputs: { fast: 5, slow: 10 },
      appearance: { plots: { main: { color: "#abcdef", lineWidth: 3 } } },
    });
    expect(
      getChartIndicatorInstances(useChartPreferences.getState()).find(
        (instance) => instance.id === source.id,
      ),
    ).toEqual(source);
    const secondId = store.duplicateIndicatorInstance(firstId)!;
    const second = useChartPreferences.getState().extraIndicators[1]!;
    expect(second).toEqual({ ...first, id: secondId });
    expect(secondId).not.toBe(firstId);
    expect(second.inputs).not.toBe(first.inputs);
    expect(second.appearance.plots?.main).not.toBe(first.appearance.plots?.main);
    store.setIndicatorInstanceInputs(secondId, { fast: 6 });
    store.setIndicatorInstanceAppearance(secondId, { plots: { main: { lineWidth: 4 } } });
    expect(useChartPreferences.getState().extraIndicators[0]).toEqual(first);
    const expected = getChartIndicatorInstances(useChartPreferences.getState());
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    useChartPreferences.setState(useChartPreferences.getInitialState(), true);
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    await useChartPreferences.persist.rehydrate();
    expect(getChartIndicatorInstances(useChartPreferences.getState())).toEqual(expected);
  });

  it("copies session schedules and volume colors without sharing their mutable settings", () => {
    const store = useChartPreferences.getState();
    store.addIndicator("ib");
    const session = {
      ...DEFAULT_INITIAL_BALANCE,
      startTime: "08:30",
      backgroundColor: "#123456",
      backgroundOpacity: 0.4,
    };
    const colors = { up: "#123456", down: "#abcdef" };
    store.setIndicatorInstanceInitialBalance("base:ib", session);
    store.setIndicatorInstanceVolumeColors("base:volume", colors);
    const ibId = store.duplicateIndicatorInstance("base:ib")!;
    const volumeId = store.duplicateIndicatorInstance("base:volume")!;
    const state = useChartPreferences.getState();
    expect(state.extraIndicators.find((instance) => instance.id === ibId)?.initialBalance).toEqual(
      session,
    );
    expect(state.extraIndicators.find((instance) => instance.id === ibId)?.initialBalance).not.toBe(
      state.initialBalance,
    );
    expect(
      state.extraIndicators.find((instance) => instance.id === volumeId)?.volumeColors,
    ).toEqual(colors);
    expect(
      state.extraIndicators.find((instance) => instance.id === volumeId)?.volumeColors,
    ).not.toBe(state.volumeColors);
    store.setIndicatorInstanceInitialBalance(ibId, { ...session, startTime: "09:00" });
    store.setIndicatorInstanceVolumeColors(volumeId, { up: "#112233", down: "#445566" });
    expect(useChartPreferences.getState().initialBalance).toEqual(session);
    expect(useChartPreferences.getState().volumeColors).toEqual(colors);
  });

  it("does nothing for stale IDs, disabled bases, and a full chart", () => {
    const store = useChartPreferences.getState();
    const removed = store.addIndicator("volume")!;
    store.removeIndicatorInstance(removed);
    const original = useChartPreferences.getState();
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    expect(store.duplicateIndicatorInstance(removed)).toBeNull();
    expect(store.duplicateIndicatorInstance("missing")).toBeNull();
    expect(store.duplicateIndicatorInstance("base:sma")).toBeNull();
    expect(useChartPreferences.getState()).toBe(original);
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
    while (getChartIndicatorInstances(useChartPreferences.getState()).length < MAX_CHART_INDICATORS)
      expect(store.duplicateIndicatorInstance("base:volume")).not.toBeNull();
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    expect(store.duplicateIndicatorInstance("base:volume")).toBeNull();
    expect(getChartIndicatorInstances(useChartPreferences.getState())).toHaveLength(
      MAX_CHART_INDICATORS,
    );
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });
});

describe("indicator favorites", () => {
  it("normalizes legacy, malformed and duplicate favorites without enabling indicators", () => {
    expect(normalizeChartPreferences({}).favoriteIndicators).toEqual([]);
    expect(normalizeChartPreferences({ favoriteIndicators: "sma" }).favoriteIndicators).toEqual([]);
    const saved = normalizeChartPreferences({
      favoriteIndicators: ["sma", "unknown", null, "rsi", "sma", 4],
    });
    expect(saved.favoriteIndicators).toEqual(["sma", "rsi"]);
    expect(saved.indicators.sma).toBe(false);
  });

  it("toggles favorites without altering active instances and retains them after removal", () => {
    const store = configure();
    const instances = getChartIndicatorInstances(store);
    store.toggleFavoriteIndicator("sma");
    store.toggleFavoriteIndicator("rsi");
    expect(useChartPreferences.getState().favoriteIndicators).toEqual(["sma", "rsi"]);
    expect(getChartIndicatorInstances(useChartPreferences.getState())).toEqual(instances);
    store.toggleFavoriteIndicator("sma");
    expect(useChartPreferences.getState().favoriteIndicators).toEqual(["rsi"]);
    expect(getChartIndicatorInstances(useChartPreferences.getState())).toEqual(instances);
    store.addIndicator("rsi");
    store.addIndicator("rsi");
    store.removeAllIndicators();
    expect(useChartPreferences.getState().favoriteIndicators).toEqual(["rsi"]);
    expect(getChartIndicatorInstances(useChartPreferences.getState())).toEqual([]);
    const state = useChartPreferences.getState();
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    store.toggleFavoriteIndicator("unknown" as never);
    expect(useChartPreferences.getState()).toBe(state);
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });

  it("restores favorites from workspace storage and clears them for a legacy workspace", async () => {
    const store = useChartPreferences.getState();
    store.toggleFavoriteIndicator("ib");
    store.toggleFavoriteIndicator("rsi");
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    useChartPreferences.setState(useChartPreferences.getInitialState(), true);
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    await useChartPreferences.persist.rehydrate();
    expect(useChartPreferences.getState().favoriteIndicators).toEqual(["ib", "rsi"]);
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
      JSON.stringify({ state: { indicators: { sma: true } }, version: 0 }),
    );
    await useChartPreferences.persist.rehydrate();
    expect(useChartPreferences.getState().favoriteIndicators).toEqual([]);
    expect(useChartPreferences.getState().indicators.sma).toBe(true);
  });
});

it("preserves each moving-average source through duplication and workspace reload", async () => {
  const store = useChartPreferences.getState();
  store.addIndicator("sma");
  store.setIndicatorInstanceInputs("base:sma", { source: 1 });
  const copyId = store.duplicateIndicatorInstance("base:sma")!;
  expect(store.setIndicatorInstanceInputs(copyId, { source: 6 })).toBe(true);
  expect(store.setIndicatorInstanceInputs(copyId, { source: 7 })).toBe(false);
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
  await useChartPreferences.persist.rehydrate();
  const restored = getChartIndicatorInstances(useChartPreferences.getState());
  expect(restored.find((instance) => instance.id === "base:sma")?.inputs.source).toBe(1);
  expect(restored.find((instance) => instance.id === copyId)?.inputs.source).toBe(6);
  useChartPreferences.getState().resetIndicatorInstanceInputs(copyId);
  expect(
    useChartPreferences.getState().extraIndicators.find((instance) => instance.id === copyId)
      ?.inputs.source,
  ).toBe(0);
  expect(useChartPreferences.getState().indicatorInputs.sma?.source).toBe(1);
});

it("keeps duplicate MACD source and MA selectors independent through validation, reset, and reload", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("macd")!;
  const baseInputs = {
    fast: 4,
    slow: 10,
    signalPeriod: 3,
    source: 1,
    oscillatorMA: 1,
    signalMA: 0,
    histogramColors: 1,
  };
  expect(store.setIndicatorInstanceInputs(base, baseInputs)).toBe(true);
  const duplicate = store.duplicateIndicatorInstance(base)!;
  const duplicateInputs = {
    ...baseInputs,
    fast: 6,
    source: 5,
    oscillatorMA: 0,
    signalMA: 1,
    histogramColors: 0,
  };
  expect(store.setIndicatorInstanceInputs(duplicate, duplicateInputs)).toBe(true);
  const inputs = () =>
    getChartIndicatorInstances(useChartPreferences.getState())
      .filter((instance) => instance.key === "macd")
      .map((instance) => instance.inputs);
  expect(inputs()).toEqual([baseInputs, duplicateInputs]);
  const reload = async () => {
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    useChartPreferences.setState(useChartPreferences.getInitialState(), true);
    await useChartPreferences.persist.rehydrate();
  };
  await reload();
  expect(inputs()).toEqual([baseInputs, duplicateInputs]);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  for (const patch of [
    { source: 99 },
    { source: 0.5 },
    { oscillatorMA: 2 },
    { oscillatorMA: -1 },
    { histogramColors: 2 },
    { histogramColors: 0.5 },
    { signalMA: 2 },
    { signalMA: 0.5 },
  ])
    expect(
      useChartPreferences.getState().setIndicatorInstanceInputs(duplicate, { fast: 8, ...patch }),
    ).toBe(false);
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  expect(inputs()).toEqual([baseInputs, duplicateInputs]);
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  const defaults = {
    fast: 12,
    slow: 26,
    signalPeriod: 9,
    source: 0,
    oscillatorMA: 0,
    signalMA: 0,
    histogramColors: 0,
  };
  expect(inputs()).toEqual([baseInputs, defaults]);
  await reload();
  expect(inputs()).toEqual([baseInputs, defaults]);
});

it("keeps ATR smoothing independent through duplication, invalid edits, reload and reset", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("atr")!;
  expect(store.setIndicatorInstanceInputs(base, { period: 7, smoothing: 1 })).toBe(true);
  const copy = store.duplicateIndicatorInstance(base)!;
  const inputs = () =>
    getChartIndicatorInstances(useChartPreferences.getState())
      .filter((instance) => instance.key === "atr")
      .map((instance) => instance.inputs);
  expect(inputs()).toEqual([
    { period: 7, smoothing: 1 },
    { period: 7, smoothing: 1 },
  ]);
  expect(store.setIndicatorInstanceInputs(copy, { period: 5, smoothing: 3 })).toBe(true);
  const configured = [
    { period: 7, smoothing: 1 },
    { period: 5, smoothing: 3 },
  ];
  expect(inputs()).toEqual(configured);
  const reload = async () => {
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    useChartPreferences.setState(useChartPreferences.getInitialState(), true);
    await useChartPreferences.persist.rehydrate();
  };
  await reload();
  expect(inputs()).toEqual(configured);
  const before = useChartPreferences.getState();
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  for (const id of [base, copy])
    for (const smoothing of [-1, 4, 0.5, NaN, Infinity])
      expect(
        useChartPreferences.getState().setIndicatorInstanceInputs(id, { period: 9, smoothing }),
      ).toBe(false);
  expect(useChartPreferences.getState()).toBe(before);
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  expect(inputs()).toEqual(configured);
  useChartPreferences.getState().resetIndicatorInstanceInputs(copy);
  const reset = [{ period: 7, smoothing: 1 }, getIndicatorInputs("atr")];
  expect(inputs()).toEqual(reset);
  await reload();
  expect(inputs()).toEqual(reset);
});

it("hydrates legacy and malformed ATR smoothing without losing each instance's length", async () => {
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
    JSON.stringify({
      version: 0,
      state: {
        indicators: { atr: true },
        indicatorInputs: { atr: { period: 7 } },
        extraIndicators: [
          { id: "legacy-atr", key: "atr", hidden: false, inputs: { period: 5 }, appearance: {} },
          {
            id: "invalid-atr",
            key: "atr",
            hidden: true,
            inputs: { period: 9, smoothing: 99 },
            appearance: {},
          },
        ],
      },
    }),
  );
  await useChartPreferences.persist.rehydrate();
  expect(
    getChartIndicatorInstances(useChartPreferences.getState())
      .filter((instance) => instance.key === "atr")
      .map(({ id, inputs, hidden }) => ({ id, inputs, hidden })),
  ).toEqual([
    { id: "base:atr", inputs: { period: 7, smoothing: 0 }, hidden: false },
    { id: "legacy-atr", inputs: { period: 5, smoothing: 0 }, hidden: false },
    { id: "invalid-atr", inputs: { period: 9, smoothing: 0 }, hidden: true },
  ]);
});

it("retains independent Stochastic RSI sources through duplication, reload, and reset", async () => {
  const store = useChartPreferences.getState();
  const original = store.addIndicator("stochRsi")!;
  const custom = {
    rsiPeriod: 7,
    stochasticPeriod: 9,
    smoothK: 2,
    periodD: 1,
    source: 4,
    lowerLevel: 20,
    upperLevel: 80,
    showLevels: 1,
  };
  expect(store.setIndicatorInstanceInputs(original, custom)).toBe(true);
  const duplicate = store.duplicateIndicatorInstance(original)!;
  expect(store.setIndicatorInstanceInputs(duplicate, { source: 6 })).toBe(true);
  const instances = () =>
    getChartIndicatorInstances(useChartPreferences.getState()).filter(
      (item) => item.key === "stochRsi",
    );
  const reload = async () => {
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
    useChartPreferences.setState(useChartPreferences.getInitialState(), true);
    await useChartPreferences.persist.rehydrate();
  };
  await reload();
  expect(instances().map((item) => item.inputs)).toEqual([custom, { ...custom, source: 6 }]);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  expect(useChartPreferences.getState().setIndicatorInstanceInputs(duplicate, { source: 9 })).toBe(
    false,
  );
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  expect(instances().map((item) => item.inputs)).toEqual([custom, { ...custom, source: 6 }]);
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  await reload();
  expect(instances().map((item) => item.inputs)).toEqual([
    custom,
    {
      rsiPeriod: 14,
      stochasticPeriod: 14,
      smoothK: 3,
      periodD: 3,
      source: 0,
      lowerLevel: 20,
      upperLevel: 80,
      showLevels: 1,
    },
  ]);
});

it.each(["rsi", "stochastic", "stochRsi"] as const)(
  "persists independent %s levels, rejects invalid edits atomically, and resets only the copy",
  async (key) => {
    const store = useChartPreferences.getState();
    const base = store.addIndicator(key)!;
    const length = key === "stochRsi" ? { rsiPeriod: 7 } : { period: 7 };
    const baseInputs = {
      ...getIndicatorInputs(key),
      ...length,
      lowerLevel: 12.5,
      upperLevel: 87.5,
    };
    expect(store.setIndicatorInstanceInputs(base, baseInputs)).toBe(true);
    const copy = store.duplicateIndicatorInstance(base)!;
    const inputs = () =>
      getChartIndicatorInstances(useChartPreferences.getState())
        .filter((instance) => instance.key === key)
        .map((instance) => instance.inputs);
    expect(inputs()).toEqual([baseInputs, baseInputs]);
    const copyInputs = { ...baseInputs, lowerLevel: 25.5, upperLevel: 74.5, showLevels: 0 };
    expect(store.setIndicatorInstanceInputs(copy, copyInputs)).toBe(true);
    const reload = async () => {
      const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
    };
    await reload();
    expect(inputs()).toEqual([baseInputs, copyInputs]);
    const before = useChartPreferences.getState();
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    for (const id of [base, copy])
      for (const patch of [
        { lowerLevel: 90 },
        { upperLevel: 10 },
        { lowerLevel: 50, upperLevel: 50 },
        { lowerLevel: -0.1 },
        { upperLevel: 100.1 },
        { lowerLevel: NaN },
        { upperLevel: Infinity },
        { showLevels: 2 },
        { showLevels: 0.5 },
      ])
        expect(
          useChartPreferences.getState().setIndicatorInstanceInputs(id, {
            ...(key === "stochRsi" ? { rsiPeriod: 9 } : { period: 9 }),
            ...patch,
          }),
        ).toBe(false);
    expect(useChartPreferences.getState()).toBe(before);
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
    expect(inputs()).toEqual([baseInputs, copyInputs]);
    useChartPreferences.getState().resetIndicatorInstanceInputs(copy);
    expect(inputs()).toEqual([baseInputs, getIndicatorInputs(key)]);
    await reload();
    expect(inputs()).toEqual([baseInputs, getIndicatorInputs(key)]);
  },
);

it("persists independent Supertrend factors, periods, colors and visibility", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("supertrend")!;
  expect(store.setIndicatorInstanceInputs(base, { period: 7, multiplier: 2.5 })).toBe(true);
  store.setIndicatorInstanceAppearance(base, {
    plots: { up: { color: "#123456", lineWidth: 3 }, down: { color: "#654321" } },
  });
  const duplicate = store.duplicateIndicatorInstance(base)!;
  store.setIndicatorInstanceInputs(duplicate, { period: 14, multiplier: 4 });
  store.toggleIndicatorInstanceVisibility(duplicate);
  expect(store.setIndicatorInstanceInputs(duplicate, { multiplier: 0 })).toBe(false);
  expect(store.setIndicatorInstanceInputs(duplicate, { period: 1.5 })).toBe(false);
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const instances = getChartIndicatorInstances(useChartPreferences.getState()).filter(
    (instance) => instance.key === "supertrend",
  );
  expect(instances.map((instance) => instance.inputs)).toEqual([
    { period: 7, multiplier: 2.5 },
    { period: 14, multiplier: 4 },
  ]);
  expect(instances.map((instance) => instance.hidden)).toEqual([false, true]);
  expect(instances[0]!.appearance.plots?.up?.color).toBe("#123456");
  expect(instances[1]!.appearance.plots?.down?.color).toBe("#654321");
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(
    getChartIndicatorInstances(useChartPreferences.getState()).find(
      (instance) => instance.id === duplicate,
    )!.inputs,
  ).toEqual({ period: 10, multiplier: 3 });
});

it("saves independent SAR acceleration settings and marker appearance", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("sar")!;
  expect(
    store.setIndicatorInstanceInputs(base, { start: 0.04, increment: 0.03, maximum: 0.3 }),
  ).toBe(true);
  store.setIndicatorInstanceAppearance(base, {
    plots: { main: { color: "#facc15", lineWidth: 3, opacity: 0.5 } },
  });
  const duplicate = store.duplicateIndicatorInstance(base)!;
  expect(store.setIndicatorInstanceInputs(duplicate, { maximum: 0.01 })).toBe(false);
  expect(store.setIndicatorInstanceInputs(duplicate, { increment: -1 })).toBe(false);
  store.setIndicatorInstanceInputs(duplicate, { start: 0.01 });
  store.toggleIndicatorInstanceVisibility(duplicate);
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const instances = getChartIndicatorInstances(useChartPreferences.getState()).filter(
    (i) => i.key === "sar",
  );
  expect(instances.map((i) => i.inputs)).toEqual([
    { start: 0.04, increment: 0.03, maximum: 0.3 },
    { start: 0.01, increment: 0.03, maximum: 0.3 },
  ]);
  expect(instances[1]!.hidden).toBe(true);
  expect(instances[0]!.appearance.plots?.main).toEqual({
    color: "#facc15",
    lineWidth: 3,
    opacity: 0.5,
  });
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(
    getChartIndicatorInstances(useChartPreferences.getState()).find((i) => i.id === duplicate)!
      .inputs,
  ).toEqual({ start: 0.02, increment: 0.02, maximum: 0.2 });
});

it.each(["hollow", "heikin-ashi"] as const)(
  "restores the %s chart style from workspace preferences",
  async (style) => {
    useChartPreferences.getState().setStyle(style);
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
    useChartPreferences.setState(useChartPreferences.getInitialState(), true);
    await useChartPreferences.persist.rehydrate();
    expect(useChartPreferences.getState().style).toBe(style);
    useChartPreferences.getState().setStyle("candles");
    expect(useChartPreferences.getState().style).toBe("candles");
  },
);

it("persists independent MFI lengths, levels, appearance and visibility", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("mfi")!;
  expect(
    store.setIndicatorInstanceInputs(base, { period: 7, lowerLevel: 15, upperLevel: 85 }),
  ).toBe(true);
  store.setIndicatorInstanceAppearance(base, {
    plots: { main: { color: "#facc15", lineWidth: 3 } },
  });
  const duplicate = store.duplicateIndicatorInstance(base)!;
  expect(store.setIndicatorInstanceInputs(duplicate, { period: 21, showLevels: 0 })).toBe(true);
  store.toggleIndicatorInstanceVisibility(duplicate);
  expect(store.setIndicatorInstanceInputs(base, { lowerLevel: 90 })).toBe(false);
  expect(store.setIndicatorInstanceInputs(base, { period: 0 })).toBe(false);
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const instances = getChartIndicatorInstances(useChartPreferences.getState()).filter(
    (i) => i.key === "mfi",
  );
  expect(instances.map((i) => i.inputs)).toEqual([
    { period: 7, lowerLevel: 15, upperLevel: 85, showLevels: 1 },
    { period: 21, lowerLevel: 15, upperLevel: 85, showLevels: 0 },
  ]);
  expect(instances.map((i) => i.hidden)).toEqual([false, true]);
  expect(instances[0]!.appearance.plots?.main).toEqual({ color: "#facc15", lineWidth: 3 });
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(
    getChartIndicatorInstances(useChartPreferences.getState()).find((i) => i.id === duplicate)!
      .inputs,
  ).toEqual({ period: 14, lowerLevel: 20, upperLevel: 80, showLevels: 1 });
});

it("persists independent Williams %R lengths, levels, appearance and visibility", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("williams")!;
  expect(
    store.setIndicatorInstanceInputs(base, { period: 7, lowerLevel: -90, upperLevel: -10 }),
  ).toBe(true);
  store.setIndicatorInstanceAppearance(base, {
    plots: { main: { color: "#facc15", lineWidth: 3 } },
  });
  const duplicate = store.duplicateIndicatorInstance(base)!;
  expect(store.setIndicatorInstanceInputs(duplicate, { period: 21, showLevels: 0 })).toBe(true);
  store.toggleIndicatorInstanceVisibility(duplicate);
  expect(store.setIndicatorInstanceInputs(base, { lowerLevel: -5 })).toBe(false);
  expect(store.setIndicatorInstanceInputs(base, { period: 0 })).toBe(false);
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const instances = getChartIndicatorInstances(useChartPreferences.getState()).filter(
    (i) => i.key === "williams",
  );
  expect(instances.map((i) => i.inputs)).toEqual([
    { period: 7, lowerLevel: -90, upperLevel: -10, showLevels: 1 },
    { period: 21, lowerLevel: -90, upperLevel: -10, showLevels: 0 },
  ]);
  expect(instances.map((i) => i.hidden)).toEqual([false, true]);
  expect(instances[0]!.appearance.plots?.main).toEqual({ color: "#facc15", lineWidth: 3 });
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(
    getChartIndicatorInstances(useChartPreferences.getState()).find((i) => i.id === duplicate)!
      .inputs,
  ).toEqual({ period: 14, lowerLevel: -80, upperLevel: -20, showLevels: 1 });
});

it("persists independent Bollinger basis types and restores old charts to SMA", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("bollinger")!;
  expect(store.setIndicatorInstanceInputs(base, { period: 7, basisType: 1 })).toBe(true);
  const duplicate = store.duplicateIndicatorInstance(base)!;
  expect(store.setIndicatorInstanceInputs(duplicate, { basisType: 4, source: 1 })).toBe(true);
  expect(store.setIndicatorInstanceInputs(duplicate, { basisType: 5 })).toBe(false);
  expect(store.setIndicatorInstanceInputs(duplicate, { basisType: 1.5 })).toBe(false);
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const instances = getChartIndicatorInstances(useChartPreferences.getState()).filter(
    (i) => i.key === "bollinger",
  );
  expect(instances.map((i) => i.inputs)).toEqual([
    { period: 7, basisType: 1, source: 0, deviations: 2 },
    { period: 7, basisType: 4, source: 1, deviations: 2 },
  ]);
  expect(getIndicatorInputs("bollinger", { bollinger: { period: 12 } }).basisType).toBe(0);
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(
    getChartIndicatorInstances(useChartPreferences.getState()).find((i) => i.id === duplicate)!
      .inputs,
  ).toEqual({ period: 20, basisType: 0, source: 0, deviations: 2 });
});

it.each(["hma", "wma", "vwma"] as const)(
  "persists independent %s lengths, sources and appearance",
  async (key) => {
    const store = useChartPreferences.getState();
    const base = store.addIndicator(key)!;
    expect(store.setIndicatorInstanceInputs(base, { period: 16, source: 5 })).toBe(true);
    store.setIndicatorInstanceAppearance(base, {
      plots: { main: { color: "#ff00aa", lineWidth: 3 } },
    });
    const duplicate = store.duplicateIndicatorInstance(base)!;
    expect(store.setIndicatorInstanceInputs(duplicate, { period: 21, source: 1 })).toBe(true);
    store.toggleIndicatorInstanceVisibility(duplicate);
    expect(store.setIndicatorInstanceInputs(base, { period: 0 })).toBe(false);
    expect(store.setIndicatorInstanceInputs(base, { source: 7 })).toBe(false);
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
    useChartPreferences.setState(useChartPreferences.getInitialState(), true);
    await useChartPreferences.persist.rehydrate();
    const instances = getChartIndicatorInstances(useChartPreferences.getState()).filter(
      (i) => i.key === key,
    );
    expect(instances.map((i) => i.inputs)).toEqual([
      { period: 16, source: 5 },
      { period: 21, source: 1 },
    ]);
    expect(instances.map((i) => i.hidden)).toEqual([false, true]);
    expect(instances[0]!.appearance.plots?.main).toEqual({ color: "#ff00aa", lineWidth: 3 });
    useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
    expect(
      getChartIndicatorInstances(useChartPreferences.getState()).find((i) => i.id === duplicate)!
        .inputs,
    ).toEqual({ period: key === "vwma" ? 20 : 9, source: 0 });
    expect(
      getChartIndicatorInstances(useChartPreferences.getState()).find((i) => i.id === base)!.inputs,
    ).toEqual({ period: 16, source: 5 });
  },
);

it("persists independent AO periods, momentum colors and visibility", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("ao")!;
  expect(store.setIndicatorInstanceInputs(base, { fast: 3, slow: 10 })).toBe(true);
  store.setIndicatorInstanceAppearance(base, {
    plots: { growing: { color: "#123456" }, falling: { color: "#abcdef", opacity: 0.5 } },
  });
  const duplicate = store.duplicateIndicatorInstance(base)!;
  expect(store.setIndicatorInstanceInputs(duplicate, { fast: 7, slow: 21 })).toBe(true);
  store.toggleIndicatorInstanceVisibility(duplicate);
  expect(store.setIndicatorInstanceInputs(base, { fast: 10 })).toBe(false);
  expect(store.setIndicatorInstanceInputs(base, { slow: 0 })).toBe(false);
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const instances = getChartIndicatorInstances(useChartPreferences.getState()).filter(
    (i) => i.key === "ao",
  );
  expect(instances.map((i) => i.inputs)).toEqual([
    { fast: 3, slow: 10 },
    { fast: 7, slow: 21 },
  ]);
  expect(instances.map((i) => i.hidden)).toEqual([false, true]);
  expect(instances[0]!.appearance.plots).toEqual({
    growing: { color: "#123456" },
    falling: { color: "#abcdef", opacity: 0.5 },
  });
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(
    getChartIndicatorInstances(useChartPreferences.getState()).find((i) => i.id === duplicate)!
      .inputs,
  ).toEqual({ fast: 5, slow: 34 });
});

describe("chart crosshair preferences", () => {
  it("defaults older charts and invalid saved modes to the existing normal crosshair", () => {
    expect(useChartPreferences.getInitialState().crosshairMode).toBe("normal");
    for (const invalid of [
      undefined,
      null,
      "",
      "Normal",
      "strong",
      0,
      1,
      2,
      3,
      true,
      {},
      ["magnet"],
    ]) {
      const restored = normalizeChartPreferences({
        style: "heikin-ashi",
        showGrid: false,
        logScale: true,
        crosshairMode: invalid,
        indicatorInputs: { sma: { period: 42 } },
      });
      expect(restored.crosshairMode).toBe("normal");
      expect(restored.style).toBe("heikin-ashi");
      expect(restored.gridMode).toBe("none");
      expect(restored.priceScaleMode).toBe("logarithmic");
      expect(restored.indicatorInputs.sma?.period).toBe(42);
    }
    expect(normalizeChartPreferences({}).crosshairMode).toBe("normal");
  });

  it.each(["normal", "magnet", "ohlc", "hidden"] as const)(
    "persists and restores %s without changing other chart choices",
    async (mode) => {
      const configured = configure();
      configured.setStyle("heikin-ashi");
      configured.setGridMode("none");
      configured.setPriceScaleMode("logarithmic");
      // Ensure normal also exercises a real transition/save.
      configured.setCrosshairMode(mode === "normal" ? "hidden" : "normal");
      const before = normalizeChartPreferences(useChartPreferences.getState());
      useChartPreferences.getState().setCrosshairMode(mode);
      const expected = { ...before, crosshairMode: mode };
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
      expect(JSON.parse(saved[1]).state.crosshairMode).toBe(mode);
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      expect(typeof useChartPreferences.getState().setCrosshairMode).toBe("function");
    },
  );

  it("rejects invalid runtime values and repeated selections without changing state or writing storage", () => {
    configure().setCrosshairMode("ohlc");
    const before = useChartPreferences.getState();
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    for (const invalid of [undefined, null, "OHLC", "snap", 0, 3, false, {}, ["hidden"]])
      before.setCrosshairMode(invalid as ChartCrosshairMode);
    before.setCrosshairMode("ohlc");
    expect(useChartPreferences.getState()).toBe(before);
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
    before.setCrosshairMode("hidden");
    expect(useChartPreferences.getState().crosshairMode).toBe("hidden");
    expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
  });
});

describe("current price display preferences", () => {
  it("keeps lines and labels visible for legacy charts and rejects nonboolean saved values", () => {
    expect(useChartPreferences.getInitialState()).toMatchObject({
      showPriceLine: true,
      showPriceLabel: true,
    });
    expect(normalizeChartPreferences({})).toMatchObject({
      showPriceLine: true,
      showPriceLabel: true,
    });
    for (const invalid of [null, undefined, "false", "true", 0, 1, [], {}, [false]]) {
      expect(
        normalizeChartPreferences({ showPriceLine: invalid, showPriceLabel: false }),
      ).toMatchObject({ showPriceLine: true, showPriceLabel: false });
      expect(
        normalizeChartPreferences({ showPriceLine: false, showPriceLabel: invalid }),
      ).toMatchObject({ showPriceLine: false, showPriceLabel: true });
    }
  });

  it.each([
    { line: true, label: true },
    { line: true, label: false },
    { line: false, label: true },
    { line: false, label: false },
  ])(
    "preserves line=$line and label=$label independently through toggles and reload",
    async ({ line, label }) => {
      const configured = configure();
      configured.setStyle("heikin-ashi");
      configured.setCrosshairMode("ohlc");
      configured.setGridMode("none");
      configured.setPriceScaleMode("logarithmic");
      const before = normalizeChartPreferences(useChartPreferences.getState());
      const { togglePriceLine, togglePriceLabel } = useChartPreferences.getState();
      if (!line) togglePriceLine();
      if (!label) togglePriceLabel();
      // Saved callbacks must read current state, and round-tripping each setting is independent.
      togglePriceLine();
      expect(useChartPreferences.getState()).toMatchObject({
        showPriceLine: !line,
        showPriceLabel: label,
      });
      togglePriceLine();
      togglePriceLabel();
      expect(useChartPreferences.getState()).toMatchObject({
        showPriceLine: line,
        showPriceLabel: !label,
      });
      togglePriceLabel();
      const expected = { ...before, showPriceLine: line, showPriceLabel: label };
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
      expect(JSON.parse(saved[1]).state).toMatchObject({
        showPriceLine: line,
        showPriceLabel: label,
      });
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      expect(typeof useChartPreferences.getState().togglePriceLine).toBe("function");
      expect(typeof useChartPreferences.getState().togglePriceLabel).toBe("function");
    },
  );
});

describe("inverted price scale preferences", () => {
  it("retains normal orientation for legacy or nonboolean saved settings", () => {
    expect(useChartPreferences.getInitialState().invertScale).toBe(false);
    expect(normalizeChartPreferences({ logScale: true })).toMatchObject({
      invertScale: false,
      priceScaleMode: "logarithmic",
    });
    for (const invalid of [undefined, null, 0, 1, "true", "false", [], {}, [true]])
      expect(
        normalizeChartPreferences({ invertScale: invalid, logScale: true, showPriceLine: false }),
      ).toMatchObject({ invertScale: false, priceScaleMode: "logarithmic", showPriceLine: false });
    expect(normalizeChartPreferences({ invertScale: true })).toMatchObject({
      invertScale: true,
      priceScaleMode: "normal",
    });
    expect(normalizeChartPreferences({ invertScale: false })).toMatchObject({ invertScale: false });
  });

  it.each([
    { inverted: false, logarithmic: false },
    { inverted: true, logarithmic: false },
    { inverted: false, logarithmic: true },
    { inverted: true, logarithmic: true },
  ])(
    "persists inverted=$inverted independently from logarithmic=$logarithmic",
    async ({ inverted, logarithmic }) => {
      const configured = configure();
      configured.setStyle("heikin-ashi");
      configured.setCrosshairMode("magnet");
      configured.togglePriceLine();
      configured.togglePriceLabel();
      if (logarithmic) configured.setPriceScaleMode("logarithmic");
      const before = normalizeChartPreferences(useChartPreferences.getState());
      const { toggleInvertScale, setPriceScaleMode } = useChartPreferences.getState();
      if (inverted) toggleInvertScale();
      setPriceScaleMode(logarithmic ? "normal" : "logarithmic");
      expect(useChartPreferences.getState()).toMatchObject({
        invertScale: inverted,
        priceScaleMode: logarithmic ? "normal" : "logarithmic",
      });
      setPriceScaleMode(logarithmic ? "logarithmic" : "normal");
      toggleInvertScale();
      expect(useChartPreferences.getState()).toMatchObject({
        invertScale: !inverted,
        priceScaleMode: logarithmic ? "logarithmic" : "normal",
      });
      toggleInvertScale();
      const expected = { ...before, invertScale: inverted };
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
      expect(JSON.parse(saved[1]).state).toMatchObject({
        invertScale: inverted,
        priceScaleMode: logarithmic ? "logarithmic" : "normal",
      });
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      expect(typeof useChartPreferences.getState().toggleInvertScale).toBe("function");
    },
  );
});

it("persists independent Bollinger BandWidth inputs and appearance", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("bbWidth")!;
  expect(
    store.setIndicatorInstanceInputs(base, {
      period: 10,
      source: 5,
      deviations: 1.5,
      expansionLength: 12,
      contractionLength: 8,
    }),
  ).toBe(true);
  store.setIndicatorInstanceAppearance(base, {
    plots: {
      main: { color: "#ff00aa", lineWidth: 3 },
      highest: { visible: false, color: "#facc15", lineWidth: 2 },
      lowest: { color: "#a78bfa" },
    },
  });
  const duplicate = store.duplicateIndicatorInstance(base)!;
  expect(
    store.setIndicatorInstanceInputs(duplicate, {
      period: 21,
      source: 1,
      deviations: 3,
      expansionLength: 30,
      contractionLength: 20,
    }),
  ).toBe(true);
  store.toggleIndicatorInstanceVisibility(duplicate);
  for (const invalid of [
    { period: 0 },
    { deviations: -1 },
    { source: 7 },
    { expansionLength: 0 },
    { contractionLength: 1.5 },
  ])
    expect(store.setIndicatorInstanceInputs(base, invalid)).toBe(false);
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const instances = getChartIndicatorInstances(useChartPreferences.getState()).filter(
    (i) => i.key === "bbWidth",
  );
  expect(instances.map((i) => i.inputs)).toEqual([
    { period: 10, source: 5, deviations: 1.5, expansionLength: 12, contractionLength: 8 },
    { period: 21, source: 1, deviations: 3, expansionLength: 30, contractionLength: 20 },
  ]);
  expect(instances.map((i) => i.hidden)).toEqual([false, true]);
  expect(instances[0]!.appearance.plots?.main).toEqual({ color: "#ff00aa", lineWidth: 3 });
  expect(instances[0]!.appearance.plots?.highest).toEqual({
    visible: false,
    color: "#facc15",
    lineWidth: 2,
  });
  expect(instances[1]!.appearance.plots?.lowest).toEqual({ color: "#a78bfa" });
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(
    getChartIndicatorInstances(useChartPreferences.getState()).find((i) => i.id === duplicate)!
      .inputs,
  ).toEqual({ period: 20, source: 0, deviations: 2, expansionLength: 125, contractionLength: 125 });
});

it("persists independent Bollinger %B inputs, levels and appearance", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("bbPercentB")!;
  expect(
    store.setIndicatorInstanceInputs(base, {
      period: 10,
      source: 5,
      deviations: 1.5,
      lowerLevel: -0.2,
      upperLevel: 1.2,
    }),
  ).toBe(true);
  store.setIndicatorInstanceAppearance(base, {
    plots: { main: { color: "#ff00aa", lineWidth: 3 } },
  });
  const duplicate = store.duplicateIndicatorInstance(base)!;
  expect(
    store.setIndicatorInstanceInputs(duplicate, {
      period: 21,
      source: 1,
      deviations: 3,
      showLevels: 0,
    }),
  ).toBe(true);
  store.toggleIndicatorInstanceVisibility(duplicate);
  for (const invalid of [{ period: 0 }, { deviations: 0 }, { source: 7 }, { lowerLevel: 2 }])
    expect(store.setIndicatorInstanceInputs(base, invalid)).toBe(false);
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const instances = getChartIndicatorInstances(useChartPreferences.getState()).filter(
    (i) => i.key === "bbPercentB",
  );
  expect(instances.map((i) => i.inputs)).toEqual([
    { period: 10, source: 5, deviations: 1.5, showLevels: 1, lowerLevel: -0.2, upperLevel: 1.2 },
    { period: 21, source: 1, deviations: 3, showLevels: 0, lowerLevel: -0.2, upperLevel: 1.2 },
  ]);
  expect(instances.map((i) => i.hidden)).toEqual([false, true]);
  expect(instances[0]!.appearance.plots?.main).toEqual({ color: "#ff00aa", lineWidth: 3 });
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(
    getChartIndicatorInstances(useChartPreferences.getState()).find((i) => i.id === duplicate)!
      .inputs,
  ).toEqual({ period: 20, source: 0, deviations: 2, showLevels: 1, lowerLevel: 0, upperLevel: 1 });
});

describe("chart grid orientation preferences", () => {
  it("migrates legacy visibility and removes the legacy key from current preferences", () => {
    expect(useChartPreferences.getInitialState().gridMode).toBe("both");
    expect(useChartPreferences.getInitialState()).not.toHaveProperty("showGrid");
    expect(useChartPreferences.getInitialState()).not.toHaveProperty("toggleGrid");
    expect(normalizeChartPreferences({ showGrid: false }).gridMode).toBe("none");
    for (const legacy of [undefined, null, true, "false", 0, 1, {}, []])
      expect(normalizeChartPreferences({ showGrid: legacy }).gridMode).toBe("both");
    const restored = normalizeChartPreferences({
      showGrid: false,
      style: "heikin-ashi",
      logScale: true,
    });
    expect(restored).not.toHaveProperty("showGrid");
    expect(restored).toMatchObject({
      gridMode: "none",
      style: "heikin-ashi",
      priceScaleMode: "logarithmic",
    });
  });

  it("prefers valid explicit modes over legacy visibility, but falls back safely for invalid modes", () => {
    for (const mode of ["both", "horizontal", "vertical", "none"] as const)
      for (const showGrid of [true, false])
        expect(normalizeChartPreferences({ gridMode: mode, showGrid }).gridMode).toBe(mode);
    for (const invalid of [undefined, null, "Horizontal", "all", "", 0, 1, true, {}, ["none"]]) {
      expect(normalizeChartPreferences({ gridMode: invalid }).gridMode).toBe("both");
      expect(normalizeChartPreferences({ gridMode: invalid, showGrid: false }).gridMode).toBe(
        "none",
      );
    }
  });

  it.each(["both", "horizontal", "vertical", "none"] as const)(
    "persists %s orientation and leaves other settings unchanged",
    async (mode) => {
      const configured = configure();
      configured.setStyle("heikin-ashi");
      configured.setCrosshairMode("ohlc");
      configured.toggleInvertScale();
      configured.setPriceScaleMode("logarithmic");
      configured.togglePriceLine();
      configured.togglePriceLabel();
      configured.setGridMode(mode === "both" ? "none" : "both");
      const before = normalizeChartPreferences(useChartPreferences.getState());
      configured.setGridMode(mode);
      const expected = { ...before, gridMode: mode };
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
      const serialized = JSON.parse(saved[1]).state;
      expect(serialized.gridMode).toBe(mode);
      expect(serialized).not.toHaveProperty("showGrid");
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      expect(typeof useChartPreferences.getState().setGridMode).toBe("function");
    },
  );

  it("ignores invalid and unchanged runtime selections without a write or notification", () => {
    configure().setGridMode("vertical");
    const before = useChartPreferences.getState();
    const listener = vi.fn();
    const unsubscribe = useChartPreferences.subscribe(listener);
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    try {
      for (const invalid of [undefined, null, "Vertical", "all", false, 0, {}, ["horizontal"]])
        before.setGridMode(invalid as ChartGridMode);
      before.setGridMode("vertical");
      expect(useChartPreferences.getState()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
      expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
      before.setGridMode("horizontal");
      expect(useChartPreferences.getState().gridMode).toBe("horizontal");
      expect(listener).toHaveBeenCalledTimes(1);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it("rehydrates legacy hidden grids and saves only the new orientation schema", async () => {
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
      JSON.stringify({
        version: 0,
        state: { showGrid: false, logScale: true, invertScale: true },
      }),
    );
    await useChartPreferences.persist.rehydrate();
    expect(useChartPreferences.getState()).toMatchObject({
      gridMode: "none",
      priceScaleMode: "logarithmic",
      invertScale: true,
    });
    expect(useChartPreferences.getState()).not.toHaveProperty("showGrid");
    useChartPreferences.getState().setGridMode("horizontal");
    const saved = JSON.parse(
      vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1],
    ).state;
    expect(saved).toMatchObject({
      gridMode: "horizontal",
      priceScaleMode: "logarithmic",
      invertScale: true,
    });
    expect(saved).not.toHaveProperty("showGrid");
  });
});

it("saves independent volume average lengths and styles alongside histogram colors", async () => {
  const store = useChartPreferences.getState();
  store.setIndicatorInstanceInputs("base:volume", { period: 5 });
  store.setIndicatorInstanceAppearance("base:volume", {
    plots: { average: { visible: true, color: "#abcdef", lineWidth: 3 } },
  });
  store.setIndicatorInstanceVolumeColors("base:volume", { up: "#123456", down: "#654321" });
  const duplicate = store.duplicateIndicatorInstance("base:volume")!;
  store.setIndicatorInstanceInputs(duplicate, { period: 10 });
  store.setIndicatorInstanceAppearance(duplicate, { plots: { average: { visible: false } } });
  expect(store.setIndicatorInstanceInputs(duplicate, { period: 0 })).toBe(false);
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const volumes = getChartIndicatorInstances(useChartPreferences.getState()).filter(
    (i) => i.key === "volume",
  );
  expect(volumes.map((i) => i.inputs.period)).toEqual([5, 10]);
  expect(volumes.map((i) => i.appearance.plots?.average?.visible)).toEqual([true, false]);
  expect(volumes[0]!.appearance.plots?.average).toEqual({
    visible: true,
    color: "#abcdef",
    lineWidth: 3,
  });
  expect(volumes.map((i) => i.volumeColors)).toEqual([
    { up: "#123456", down: "#654321" },
    { up: "#123456", down: "#654321" },
  ]);
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(
    getChartIndicatorInstances(useChartPreferences.getState()).find((i) => i.id === duplicate)!
      .inputs.period,
  ).toBe(20);
});

describe("chart grid line appearance preferences", () => {
  it("uses the existing solid dark grid by default and preserves legacy orientation migration", () => {
    expect(useChartPreferences.getInitialState()).toMatchObject({
      gridMode: "both",
      gridLineStyle: "solid",
      gridColor: "#171a23",
    });
    for (const saved of [undefined, null, {}, { showGrid: false }, { gridMode: "vertical" }])
      expect(normalizeChartPreferences(saved)).toMatchObject({
        gridLineStyle: "solid",
        gridColor: "#171a23",
      });
    expect(
      normalizeChartPreferences({ showGrid: false, gridLineStyle: "dotted", gridColor: "#123ABC" }),
    ).toMatchObject({ gridMode: "none", gridLineStyle: "dotted", gridColor: "#123ABC" });
    expect(
      normalizeChartPreferences({
        gridMode: "horizontal",
        showGrid: false,
        gridLineStyle: "dashed",
        gridColor: "#abcdef",
      }),
    ).toMatchObject({ gridMode: "horizontal", gridLineStyle: "dashed", gridColor: "#abcdef" });
  });

  it("normalizes malformed saved style and color independently without affecting valid neighboring fields", () => {
    for (const gridLineStyle of [undefined, null, "", "Solid", "dash", 0, 1, false, {}, ["dotted"]])
      expect(
        normalizeChartPreferences({ gridMode: "vertical", gridLineStyle, gridColor: "#abcdef" }),
      ).toMatchObject({ gridMode: "vertical", gridLineStyle: "solid", gridColor: "#abcdef" });
    for (const gridColor of [
      undefined,
      null,
      "",
      "#fff",
      "abcdef",
      "#12345678",
      "#gggggg",
      "#123456 ",
      " #123456",
      "rgb(1,2,3)",
      "transparent",
      "var(--grid)",
      123456,
      true,
      {},
      ["#123456"],
    ])
      expect(
        normalizeChartPreferences({ showGrid: false, gridLineStyle: "dashed", gridColor }),
      ).toMatchObject({ gridMode: "none", gridLineStyle: "dashed", gridColor: "#171a23" });
  });

  it("does not write or notify for unchanged or invalid runtime appearance values", () => {
    const store = configure();
    store.setGridMode("horizontal");
    store.setGridLineStyle("dotted");
    store.setGridColor("#123456");
    const before = useChartPreferences.getState(),
      listener = vi.fn(),
      unsubscribe = useChartPreferences.subscribe(listener);
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    try {
      for (const invalid of [undefined, null, "Solid", "dot", "", 1, false, {}, ["dashed"]])
        before.setGridLineStyle(invalid as ChartGridLineStyle);
      for (const invalid of [
        undefined,
        null,
        "#fff",
        "#12345678",
        "#abcdef ",
        "#zzzzzz",
        "red",
        1,
        false,
        {},
        ["#abcdef"],
      ])
        before.setGridColor(invalid as string);
      before.setGridLineStyle("dotted");
      before.setGridColor("#123456");
      expect(useChartPreferences.getState()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
      expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
      before.setGridLineStyle("dashed");
      before.setGridColor("#abcdef");
      expect(listener).toHaveBeenCalledTimes(2);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(2);
      expect(useChartPreferences.getState()).toMatchObject({
        gridMode: "horizontal",
        gridLineStyle: "dashed",
        gridColor: "#abcdef",
      });
    } finally {
      unsubscribe();
    }
  });

  it.each(["solid", "dotted", "dashed"] as const)(
    "persists %s lines and color alongside orientation, scales and configured indicators",
    async (gridLineStyle) => {
      const store = configure();
      store.setGridMode("vertical");
      store.setStyle("heikin-ashi");
      store.setPriceScaleMode("logarithmic");
      store.toggleInvertScale();
      store.setCrosshairMode("ohlc");
      const before = normalizeChartPreferences(useChartPreferences.getState());
      store.setGridLineStyle(gridLineStyle);
      store.setGridColor("#A1B2C3");
      const expected = { ...before, gridLineStyle, gridColor: "#A1B2C3" };
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
      expect(saved[0]).toBe("automorphic:chart:v1");
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      useChartPreferences.getState().setGridMode("none");
      expect(useChartPreferences.getState()).toMatchObject({
        gridMode: "none",
        gridLineStyle,
        gridColor: "#A1B2C3",
      });
      expect(typeof useChartPreferences.getState().setGridLineStyle).toBe("function");
      expect(typeof useChartPreferences.getState().setGridColor).toBe("function");
    },
  );

  it("keeps workspace appearances independent through the registered hydrator and restores defaults for older workspaces", async () => {
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
    const workspaceA = JSON.stringify({
      version: 0,
      state: {
        gridMode: "horizontal",
        gridLineStyle: "dashed",
        gridColor: "#123456",
        invertScale: true,
      },
    });
    const workspaceB = JSON.stringify({
      version: 0,
      state: {
        gridMode: "vertical",
        gridLineStyle: "dotted",
        gridColor: "#abcdef",
        logScale: true,
      },
    });
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(workspaceA);
    await hydrate();
    expect(useChartPreferences.getState()).toMatchObject({
      gridMode: "horizontal",
      gridLineStyle: "dashed",
      gridColor: "#123456",
      invertScale: true,
      priceScaleMode: "normal",
    });
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(workspaceB);
    await hydrate();
    expect(useChartPreferences.getState()).toMatchObject({
      gridMode: "vertical",
      gridLineStyle: "dotted",
      gridColor: "#abcdef",
      invertScale: false,
      priceScaleMode: "logarithmic",
    });
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(workspaceA);
    await hydrate();
    expect(useChartPreferences.getState()).toMatchObject({
      gridLineStyle: "dashed",
      gridColor: "#123456",
    });
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
      JSON.stringify({ version: 0, state: { showGrid: false } }),
    );
    await hydrate();
    expect(useChartPreferences.getState()).toMatchObject({
      gridMode: "none",
      gridLineStyle: "solid",
      gridColor: "#171a23",
    });
  });
});

describe("chart price scale modes", () => {
  const modes = ["normal", "logarithmic", "percentage", "indexedTo100"] as const;
  const invalidModes = [undefined, null, "", "log", "Percentage", 0, 1, 2, 3, true, {}, ["normal"]];

  it("migrates legacy scales strictly and prefers valid explicit modes", () => {
    expect(useChartPreferences.getInitialState().priceScaleMode).toBe("normal");
    expect(useChartPreferences.getInitialState()).not.toHaveProperty("logScale");
    expect(useChartPreferences.getInitialState()).not.toHaveProperty("toggleLogScale");
    expect(normalizeChartPreferences({ logScale: true }).priceScaleMode).toBe("logarithmic");
    for (const legacy of [undefined, null, false, "true", "false", 1, 0, {}, [true]])
      expect(normalizeChartPreferences({ logScale: legacy }).priceScaleMode).toBe("normal");
    for (const mode of modes) {
      for (const legacy of [true, false]) {
        const restored = normalizeChartPreferences({ priceScaleMode: mode, logScale: legacy });
        expect(restored.priceScaleMode).toBe(mode);
        expect(restored).not.toHaveProperty("logScale");
      }
    }
    for (const invalid of invalidModes) {
      expect(normalizeChartPreferences({ priceScaleMode: invalid }).priceScaleMode).toBe("normal");
      expect(
        normalizeChartPreferences({ priceScaleMode: invalid, logScale: true }).priceScaleMode,
      ).toBe("logarithmic");
    }
  });

  it.each(modes)(
    "persists %s independently from grid, inversion and indicator preferences",
    async (mode) => {
      const configured = configure();
      configured.setGridMode("horizontal");
      configured.setGridLineStyle("dashed");
      configured.setGridColor("#abcdef");
      configured.toggleInvertScale();
      configured.setCrosshairMode("ohlc");
      configured.setPriceScaleMode(mode === "normal" ? "percentage" : "normal");
      const before = normalizeChartPreferences(useChartPreferences.getState());
      configured.setPriceScaleMode(mode);
      const expected = { ...before, priceScaleMode: mode };
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      expect(JSON.parse(serialized).state.priceScaleMode).toBe(mode);
      expect(JSON.parse(serialized).state).not.toHaveProperty("logScale");
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      expect(typeof useChartPreferences.getState().setPriceScaleMode).toBe("function");
    },
  );

  it("ignores invalid and unchanged runtime modes without writes or notifications", () => {
    configure().setPriceScaleMode("indexedTo100");
    const before = useChartPreferences.getState();
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    const listener = vi.fn();
    const unsubscribe = useChartPreferences.subscribe(listener);
    try {
      for (const invalid of invalidModes) before.setPriceScaleMode(invalid as ChartPriceScaleMode);
      before.setPriceScaleMode("indexedTo100");
      expect(useChartPreferences.getState()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
      expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
      before.setPriceScaleMode("percentage");
      expect(useChartPreferences.getState().priceScaleMode).toBe("percentage");
      expect(listener).toHaveBeenCalledTimes(1);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it("rehydrates old logarithmic workspaces and writes only the current scale schema", async () => {
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
      JSON.stringify({
        version: 0,
        state: { logScale: true, invertScale: true, gridColor: "#123456" },
      }),
    );
    await useChartPreferences.persist.rehydrate();
    expect(useChartPreferences.getState()).toMatchObject({
      priceScaleMode: "logarithmic",
      invertScale: true,
      gridColor: "#123456",
    });
    expect(useChartPreferences.getState()).not.toHaveProperty("logScale");
    useChartPreferences.getState().setPriceScaleMode("indexedTo100");
    const saved = JSON.parse(
      vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1],
    ).state;
    expect(saved.priceScaleMode).toBe("indexedTo100");
    expect(saved).not.toHaveProperty("logScale");
  });
});

describe("crosshair appearance preferences", () => {
  const defaults = {
    crosshairColor: "#9598A1",
    crosshairLineStyle: "largeDashed",
    crosshairLineWidth: 1,
  };
  const invalidColors = [
    undefined,
    null,
    "",
    "red",
    "#fff",
    "#12345678",
    "123456",
    "#gggggg",
    " #123456",
    123456,
    {},
    ["#abcdef"],
  ];
  const invalidStyles = [
    undefined,
    null,
    "",
    "Dashed",
    "large-dashed",
    "sparseDotted",
    0,
    1,
    true,
    {},
    ["solid"],
  ];
  const invalidWidths = [undefined, null, 0, -1, 4, 1.5, NaN, Infinity, "2", true, {}, [1]];

  it("defaults missing or malformed fields independently without losing older chart choices", () => {
    expect(useChartPreferences.getInitialState()).toMatchObject(defaults);
    for (const payload of [undefined, null, {}, false, []])
      expect(normalizeChartPreferences(payload)).toMatchObject(defaults);
    for (const crosshairColor of invalidColors)
      expect(
        normalizeChartPreferences({
          crosshairColor,
          crosshairLineWidth: 3,
          crosshairLineStyle: "dotted",
          crosshairMode: "hidden",
          logScale: true,
        }),
      ).toMatchObject({
        crosshairColor: defaults.crosshairColor,
        crosshairLineWidth: 3,
        crosshairLineStyle: "dotted",
        crosshairMode: "hidden",
        priceScaleMode: "logarithmic",
      });
    for (const crosshairLineStyle of invalidStyles)
      expect(
        normalizeChartPreferences({
          crosshairLineStyle,
          crosshairColor: "#ABCDEF",
          crosshairLineWidth: 2,
        }),
      ).toMatchObject({
        crosshairLineStyle: defaults.crosshairLineStyle,
        crosshairColor: "#ABCDEF",
        crosshairLineWidth: 2,
      });
    for (const crosshairLineWidth of invalidWidths)
      expect(
        normalizeChartPreferences({
          crosshairLineWidth,
          crosshairColor: "#123456",
          crosshairLineStyle: "solid",
        }),
      ).toMatchObject({
        crosshairLineWidth: defaults.crosshairLineWidth,
        crosshairColor: "#123456",
        crosshairLineStyle: "solid",
      });
  });

  it("ignores invalid and unchanged updates without notifications or storage writes", () => {
    const state = configure();
    const listener = vi.fn();
    const unsubscribe = useChartPreferences.subscribe(listener);
    try {
      for (const value of invalidColors) state.setCrosshairColor(value as string);
      for (const value of invalidStyles)
        state.setCrosshairLineStyle(value as ChartCrosshairLineStyle);
      for (const value of invalidWidths)
        state.setCrosshairLineWidth(value as ChartCrosshairLineWidth);
      state.setCrosshairColor(state.crosshairColor);
      state.setCrosshairLineStyle(state.crosshairLineStyle);
      state.setCrosshairLineWidth(state.crosshairLineWidth);
      expect(useChartPreferences.getState()).toBe(state);
      expect(listener).not.toHaveBeenCalled();
      expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
      state.setCrosshairColor("#ABCDEF");
      state.setCrosshairLineStyle("solid");
      state.setCrosshairLineWidth(3);
      expect(listener).toHaveBeenCalledTimes(3);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(3);
    } finally {
      unsubscribe();
    }
  });

  it.each([
    { style: "solid", width: 1, mode: "magnet" },
    { style: "dotted", width: 2, mode: "ohlc" },
    { style: "dashed", width: 3, mode: "hidden" },
    { style: "largeDashed", width: 2, mode: "normal" },
  ] as const)(
    "persists $style width $width independently of mode $mode and other chart choices",
    async ({ style, width, mode }) => {
      const state = configure();
      state.setGridColor("#123456");
      state.setGridLineStyle("dotted");
      state.setGridMode("vertical");
      state.setPriceScaleMode("percentage");
      state.toggleInvertScale();
      state.setCrosshairMode(mode);
      const before = normalizeChartPreferences(useChartPreferences.getState());
      state.setCrosshairColor("#ABCDEF");
      state.setCrosshairLineStyle(style);
      state.setCrosshairLineWidth(width);
      const expected = {
        ...before,
        crosshairColor: "#ABCDEF",
        crosshairLineStyle: style,
        crosshairLineWidth: width,
      };
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      expect(JSON.parse(serialized).state).toMatchObject(expected);
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      expect(typeof useChartPreferences.getState().setCrosshairColor).toBe("function");
      expect(typeof useChartPreferences.getState().setCrosshairLineStyle).toBe("function");
      expect(typeof useChartPreferences.getState().setCrosshairLineWidth).toBe("function");
    },
  );

  it("resets crosshair appearance when switching to an older workspace", async () => {
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
    const appearance = {
      crosshairColor: "#123456",
      crosshairLineStyle: "solid",
      crosshairLineWidth: 3,
      crosshairMode: "hidden",
    };
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
      JSON.stringify({ version: 0, state: appearance }),
    );
    await hydrate();
    expect(useChartPreferences.getState()).toMatchObject(appearance);
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
      JSON.stringify({ version: 0, state: { crosshairMode: "magnet", gridMode: "none" } }),
    );
    await hydrate();
    expect(useChartPreferences.getState()).toMatchObject({
      ...defaults,
      crosshairMode: "magnet",
      gridMode: "none",
    });
  });
});

describe("bar replay speed preferences", () => {
  const invalidSpeeds = [
    undefined,
    null,
    0,
    -1,
    0.25,
    1.5,
    3,
    20,
    NaN,
    Infinity,
    "2",
    true,
    {},
    [5],
  ];

  it("defaults older and malformed saved speeds to normal playback", () => {
    expect(useChartPreferences.getInitialState().replaySpeed).toBe(1);
    expect(normalizeChartPreferences({}).replaySpeed).toBe(1);
    for (const replaySpeed of invalidSpeeds)
      expect(
        normalizeChartPreferences({
          replaySpeed,
          crosshairMode: "hidden",
          logScale: true,
          gridColor: "#123456",
        }),
      ).toMatchObject({
        replaySpeed: 1,
        crosshairMode: "hidden",
        priceScaleMode: "logarithmic",
        gridColor: "#123456",
      });
  });

  it.each([0.5, 1, 2, 5, 10] as const)(
    "persists %sx playback without changing other preferences",
    async (replaySpeed) => {
      const store = configure();
      store.setGridLineStyle("dashed");
      store.setGridColor("#abcdef");
      store.setCrosshairMode("ohlc");
      store.setCrosshairLineWidth(3);
      store.setPriceScaleMode("indexedTo100");
      store.toggleInvertScale();
      store.setReplaySpeed(replaySpeed === 1 ? 5 : 1);
      const before = normalizeChartPreferences(useChartPreferences.getState());
      store.setReplaySpeed(replaySpeed);
      const expected = { ...before, replaySpeed };
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      expect(JSON.parse(serialized).state.replaySpeed).toBe(replaySpeed);
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      expect(typeof useChartPreferences.getState().setReplaySpeed).toBe("function");
    },
  );

  it("rejects invalid and repeated speed changes without writes or notifications", () => {
    configure().setReplaySpeed(5);
    const before = useChartPreferences.getState();
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    const listener = vi.fn();
    const unsubscribe = useChartPreferences.subscribe(listener);
    try {
      for (const value of invalidSpeeds) before.setReplaySpeed(value as ChartReplaySpeed);
      before.setReplaySpeed(5);
      expect(useChartPreferences.getState()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
      expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
      before.setReplaySpeed(0.5);
      expect(useChartPreferences.getState().replaySpeed).toBe(0.5);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it("keeps workspace speeds independent and resets older workspaces to normal playback", async () => {
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
    for (const [saved, expected] of [
      [{ replaySpeed: 10 }, 10],
      [{ replaySpeed: 0.5 }, 0.5],
      [{}, 1],
      [{ replaySpeed: 10 }, 10],
    ] as const) {
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
        JSON.stringify({ version: 0, state: saved }),
      );
      await hydrate();
      expect(useChartPreferences.getState().replaySpeed).toBe(expected);
    }
  });
});

describe("candle wick visibility preferences", () => {
  it("defaults legacy and malformed values to visible and accepts only saved booleans", () => {
    expect(useChartPreferences.getInitialState().showCandleWicks).toBe(true);
    expect(normalizeChartPreferences({}).showCandleWicks).toBe(true);
    for (const invalid of [undefined, null, "false", "true", 0, 1, [], {}, [false]])
      expect(
        normalizeChartPreferences({
          showCandleWicks: invalid,
          showPriceLine: false,
          style: "heikin-ashi",
        }),
      ).toMatchObject({
        showCandleWicks: true,
        showPriceLine: false,
        style: "heikin-ashi",
      });
    for (const showCandleWicks of [false, true])
      expect(normalizeChartPreferences({ showCandleWicks }).showCandleWicks).toBe(showCandleWicks);
  });

  it.each([false, true])(
    "persists visibility=%s independently from other chart settings",
    async (showCandleWicks) => {
      const store = configure();
      store.setPriceScaleMode("percentage");
      store.setGridMode("horizontal");
      store.setCrosshairLineWidth(3);
      store.togglePriceLine();
      store.togglePriceLabel();
      if (showCandleWicks) store.toggleCandleWicks();
      const before = normalizeChartPreferences(useChartPreferences.getState());
      vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
      const listener = vi.fn();
      const unsubscribe = useChartPreferences.subscribe(listener);
      try {
        store.toggleCandleWicks();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
      } finally {
        unsubscribe();
      }
      const expected = { ...before, showCandleWicks };
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      expect(JSON.parse(serialized).state.showCandleWicks).toBe(showCandleWicks);
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      expect(typeof useChartPreferences.getState().toggleCandleWicks).toBe("function");
    },
  );

  it("retains the wick choice when switching among candle and non-candle styles", () => {
    const store = configure();
    store.toggleCandleWicks();
    const before = normalizeChartPreferences(useChartPreferences.getState());
    for (const style of ["heikin-ashi", "hollow", "line", "candles"] as const) {
      store.setStyle(style);
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
        ...before,
        style,
      });
    }
    store.toggleCandleWicks();
    expect(useChartPreferences.getState().showCandleWicks).toBe(true);
  });

  it("restores workspace wick preferences and resets older workspaces to visible", async () => {
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
    for (const [saved, expected] of [
      [{ showCandleWicks: false }, false],
      [{}, true],
      [{ showCandleWicks: false }, false],
      [{ showCandleWicks: true }, true],
    ] as const) {
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
        JSON.stringify({ version: 0, state: saved }),
      );
      await hydrate();
      expect(useChartPreferences.getState().showCandleWicks).toBe(expected);
    }
  });
});

describe("bar chart appearance preferences", () => {
  it("defaults legacy and malformed appearance settings to native defaults independently", () => {
    expect(useChartPreferences.getInitialState()).toMatchObject({
      thinBars: true,
      showBarOpen: true,
    });
    expect(normalizeChartPreferences({})).toMatchObject({ thinBars: true, showBarOpen: true });
    for (const invalid of [undefined, null, "false", "true", 0, 1, [], {}, [false]]) {
      expect(
        normalizeChartPreferences({
          thinBars: invalid,
          showBarOpen: false,
          showCandleWicks: false,
        }),
      ).toMatchObject({ thinBars: true, showBarOpen: false, showCandleWicks: false });
      expect(
        normalizeChartPreferences({ showBarOpen: invalid, thinBars: false, showPriceLine: false }),
      ).toMatchObject({ thinBars: false, showBarOpen: true, showPriceLine: false });
    }
  });

  it.each([
    { thinBars: false, showBarOpen: false },
    { thinBars: false, showBarOpen: true },
    { thinBars: true, showBarOpen: false },
    { thinBars: true, showBarOpen: true },
  ])(
    "persists thin=$thinBars/open=$showBarOpen without changing other choices",
    async ({ thinBars, showBarOpen }) => {
      const store = configure();
      store.setStyle("bars");
      store.toggleCandleWicks();
      store.setGridMode("vertical");
      store.setPriceScaleMode("percentage");
      store.setReplaySpeed(5);
      if (thinBars) store.toggleThinBars();
      if (showBarOpen) store.toggleBarOpen();
      const before = normalizeChartPreferences(useChartPreferences.getState());
      vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
      const listener = vi.fn();
      const unsubscribe = useChartPreferences.subscribe(listener);
      try {
        store.toggleThinBars();
        expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
          ...before,
          thinBars,
        });
        store.toggleBarOpen();
        expect(listener).toHaveBeenCalledTimes(2);
        expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(2);
      } finally {
        unsubscribe();
      }
      const expected = { ...before, thinBars, showBarOpen };
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      expect(JSON.parse(serialized).state).toMatchObject({ thinBars, showBarOpen });
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      expect(typeof useChartPreferences.getState().toggleThinBars).toBe("function");
      expect(typeof useChartPreferences.getState().toggleBarOpen).toBe("function");
    },
  );

  it("keeps bar appearance when switching to other styles and back", () => {
    const store = configure();
    store.toggleThinBars();
    store.toggleBarOpen();
    const before = normalizeChartPreferences(useChartPreferences.getState());
    for (const style of ["bars", "candles", "hollow", "heikin-ashi", "line", "bars"] as const) {
      store.setStyle(style);
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
        ...before,
        style,
      });
    }
    store.toggleBarOpen();
    expect(useChartPreferences.getState()).toMatchObject({ thinBars: false, showBarOpen: true });
    store.toggleThinBars();
    expect(useChartPreferences.getState()).toMatchObject({ thinBars: true, showBarOpen: true });
  });

  it("restores each workspace's bar appearance and resets omitted settings independently", async () => {
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
    for (const [saved, expected] of [
      [
        { thinBars: false, showBarOpen: false },
        { thinBars: false, showBarOpen: false },
      ],
      [{ showBarOpen: false }, { thinBars: true, showBarOpen: false }],
      [{ thinBars: false }, { thinBars: false, showBarOpen: true }],
      [{}, { thinBars: true, showBarOpen: true }],
      [
        { thinBars: false, showBarOpen: false },
        { thinBars: false, showBarOpen: false },
      ],
    ] as const) {
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
        JSON.stringify({ version: 0, state: saved }),
      );
      await hydrate();
      expect(useChartPreferences.getState()).toMatchObject(expected);
    }
  });
});

describe("candle border visibility preferences", () => {
  it("defaults legacy and malformed values to visible without changing wick or bar choices", () => {
    expect(useChartPreferences.getInitialState().showCandleBorders).toBe(true);
    expect(normalizeChartPreferences({}).showCandleBorders).toBe(true);
    for (const showCandleBorders of [undefined, null, "false", "true", 0, 1, {}, [], [false]])
      expect(
        normalizeChartPreferences({
          showCandleBorders,
          showCandleWicks: false,
          thinBars: false,
          showBarOpen: false,
        }),
      ).toMatchObject({
        showCandleBorders: true,
        showCandleWicks: false,
        thinBars: false,
        showBarOpen: false,
      });
    for (const showCandleBorders of [false, true])
      expect(normalizeChartPreferences({ showCandleBorders }).showCandleBorders).toBe(
        showCandleBorders,
      );
  });

  it.each([false, true])(
    "persists border visibility=%s independently through style changes and reload",
    async (showCandleBorders) => {
      const store = configure();
      store.toggleCandleWicks();
      store.toggleThinBars();
      store.toggleBarOpen();
      store.setPriceScaleMode("logarithmic");
      store.setGridColor("#abcdef");
      if (showCandleBorders) store.toggleCandleBorders();
      const before = normalizeChartPreferences(useChartPreferences.getState());
      vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
      store.toggleCandleBorders();
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
      const expected = { ...before, showCandleBorders };
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      for (const style of ["hollow", "heikin-ashi", "bars", "candles"] as const) {
        store.setStyle(style);
        expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
          ...expected,
          style,
        });
      }
      const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      expect(JSON.parse(serialized).state.showCandleBorders).toBe(showCandleBorders);
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
        ...expected,
        style: "candles",
      });
      expect(typeof useChartPreferences.getState().toggleCandleBorders).toBe("function");
    },
  );

  it("restores workspace border choices and resets older workspaces without inheriting the prior choice", async () => {
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
    const hidden = {
      showCandleBorders: false,
      showCandleWicks: true,
      thinBars: false,
      showBarOpen: true,
    };
    const legacy = { showCandleWicks: false, thinBars: true, showBarOpen: false };
    for (const [saved, expected] of [
      [hidden, hidden],
      [legacy, { ...legacy, showCandleBorders: true }],
      [hidden, hidden],
    ] as const) {
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
        JSON.stringify({ version: 0, state: saved }),
      );
      await hydrate();
      expect(useChartPreferences.getState()).toMatchObject(expected);
    }
  });
});

describe("line and area appearance preferences", () => {
  const defaults = { lineChartColor: "#6097ee", lineChartWidth: 2 };
  const invalidColors = [
    undefined,
    null,
    "",
    "red",
    "#abc",
    "#abcdef00",
    "abcdef",
    "#gggggg",
    " #abcdef",
    123456,
    {},
    ["#abcdef"],
  ];
  const invalidWidths = [undefined, null, 0, -1, 5, 1.5, NaN, Infinity, "2", true, {}, [3]];

  it("defaults legacy and malformed fields independently and preserves unrelated display settings", () => {
    expect(useChartPreferences.getInitialState()).toMatchObject(defaults);
    expect(normalizeChartPreferences({})).toMatchObject(defaults);
    for (const lineChartColor of invalidColors)
      expect(
        normalizeChartPreferences({
          lineChartColor,
          lineChartWidth: 4,
          gridColor: "#123456",
          showCandleWicks: false,
        }),
      ).toMatchObject({
        lineChartColor: defaults.lineChartColor,
        lineChartWidth: 4,
        gridColor: "#123456",
        showCandleWicks: false,
      });
    for (const lineChartWidth of invalidWidths)
      expect(
        normalizeChartPreferences({
          lineChartWidth,
          lineChartColor: "#ABCDEF",
          showCandleBorders: false,
        }),
      ).toMatchObject({ lineChartWidth: 2, lineChartColor: "#ABCDEF", showCandleBorders: false });
  });

  it("ignores invalid and identical appearance edits without writes or notifications", () => {
    const store = configure();
    store.setLineChartColor("#123456");
    store.setLineChartWidth(4);
    const before = useChartPreferences.getState();
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    const listener = vi.fn();
    const unsubscribe = useChartPreferences.subscribe(listener);
    try {
      for (const value of invalidColors) store.setLineChartColor(value as string);
      for (const value of invalidWidths) store.setLineChartWidth(value as ChartLineWidth);
      store.setLineChartColor("#123456");
      store.setLineChartWidth(4);
      expect(useChartPreferences.getState()).toBe(before);
      expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
      store.setLineChartColor("#ABCDEF");
      store.setLineChartWidth(1);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(2);
      expect(useChartPreferences.getState()).toMatchObject({
        lineChartColor: "#ABCDEF",
        lineChartWidth: 1,
      });
    } finally {
      unsubscribe();
    }
  });

  it.each([1, 2, 3, 4] as const)(
    "shares width%s and color across Line/Area styles and saves them independently",
    async (lineChartWidth) => {
      const store = configure();
      store.setGridColor("#654321");
      store.setGridLineStyle("dotted");
      store.toggleCandleBorders();
      store.toggleCandleWicks();
      store.toggleThinBars();
      const before = normalizeChartPreferences(useChartPreferences.getState());
      store.setLineChartColor("#ABCDEF");
      store.setLineChartWidth(lineChartWidth);
      const expected = { ...before, lineChartColor: "#ABCDEF", lineChartWidth };
      for (const style of ["line", "area", "candles", "line", "area"] as const) {
        store.setStyle(style);
        expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
          ...expected,
          style,
        });
      }
      const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      expect(JSON.parse(serialized).state).toMatchObject({
        lineChartColor: "#ABCDEF",
        lineChartWidth,
      });
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
        ...expected,
        style: "area",
      });
      expect(typeof useChartPreferences.getState().setLineChartColor).toBe("function");
      expect(typeof useChartPreferences.getState().setLineChartWidth).toBe("function");
    },
  );

  it("restores per-workspace line appearance and resets missing fields for older workspaces", async () => {
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
    const first = { lineChartColor: "#123456", lineChartWidth: 4, showCandleWicks: false };
    const second = { lineChartColor: "#abcdef", lineChartWidth: 1 };
    for (const [saved, expected] of [
      [first, first],
      [second, { ...second, showCandleWicks: true }],
      [{ lineChartWidth: 3 }, { ...defaults, lineChartWidth: 3 }],
      [{}, defaults],
      [first, first],
    ] as const) {
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
        JSON.stringify({ version: 0, state: saved }),
      );
      await hydrate();
      expect(useChartPreferences.getState()).toMatchObject(expected);
    }
  });
});

describe("line and area price source preferences", () => {
  const invalidSources = [
    undefined,
    null,
    "",
    "Close",
    "HL2",
    "volume",
    "hlcc4",
    0,
    1,
    true,
    {},
    ["open"],
  ];

  it("defaults legacy or malformed sources to Close while preserving custom appearance", () => {
    expect(useChartPreferences.getInitialState().lineChartSource).toBe("close");
    expect(normalizeChartPreferences({}).lineChartSource).toBe("close");
    for (const lineChartSource of invalidSources)
      expect(
        normalizeChartPreferences({
          lineChartSource,
          lineChartColor: "#abcdef",
          lineChartWidth: 4,
          showCandleWicks: false,
        }),
      ).toMatchObject({
        lineChartSource: "close",
        lineChartColor: "#abcdef",
        lineChartWidth: 4,
        showCandleWicks: false,
      });
  });

  it("rejects invalid or repeated selections without writes or notifications", () => {
    configure().setLineChartSource("hlc3");
    const before = useChartPreferences.getState();
    const listener = vi.fn();
    const unsubscribe = useChartPreferences.subscribe(listener);
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    try {
      for (const value of invalidSources) before.setLineChartSource(value as PriceSource);
      before.setLineChartSource("hlc3");
      expect(useChartPreferences.getState()).toBe(before);
      expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
      before.setLineChartSource("ohlc4");
      expect(useChartPreferences.getState().lineChartSource).toBe("ohlc4");
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it.each(PRICE_SOURCES)(
    "persists %s across chart style changes and reload without altering line appearance",
    async (lineChartSource) => {
      const store = configure();
      store.setLineChartColor("#123456");
      store.setLineChartWidth(3);
      store.setGridMode("none");
      store.toggleCandleWicks();
      store.setLineChartSource(lineChartSource === "close" ? "open" : "close");
      const before = normalizeChartPreferences(useChartPreferences.getState());
      store.setLineChartSource(lineChartSource);
      const expected = { ...before, lineChartSource };
      for (const style of ["line", "area", "candles", "line"] as const) {
        store.setStyle(style);
        expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
          ...expected,
          style,
        });
      }
      const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      expect(JSON.parse(serialized).state.lineChartSource).toBe(lineChartSource);
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
        ...expected,
        style: "line",
      });
      expect(typeof useChartPreferences.getState().setLineChartSource).toBe("function");
    },
  );

  it("keeps source choices workspace-specific and defaults older workspaces to Close", async () => {
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
    const first = { lineChartSource: "high", lineChartColor: "#abcdef", lineChartWidth: 4 };
    const old = { lineChartColor: "#123456", lineChartWidth: 1 };
    for (const [saved, expected] of [
      [first, first],
      [
        { lineChartSource: "low" },
        { lineChartSource: "low", lineChartColor: "#6097ee", lineChartWidth: 2 },
      ],
      [old, { ...old, lineChartSource: "close" }],
      [first, first],
    ] as const) {
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
        JSON.stringify({ version: 0, state: saved }),
      );
      await hydrate();
      expect(useChartPreferences.getState()).toMatchObject(expected);
    }
  });
});

describe("line and area chart shape", () => {
  const invalidShapes: unknown[] = [
    undefined,
    null,
    "",
    "Straight",
    "step",
    "curved",
    0,
    1,
    true,
    {},
    ["stepped"],
  ];

  it("defaults missing or malformed shapes without changing saved appearance", () => {
    expect(useChartPreferences.getInitialState().lineChartShape).toBe("straight");
    for (const lineChartShape of invalidShapes)
      expect(
        normalizeChartPreferences({
          lineChartShape,
          lineChartSource: "hl2",
          lineChartColor: "#123456",
          lineChartWidth: 4,
        }),
      ).toMatchObject({
        lineChartShape: "straight",
        lineChartSource: "hl2",
        lineChartColor: "#123456",
        lineChartWidth: 4,
      });
  });

  it("rejects invalid and unchanged shapes without writes or notifications", () => {
    const store = configure();
    store.setLineChartShape("stepped");
    const before = useChartPreferences.getState();
    const listener = vi.fn();
    const unsubscribe = useChartPreferences.subscribe(listener);
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    try {
      for (const shape of invalidShapes) store.setLineChartShape(shape as ChartLineShape);
      store.setLineChartShape("stepped");
      expect(useChartPreferences.getState()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
      expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
      store.setLineChartShape("straight");
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
        ...normalizeChartPreferences(before),
        lineChartShape: "straight",
      });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it.each(["straight", "stepped"] as const)(
    "persists %s across chart styles and reload",
    async (lineChartShape) => {
      const store = configure();
      store.setLineChartSource("ohlc4");
      store.setLineChartColor("#abcdef");
      store.setLineChartWidth(3);
      store.setLineChartShape(lineChartShape === "straight" ? "stepped" : "straight");
      const before = normalizeChartPreferences(useChartPreferences.getState());
      store.setLineChartShape(lineChartShape);
      for (const style of ["line", "area", "candles", "area"] as const) {
        store.setStyle(style);
        expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
          ...before,
          style,
          lineChartShape,
        });
      }
      const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      expect(JSON.parse(serialized).state.lineChartShape).toBe(lineChartShape);
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
        ...before,
        style: "area",
        lineChartShape,
      });
      expect(typeof useChartPreferences.getState().setLineChartShape).toBe("function");
    },
  );

  it("does not leak stepped shape into legacy or malformed workspaces", async () => {
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
    for (const [saved, expected] of [
      [{ lineChartShape: "stepped", lineChartSource: "high" }, "stepped"],
      [{ lineChartColor: "#abcdef" }, "straight"],
      [{ lineChartShape: "stepped" }, "stepped"],
      [{ lineChartShape: "curve" }, "straight"],
    ] as const) {
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
        JSON.stringify({ version: 0, state: saved }),
      );
      await hydrate();
      expect(useChartPreferences.getState().lineChartShape).toBe(expected);
    }
  });
});

describe("line and area point markers", () => {
  const invalidRadii: unknown[] = [
    undefined,
    null,
    "3",
    "",
    0,
    1,
    7,
    3.5,
    NaN,
    Infinity,
    true,
    {},
    [3],
  ];
  it("defaults legacy or malformed marker fields without disturbing line appearance", () => {
    expect(useChartPreferences.getInitialState()).toMatchObject({
      showLineMarkers: false,
      lineMarkerRadius: 3,
    });
    for (const value of [undefined, null, "true", 1, {}, [], false])
      expect(normalizeChartPreferences({ showLineMarkers: value }).showLineMarkers).toBe(false);
    expect(normalizeChartPreferences({ showLineMarkers: true }).showLineMarkers).toBe(true);
    for (const lineMarkerRadius of invalidRadii)
      expect(
        normalizeChartPreferences({
          lineMarkerRadius,
          showLineMarkers: true,
          lineChartShape: "stepped",
          lineChartColor: "#abcdef",
        }),
      ).toMatchObject({
        lineMarkerRadius: 3,
        showLineMarkers: true,
        lineChartShape: "stepped",
        lineChartColor: "#abcdef",
      });
  });
  it("rejects invalid and repeated radii without writes or notifications", () => {
    const store = configure();
    store.setLineMarkerRadius(5);
    const before = useChartPreferences.getState();
    const listener = vi.fn();
    const unsubscribe = useChartPreferences.subscribe(listener);
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    try {
      for (const radius of invalidRadii) store.setLineMarkerRadius(radius as ChartLineMarkerRadius);
      store.setLineMarkerRadius(5);
      expect(useChartPreferences.getState()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
      expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
      store.setLineMarkerRadius(6);
      expect(useChartPreferences.getState()).toMatchObject({
        lineMarkerRadius: 6,
        showLineMarkers: false,
      });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });
  it.each([2, 3, 4, 5, 6] as const)(
    "persists radius %s and marker visibility through style switches, toggles and reload",
    async (lineMarkerRadius) => {
      const store = configure();
      store.setLineChartSource("ohlc4");
      store.setLineChartShape("stepped");
      store.setLineChartColor("#123456");
      store.setLineChartWidth(4);
      const before = normalizeChartPreferences(useChartPreferences.getState());
      store.setLineMarkerRadius(lineMarkerRadius);
      store.toggleLineMarkers();
      for (const style of ["line", "area", "candles", "area"] as const) {
        store.setStyle(style);
        expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
          ...before,
          style,
          lineMarkerRadius,
          showLineMarkers: true,
        });
      }
      store.toggleLineMarkers();
      expect(useChartPreferences.getState()).toMatchObject({
        showLineMarkers: false,
        lineMarkerRadius,
      });
      store.toggleLineMarkers();
      const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      expect(JSON.parse(serialized).state).toMatchObject({
        showLineMarkers: true,
        lineMarkerRadius,
      });
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual({
        ...before,
        style: "area",
        lineMarkerRadius,
        showLineMarkers: true,
      });
    },
  );
  it("isolates marker preferences between modern, legacy and malformed workspaces", async () => {
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
    const custom = { showLineMarkers: true, lineMarkerRadius: 6 };
    for (const [saved, expected] of [
      [custom, custom],
      [{ lineChartColor: "#abcdef" }, { showLineMarkers: false, lineMarkerRadius: 3 }],
      [
        { showLineMarkers: true, lineMarkerRadius: 2 },
        { showLineMarkers: true, lineMarkerRadius: 2 },
      ],
      [
        { showLineMarkers: "true", lineMarkerRadius: "5" },
        { showLineMarkers: false, lineMarkerRadius: 3 },
      ],
      [custom, custom],
    ]) {
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
        JSON.stringify({ version: 0, state: saved }),
      );
      await hydrate();
      expect(useChartPreferences.getState()).toMatchObject(expected!);
    }
  });
});

it("persists independent RSI background appearance without changing indicator inputs", async () => {
  const store = useChartPreferences.getState();
  const first = store.addIndicator("rsi")!;
  store.setIndicatorInstanceAppearance(first, {
    plots: { background: { color: "#123456", opacity: 0.3, visible: true } },
  });
  const second = store.duplicateIndicatorInstance(first)!;
  store.setIndicatorInstanceAppearance(second, {
    plots: { background: { color: "#abcdef", opacity: 0.5, visible: false } },
  });
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const instances = getChartIndicatorInstances(useChartPreferences.getState()).filter(
    (i) => i.key === "rsi",
  );
  expect(instances.map((i) => i.appearance.plots?.background)).toEqual([
    { color: "#123456", opacity: 0.3, visible: true },
    { color: "#abcdef", opacity: 0.5, visible: false },
  ]);
  expect(instances[0]!.inputs).toEqual(instances[1]!.inputs);
});

describe("chart display time zone preferences", () => {
  const invalidZones = [
    undefined,
    null,
    "",
    "utc",
    "EST",
    "America/Toronto",
    "America/New_York ",
    "Not/A_Zone",
    0,
    true,
    {},
    ["UTC"],
  ];

  it("defaults legacy and unsupported saved zones to UTC without changing session settings", () => {
    expect(useChartPreferences.getInitialState().timeZone).toBe("UTC");
    expect(normalizeChartPreferences({}).timeZone).toBe("UTC");
    const session = { ...DEFAULT_INITIAL_BALANCE, timeZone: "America/Chicago", startTime: "08:30" };
    for (const timeZone of invalidZones)
      expect(
        normalizeChartPreferences({
          timeZone,
          initialBalance: session,
          lineChartColor: "#abcdef",
          priceScaleMode: "percentage",
        }),
      ).toMatchObject({
        timeZone: "UTC",
        initialBalance: session,
        lineChartColor: "#abcdef",
        priceScaleMode: "percentage",
      });
  });

  it("rejects unsupported and unchanged selections without writes or notifications", () => {
    configure().setTimeZone("Asia/Tokyo");
    const before = useChartPreferences.getState();
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    const listener = vi.fn();
    const unsubscribe = useChartPreferences.subscribe(listener);
    try {
      for (const value of invalidZones) before.setTimeZone(value as string);
      before.setTimeZone("Asia/Tokyo");
      expect(useChartPreferences.getState()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
      expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
      before.setTimeZone("Europe/London");
      expect(useChartPreferences.getState().timeZone).toBe("Europe/London");
      expect(listener).toHaveBeenCalledTimes(1);
      expect(tradingWorkspaceStorage.setItem).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it.each(CHART_TIME_ZONES)(
    "persists $value independently of session and chart appearance",
    async ({ value: timeZone }) => {
      const store = configure();
      store.setLineChartColor("#123456");
      store.setLineChartWidth(4);
      store.setGridMode("none");
      store.toggleCandleWicks();
      store.setTimeZone(timeZone === "UTC" ? "America/New_York" : "UTC");
      const before = normalizeChartPreferences(useChartPreferences.getState());
      store.setTimeZone(timeZone);
      const expected = { ...before, timeZone };
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      const serialized = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
      expect(JSON.parse(serialized).state.timeZone).toBe(timeZone);
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(serialized);
      useChartPreferences.setState(useChartPreferences.getInitialState(), true);
      await useChartPreferences.persist.rehydrate();
      expect(normalizeChartPreferences(useChartPreferences.getState())).toEqual(expected);
      expect(typeof useChartPreferences.getState().setTimeZone).toBe("function");
    },
  );

  it("keeps display zones workspace-specific and defaults older workspaces to UTC", async () => {
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
    for (const [saved, expected] of [
      [{ timeZone: "America/Los_Angeles" }, "America/Los_Angeles"],
      [{ timeZone: "Australia/Sydney" }, "Australia/Sydney"],
      [{}, "UTC"],
      [{ timeZone: "America/Los_Angeles" }, "America/Los_Angeles"],
    ] as const) {
      vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(
        JSON.stringify({ version: 0, state: saved }),
      );
      await hydrate();
      expect(useChartPreferences.getState().timeZone).toBe(expected);
    }
  });
});

it("persists independent RSI Bollinger smoothing inputs and band styles", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("rsi")!;
  store.setIndicatorInstanceInputs(base, {
    smoothingType: 5,
    smoothingPeriod: 9,
    smoothingDeviations: 1.5,
  });
  store.setIndicatorInstanceAppearance(base, {
    plots: {
      smoothingUpper: { color: "#f59e0b" },
      smoothingBackground: { opacity: 0.25, visible: false },
    },
  });
  const duplicate = store.duplicateIndicatorInstance(base)!;
  store.setIndicatorInstanceInputs(duplicate, { smoothingDeviations: 3 });
  store.setIndicatorInstanceAppearance(duplicate, {
    plots: { smoothingBackground: { visible: true } },
  });
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const instances = () =>
    getChartIndicatorInstances(useChartPreferences.getState()).filter((i) => i.key === "rsi");
  expect(
    instances().map((i) => [
      i.inputs.smoothingType,
      i.inputs.smoothingPeriod,
      i.inputs.smoothingDeviations,
      i.appearance.plots?.smoothingBackground?.visible,
    ]),
  ).toEqual([
    [5, 9, 1.5, false],
    [5, 9, 3, true],
  ]);
  expect(instances()[0]!.appearance.plots?.smoothingUpper?.color).toBe("#f59e0b");
  expect(instances()[1]!.appearance.plots?.smoothingBackground?.opacity).toBe(0.25);
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(
    instances().map((i) => [
      i.inputs.smoothingType,
      i.inputs.smoothingPeriod,
      i.inputs.smoothingDeviations,
    ]),
  ).toEqual([
    [5, 9, 1.5],
    [0, 14, 2],
  ]);
});

it("persists RSI volume-weighted smoothing independently and resets it to None", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("rsi")!;
  store.setIndicatorInstanceInputs(base, { smoothingType: 6, smoothingPeriod: 8, source: 5 });
  const duplicate = store.duplicateIndicatorInstance(base)!;
  store.setIndicatorInstanceInputs(duplicate, { smoothingType: 2, smoothingPeriod: 3 });
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const values = () =>
    getChartIndicatorInstances(useChartPreferences.getState())
      .filter((i) => i.key === "rsi")
      .map((i) => [i.inputs.smoothingType, i.inputs.smoothingPeriod, i.inputs.source]);
  expect(values()).toEqual([
    [6, 8, 5],
    [2, 3, 5],
  ]);
  useChartPreferences.getState().resetIndicatorInstanceInputs(base);
  expect(values()).toEqual([
    [0, 14, 0],
    [2, 3, 5],
  ]);
});

it.each(["stochastic", "stochRsi"] as const)(
  "keeps %s background edits independent across duplicated and reloaded instances",
  async (key) => {
    const store = useChartPreferences.getState();
    const first = store.addIndicator(key)!;
    store.setIndicatorInstanceInputs(first, { lowerLevel: 15, upperLevel: 85, showLevels: 0 });
    store.setIndicatorInstanceAppearance(first, {
      plots: {
        main: { visible: false },
        signal: { visible: false },
        background: { color: "#123456", opacity: 0.3, visible: true },
      },
    });
    const second = store.duplicateIndicatorInstance(first)!;
    store.setIndicatorInstanceAppearance(second, {
      plots: { background: { color: "#abcdef", opacity: 0, visible: false } },
    });
    const instances = () =>
      getChartIndicatorInstances(useChartPreferences.getState()).filter((item) => item.key === key);
    expect(instances()[0]!.appearance.plots?.background).toEqual({
      color: "#123456",
      opacity: 0.3,
      visible: true,
    });
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    useChartPreferences.setState(useChartPreferences.getInitialState(), true);
    await useChartPreferences.persist.rehydrate();
    expect(instances().map((item) => item.appearance.plots?.background)).toEqual([
      { color: "#123456", opacity: 0.3, visible: true },
      { color: "#abcdef", opacity: 0, visible: false },
    ]);
    expect(instances().every((item) => item.inputs.showLevels === 0)).toBe(true);
    expect(
      instances().every(
        (item) =>
          item.appearance.plots?.main?.visible === false &&
          item.appearance.plots?.signal?.visible === false,
      ),
    ).toBe(true);
    const firstBefore = structuredClone(instances()[0]!);
    useChartPreferences.getState().resetIndicatorInstanceAppearance(second);
    expect(instances()[0]).toEqual(firstBefore);
    expect(instances()[1]!.appearance).toEqual({});
    expect(instances()[1]!.inputs).toEqual(firstBefore.inputs);
  },
);

it("preserves independent OBV smoothing modes and band appearance through duplicate, reload and reset", async () => {
  const store = useChartPreferences.getState();
  const first = store.addIndicator("obv")!;
  store.setIndicatorInstanceInputs(first, {
    smoothingType: 5,
    smoothingPeriod: 3,
    smoothingDeviations: 1.5,
  });
  store.setIndicatorInstanceAppearance(first, {
    plots: {
      smoothing: { color: "#abcdef", visible: false },
      smoothingBackground: { color: "#123456", opacity: 0.3, visible: true },
    },
  });
  const second = store.duplicateIndicatorInstance(first)!;
  store.setIndicatorInstanceInputs(second, { smoothingType: 6, smoothingPeriod: 2 });
  store.setIndicatorInstanceAppearance(second, {
    plots: { smoothingBackground: { visible: false } },
  });
  const instances = () =>
    getChartIndicatorInstances(useChartPreferences.getState()).filter((item) => item.key === "obv");
  const before = structuredClone(instances());
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  expect(instances()).toEqual(before);
  expect(instances().map((item) => item.inputs.smoothingType)).toEqual([5, 6]);
  expect(instances().map((item) => item.appearance.plots?.smoothingBackground?.visible)).toEqual([
    true,
    false,
  ]);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  expect(
    useChartPreferences.getState().setIndicatorInstanceInputs(second, { smoothingType: 7 }),
  ).toBe(false);
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  useChartPreferences.getState().resetIndicatorInstanceInputs(second);
  expect(instances()[0]).toEqual(before[0]);
  expect(instances()[1]!.inputs).toEqual({
    smoothingType: 0,
    smoothingPeriod: 14,
    smoothingDeviations: 2,
  });
  expect(instances()[1]!.appearance).toEqual(before[1]!.appearance);
  useChartPreferences.getState().resetIndicatorInstanceAppearance(second);
  expect(instances()[1]!.appearance).toEqual({});
  expect(instances()[0]).toEqual(before[0]);
});
