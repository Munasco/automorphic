import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    registerHydrator: vi.fn(),
  },
}));

import { useChartPreferences, normalizeChartPreferences } from "./chartPreferences";
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

it("persists independent RSI sources and resets only the selected instance", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("rsi")!;
  const duplicate = store.addIndicator("rsi")!;
  store.setIndicatorInstanceInputs(base, { period: 7, source: 1 });
  store.setIndicatorInstanceInputs(duplicate, { period: 21, source: 5 });
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  await useChartPreferences.persist.rehydrate();
  const instances = () =>
    getChartIndicatorInstances(useChartPreferences.getState()).filter((i) => i.key === "rsi");
  expect(instances().map((i) => i.inputs)).toEqual([
    { period: 7, source: 1, lowerLevel: 30, upperLevel: 70, showLevels: 1 },
    { period: 21, source: 5, lowerLevel: 30, upperLevel: 70, showLevels: 1 },
  ]);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  useChartPreferences.getState().setIndicatorInstanceInputs(duplicate, { source: 99 });
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  expect(instances().map((i) => i.inputs)).toEqual([
    { period: 7, source: 1, lowerLevel: 30, upperLevel: 70, showLevels: 1 },
    { period: 14, source: 0, lowerLevel: 30, upperLevel: 70, showLevels: 1 },
  ]);
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
  };
  expect(store.setIndicatorInstanceInputs(base, baseInputs)).toBe(true);
  const duplicate = store.duplicateIndicatorInstance(base)!;
  const duplicateInputs = { ...baseInputs, fast: 6, source: 5, oscillatorMA: 0, signalMA: 1 };
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
    { signalMA: 2 },
    { signalMA: 0.5 },
  ])
    expect(
      useChartPreferences.getState().setIndicatorInstanceInputs(duplicate, { fast: 8, ...patch }),
    ).toBe(false);
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  expect(inputs()).toEqual([baseInputs, duplicateInputs]);
  useChartPreferences.getState().resetIndicatorInstanceInputs(duplicate);
  const defaults = { fast: 12, slow: 26, signalPeriod: 9, source: 0, oscillatorMA: 0, signalMA: 0 };
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

it("persists independent Hull moving average lengths, sources and appearance", async () => {
  const store = useChartPreferences.getState();
  const base = store.addIndicator("hma")!;
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
    (i) => i.key === "hma",
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
  ).toEqual({ period: 9, source: 0 });
});

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
