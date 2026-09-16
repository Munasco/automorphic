import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    registerHydrator: vi.fn(),
    getSnapshot: vi.fn(() => ({ ready: true })),
  },
}));
import {
  captureChartTemplateSettings,
  chartTemplateSettingsKey,
  CHART_TEMPLATES_KEY,
  MAX_CHART_TEMPLATES,
  normalizeChartTemplates,
  useChartTemplates,
} from "./chartTemplates";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import { DEFAULT_INITIAL_BALANCE } from "./initialBalanceSettings";
import { createIndicatorInstance } from "./chartIndicatorInstances";
import { useChartPreferences } from "./chartPreferences";

beforeEach(() => {
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(null);
  vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: true } as ReturnType<
    typeof tradingWorkspaceStorage.getSnapshot
  >);
  useChartTemplates.setState(useChartTemplates.getInitialState(), true);
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
});
const chart = () => ({
  style: "area",
  gridMode: "horizontal",
  gridColor: "#123456",
  priceScaleMode: "logarithmic",
  timeZone: "America/New_York",
  replaySpeed: 5,
  lockVisibleTimeRangeOnResize: true,
  showPriceScaleTicks: true,
  showSymbolWatermark: true,
  showBarChange: true,
  showIndicatorInputs: false,
  showIndicatorValues: false,
  priceLineAppearance: { color: "#ff8800", width: 3, style: "solid" },
  watermarkColor: "#ff8800",
  watermarkOpacity: 60,
  chartFontSize: 18,
  areaFill: { topColor: "#ff8800", bottomColor: null, topOpacity: 75, bottomOpacity: 20 },
  favoriteIndicators: ["rsi"],
  favoriteChartIntervals: ["minute:5"],
  indicators: { rsi: true, ib: true },
  indicatorInputs: { rsi: { period: 7 } },
  appearance: { rsi: { plots: { background: { color: "#123456", opacity: 0.3 } } } },
  extraIndicators: [
    createIndicatorInstance("rsi", "second-rsi"),
    createIndicatorInstance("ib", "second-ib"),
  ],
});

