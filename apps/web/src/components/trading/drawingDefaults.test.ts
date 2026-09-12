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
