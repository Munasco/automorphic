import type { UTCTimestamp } from "lightweight-charts";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  createDrawingDefaults,
  DRAWING_DEFAULTS_KEY,
  drawingAppearanceChanged,
  normalizeDrawingDefaults,
} from "./drawingDefaults";
import { defaultDrawingTemplateSettings } from "./drawingTemplates";
import type { ChartDrawing } from "./drawingGeometry";
const drawing: ChartDrawing = {
  id: "private-id",
  kind: "trend",
  anchors: [
    { time: 100 as UTCTimestamp, price: 10 },
    { time: 200 as UTCTimestamp, price: 20 },
  ],
  name: "Private name",
  locked: true,
  hidden: true,
  text: "Private note",
  color: "#ff0000",
  width: 3,
  lineStyle: "dashed",
  textFontSize: 22,
  textBold: true,
  lineOpacity: 0.5,
};

describe("last-used drawing appearance", () => {
  it.each([
    ["flat-channel", "#ff9800"],
    ["disjoint-channel", "#089981"],
  ] as const)("uses factory %s appearance only without remembered settings", (kind, color) => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const defaults = createDrawingDefaults(storage);
    expect(defaults.get(kind)).toMatchObject({ color, backgroundOpacity: 0.2 });
    const legacy: ChartDrawing = { ...drawing, kind, color: "#2962ff", backgroundOpacity: 0.12 };
    expect(defaults.remember(legacy)).toBe(true);
    expect(createDrawingDefaults(storage).get(kind)).toMatchObject({
      color: "#2962ff",
      backgroundOpacity: 0.12,
    });
    const { backgroundOpacity: _opacity, ...sparse } = legacy;
    expect(defaults.remember(sparse)).toBe(true);
    const remembered = createDrawingDefaults(storage).get(kind);
    expect(remembered.color).toBe("#2962ff");
    expect(remembered).not.toHaveProperty("backgroundOpacity");
    values.clear();
    expect(defaults.get(kind)).toMatchObject({ color, backgroundOpacity: 0.2 });
  });
  it.each([
    "pitchfork",
    "schiff-pitchfork",
    "modified-schiff-pitchfork",
    "inside-pitchfork",
  ] as const)("uses factory %s colors only when no remembered appearance exists", (kind) => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const defaults = createDrawingDefaults(storage);
    expect(defaults.get(kind)).toMatchObject({ color: "#f23645", backgroundOpacity: 0.2 });
    expect(defaults.get(kind).levels?.filter((level) => level.visible)).toEqual([
      { value: 0.5, visible: true, color: "#089981" },
      { value: 1, visible: true, color: "#2962ff" },
    ]);

    const legacy: ChartDrawing = { ...drawing, kind, backgroundOpacity: 0.12 };
    expect(defaults.remember(legacy)).toBe(true);
    const remembered = createDrawingDefaults(storage).get(kind);
    expect(remembered).toMatchObject({ color: drawing.color, backgroundOpacity: 0.12 });
    expect(remembered).not.toHaveProperty("levels");
    expect(drawingAppearanceChanged(legacy, { ...legacy, anchors: [] })).toBe(false);

    const custom: ChartDrawing = {
      ...legacy,
      levels: [
        {
          value: 0.25,
          visible: true,
          color: "#123456",
          opacity: 0.3,
          width: 4,
          lineStyle: "dotted",
        },
      ],
    };
    expect(defaults.remember(custom)).toBe(true);
    expect(createDrawingDefaults(storage).get(kind).levels).toEqual(custom.levels);
    values.clear();
    expect(defaults.get(kind)).toMatchObject({ color: "#f23645", backgroundOpacity: 0.2 });
  });
  it("persists only validated appearance per tool and keeps factory reset independent", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
    };
    const defaults = createDrawingDefaults(storage);
    expect(defaults.get("trend").color).toBe("#2962ff");
    expect(defaults.remember(drawing)).toBe(true);
    expect(defaults.remember(drawing)).toBe(false);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(values.get(DRAWING_DEFAULTS_KEY)!);
    expect(saved.trend).toEqual({
      color: "#ff0000",
      width: 3,
      lineStyle: "dashed",
      textFontSize: 22,
      textBold: true,
      lineOpacity: 0.5,
    });
    expect(defaults.get("trend")).toEqual(saved.trend);
    expect(defaults.get("horizontal").color).toBe("#2962ff");
    expect(defaultDrawingTemplateSettings("trend").color).toBe("#2962ff");
    expect(
      drawingAppearanceChanged(drawing, {
        ...drawing,
        name: "new",
        text: "another",
        hidden: false,
        locked: false,
        anchors: [
          { time: 300 as UTCTimestamp, price: 20 },
          { time: 400 as UTCTimestamp, price: 30 },
        ],
      }),
    ).toBe(false);
    expect(drawingAppearanceChanged(drawing, { ...drawing, color: "#00ff00" })).toBe(true);
  });
  it("reads the hydrated workspace on demand without leaking styles across workspace switches", () => {
    const first = new Map<string, string>(),
      second = new Map<string, string>();
    let current = first;
    const storage = {
      getItem: (key: string) => current.get(key) ?? null,
      setItem: (key: string, value: string) => {
        current.set(key, value);
      },
    };
    const session = createDrawingDefaults(storage);
    session.remember(drawing);
    current = second;
    expect(session.get("trend").color).toBe("#2962ff");
    session.remember({ ...drawing, color: "#00ff00" });
    current = first;
    expect(createDrawingDefaults(storage).get("trend").color).toBe("#ff0000");
    first.clear();
    expect(session.get("trend").color).toBe("#2962ff");
  });
  it("rejects malformed styles, unknown tools and corrupt records", () => {
    expect(
      normalizeDrawingDefaults({
        unknown: drawing,
        trend: { color: "red", width: 99 },
        horizontal: drawing,
      }),
    ).toEqual({
      horizontal: {
        color: "#ff0000",
        width: 3,
        lineStyle: "dashed",
        textFontSize: 22,
        textBold: true,
        lineOpacity: 0.5,
      },
    });
    const defaults = createDrawingDefaults({
      getItem: () => "not-json",
      setItem: () => {
        throw Error("unavailable");
      },
    });
    expect(defaults.get("trend").color).toBe("#2962ff");
    expect(defaults.remember(drawing)).toBe(false);
  });
});

