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
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
});
const chart = () => ({
  style: "area",
  gridMode: "horizontal",
  gridColor: "#123456",
  priceScaleMode: "logarithmic",
  timeZone: "America/New_York",
  replaySpeed: 5,
  favoriteIndicators: ["rsi"],
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
      indicatorInputs: { rsi: { period: 7 } },
    });
    for (const key of ["favoriteIndicators", "replaySpeed", "symbol", "drawings", "alerts"])
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
