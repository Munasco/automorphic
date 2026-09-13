import { describe, expect, it } from "vite-plus/test";
import type { Time } from "lightweight-charts";
import type { ChartDrawing } from "./drawingGeometry";
import {
  parseDrawingClipboard,
  serializeDrawingClipboard,
  parseDrawingsClipboard,
  serializeDrawingsClipboard,
} from "./drawingClipboard";

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

describe("drawing selection clipboard", () => {
  const front: ChartDrawing = {
    id: "front",
    kind: "trend",
    anchors: [
      { time: 125 as Time, price: 25 },
      { time: 250 as Time, price: 40 },
    ],
    color: "#abcdef",
    width: 1,
    text: "Front line",
  };
  const envelope = (drawings: unknown) =>
    JSON.stringify({
      type: "automorphic.chart-drawings",
      version: 1,
      drawings,
    });

  it("reads legacy single copies and emits the unchanged single format for one selection", () => {
    const legacy = serializeDrawingClipboard(drawing)!;
    expect(serializeDrawingsClipboard([drawing])).toBe(legacy);
    expect(parseDrawingsClipboard(legacy)).toEqual([drawing]);
    expect(parseDrawingClipboard(serializeDrawingsClipboard([drawing, front])!)).toBeNull();
  });

  it("retains stacking order, relative coordinates and independent nested settings for every object", () => {
    const source = [drawing, front];
    const text = serializeDrawingsClipboard(source)!;
    const first = parseDrawingsClipboard(text)!;
    const second = parseDrawingsClipboard(text)!;
    expect(first).toEqual(source);
    expect(second).toEqual(source);
    expect(first.map(({ id }) => id)).toEqual(["source", "front"]);
    expect(first[1]!.anchors[0]!.price - first[0]!.anchors[0]!.price).toBe(5);
    first[0]!.anchors[0]!.price = 999;
    first[0]!.levels![0]!.color = "#000000";
    first[1]!.anchors[1]!.price = -100;
    expect(second).toEqual(source);
    expect(drawing.anchors[0]!.price).toBe(20);
    expect(front.anchors[1]!.price).toBe(40);
  });

  it.each([
    null,
    {},
    [],
    [drawing, null],
    [drawing, { ...front, anchors: [] }],
    [drawing, { ...front, kind: "unknown" }],
    [drawing, { ...front, id: drawing.id }],
  ])("rejects the entire malformed selection %j", (objects) => {
    expect(parseDrawingsClipboard(envelope(objects))).toBeNull();
  });

  it("rejects IDs that collide after normalization and does not silently truncate oversized groups", () => {
    const longId = "x".repeat(100);
    expect(
      parseDrawingsClipboard(
        envelope([
          { ...drawing, id: `${longId}a` },
          { ...front, id: `${longId}b` },
        ]),
      ),
    ).toBeNull();
    const maximum = Array.from({ length: 100 }, (_, index) => ({ ...front, id: `line-${index}` }));
    expect(parseDrawingsClipboard(serializeDrawingsClipboard(maximum)!)).toEqual(maximum);
    const oversized = [...maximum, { ...front, id: "extra" }];
    expect(parseDrawingsClipboard(envelope(oversized))).toBeNull();
    expect(serializeDrawingsClipboard(oversized)).toBeNull();
    expect(serializeDrawingsClipboard([])).toBeNull();
    expect(serializeDrawingsClipboard([drawing, { ...front, anchors: [] }])).toBeNull();
  });

  it("bounds group text, rejects unsupported envelopes and strips unknown drawing fields", () => {
    const text = envelope([{ ...drawing, executable: "untrusted" }, front]);
    expect(parseDrawingsClipboard(text)).toEqual([drawing, front]);
    expect(
      parseDrawingsClipboard(
        JSON.stringify({
          type: "automorphic.chart-drawings",
          version: 1,
          drawings: [drawing, front],
          padding: "x".repeat(256 * 1024),
        }),
      ),
    ).toBeNull();
    expect(
      serializeDrawingsClipboard([drawing, { ...front, text: "x".repeat(256 * 1024) }]),
    ).toBeNull();
    for (const invalid of [
      "ordinary text",
      "[]",
      "null",
      "{}",
      JSON.stringify({
        type: "automorphic.chart-drawings",
        version: 2,
        drawings: [drawing, front],
      }),
    ])
      expect(parseDrawingsClipboard(invalid)).toBeNull();
  });
});