describe("chart template snapshots", () => {
  it("captures display settings and independent indicators while excluding unrelated workspace state", () => {
    const source = { ...chart(), symbol: "NQ", drawings: ["drawing"], alerts: ["alert"] };
    source.extraIndicators[0]!.inputs.period = 21;
    source.extraIndicators[1]!.initialBalance!.backgroundColor = "#654321";
    const snapshot = captureChartTemplateSettings(source);
    expect(snapshot).toMatchObject({
      style: "area",
      gridMode: "horizontal",
      priceScaleMode: "logarithmic",
      timeZone: "America/New_York",
      lockVisibleTimeRangeOnResize: true,
      showPriceScaleTicks: true,
      showSymbolWatermark: true,
      showBarChange: true,
      showIndicatorInputs: false,
      showIndicatorValues: false,
      priceLineAppearance: { color: "#ff8800", width: 3, style: "solid" },
      watermarkColor: "#ff8800",
      watermarkOpacity: 60,
      chartFontSize: 18,
      areaFill: { topColor: "#ff8800", bottomColor: null, topOpacity: 75, bottomOpacity: 20 },
      indicatorInputs: { rsi: { period: 7 } },
    });
    for (const key of [
      "favoriteIndicators",
      "favoriteChartIntervals",
      "replaySpeed",
      "symbol",
      "drawings",
      "alerts",
    ])
      expect(snapshot).not.toHaveProperty(key);
    source.extraIndicators[0]!.inputs.period = 30;
    source.extraIndicators[1]!.initialBalance!.backgroundColor = "#abcdef";
    source.appearance.rsi.plots.background.color = "#000000";
    expect(snapshot.extraIndicators[0]!.inputs.period).toBe(21);
    expect(snapshot.extraIndicators[1]!.initialBalance!.backgroundColor).toBe("#654321");
    expect(snapshot.appearance.rsi?.plots?.background?.color).toBe("#123456");
    const applied = captureChartTemplateSettings(snapshot);
    applied.extraIndicators[0]!.inputs.period = 40;
    expect(snapshot.extraIndicators[0]!.inputs.period).toBe(21);
  });
  it("excludes unknown nested workspace metadata from base and extra IB sessions", () => {
    const initialBalance = {
      ...DEFAULT_INITIAL_BALANCE,
      startTime: "10:00",
      durationMinutes: 45,
      backgroundColor: "#abcdef",
      symbol: "NQ",
      drawings: [{ id: "private-drawing" }],
      alerts: [{ id: "private-alert" }],
      metadata: { workspace: "unrelated" },
    };
    const extra = { ...createIndicatorInstance("ib", "extra-ib"), initialBalance };
    const source = { initialBalance, extraIndicators: [extra] };
    const expected = {
      ...DEFAULT_INITIAL_BALANCE,
      startTime: "10:00",
      durationMinutes: 45,
      backgroundColor: "#abcdef",
    };
    const snapshot = captureChartTemplateSettings(source);
    expect(snapshot.initialBalance).toEqual(expected);
    expect(snapshot.extraIndicators[0]!.initialBalance).toEqual(expected);
    expect(initialBalance.symbol).toBe("NQ");
    expect(initialBalance.alerts).toEqual([{ id: "private-alert" }]);
    const restored = normalizeChartTemplates([{ id: "saved", name: "Saved", settings: source }])[0]!
      .settings;
    expect(restored.initialBalance).toEqual(expected);
    expect(restored.extraIndicators[0]!.initialBalance).toEqual(expected);
    expect(snapshot.initialBalance).not.toBe(snapshot.extraIndicators[0]!.initialBalance);
  });
  it("captures and reloads indicator ordering without sharing mutable order arrays", () => {
    const source = { ...chart(), indicatorOrder: ["second-rsi", "base:rsi", "second-ib"] };
    const captured = captureChartTemplateSettings(source);
    expect(captured.indicatorOrder.slice(0, 3)).toEqual(source.indicatorOrder);
    source.indicatorOrder.reverse();
    expect(captured.indicatorOrder[0]).toBe("second-rsi");
    const restored = normalizeChartTemplates([
      { id: "ordered", name: "Ordered", settings: captured },
    ])[0]!.settings;
    expect(restored.indicatorOrder).toEqual(captured.indicatorOrder);
    expect(restored.indicatorOrder).not.toBe(captured.indicatorOrder);
  });
  it("normalizes malformed values and legacy chart scale choices", () => {
    expect(
      captureChartTemplateSettings({
        style: "invalid",
        logScale: true,
        gridColor: "red",
        extraIndicators: [{ key: "unknown" }],
      }),
    ).toMatchObject({
      style: "candles",
      priceScaleMode: "logarithmic",
      gridColor: "#171a23",
      extraIndicators: [],
    });
    expect(
      normalizeChartTemplates([
        { id: "one", name: " Saved ", settings: {} },
        { id: "two", name: "saved", settings: {} },
        { id: "one", name: "Other", settings: {} },
        { id: "bad", name: "Broken", settings: null },
      ]).map(({ id, name }) => ({ id, name })),
    ).toEqual([{ id: "one", name: "Saved" }]);
  });
  it("applies a detached template without changing favorites or replay speed", () => {
    useChartPreferences.setState({ favoriteIndicators: ["macd"], replaySpeed: 10 });
    useChartPreferences.setState(captureChartTemplateSettings(chart()));
    expect(useChartPreferences.getState()).toMatchObject({
      style: "area",
      favoriteIndicators: ["macd"],
      replaySpeed: 10,
    });
  });
});

