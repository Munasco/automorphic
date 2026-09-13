import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Time } from "lightweight-charts";
import {
  defaultChannelDrawingSettings,
  defaultDrawingLevels,
  parseChartDrawings,
  type ChartDrawing,
} from "./drawingGeometry";

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
  it("resets parallel channels to styled rails without altering saved custom or sparse appearances", () => {
    const target: ChartDrawing = {
      ...drawing,
      kind: "channel",
      anchors: [...drawing.anchors, { time: 300 as Time, price: 15 }],
      backgroundOpacity: 0.65,
    };
    const saved = saveDrawingTemplate([], target, "Custom parallel channel")!;
    const restored = normalizeDrawingTemplates(JSON.parse(JSON.stringify(saved)))[0]!;
    const reset = applyDrawingTemplate(target, defaultDrawingTemplateSettings("channel"));
    expect(reset).toMatchObject({
      id: target.id,
      anchors: target.anchors,
      background: true,
      backgroundOpacity: 0.2,
    });
    expect(reset.levels?.filter((level) => level.visible)).toEqual([
      { value: 0, visible: true, color: "#2962ff", width: 2, lineStyle: "solid" },
      { value: 0.5, visible: true, color: "#2962ff", width: 1, lineStyle: "dashed" },
      { value: 1, visible: true, color: "#2962ff", width: 2, lineStyle: "solid" },
    ]);
    expect(parseChartDrawings(JSON.stringify([reset]))).toEqual([reset]);
    expect(applyDrawingTemplate(reset, restored.settings)).toEqual(target);
    const {
      levels: _levels,
      background: _background,
      backgroundOpacity: _opacity,
      ...legacy
    } = target;
    expect(parseChartDrawings(JSON.stringify([legacy]))).toEqual([legacy]);
    expect(defaultChannelDrawingSettings("channel")).toMatchObject({
      background: false,
      backgroundOpacity: 0.12,
    });
  });
  it.each([
    ["flat-channel", "#ff9800"],
    ["disjoint-channel", "#089981"],
  ] as const)(
    "applies factory %s colors only on reset while preserving custom and sparse legacy drawings",
    (kind, color) => {
      const target: ChartDrawing = {
        ...drawing,
        kind,
        anchors: [...drawing.anchors, { time: 300 as Time, price: 15 }],
        backgroundOpacity: 0.65,
      };
      const saved = saveDrawingTemplate([], target, "Custom channel")!;
      const restored = normalizeDrawingTemplates(JSON.parse(JSON.stringify(saved)))[0]!;
      expect(applyDrawingTemplate(target, restored.settings)).toEqual(target);
      const reset = applyDrawingTemplate(target, defaultDrawingTemplateSettings(kind));
      expect(reset).toMatchObject({
        id: target.id,
        kind,
        anchors: target.anchors,
        name: target.name,
        locked: true,
        hidden: true,
        color,
        width: 2,
        lineStyle: "solid",
        background: true,
        backgroundOpacity: 0.2,
      });
      expect(applyDrawingTemplate(reset, restored.settings)).toEqual(target);
      const legacy: ChartDrawing = {
        id: "legacy",
        kind,
        anchors: target.anchors,
        color: "#2962ff",
        width: 2,
      };
      const loaded = parseChartDrawings(JSON.stringify([legacy]))[0]!;
      expect(loaded).toEqual(legacy);
      expect({ ...defaultChannelDrawingSettings(kind), ...loaded }).toMatchObject({
        color: "#2962ff",
        backgroundOpacity: 0.12,
      });
    },
  );
  it.each([
    "pitchfork",
    "schiff-pitchfork",
    "modified-schiff-pitchfork",
    "inside-pitchfork",
  ] as const)(
    "resets %s to its factory palette without changing saved or legacy appearance",
    (kind) => {
      const target: ChartDrawing = {
        ...drawing,
        kind,
        anchors: [...drawing.anchors, { time: 300 as Time, price: 15 }],
        backgroundOpacity: 0.65,
        levels: [{ value: 0.75, visible: true, color: "#abcdef", width: 4, opacity: 0.4 }],
      };
      const saved = saveDrawingTemplate([], target, "Custom fork")!;
      const restored = normalizeDrawingTemplates(JSON.parse(JSON.stringify(saved)))[0]!;
      const applied = applyDrawingTemplate(target, restored.settings);
      expect(applied).toEqual(target);

      const reset = applyDrawingTemplate(applied, defaultDrawingTemplateSettings(kind));
      expect(reset).toMatchObject({
        id: target.id,
        kind,
        anchors: target.anchors,
        name: target.name,
        locked: true,
        hidden: true,
        color: "#f23645",
        width: 2,
        lineStyle: "solid",
        lineOpacity: 1,
        background: true,
        backgroundOpacity: 0.2,
      });
      expect(reset.levels?.map(({ value, color, visible }) => [value, color, visible])).toEqual([
        [0.25, "#ffb74d", false],
        [0.382, "#81c784", false],
        [0.5, "#089981", true],
        [0.618, "#089981", false],
        [0.75, "#00bcd4", false],
        [1, "#2962ff", true],
        [1.5, "#9c27b0", false],
        [1.75, "#e91e63", false],
        [2, "#f77c80", false],
      ]);
      expect(parseChartDrawings(JSON.stringify([reset]))).toEqual([reset]);

      const { levels: _levels, ...legacy } = target;
      const legacyTemplate = saveDrawingTemplate([], legacy, "Legacy fork")!;
      const legacySettings = normalizeDrawingTemplates(
        JSON.parse(JSON.stringify(legacyTemplate)),
      )[0]!.settings;
      expect(applyDrawingTemplate(reset, legacySettings)).toEqual(legacy);
      expect(parseChartDrawings(JSON.stringify([legacy]))).toEqual([legacy]);
      expect(defaultDrawingLevels(kind).filter((level) => level.visible)).toEqual([
        { value: 0.5, visible: true, color: "#4caf50" },
        { value: 1, visible: true, color: "#2962ff" },
      ]);
    },
  );
  it.each(["horizontal", "horizontal-ray", "vertical", "crossline"] as const)(
    "restores %s factory axis labels and preserves explicit disabled labels in saved templates",
    (kind) => {
      const target: ChartDrawing = {
        ...drawing,
        kind,
        anchors: [drawing.anchors[0]!],
        showPriceLabel: false,
        showTimeLabel: false,
      };
      const saved = saveDrawingTemplate([], target, "No axis labels")!;
      const reloaded = normalizeDrawingTemplates(JSON.parse(JSON.stringify(saved)));
      const applied = applyDrawingTemplate(
        { ...target, showPriceLabel: true, showTimeLabel: true },
        reloaded[0]!.settings,
      );
      expect(applied.showPriceLabel).toBe(false);
      expect(applied.showTimeLabel).toBe(false);
      expect(applied.id).toBe(target.id);
      expect(applied.anchors).toBe(target.anchors);
      const reset = applyDrawingTemplate(applied, defaultDrawingTemplateSettings(kind));
      expect(reset.showPriceLabel).toBe(kind === "vertical" ? undefined : true);
      expect(reset.showTimeLabel).toBe(
        kind === "vertical" || kind === "crossline" ? true : undefined,
      );
    },
  );
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

  it("roundtrips channel level styles and resets to factory rails and shading", () => {
    const channel: ChartDrawing = {
      ...drawing,
      kind: "channel",
      extendLeft: true,
      extendRight: true,
      background: true,
      backgroundColor: "#00ff00",
      backgroundOpacity: 0.4,
      levels: [
        {
          value: -0.5,
          visible: true,
          color: "#ff0000",
          width: 5,
          lineStyle: "dotted",
          opacity: 0.3,
        },
        { value: 2, visible: false },
      ],
    };
    const saved = saveDrawingTemplate([], channel, "Channel")!;
    const restored = normalizeDrawingTemplates(JSON.parse(JSON.stringify(saved)))[0]!;
    const applied = applyDrawingTemplate(channel, restored.settings);
    expect(applied.levels).toEqual(channel.levels);
    expect(applied).toMatchObject({
      background: true,
      backgroundColor: "#00ff00",
      backgroundOpacity: 0.4,
      extendLeft: true,
      extendRight: true,
    });
    const reset = applyDrawingTemplate(applied, defaultDrawingTemplateSettings("channel"));
    expect(reset).toMatchObject({
      background: true,
      backgroundOpacity: 0.2,
      extendLeft: false,
      extendRight: false,
      id: channel.id,
      anchors: channel.anchors,
    });
    expect(reset.levels).toHaveLength(7);
    expect(reset).not.toHaveProperty("backgroundColor");
  });

  it("preserves a saved shape fill and resets it through the existing sparse default template", () => {
    const shape: ChartDrawing = {
      ...drawing,
      kind: "rectangle",
      background: true,
      backgroundColor: "#00ff00",
      backgroundOpacity: 0.42,
    };
    const saved = saveDrawingTemplate([], shape, "Green fill")!;
    const restored = normalizeDrawingTemplates(JSON.parse(JSON.stringify(saved)))[0]!;
    const applied = applyDrawingTemplate(
      { ...shape, background: false, backgroundColor: "#ff0000" },
      restored.settings,
    );
    expect(applied).toMatchObject({
      id: shape.id,
      anchors: shape.anchors,
      locked: true,
      background: true,
      backgroundColor: "#00ff00",
      backgroundOpacity: 0.42,
    });
    const reset = applyDrawingTemplate(applied, defaultDrawingTemplateSettings("rectangle"));
    expect(reset).not.toHaveProperty("background");
    expect(reset).not.toHaveProperty("backgroundColor");
    expect(reset).not.toHaveProperty("backgroundOpacity");
    expect(reset).toMatchObject({ id: shape.id, anchors: shape.anchors, locked: true });
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

describe("Text box templates", () => {
  it("preserves box appearance through saved templates and resets only appearance with factory defaults", () => {
    const source: ChartDrawing = {
      ...drawing,
      kind: "text",
      anchors: [{ time: 100 as Time, price: 20 }],
      text: "First\nSecond",
      textWrap: true,
      textWrapWidth: 180,
      textBorder: true,
      textBorderColor: "#112233",
      textBorderOpacity: 0.5,
      background: true,
      backgroundColor: "#abcdef",
      backgroundOpacity: 0.25,
    };
    const templates = normalizeDrawingTemplates([{ kind: "text", name: "Note", settings: source }]);
    expect(templates[0]?.settings).toMatchObject({
      textWrap: true,
      textWrapWidth: 180,
      textBorder: true,
      textBorderColor: "#112233",
      textBorderOpacity: 0.5,
      background: true,
      backgroundOpacity: 0.25,
    });
    const restored = applyDrawingTemplate(source, templates[0]!.settings);
    expect(parseChartDrawings(JSON.stringify([restored]))[0]).toMatchObject({
      textWrap: true,
      textWrapWidth: 180,
      text: "First\nSecond",
    });
    const reset = applyDrawingTemplate(source, defaultDrawingTemplateSettings("text"));
    expect(reset).toMatchObject({
      id: source.id,
      anchors: source.anchors,
      background: false,
      textBorder: false,
      textWrap: false,
    });
    expect(reset.textWrapWidth).toBeUndefined();
  });
});
