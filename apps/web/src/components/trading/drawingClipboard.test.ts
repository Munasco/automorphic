import { describe, expect, it } from "vite-plus/test";
import type { Time } from "lightweight-charts";
import type { ChartDrawing } from "./drawingGeometry";
import { parseDrawingClipboard, serializeDrawingClipboard } from "./drawingClipboard";

const drawing: ChartDrawing = {
  id: "source",
  kind: "fib",
  anchors: [
    { time: 100 as Time, price: 20 },
    { time: 200 as Time, price: 30 },
  ],
  color: "#123456",
  width: 3,
  lineStyle: "dashed",
  lineOpacity: 0.4,
  text: "Research\nentry",
  textColor: "#abcdef",
  textFontSize: 22,
  textBold: true,
  textItalic: true,
  textOpacity: 0.6,
  name: "Saved range",
  locked: true,
  hidden: true,
  levels: [
    { value: 0.618, visible: true, color: "#ff9800", opacity: 0.5, width: 4, lineStyle: "dotted" },
  ],
  useOneColor: false,
  background: true,
  backgroundOpacity: 0.2,
  extendRight: true,
};

describe("drawing clipboard format", () => {
  it("round-trips literal coordinates, custom levels and annotation appearance independently", () => {
    const text = serializeDrawingClipboard(drawing)!;
    const first = parseDrawingClipboard(text)!;
    const second = parseDrawingClipboard(text)!;
    expect(first).toEqual(drawing);
    expect(second).toEqual(drawing);
    expect(first.anchors).not.toBe(drawing.anchors);
    expect(first.anchors[0]).not.toBe(second.anchors[0]);
    expect(first.levels![0]).not.toBe(second.levels![0]);
    first.anchors[0]!.price = 999;
    first.levels![0]!.color = "#000000";
    expect(second).toEqual(drawing);
  });

  it.each([
    "ordinary clipboard text",
    "null",
    "[]",
    "{}",
    JSON.stringify([drawing]),
    JSON.stringify({ type: "other-app", version: 1, drawing }),
    JSON.stringify({ type: "automorphic.chart-drawing", version: 2, drawing }),
    JSON.stringify({ type: "automorphic.chart-drawing", version: "1", drawing }),
    JSON.stringify({ type: "automorphic.chart-drawing", version: 1, drawing: [] }),
    JSON.stringify({
      type: "automorphic.chart-drawing",
      version: 1,
      drawing: { ...drawing, anchors: [] },
    }),
    JSON.stringify({
      type: "automorphic.chart-drawing",
      version: 1,
      drawing: {
        ...drawing,
        anchors: [
          { time: 100, price: null },
          { time: 200, price: 30 },
        ],
      },
    }),
    JSON.stringify({
      type: "automorphic.chart-drawing",
      version: 1,
      drawing: { ...drawing, kind: "unknown" },
    }),
  ])("rejects foreign, malformed or unsupported payload %s", (text) => {
    expect(parseDrawingClipboard(text)).toBeNull();
  });

  it("bounds input size and strips unknown fields through the workspace validator", () => {
    const envelope = {
      type: "automorphic.chart-drawing",
      version: 1,
      drawing: { ...drawing, executable: "alert(1)", secret: "irrelevant" },
    };
    expect(parseDrawingClipboard(JSON.stringify(envelope))).toEqual(drawing);
    expect(
      parseDrawingClipboard(JSON.stringify({ ...envelope, padding: "x".repeat(256 * 1024) })),
    ).toBeNull();
    expect(serializeDrawingClipboard({ ...drawing, anchors: [] })).toBeNull();
  });
});
