import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Time } from "lightweight-charts";
import type { ChartDrawing } from "./drawingGeometry";

vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    registerHydrator: vi.fn(),
  },
}));

import {
  applyDrawingTemplate,
  defaultDrawingTemplateSettings,
  normalizeDrawingTemplates,
  saveDrawingTemplate,
  useDrawingTemplates,
} from "./drawingTemplates";
import { tradingWorkspaceStorage } from "./workspaceStorage";

const drawing: ChartDrawing = {
  id: "original",
  kind: "fib",
  anchors: [
    { time: 100 as Time, price: 20 },
    { time: 200 as Time, price: 30 },
  ],
  name: "Entry",
  locked: true,
  hidden: true,
  color: "#123456",
  width: 2,
  lineStyle: "dashed",
  levels: [{ value: 0.618, visible: true, color: "#abcdef" }],
  background: false,
};

beforeEach(() => {
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(null);
  useDrawingTemplates.setState(useDrawingTemplates.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
});

describe("drawing templates", () => {
  it("resets factory appearance and clears custom text while preserving object identity and placement", () => {
    const target: ChartDrawing = {
      ...drawing,
      kind: "trend",
      text: "Custom annotation",
      textBold: true,
      textOpacity: 0.2,
      lineOpacity: 0.35,
      extendRight: true,
      showMiddlePoint: true,
    };
    const reset = applyDrawingTemplate(target, defaultDrawingTemplateSettings(target.kind));
    expect(reset).toEqual({
      id: target.id,
      kind: target.kind,
      anchors: target.anchors,
      name: target.name,
      hidden: true,
      locked: true,
      color: "#2962ff",
      width: 2,
      lineStyle: "solid",
      lineOpacity: 1,
      textOpacity: 1,
    });
    expect(applyDrawingTemplate(reset, defaultDrawingTemplateSettings(reset.kind))).toEqual(reset);
  });

  it("restores existing level, channel and regression defaults without retaining custom settings", () => {
    const reset = (kind: ChartDrawing["kind"]) =>
      applyDrawingTemplate(
        {
          ...drawing,
          kind,
          background: false,
          textAlignment: "right",
          regressionSource: "high",
          regressionLowerDeviation: 5,
          regressionUpperLine: { visible: false, color: "#123456", width: 4, lineStyle: "dotted" },
        },
        defaultDrawingTemplateSettings(kind),
      );
    expect(reset("fib-extension")).toMatchObject({
      background: true,
      showTrendLine: true,
      showPrices: true,
      showLevels: true,
      extendLeft: false,
      extendRight: false,
    });
    expect(reset("fib-extension")).not.toHaveProperty("levels");
    expect(reset("fib-time-zone")).toMatchObject({ background: false, backgroundOpacity: 0.2 });
    expect(reset("flat-channel")).toMatchObject({
      background: true,
      textAlignment: "left",
      textPosition: "above",
    });
    expect(reset("flat-channel")).not.toHaveProperty("regressionSource");
    expect(reset("regression-trend")).toMatchObject({
      regressionSource: "close",
      regressionLowerDeviation: -2,
      regressionUpperLine: {
        visible: true,
        color: "#2962ff",
        width: 2,
        lineStyle: "solid",
        opacity: 0.3,
      },
    });
    expect(reset("regression-trend")).not.toHaveProperty("levels");
  });

  it("captures validated settings without copying identity, anchors, object names or locks", () => {
    const saved = saveDrawingTemplate([], drawing, "  My levels  ")!;
    expect(saved).toEqual([
      {
        name: "My levels",
        kind: "fib",
        settings: {
          color: "#123456",
          width: 2,
          lineStyle: "dashed",
          levels: [{ value: 0.618, visible: true, color: "#abcdef" }],
          background: false,
        },
      },
    ]);
    saved[0]!.settings.levels![0]!.value = 0.5;
    expect(drawing.levels![0]!.value).toBe(0.618);
    expect(normalizeDrawingTemplates(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it("drops corrupt entries and unsafe fields while applying the shared settings sanitizer", () => {
    const good = {
      kind: "trend",
      name: "x".repeat(90),
      settings: {
        color: "#abcdef",
        width: 1,
        lineStyle: "invalid",
        id: "bad",
        anchors: [],
        locked: true,
        textColor: "url(bad)",
        textFontSize: 999,
        textBold: true,
        stats: ["price", "invented"],
        levels: [
          { value: 101, visible: true },
          { value: 1, visible: false, color: "invalid" },
        ],
        visibility: { minutes: { enabled: false, min: -5, max: 999 } },
      },
    };
    const templates = normalizeDrawingTemplates([
      null,
      {},
      { ...good, kind: "__proto__" },
      { ...good, name: " " },
      { ...good, settings: { color: "bad", width: 1 } },
      good,
    ]);
    expect(templates).toHaveLength(1);
    expect(templates[0]!.name).toHaveLength(80);
    expect(templates[0]!.settings).toMatchObject({
      lineStyle: "solid",
      textBold: true,
      stats: ["price"],
      levels: [{ value: 1, visible: false }],
      visibility: { minutes: { enabled: false, min: 1, max: 59 } },
    });
    expect(templates[0]!.settings).not.toHaveProperty("id");
    expect(templates[0]!.settings).not.toHaveProperty("locked");
    expect(templates[0]!.settings).not.toHaveProperty("anchors");
    expect(templates[0]!.settings).not.toHaveProperty("textColor");
    expect(normalizeDrawingTemplates({ templates })).toEqual([]);
  });

  it("caps each drawing kind at 20, permits explicit replacement, and keeps kinds independent", () => {
    const entries = Array.from({ length: 25 }, (_, index) => ({
      name: `Style ${index}`,
      kind: "fib",
      settings: drawing,
    }));
    const capped = normalizeDrawingTemplates([
      ...entries,
      { name: "Style 0", kind: "trend", settings: drawing },
    ]);
    expect(capped).toHaveLength(21);
    expect(saveDrawingTemplate(capped, drawing, "Another")).toBeNull();
    const replaced = saveDrawingTemplate(capped, { ...drawing, color: "#654321" }, "Style 0")!;
    expect(replaced).toHaveLength(21);
    expect(
      replaced.find((item) => item.kind === "fib" && item.name === "Style 0")!.settings.color,
    ).toBe("#654321");
    expect(replaced.find((item) => item.kind === "trend")!.settings.color).toBe("#123456");
    expect(saveDrawingTemplate(capped, drawing, " ")).toBeNull();
  });

  it("replaces omitted old appearance instead of merging it and rejects injected object metadata", () => {
    const target = { ...drawing, textBold: true, text: "old", extendRight: true };
    const applied = applyDrawingTemplate(target, {
      color: "#abcdef",
      width: 3,
      id: "injected",
      kind: "text",
      anchors: [],
      name: "bad",
      locked: false,
      hidden: false,
    });
    expect(applied).toEqual({
      id: drawing.id,
      kind: drawing.kind,
      anchors: drawing.anchors,
      name: drawing.name,
      locked: true,
      hidden: true,
      color: "#abcdef",
      width: 3,
      lineStyle: "solid",
    });
    expect(applyDrawingTemplate(target, { color: "invalid", width: 3 })).toBe(target);
  });

  it("restores saved templates after reload, deletes only the requested kind and resets on workspace hydration", async () => {
    const store = useDrawingTemplates.getState();
    expect(store.saveTemplate(drawing, "My style")).toBe(true);
    expect(store.saveTemplate({ ...drawing, kind: "trend" }, "My style")).toBe(true);
    const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
    useDrawingTemplates.setState(useDrawingTemplates.getInitialState(), true);
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved);
    await useDrawingTemplates.persist.rehydrate();
    expect(useDrawingTemplates.getState().templates).toHaveLength(2);
    useDrawingTemplates.getState().deleteTemplate("fib", "My style");
    expect(useDrawingTemplates.getState().templates.map((item) => item.kind)).toEqual(["trend"]);
    vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(null);
    const hydrate = vi.mocked(tradingWorkspaceStorage.registerHydrator).mock.calls[0]![0];
    await hydrate();
    expect(useDrawingTemplates.getState().templates).toEqual([]);
  });
});