describe("saved chart template lifecycle", () => {
  it("round-trips settings and stable IDs, then renames, updates and deletes only the chosen template", async () => {
    const store = useChartTemplates.getState();
    const first = store.saveTemplate("  My chart  ", chart());
    const second = store.saveTemplate("Other", { style: "bars" });
    const expected = structuredClone(useChartTemplates.getState().templates);
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)!;
    expect(saved[0]).toBe(CHART_TEMPLATES_KEY);
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved[1]);
    useChartTemplates.setState(useChartTemplates.getInitialState(), true);
    await useChartTemplates.persist.rehydrate();
    expect(useChartTemplates.getState().templates).toEqual(expected);
    store.renameTemplate(first, "New name");
    store.updateTemplate(first, { style: "line" });
    expect(useChartTemplates.getState().templates[0]).toMatchObject({
      id: first,
      name: "New name",
      settings: { style: "line" },
    });
    expect(useChartTemplates.getState().templates[1]).toEqual(expected[1]);
    expect(store.deleteTemplate(first)).toBe(true);
    expect(useChartTemplates.getState().templates.map((item) => item.id)).toEqual([second]);
  });
  it("rejects duplicates, invalid names and capacity overflow without writes or silent replacement", () => {
    const store = useChartTemplates.getState();
    const first = store.saveTemplate("Alpha", {});
    const second = store.saveTemplate("Beta", {});
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    expect(() => store.saveTemplate(" alpha ", {})).toThrow("already exists");
    expect(() => store.renameTemplate(second, "ALPHA")).toThrow("already exists");
    for (const name of ["", "  ", "a".repeat(81)])
      expect(() => store.saveTemplate(name, {})).toThrow();
    expect(store.renameTemplate(first, " Alpha ")).toBe(true);
    expect(store.updateTemplate(first, {})).toBe(true);
    expect(store.deleteTemplate("missing")).toBe(false);
    expect(store.renameTemplate("missing", "Name")).toBe(false);
    expect(store.updateTemplate("missing", {})).toBe(false);
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
    for (let i = 2; i < MAX_CHART_TEMPLATES; i++) store.saveTemplate(`Chart ${i}`, {});
    expect(() => store.saveTemplate("Overflow", {})).toThrow("20 per workspace");
    expect(useChartTemplates.getState().templates).toHaveLength(MAX_CHART_TEMPLATES);
  });
  it("resets during workspace hydration and rejects edits while loading", async () => {
    useChartTemplates.getState().saveTemplate("First workspace", chart());
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls.at(-1)![0];
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(null);
    await hydrate();
    expect(useChartTemplates.getState().templates).toEqual([]);
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    await hydrate();
    expect(useChartTemplates.getState().templates[0]!.name).toBe("First workspace");
    vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: false } as ReturnType<
      typeof tradingWorkspaceStorage.getSnapshot
    >);
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    expect(() => useChartTemplates.getState().saveTemplate("Too soon", {})).toThrow(
      "finish loading",
    );
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  });
});

it("matches template settings regardless of object key order, favorites or replay speed", () => {
  const a = {
    paneStretchFactors: { $price: 3, "base:rsi": 1 },
    appearance: { sma: { color: "#123456", lineWidth: 2 } },
    replaySpeed: 1,
    favoriteIndicators: ["rsi"],
  };
  const b = {
    paneStretchFactors: { "base:rsi": 1, $price: 3 },
    favoriteIndicators: ["macd"],
    replaySpeed: 4,
    appearance: { sma: { lineWidth: 2, color: "#123456" } },
  };
  expect(chartTemplateSettingsKey(a)).toBe(chartTemplateSettingsKey(b));
  expect(chartTemplateSettingsKey({})).toBe(
    chartTemplateSettingsKey(captureChartTemplateSettings({})),
  );
});
it("detects chart and indicator changes while matching restored saved settings", () => {
  const store = useChartPreferences.getState();
  store.addIndicator("rsi");
  const copy = store.duplicateIndicatorInstance("base:rsi")!;
  const saved = captureChartTemplateSettings(useChartPreferences.getState());
  const key = chartTemplateSettingsKey(saved);
  store.setIndicatorInstanceInputs(copy, { period: 7 });
  expect(chartTemplateSettingsKey(useChartPreferences.getState())).not.toBe(key);
  useChartPreferences.setState(saved);
  expect(chartTemplateSettingsKey(useChartPreferences.getState())).toBe(key);
  store.moveIndicatorInstance(copy, "up");
  expect(chartTemplateSettingsKey(useChartPreferences.getState())).not.toBe(key);
  useChartPreferences.setState(saved);
  store.setShowTimeScale(false);
  expect(chartTemplateSettingsKey(useChartPreferences.getState())).not.toBe(key);
  useChartPreferences.setState(saved);
  expect(chartTemplateSettingsKey(useChartPreferences.getState())).toBe(key);
});

