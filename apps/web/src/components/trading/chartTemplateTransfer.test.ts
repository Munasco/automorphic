import { describe, expect, it, vi } from "vite-plus/test";
vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    registerHydrator: vi.fn(),
  },
}));
import { captureChartTemplateSettings } from "./chartTemplates";
import { createIndicatorInstance } from "./chartIndicatorInstances";
import { DEFAULT_INITIAL_BALANCE } from "./initialBalanceSettings";
import {
  MAX_CHART_TEMPLATE_FILE_BYTES,
  chartTemplateFileName,
  parseChartTemplateFile,
  serializeChartTemplate,
} from "./chartTemplateTransfer";

const envelope = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: "automorphic-chart-template",
    version: 1,
    name: "My chart",
    settings: {},
    ...patch,
  });

describe("portable chart templates", () => {
  it("round-trips independent indicator settings, order and chart colors without a source template ID", () => {
    const extra = createIndicatorInstance("sma", "second-sma");
    extra.inputs.period = 42;
    const settings = captureChartTemplateSettings({
      indicators: { sma: true },
      indicatorInputs: { sma: { period: 12 } },
      extraIndicators: [extra],
      indicatorOrder: [extra.id, "base:sma"],
      chartBackgroundColor: "#123456",
      chartTextColor: "#abcdef",
      showSymbolWatermark: true,
      appearance: { sma: { color: "#fedcba", lineWidth: 3 } },
    });
    const source = { id: "private-template-id", name: " Portable ", settings };
    const text = serializeChartTemplate(source);
    expect(JSON.parse(text)).not.toHaveProperty("id");
    const imported = parseChartTemplateFile(text);
    expect(imported.name).toBe("Portable");
    expect(imported.settings).toEqual(settings);
    imported.settings.extraIndicators[0]!.inputs.period = 5;
    expect(source.settings.extraIndicators[0]!.inputs.period).toBe(42);
  });

  it("strips unknown fields and unrelated workspace preferences during import and export", () => {
    const settings = {
      symbol: "private-symbol",
      token: "private-token",
      favoriteIndicators: ["sma"],
      replaySpeed: 10,
      initialBalance: { ...DEFAULT_INITIAL_BALANCE, token: "nested-private-token" },
      extraIndicators: [
        {
          ...createIndicatorInstance("ib", "extra-ib"),
          initialBalance: { ...DEFAULT_INITIAL_BALANCE, token: "extra-private-token" },
        },
      ],
    };
    const text = envelope({ settings, id: "source", accessToken: "private-access" });
    const parsed = parseChartTemplateFile(text);
    const exported = serializeChartTemplate({ id: "new-id", ...parsed });
    for (const field of ["symbol", "token", "favoriteIndicators", "replaySpeed", "accessToken"])
      expect(exported).not.toContain(`"${field}"`);
    expect(exported).not.toContain("private");
    expect(parsed.settings.extraIndicators[0]!.initialBalance).toEqual(DEFAULT_INITIAL_BALANCE);
  });

  it.each([
    "",
    "{invalid",
    "null",
    "[]",
    "{}",
    envelope({ version: 2 }),
    envelope({ format: "other" }),
  ])("rejects malformed or unsupported envelopes: %s", (text) => {
    expect(() => parseChartTemplateFile(text)).toThrow();
  });
  it.each([null, [], "settings", 1])("rejects missing or non-object settings: %s", (settings) => {
    expect(() => parseChartTemplateFile(envelope({ settings }))).toThrow("chart settings");
  });
  it.each([null, "", "   ", "a".repeat(81), 12])("rejects invalid names: %s", (name) => {
    expect(() => parseChartTemplateFile(envelope({ name }))).toThrow("name");
  });
  it("enforces the file limit in UTF-8 bytes before parsing", () => {
    const oversized = envelope({ padding: "é".repeat(125_000) });
    expect(oversized.length).toBeLessThan(MAX_CHART_TEMPLATE_FILE_BYTES);
    expect(new TextEncoder().encode(oversized).byteLength).toBeGreaterThan(
      MAX_CHART_TEMPLATE_FILE_BYTES,
    );
    expect(() => parseChartTemplateFile(oversized)).toThrow("250 KB");
    expect(() => parseChartTemplateFile(" ".repeat(MAX_CHART_TEMPLATE_FILE_BYTES + 1))).toThrow(
      "250 KB",
    );
  });
  it("normalizes known malformed settings without preserving unknown fields", () => {
    expect(
      parseChartTemplateFile(
        envelope({
          settings: {
            style: "invalid",
            chartBackgroundColor: "red",
            extraIndicators: [{ key: "invalid" }],
          },
        }),
      ).settings,
    ).toMatchObject({ style: "candles", chartBackgroundColor: "#0b0d12", extraIndicators: [] });
  });
  it.each([
    ["My Chart", "my-chart.json"],
    ["../../NQ: morning?", "nq-morning.json"],
    ["Café", "cafe.json"],
    ["💹", "chart-template.json"],
    ["a".repeat(80), `${"a".repeat(60)}.json`],
  ])("creates a bounded filename for %s", (name, expected) => {
    expect(chartTemplateFileName(name)).toBe(expected);
  });
});
