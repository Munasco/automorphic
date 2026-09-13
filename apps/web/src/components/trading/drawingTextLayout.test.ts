import { describe, expect, it } from "vite-plus/test";
import type { ChartDrawing, DrawingGeometry } from "./drawingGeometry";
import { measureDrawingText } from "./drawingTextLayout";
const drawing: ChartDrawing = {
  id: "text",
  kind: "text",
  anchors: [],
  color: "#ffffff",
  width: 2,
  textFontSize: 20,
};
const placement = (value: string): NonNullable<DrawingGeometry["text"]> => ({
  point: { x: 100, y: 100 },
  value,
  fontSize: 20,
  baseline: "top",
  align: "left",
});
const measure = (value: string) => Array.from(value).length * 10;

describe("shared drawing text layout", () => {
  it("preserves unwrapped multiline glyph origins while adding symmetric frame padding", () => {
    const result = measureDrawingText(drawing, placement("ABC\n\nD"), "Test Sans", measure);
    expect(result).toMatchObject({
      rows: ["ABC", "", "D"],
      rowWidths: [30, 0, 10],
      width: 38,
      height: 80,
      left: -4,
      top: -4,
      padding: 4,
      rowHeight: 24,
      font: "20px Test Sans",
    });
  });
  it("wraps at word boundaries and retains explicit blank lines", () => {
    const result = measureDrawingText(
      { ...drawing, textWrap: true, textWrapWidth: 68 },
      placement("Alpha Beta\n\nGamma"),
      "Test",
      measure,
    );
    expect(result.rows).toEqual(["Alpha ", "Beta", "", "Gamma"]);
    expect(result.width).toBe(68);
    expect(result.height).toBe(104);
  });
  it("splits long words by grapheme without separating emoji sequences or combining marks", () => {
    const clusters = ["👩🏽‍💻", "e\u0301", "🏳️‍🌈", "🧑‍🚀"];
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const result = measureDrawingText(
      { ...drawing, textWrap: true, textWrapWidth: 40 },
      placement(clusters.join("")),
      "Test",
      (value) => Array.from(segmenter.segment(value)).length * 20,
    );
    expect(result.rows).toEqual(clusters);
    expect(result.rowWidths).toEqual([20, 20, 20, 20]);
  });
  it("keeps wrapped outer origin fixed for center/right content alignment", () => {
    for (const align of ["left", "center", "right"] as const) {
      const result = measureDrawingText(
        { ...drawing, textWrap: true, textWrapWidth: 120 },
        { ...placement("ABC"), align },
        "Test",
        measure,
      );
      expect(result.left).toBe(-4);
      expect(result.width).toBe(120);
    }
    const unwrapped = measureDrawingText(
      drawing,
      { ...placement("ABC"), align: "right", baseline: "bottom" },
      "Test",
      measure,
    );
    expect(unwrapped.left).toBe(-34);
    expect(unwrapped.top).toBe(-28);
  });
  it("uses the exact bold italic font for all width measurements", () => {
    const fonts: string[] = [];
    const result = measureDrawingText(
      { ...drawing, textBold: true, textItalic: true },
      placement("WW\nii"),
      "Test Sans",
      (value, font) => {
        fonts.push(font);
        return value.includes("W") ? 38 : 8;
      },
    );
    expect(new Set(fonts)).toEqual(new Set(["italic bold 20px Test Sans"]));
    expect(result.rowWidths).toEqual([38, 8]);
  });
  it("keeps line-attached text unwrapped and unpadded regardless of standalone box flags", () => {
    const result = measureDrawingText(
      {
        ...drawing,
        kind: "trend",
        textWrap: true,
        textWrapWidth: 40,
        textBorder: true,
        background: true,
      },
      placement("Alpha Beta"),
      "Test",
      measure,
    );
    expect(result.rows).toEqual(["Alpha Beta"]);
    expect(result).toMatchObject({ padding: 0, left: 0, top: 0, width: 100, height: 24 });
  });
});