it("duplicates saved settings with new IDs, detached data and persistent unique names", async () => {
  const store = useChartTemplates.getState();
  const sourceId = store.saveTemplate("NQ setup", chart());
  const source = useChartTemplates.getState().templates[0]!;
  const preferences = useChartPreferences.getState();
  const first = store.duplicateTemplate(sourceId)!;
  const second = store.duplicateTemplate(sourceId)!;
  const templates = useChartTemplates.getState().templates;
  expect(new Set(templates.map((template) => template.id)).size).toBe(3);
  expect(templates.map((template) => template.name)).toEqual([
    "NQ setup",
    "NQ setup copy",
    "NQ setup copy 2",
  ]);
  expect(templates[1]!.settings).toEqual(source.settings);
  expect(templates[1]!.settings.extraIndicators[1]!.initialBalance).not.toBe(
    source.settings.extraIndicators[1]!.initialBalance,
  );
  expect(useChartPreferences.getState()).toBe(preferences);
  store.updateTemplate(first, { style: "line" });
  expect(useChartTemplates.getState().templates[0]).toEqual(source);
  expect(useChartTemplates.getState().templates[2]!.settings).toEqual(source.settings);
  const expected = useChartTemplates.getState().templates;
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
  useChartTemplates.setState(useChartTemplates.getInitialState(), true);
  await useChartTemplates.persist.rehydrate();
  expect(useChartTemplates.getState().templates).toEqual(expected);
  store.deleteTemplate(second);
  store.duplicateTemplate(sourceId);
  expect(useChartTemplates.getState().templates.at(-1)!.name).toBe("NQ setup copy 2");
});
it("resolves case-insensitive copy collisions after truncating long names", () => {
  const store = useChartTemplates.getState();
  const source = store.saveTemplate("A".repeat(80), {});
  store.saveTemplate(`${"a".repeat(75)} COPY`, {});
  store.duplicateTemplate(source);
  expect(useChartTemplates.getState().templates.at(-1)!.name).toBe(`${"A".repeat(73)} copy 2`);
  const next = store.duplicateTemplate(source)!;
  expect(useChartTemplates.getState().templates.at(-1)!.name).toBe(`${"A".repeat(73)} copy 3`);
  store.duplicateTemplate(next);
  expect(useChartTemplates.getState().templates.at(-1)!.name.length).toBeLessThanOrEqual(80);
  const emoji = store.saveTemplate("😀".repeat(40), {});
  store.duplicateTemplate(emoji);
  expect(useChartTemplates.getState().templates.at(-1)!.name).toBe(`${"😀".repeat(37)} copy`);
});
it("rejects missing sources, loading workspaces and full storage without writes", () => {
  const store = useChartTemplates.getState();
  const source = store.saveTemplate("Source", {});
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  expect(store.duplicateTemplate("gone")).toBeNull();
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: false } as ReturnType<
    typeof tradingWorkspaceStorage.getSnapshot
  >);
  expect(() => store.duplicateTemplate(source)).toThrow("finish loading");
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: true } as ReturnType<
    typeof tradingWorkspaceStorage.getSnapshot
  >);
  for (let i = 1; i < MAX_CHART_TEMPLATES; i++) store.duplicateTemplate(source);
  const previous = useChartTemplates.getState().templates;
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  expect(() => store.duplicateTemplate(source)).toThrow("20 per workspace");
  expect(useChartTemplates.getState().templates).toBe(previous);
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
});
it("rejects copies exceeding the payload limit without changing saved templates", () => {
  const store = useChartTemplates.getState();
  const source = store.saveTemplate("Large", {
    extraIndicators: Array.from({ length: 100 }, (_, i) =>
      createIndicatorInstance("ib", `ib-${i}`),
    ),
  });
  let error: unknown;
  for (let i = 1; i < MAX_CHART_TEMPLATES; i++) {
    const previous = useChartTemplates.getState().templates;
    vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
    try {
      store.duplicateTemplate(source);
    } catch (cause) {
      error = cause;
      expect(useChartTemplates.getState().templates).toBe(previous);
      expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
      break;
    }
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("Chart templates are full");
});

it("keeps personal favorite intervals when a saved chart template is applied", () => {
  const store = useChartPreferences.getState();
  store.toggleFavoriteChartInterval("minute:60");
  const captured = captureChartTemplateSettings({ ...chart(), favoriteChartIntervals: ["day:1"] });
  expect(captured).not.toHaveProperty("favoriteChartIntervals");
  useChartPreferences.setState(captured);
  expect(useChartPreferences.getState().favoriteChartIntervals).toEqual(["minute:60"]);
});

it("keeps the personal object tree filter when capturing and applying chart templates", () => {
  const store = useChartPreferences.getState();
  store.setObjectTreeFilter("indicators");
  const captured = captureChartTemplateSettings({ ...chart(), objectTreeFilter: "drawings" });
  expect(captured).not.toHaveProperty("objectTreeFilter");
  expect(chartTemplateSettingsKey({ ...chart(), objectTreeFilter: "drawings" })).toBe(
    chartTemplateSettingsKey({ ...chart(), objectTreeFilter: "all" }),
  );
  useChartPreferences.setState(captured);
  expect(useChartPreferences.getState().objectTreeFilter).toBe("indicators");
});

it("captures previous-close bar coloring independently from its source", () => {
  const source = { colorBarsByPreviousClose: true };
  const settings = captureChartTemplateSettings(source);
  source.colorBarsByPreviousClose = false;
  expect(settings.colorBarsByPreviousClose).toBe(true);
  expect(captureChartTemplateSettings({}).colorBarsByPreviousClose).toBe(false);
});

it("captures watermark position and defaults old templates to center", () => {
  const source = { watermarkHorizontalAlignment: "right", watermarkVerticalAlignment: "bottom" };
  const saved = captureChartTemplateSettings(source);
  source.watermarkHorizontalAlignment = "left";
  expect(saved.watermarkHorizontalAlignment).toBe("right");
  expect(saved.watermarkVerticalAlignment).toBe("bottom");
  const legacy = captureChartTemplateSettings({ showSymbolWatermark: true });
  expect(legacy.watermarkHorizontalAlignment).toBe("center");
  expect(legacy.watermarkVerticalAlignment).toBe("center");
});

it("round-trips independent base and extra indicator timeframe rules", () => {
  const source = {
    appearance: { rsi: { timeframeVisibility: { minutes: { enabled: false, min: 5, max: 15 } } } },
    extraIndicators: [
      {
        id: "custom-rsi",
        key: "rsi",
        hidden: false,
        inputs: { period: 21 },
        appearance: { timeframeVisibility: { hours: { enabled: false, min: 1, max: 4 } } },
      },
    ],
  };
  const saved = captureChartTemplateSettings(source);
  expect(saved.appearance.rsi?.timeframeVisibility?.minutes).toEqual({
    enabled: false,
    min: 5,
    max: 15,
  });
  expect(saved.extraIndicators[0]?.appearance.timeframeVisibility?.hours.enabled).toBe(false);
  source.appearance.rsi.timeframeVisibility.minutes.enabled = true;
  expect(saved.appearance.rsi?.timeframeVisibility?.minutes.enabled).toBe(false);
  expect(captureChartTemplateSettings(saved)).toEqual(saved);
});

it("captures wheel zoom and restores enabled behavior for older templates", () => {
  expect(captureChartTemplateSettings({ zoomWithMouseWheel: false }).zoomWithMouseWheel).toBe(
    false,
  );
  expect(captureChartTemplateSettings({}).zoomWithMouseWheel).toBe(true);
  expect(chartTemplateSettingsKey({ zoomWithMouseWheel: false })).not.toBe(
    chartTemplateSettingsKey({}),
  );
  const templates = normalizeChartTemplates([
    { id: "wheel-off", name: "No wheel zoom", settings: { zoomWithMouseWheel: false } },
    { id: "legacy", name: "Legacy", settings: {} },
  ]);
  expect(templates.map((template) => template.settings.zoomWithMouseWheel)).toEqual([false, true]);
});

it("captures gradient background endpoints and keeps legacy templates solid", () => {
  const gradient = {
    chartBackgroundMode: "gradient",
    chartBackgroundColor: "#123456",
    chartBackgroundBottomColor: "#654321",
  };
  expect(captureChartTemplateSettings(gradient)).toMatchObject(gradient);
  expect(captureChartTemplateSettings({ chartBackgroundColor: "#123456" })).toMatchObject({
    chartBackgroundMode: "solid",
    chartBackgroundColor: "#123456",
    chartBackgroundBottomColor: "#000000",
  });
  const templates = normalizeChartTemplates([
    { id: "gradient", name: "Gradient", settings: gradient },
  ]);
  expect(templates[0]?.settings).toMatchObject(gradient);
  expect(chartTemplateSettingsKey(gradient)).not.toBe(
    chartTemplateSettingsKey({ ...gradient, chartBackgroundMode: "solid" }),
  );
});

it("captures zoom anchoring and restores pointer anchoring for legacy templates", () => {
  expect(captureChartTemplateSettings({ chartZoomAnchor: "right" }).chartZoomAnchor).toBe("right");
  expect(captureChartTemplateSettings({}).chartZoomAnchor).toBe("pointer");
  const templates = normalizeChartTemplates([
    {
      id: "right",
      name: "Right edge",
      settings: { chartZoomAnchor: "right", zoomWithMouseWheel: false },
    },
  ]);
  expect(templates[0]?.settings).toMatchObject({
    chartZoomAnchor: "right",
    zoomWithMouseWheel: false,
  });
  expect(chartTemplateSettingsKey({ chartZoomAnchor: "right" })).not.toBe(
    chartTemplateSettingsKey({}),
  );
});