describe("reset future drawing defaults", () => {
  it("clears only the requested tool, survives reload, and skips redundant writes", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
    };
    const defaults = createDrawingDefaults(storage);
    defaults.remember(drawing);
    defaults.remember({ ...drawing, kind: "horizontal", color: "#00ff00" });
    const other = defaults.get("horizontal");
    expect(defaults.reset("trend")).toBe(true);
    expect(defaults.get("trend")).toEqual(defaultDrawingTemplateSettings("trend"));
    expect(createDrawingDefaults(storage).get("trend")).toEqual(defaults.get("trend"));
    expect(defaults.get("horizontal")).toEqual(other);
    const writes = storage.setItem.mock.calls.length;
    expect(defaults.reset("trend")).toBe(true);
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
  });
  it("resets the active workspace without affecting another workspace's defaults", () => {
    const first = new Map<string, string>(),
      second = new Map<string, string>();
    let current = first;
    const storage = {
      getItem: (key: string) => current.get(key) ?? null,
      setItem: (key: string, value: string) => {
        current.set(key, value);
      },
    };
    const defaults = createDrawingDefaults(storage);
    defaults.remember(drawing);
    current = second;
    defaults.remember({ ...drawing, color: "#00ff00" });
    expect(defaults.reset("trend")).toBe(true);
    expect(defaults.get("trend").color).toBe("#2962ff");
    current = first;
    expect(defaults.get("trend").color).toBe("#ff0000");
  });
  it("reports unavailable storage and leaves remembered appearance intact after a failed write", () => {
    const json = JSON.stringify({ trend: drawing });
    const defaults = createDrawingDefaults({
      getItem: () => json,
      setItem: () => {
        throw Error("failed");
      },
    });
    expect(defaults.reset("trend")).toBe(false);
    expect(defaults.get("trend").color).toBe("#ff0000");
    expect(createDrawingDefaults().reset("trend")).toBe(false);
    expect(
      createDrawingDefaults({
        getItem: () => {
          throw Error("unavailable");
        },
        setItem: vi.fn(),
      }).reset("trend"),
    ).toBe(false);
  });
});
