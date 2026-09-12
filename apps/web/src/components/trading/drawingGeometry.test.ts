import { describe, expect, it } from "vite-plus/test";
import { calculateChartRegression } from "./chartRegression";
import type { Time } from "lightweight-charts";
import {
  buildDrawingGeometry,
  hitDrawingGeometry,
  hitDrawingHandle,
  validDrawingAnchors,
  DRAWING_ANCHORS,
  defaultDrawingLevels,
  defaultRegressionDrawingSettings,
  maximumDrawingAnchors,
  sanitizeDrawingSettings,
  parseChartDrawings,
  type ChartDrawing,
  type DrawingKind,
} from "./drawingGeometry";

function drawing(kind: DrawingKind, anchors: Array<[number, number]>): ChartDrawing {
  return {
    id: "shape",
    kind,
    anchors: anchors.map(([time, price]) => ({ time: time as Time, price })),
    color: "#729bff",
    width: 2,
  };
}
const geometry = (shape: ChartDrawing) =>
  buildDrawingGeometry(
    shape,
    ({ time, price }) => ({ x: Number(time), y: 500 - price }),
    (price) => 500 - price,
    1000,
    500,
  );

describe("native drawing geometry", () => {
  it("extends lines independently toward earlier/later time while retaining original drag handles", () => {
    const line = drawing("trend", [
      [100, 400],
      [300, 300],
    ]);
    const left = geometry({ ...line, extendLeft: true });
    expect(left.lines[0]).toEqual({ from: { x: 0, y: 50 }, to: { x: 300, y: 200 } });
    expect(left.handles).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 200 },
    ]);
    expect(hitDrawingGeometry(left, { x: 20, y: 60 })).toBe(true);
    const right = geometry({ ...line, extendRight: true });
    expect(right.lines[0]?.to).toEqual({ x: 900, y: 500 });
    const reversed = geometry({ ...line, anchors: line.anchors.toReversed(), extendLeft: true });
    expect(reversed.lines[0]).toEqual({ from: { x: 300, y: 200 }, to: { x: 0, y: 50 } });
    const ray = geometry({ ...line, kind: "ray", extendLeft: false, extendRight: false });
    expect(ray.lines[0]).toEqual({ from: { x: 100, y: 100 }, to: { x: 300, y: 200 } });
  });

  it("adds independent arrow endpoints and can return arrow tools to normal endpoints", () => {
    const line = drawing("trend", [
      [100, 400],
      [300, 400],
    ]);
    const arrows = geometry({
      ...line,
      startMarker: "arrow",
      endMarker: "arrow",
      extendRight: true,
    });
    expect(arrows.polygons?.map((polygon) => polygon.points[0])).toEqual([
      { x: 100, y: 100 },
      { x: 1000, y: 100 },
    ]);
    expect(arrows.handles).toHaveLength(2);
    expect(geometry({ ...line, kind: "arrow", endMarker: "normal" }).polygons).toBeUndefined();
    const channel = geometry({
      ...drawing("channel", [
        [100, 400],
        [300, 300],
        [200, 300],
      ]),
      extendLeft: true,
    });
    expect(channel.lines.map((part) => part.from.x)).toEqual([0, 0, 0]);
  });

  it("places multiline text relative to line anchors and hit-tests its chosen size/alignment", () => {
    const shape = geometry({
      ...drawing("trend", [
        [100, 400],
        [300, 300],
      ]),
      text: "Breakout\nwatch",
      textFontSize: 20,
      textPosition: "below",
      textAlignment: "right",
    });
    expect(shape.text).toEqual({
      point: { x: 300 - 6 / Math.sqrt(5), y: 200 + 12 / Math.sqrt(5) },
      angle: Math.atan2(100, 200),
      value: "Breakout\nwatch",
      fontSize: 20,
      align: "right",
      baseline: "top",
    });
    expect(hitDrawingGeometry(shape, { x: 250, y: 240 })).toBe(true);
    expect(hitDrawingGeometry(shape, { x: 350, y: 240 })).toBe(false);
    expect(
      geometry({ ...drawing("horizontal", [[100, 400]]), text: "Support", textAlignment: "center" })
        .text?.point,
    ).toEqual({ x: 500, y: 94 });
  });

  it("persists line and text settings without retaining malformed style options", () => {
    const settings = {
      extendLeft: false,
      extendRight: true,
      showPriceLabel: true,
      startMarker: "arrow",
      endMarker: "normal",
      text: "Supply",
      textColor: "#aabbcc",
      textFontSize: 20,
      textBold: true,
      textItalic: false,
      textPosition: "above",
      textAlignment: "center",
    } as const;
    const line = {
      ...drawing("trend", [
        [100, 400],
        [300, 300],
      ]),
      ...settings,
    };
    expect(parseChartDrawings(JSON.stringify([line]))).toEqual([line]);
    expect(
      sanitizeDrawingSettings({
        extendLeft: "yes",
        showPriceLabel: 1,
        startMarker: "triangle",
        endMarker: "arrow",
        textColor: "red",
        textFontSize: Infinity,
        textPosition: "bad",
        textAlignment: "bad",
        textBold: "true",
        textItalic: true,
      }),
    ).toEqual({ endMarker: "arrow", textItalic: true });
    expect(sanitizeDrawingSettings({ text: "x".repeat(200), textFontSize: 7 }).text).toHaveLength(
      140,
    );
  });

  it("renders freehand, highlighter, polyline and arrow-ended paths with editable anchor indices", () => {
    const points: Array<[number, number]> = [
      [100, 400],
      [150, 350],
      [200, 400],
    ];
    const brush = geometry(drawing("brush", points));
    expect(brush.lines).toHaveLength(2);
    expect(hitDrawingGeometry(brush, { x: 150, y: 150 })).toBe(true);
    expect(hitDrawingHandle(brush, { x: 150, y: 150 })).toBe(-1);
    expect(hitDrawingHandle(brush, { x: 200, y: 100 })).toBe(2);
    expect(hitDrawingHandle(geometry(drawing("polyline", points)), { x: 150, y: 150 })).toBe(1);
    const highlight = geometry(
      drawing("highlighter", [
        [100, 400],
        [200, 400],
      ]),
    );
    expect(highlight.strokeWidth).toBe(16);
    expect(highlight.opacity).toBe(0.25);
    expect(hitDrawingGeometry(highlight, { x: 150, y: 110 })).toBe(true);
    expect(hitDrawingGeometry(highlight, { x: 150, y: 130 })).toBe(false);
    expect(geometry(drawing("path", points)).polygons?.[0]?.points[0]).toEqual({ x: 200, y: 100 });
    expect(geometry(drawing("polyline", points)).polygons).toBeUndefined();
  });

  it("distinguishes thin arrows, filled arrow markers and one-click directional arrows", () => {
    const anchors: Array<[number, number]> = [
      [100, 400],
      [200, 400],
    ];
    const arrow = geometry(drawing("arrow", anchors));
    const marker = geometry(drawing("arrow-marker", anchors));
    expect(arrow.lines[0]).toEqual({ from: { x: 100, y: 100 }, to: { x: 200, y: 100 } });
    expect(arrow.polygons?.[0]?.points).toHaveLength(3);
    expect(marker.polygons?.[0]?.points).toHaveLength(7);
    expect(hitDrawingGeometry(marker, { x: 150, y: 100 })).toBe(true);
    const up = geometry(drawing("arrow-up", [[100, 400]]));
    const down = geometry(drawing("arrow-down", [[100, 400]]));
    expect(Math.min(...up.polygons![0]!.points.map((point) => point.y))).toBe(100);
    expect(Math.max(...down.polygons![0]!.points.map((point) => point.y))).toBe(100);
    expect(up.handles).toEqual([{ x: 100, y: 100 }]);
  });

  it("constructs screen-space circles and ellipses and permits a same-time circle radius", () => {
    const circle = drawing("circle", [
      [100, 400],
      [100, 350],
    ]);
    expect(validDrawingAnchors("circle", circle.anchors)).toBe(true);
    const round = geometry(circle);
    const vertices = round.polygons![0]!.points;
    expect(Math.min(...vertices.map((point) => point.x))).toBe(50);
    expect(Math.max(...vertices.map((point) => point.y))).toBe(150);
    expect(hitDrawingGeometry(round, { x: 125, y: 100 })).toBe(true);
    expect(hitDrawingGeometry(round, { x: 175, y: 100 })).toBe(false);
    const oval = geometry(
      drawing("ellipse", [
        [300, 300],
        [100, 400],
      ]),
    ).polygons![0]!.points;
    expect(Math.min(...oval.map((point) => point.x))).toBe(100);
    expect(Math.max(...oval.map((point) => point.x))).toBe(300);
    expect(Math.min(...oval.map((point) => point.y))).toBe(100);
    expect(Math.max(...oval.map((point) => point.y))).toBe(200);
  });

  it("uses a perpendicular width for rotated rectangles and closes triangles", () => {
    const rectangle = geometry(
      drawing("rotated-rectangle", [
        [100, 400],
        [200, 300],
        [50, 350],
      ]),
    );
    const vertices = rectangle.polygons![0]!.points;
    expect(vertices).toHaveLength(4);
    expect(vertices[2]!.x).toBeCloseTo(150);
    expect(vertices[2]!.y).toBeCloseTo(250);
    expect(vertices[3]!.x).toBeCloseTo(50);
    expect(vertices[3]!.y).toBeCloseTo(150);
    expect(rectangle.handles).toHaveLength(3);
    const triangle = geometry(
      drawing("triangle", [
        [100, 400],
        [200, 400],
        [150, 300],
      ]),
    );
    expect(triangle.lines).toHaveLength(3);
    expect(hitDrawingGeometry(triangle, { x: 150, y: 130 })).toBe(true);
    expect(hitDrawingGeometry(triangle, { x: 250, y: 130 })).toBe(false);
  });

  it("samples quadratic and cubic Bezier curves from their actual control points", () => {
    const quadratic = geometry(
      drawing("curve", [
        [100, 400],
        [200, 300],
        [300, 400],
      ]),
    );
    expect(quadratic.lines[31]!.to).toEqual({ x: 200, y: 150 });
    expect(hitDrawingGeometry(quadratic, { x: 200, y: 150 })).toBe(true);
    expect(hitDrawingGeometry(quadratic, { x: 200, y: 100 })).toBe(false);
    const cubic = geometry(
      drawing("double-curve", [
        [100, 400],
        [200, 300],
        [300, 500],
        [400, 400],
      ]),
    );
    expect(cubic.lines[15]!.to).toEqual({ x: 175, y: 128.125 });
    expect(cubic.lines[31]!.to).toEqual({ x: 250, y: 100 });
    expect(cubic.lines.at(-1)!.to).toEqual({ x: 400, y: 100 });
    expect(cubic.handles).toHaveLength(4);
  });

  it("draws a circular arc through all three anchors and handles collinear input without infinities", () => {
    for (const points of [
      [
        [100, 400],
        [150, 350],
        [200, 400],
      ],
      [
        [200, 400],
        [150, 350],
        [100, 400],
      ],
    ] as Array<Array<[number, number]>>) {
      const arc = geometry(drawing("arc", points));
      expect(hitDrawingGeometry(arc, { x: 150, y: 150 }, 1)).toBe(true);
      for (const line of arc.lines)
        expect(Math.hypot(line.to.x - 150, line.to.y - 100)).toBeCloseTo(50);
      expect(hitDrawingGeometry(arc, { x: 150, y: 50 })).toBe(false);
    }
    const flat = geometry(
      drawing("arc", [
        [100, 400],
        [150, 400],
        [200, 400],
      ]),
    );
    expect(flat.lines).toHaveLength(2);
    expect(flat.lines.at(-1)!.to).toEqual({ x: 200, y: 100 });
  });

  it("round-trips every added tool and rejects corrupt, degenerate and oversized saved shapes", () => {
    const anchors: Array<[number, number]> = [
      [100, 400],
      [200, 300],
      [300, 450],
      [400, 400],
    ];
    const kinds: DrawingKind[] = [
      "brush",
      "highlighter",
      "arrow-marker",
      "arrow",
      "arrow-up",
      "arrow-down",
      "rotated-rectangle",
      "path",
      "circle",
      "ellipse",
      "polyline",
      "triangle",
      "arc",
      "curve",
      "double-curve",
    ];
    const shapes = kinds.map((kind) => drawing(kind, anchors.slice(0, DRAWING_ANCHORS[kind])));
    expect(parseChartDrawings(JSON.stringify(shapes))).toEqual(shapes);
    const long = drawing(
      "brush",
      Array.from({ length: maximumDrawingAnchors("brush") }, (_, i) => [100 + i, 400]),
    );
    expect(parseChartDrawings(JSON.stringify([long]))).toEqual([long]);
    const invalid = [
      { ...long, anchors: [...long.anchors, long.anchors[0]] },
      drawing("path", [[100, 400]]),
      drawing("circle", [
        [100, 400],
        [100, 400],
      ]),
      drawing("ellipse", [
        [100, 400],
        [100, 300],
      ]),
      drawing("triangle", [
        [100, 400],
        [200, 400],
        [300, 400],
      ]),
      {
        ...shapes[0],
        anchors: [
          { time: "bad", price: 1 },
          { time: 2, price: 3 },
        ],
      },
    ];
    expect(parseChartDrawings(JSON.stringify(invalid))).toEqual([]);
  });

  it("extends rays in the anchor direction and horizontal rays from their starting point", () => {
    expect(
      geometry(
        drawing("ray", [
          [100, 400],
          [200, 350],
        ]),
      ).lines,
    ).toEqual([{ from: { x: 100, y: 100 }, to: { x: 900, y: 500 } }]);
    expect(
      geometry(
        drawing("ray", [
          [200, 350],
          [100, 400],
        ]),
      ).lines[0]?.to,
    ).toEqual({ x: 0, y: 50 });
    expect(geometry(drawing("horizontal-ray", [[100, 400]])).lines[0]).toEqual({
      from: { x: 100, y: 100 },
      to: { x: 1000, y: 100 },
    });
    expect(geometry(drawing("vertical", [[100, 400]])).lines[0]).toEqual({
      from: { x: 100, y: 0 },
      to: { x: 100, y: 500 },
    });
  });
  it("normalizes backwards rectangle anchors and hit-tests edges without selecting unrelated space", () => {
    const box = geometry(
      drawing("rectangle", [
        [300, 200],
        [100, 400],
      ]),
    );
    expect(box.rectangle).toEqual({ x: 100, y: 100, width: 200, height: 200 });
    expect(box.lines).toHaveLength(4);
    expect(hitDrawingGeometry(box, { x: 200, y: 103 })).toBe(true);
    expect(hitDrawingGeometry(box, { x: 500, y: 103 })).toBe(false);
  });
  it("derives retracements from prices, including reversal of anchor direction", () => {
    const fib = geometry(
      drawing("fib", [
        [100, 100],
        [300, 200],
      ]),
    );
    expect(fib.lines).toHaveLength(7);
    expect(fib.lines.find((line) => line.label === "61.8%")?.from.y).toBeCloseTo(361.8);
    expect(fib.lines[0]?.from.y).toBe(300);
    expect(fib.lines.at(-1)?.from.y).toBe(400);
    const reverse = geometry(
      drawing("fib", [
        [300, 200],
        [100, 100],
      ]),
    );
    expect(reverse.lines[0]?.from.y).toBe(400);
  });
  it("uses the third channel anchor to create parallel bounds and a midpoint", () => {
    const channel = geometry(
      drawing("channel", [
        [100, 400],
        [300, 300],
        [200, 300],
      ]),
    );
    expect(channel.lines).toEqual([
      { from: { x: 100, y: 100 }, to: { x: 300, y: 200 } },
      { from: { x: 100, y: 150 }, to: { x: 300, y: 250 } },
      { from: { x: 100, y: 125 }, to: { x: 300, y: 225 } },
    ]);
    expect(hitDrawingGeometry(channel, { x: 200, y: 200 })).toBe(true);
  });
  it("restores all new drawing kinds, migrates legacy records, and rejects corrupt anchors", () => {
    const shapes = [
      drawing("ray", [
        [100, 1],
        [200, 2],
      ]),
      drawing("vertical", [[100, 1]]),
      drawing("rectangle", [
        [100, 1],
        [200, 2],
      ]),
      drawing("fib", [
        [100, 1],
        [200, 2],
      ]),
      drawing("channel", [
        [100, 1],
        [200, 2],
        [150, 5],
      ]),
      { ...drawing("text", [[100, 1]]), text: "Entry" },
    ];
    expect(parseChartDrawings(JSON.stringify(shapes))).toEqual(shapes);
    const records = parseChartDrawings(
      JSON.stringify([
        { kind: "horizontal", price: 100 },
        { kind: "trend", from: { time: 1, price: 1 }, to: { time: 2, price: 2 } },
        { kind: "channel", anchors: [{ time: 1, price: 1 }] },
        {
          ...shapes[0],
          anchors: [
            { time: "bad", price: 1 },
            { time: 2, price: 2 },
          ],
        },
      ]),
    );
    expect(records.map((item) => item.kind)).toEqual(["horizontal", "trend"]);
  });
  it("uses text bounds for selection and suppresses drawings without projected anchors", () => {
    const text = geometry({ ...drawing("text", [[100, 400]]), text: "Entry" });
    expect(hitDrawingGeometry(text, { x: 130, y: 92 })).toBe(true);
    expect(hitDrawingGeometry(text, { x: 300, y: 92 })).toBe(false);
    expect(
      buildDrawingGeometry(
        drawing("ray", [
          [1, 2],
          [2, 3],
        ]),
        () => null,
        () => 10,
        500,
        500,
      ).lines,
    ).toEqual([]);
  });
});

describe("additional line tools", () => {
  it("extends both directions by default, honors overrides and keeps original handles", () => {
    const line = drawing("extended-line", [
      [100, 400],
      [300, 300],
    ]);
    const extended = geometry(line);
    expect(extended.lines).toEqual([{ from: { x: 0, y: 50 }, to: { x: 900, y: 500 } }]);
    expect(extended.handles).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 200 },
    ]);
    expect(hitDrawingGeometry(extended, { x: 800, y: 450 })).toBe(true);
    expect(hitDrawingHandle(extended, { x: 300, y: 200 })).toBe(1);
    expect(geometry({ ...line, extendLeft: false }).lines[0]?.from).toEqual({ x: 100, y: 100 });
    expect(geometry({ ...line, extendRight: false }).lines[0]?.to).toEqual({ x: 300, y: 200 });
    expect(geometry({ ...line, anchors: line.anchors.toReversed() }).lines).toEqual([
      { from: { x: 900, y: 500 }, to: { x: 0, y: 50 } },
    ]);
    const vertical = geometry(
      drawing("extended-line", [
        [100, 400],
        [100, 300],
      ]),
    );
    expect(vertical.lines).toEqual([{ from: { x: 100, y: 0 }, to: { x: 100, y: 500 } }]);
  });

  it("draws a one-anchor crossline across both axes and hit-tests either arm", () => {
    const cross = geometry(drawing("crossline", [[200, 300]]));
    expect(cross.lines).toEqual([
      { from: { x: 0, y: 200 }, to: { x: 1000, y: 200 } },
      { from: { x: 200, y: 0 }, to: { x: 200, y: 500 } },
    ]);
    expect(cross.handles).toEqual([{ x: 200, y: 200 }]);
    expect(hitDrawingGeometry(cross, { x: 950, y: 200 })).toBe(true);
    expect(hitDrawingGeometry(cross, { x: 200, y: 490 })).toBe(true);
    expect(hitDrawingGeometry(cross, { x: 250, y: 250 })).toBe(false);
  });

  it("builds a signed angle arc from projected points without replacing custom text", () => {
    const shape = drawing("trend-angle", [
      [100, 300],
      [200, 400],
    ]);
    const angle = geometry({ ...shape, text: "Momentum", endMarker: "arrow" });
    expect(angle.lines.find((line) => line.label)?.label).toBe("45°");
    expect(angle.text?.value).toBe("Momentum");
    expect(angle.polygons?.[0]?.points[0]).toEqual({ x: 200, y: 100 });
    expect(angle.handles).toHaveLength(2);
    const arcPoint = { x: 100 + 36 * Math.cos(Math.PI / 8), y: 200 - 36 * Math.sin(Math.PI / 8) };
    expect(hitDrawingGeometry(angle, arcPoint, 1)).toBe(true);
    const rescaled = buildDrawingGeometry(
      shape,
      ({ time, price }) => ({ x: Number(time), y: (500 - price) * 2 }),
      (price) => (500 - price) * 2,
      1000,
      1000,
    );
    expect(rescaled.lines.find((line) => line.label)?.label).toBe("63.43°");
    const down = geometry(
      drawing("trend-angle", [
        [100, 400],
        [200, 300],
      ]),
    );
    expect(down.lines.find((line) => line.label)?.label).toBe("-45°");
    const vertical = geometry(
      drawing("trend-angle", [
        [100, 300],
        [100, 400],
      ]),
    );
    expect(vertical.lines.find((line) => line.label)?.label).toBe("90°");
  });

  it("validates and round-trips new kinds and their existing settings", () => {
    const kinds: DrawingKind[] = ["info-line", "extended-line", "trend-angle", "crossline"];
    for (const kind of kinds) {
      const shape = {
        ...drawing(
          kind,
          [
            [100, 400],
            [200, 300],
          ].slice(0, DRAWING_ANCHORS[kind]) as Array<[number, number]>,
        ),
        extendLeft: false,
        showPriceLabel: true,
        text: "Note",
        textBold: true,
      };
      expect(validDrawingAnchors(kind, shape.anchors)).toBe(true);
      expect(parseChartDrawings(JSON.stringify([shape]))).toEqual([shape]);
      expect(validDrawingAnchors(kind, [])).toBe(false);
      expect(
        parseChartDrawings(
          JSON.stringify([{ ...shape, anchors: [...shape.anchors, shape.anchors[0]] }]),
        ),
      ).toEqual([]);
      if (kind !== "crossline") {
        expect(validDrawingAnchors(kind, [shape.anchors[0]!, shape.anchors[0]!])).toBe(false);
        expect(
          validDrawingAnchors(kind, [
            { time: 100 as Time, price: 400 },
            { time: 100 as Time, price: 300 },
          ]),
        ).toBe(true);
      }
    }
    const info = geometry({
      ...drawing("info-line", [
        [100, 400],
        [200, 300],
      ]),
      extendRight: true,
      endMarker: "arrow",
    });
    expect(info.lines[0]?.to).toEqual({ x: 500, y: 500 });
    expect(info.polygons?.[0]?.points[0]).toEqual({ x: 500, y: 500 });
  });
});

describe("configurable Fibonacci and pitchfork geometry", () => {
  const pivots: Array<[number, number]> = [
    [100, 100],
    [300, 300],
    [500, 200],
  ];
  const levels = (values: number[]) => values.map((value) => ({ value, visible: true }));

  it("projects a measured move from the retracement, reverses it and keeps all three handles", () => {
    const extension = {
      ...drawing("fib-extension", pivots),
      levels: levels([0, 0.618, 1]),
      showTrendLine: false,
      showPrices: false,
      levelLabelFormat: "percent" as const,
      extendRight: true,
    };
    const shape = geometry(extension);
    expect(
      shape.lines.map((line) => [Number(line.from.y.toFixed(4)), line.to.x, line.label]),
    ).toEqual([
      [300, 1000, "0%"],
      [176.4, 1000, "61.8%"],
      [100, 1000, "100%"],
    ]);
    expect(shape.handles).toEqual([
      { x: 100, y: 400 },
      { x: 300, y: 200 },
      { x: 500, y: 300 },
    ]);
    expect(hitDrawingHandle(shape, { x: 500, y: 300 })).toBe(2);
    expect(hitDrawingGeometry(shape, { x: 900, y: 100 })).toBe(true);
    const reversed = geometry({ ...extension, reverse: true, levels: levels([0.5]) });
    expect(reversed.lines[0]?.from.y).toBe(400);
    expect(geometry({ ...extension, extendRight: false }).lines[0]?.to.x).toBe(500);
    expect(geometry({ ...extension, extendRight: false }).lines[0]?.from.x).toBe(300);
    expect(geometry({ ...extension, extendLeft: true }).lines[0]?.from.x).toBe(0);
    const down = geometry({
      ...drawing("fib-extension", [
        [100, 300],
        [300, 100],
        [500, 200],
      ]),
      levels: levels([1]),
      showTrendLine: false,
    });
    expect(down.lines[0]?.from.y).toBe(500);
  });

  it("builds channel ratios as parallel offsets and passes the 100% line through the third point", () => {
    const channel = {
      ...drawing("fib-channel", [
        [100, 100],
        [300, 200],
        [200, 300],
      ]),
      levels: levels([0, 0.5, 1]),
      extendRight: false,
    };
    const shape = geometry(channel);
    expect(shape.lines.map((line) => [line.from.y, line.to.y])).toEqual([
      [400, 300],
      [300, 200],
      [200, 100],
    ]);
    expect(hitDrawingGeometry(shape, { x: 200, y: 200 }, 1)).toBe(true);
    expect(
      shape.lines.map((line) => (line.to.y - line.from.y) / (line.to.x - line.from.x)),
    ).toEqual([-0.5, -0.5, -0.5]);
    const mirrored = geometry({ ...channel, reverse: true, levels: levels([0.5]) });
    expect(mirrored.lines[0]?.from.y).toBe(500);
  });

  it.each([
    ["pitchfork", { x: 100, y: 400 }, { x: 400, y: 250 }],
    ["schiff-pitchfork", { x: 100, y: 300 }, { x: 400, y: 250 }],
    ["modified-schiff-pitchfork", { x: 200, y: 300 }, { x: 400, y: 250 }],
    ["inside-pitchfork", { x: 400, y: 250 }, { x: 700, y: 250 }],
  ] as const)("constructs the documented %s median and parallel outer rails", (kind, from, to) => {
    const shape = geometry({
      ...drawing(kind, pivots),
      levels: levels([1]),
      showLevels: true,
      extendRight: false,
      extendLeft: false,
    });
    const median = shape.lines.find((line) => line.label === "Median")!;
    expect(median.from).toEqual(from);
    expect(median.to).toEqual(to);
    const slope = (to.y - from.y) / (to.x - from.x);
    for (const line of shape.lines.filter((line) => line.label))
      expect((line.to.y - line.from.y) / (line.to.x - line.from.x)).toBeCloseTo(slope);
    expect(shape.lines.find((line) => line.label === "-100%")?.from).toEqual({ x: 300, y: 200 });
    expect(shape.lines.find((line) => line.label === "100%")?.from).toEqual({ x: 500, y: 300 });
    expect(shape.handles).toHaveLength(3);
    const extended = geometry({ ...drawing(kind, pivots), levels: levels([0]), extendLeft: true });
    expect(extended.lines[0]?.from.x).toBeLessThanOrEqual(from.x);
    expect(extended.lines[0]?.to.x).toBeGreaterThan(to.x);
  });

  it("edits existing retracement levels, colors, labels, reverse and background without changing anchors", () => {
    const fib: ChartDrawing = {
      ...drawing("fib", [
        [100, 100],
        [300, 300],
      ]),
      levels: [
        { value: 0, visible: true, color: "#ff0000" },
        { value: 0.25, visible: false },
        { value: 0.5, visible: true, color: "#00ff00" },
      ],
      background: true,
      backgroundOpacity: 0.3,
      showPrices: true,
      levelLabelFormat: "value",
      levelLabelPosition: "center",
      levelLabelAlignment: "middle",
    };
    const shape = geometry(fib);
    expect(shape.lines.map((line) => [line.label, line.color])).toEqual([
      ["0  300", "#ff0000"],
      ["0.5  200", "#00ff00"],
    ]);
    expect(shape.lines[0]?.labelPoint).toEqual({ x: 200, y: 200 });
    expect(shape.lines[0]?.labelBaseline).toBe("middle");
    expect(shape.polygons).toMatchObject([{ opacity: 0.3, color: "#00ff00" }]);
    expect(geometry({ ...fib, reverse: true }).lines[0]?.from.y).toBe(400);
    expect(
      geometry({ ...fib, background: false, showPrices: false, showLevels: false }).lines.every(
        (line) => !line.label,
      ),
    ).toBe(true);
    expect(geometry({ ...fib, levels: [] }).lines).toEqual([]);
    expect(shape.handles).toEqual([
      { x: 100, y: 400 },
      { x: 300, y: 200 },
    ]);
    const unified = geometry({ ...fib, useOneColor: true });
    expect(unified.lines.every((line) => line.color === fib.color)).toBe(true);
    expect(unified.polygons?.every((polygon) => polygon.color === fib.color)).toBe(true);
    expect(fib.levels?.[0]?.color).toBe("#ff0000");
  });

  it("validates level settings and rejects geometrically degenerate persisted projections", () => {
    const settings = sanitizeDrawingSettings({
      levels: [
        { value: 0.618, visible: false, color: "#ff00ff" },
        { value: NaN },
        { value: 101 },
        { value: 1, color: "url(bad)" },
      ],
      backgroundOpacity: 1.1,
      reverse: true,
      showPrices: false,
      levelLabelFormat: "value",
      levelLabelPosition: "left",
    });
    expect(settings).toEqual({
      levels: [
        { value: 0.618, visible: false, color: "#ff00ff" },
        { value: 1, visible: true },
      ],
      reverse: true,
      showPrices: false,
      levelLabelFormat: "value",
      levelLabelPosition: "left",
    });
    expect(
      sanitizeDrawingSettings({ levels: Array.from({ length: 100 }, (_, value) => ({ value })) })
        .levels,
    ).toHaveLength(64);
    for (const kind of [
      "fib-extension",
      "fib-channel",
      "pitchfork",
      "schiff-pitchfork",
      "modified-schiff-pitchfork",
      "inside-pitchfork",
    ] as const) {
      const shape = { ...drawing(kind, pivots), ...settings };
      expect(parseChartDrawings(JSON.stringify([shape]))).toEqual([shape]);
      expect(validDrawingAnchors(kind, shape.anchors.slice(0, 2))).toBe(false);
      expect(
        validDrawingAnchors(kind, [shape.anchors[0]!, shape.anchors[0]!, shape.anchors[2]!]),
      ).toBe(false);
      if (kind !== "fib-extension")
        expect(
          validDrawingAnchors(
            kind,
            drawing(kind, [
              [100, 100],
              [200, 200],
              [300, 300],
            ]).anchors,
          ),
        ).toBe(false);
    }
  });
});

describe("pitchfork style settings", () => {
  it("keeps a separate median, expands enabled positive ratios symmetrically and switches geometry in place", () => {
    const fork = drawing("pitchfork", [
      [100, 100],
      [300, 300],
      [500, 200],
    ]);
    const defaults = defaultDrawingLevels("pitchfork");
    expect(defaults).toHaveLength(9);
    expect(defaults.filter((level) => level.visible).map((level) => level.value)).toEqual([0.5, 1]);
    const normal = geometry(fork);
    expect(normal.lines).toHaveLength(7);
    expect(normal.lines.every((line) => !line.label)).toBe(true);
    expect(normal.polygons).toHaveLength(4);
    expect(normal.lines[0]?.color).toBe(fork.color);
    const inside = geometry({ ...fork, pitchforkStyle: "inside", levels: [] });
    expect(inside.lines[0]?.from).toEqual({ x: 400, y: 250 });
    expect(inside.lines[0]?.to).toEqual({ x: 1000, y: 250 });
    expect(inside.lines).toHaveLength(3);
    const both = geometry({ ...fork, extendLines: true, levels: [] });
    expect(both.lines[0]?.from).toEqual({ x: 0, y: 450 });
    const forward = geometry({ ...fork, extendLines: false, levels: [] });
    expect(forward.lines[0]?.from).toEqual({ x: 100, y: 400 });
    expect(sanitizeDrawingSettings({ pitchforkStyle: "inside", extendLines: true })).toEqual({
      pitchforkStyle: "inside",
      extendLines: true,
    });
    expect(sanitizeDrawingSettings({ pitchforkStyle: "unsupported", extendLines: "true" })).toEqual(
      {},
    );
    expect(
      parseChartDrawings(
        JSON.stringify([{ ...fork, pitchforkStyle: "inside", extendLines: true }]),
      )[0],
    ).toMatchObject({ pitchforkStyle: "inside", extendLines: true });
  });
});

describe("three-anchor non-parallel channels", () => {
  it("builds a sloped boundary and a flat opposite boundary over the first two timestamps", () => {
    const flat = drawing("flat-channel", [
      [100, 300],
      [300, 400],
      [900, 100],
    ]);
    const shape = geometry(flat);
    expect(shape.lines).toEqual([
      { from: { x: 100, y: 200 }, to: { x: 300, y: 100 } },
      { from: { x: 100, y: 400 }, to: { x: 300, y: 400 } },
    ]);
    expect(shape.handles).toEqual([
      { x: 100, y: 200 },
      { x: 300, y: 100 },
      { x: 300, y: 400 },
      { x: 100, y: 400 },
    ]);
    expect(shape.polygons?.[0]?.points).toEqual([
      { x: 100, y: 200 },
      { x: 300, y: 100 },
      { x: 300, y: 400 },
      { x: 100, y: 400 },
    ]);
    expect(hitDrawingGeometry(shape, { x: 200, y: 300 })).toBe(true);
    expect(
      geometry({
        ...flat,
        anchors: [flat.anchors[0]!, flat.anchors[1]!, { time: 10 as Time, price: 100 }],
      }).lines,
    ).toEqual(shape.lines);
    const moved = geometry({
      ...flat,
      anchors: [flat.anchors[0]!, flat.anchors[1]!, { time: 900 as Time, price: 150 }],
    });
    expect(moved.handles.slice(2).map((point) => point.y)).toEqual([350, 350]);
  });

  it("reflects the disjoint opposite slope", () => {
    const channel = drawing("disjoint-channel", [
      [100, 250],
      [350, 310],
      [900, 40],
    ]);
    const shape = geometry(channel);
    expect(shape.lines).toEqual([
      { from: { x: 100, y: 250 }, to: { x: 350, y: 190 } },
      { from: { x: 100, y: 400 }, to: { x: 350, y: 460 } },
    ]);
    expect(hitDrawingHandle(shape, { x: 100, y: 400 })).toBe(3);
    expect(geometry(channel).lines).toHaveLength(2);
    const upward = geometry(
      drawing("disjoint-channel", [
        [100, 310],
        [350, 250],
        [900, 100],
      ]),
    );
    expect(upward.lines[1]).toEqual({ from: { x: 100, y: 460 }, to: { x: 350, y: 400 } });
  });

  it("extends each channel boundary, fills the extended region and styles all endpoint markers", () => {
    const channel: ChartDrawing = {
      ...drawing("flat-channel", [
        [100, 300],
        [300, 400],
        [900, 100],
      ]),
      extendLeft: true,
      extendRight: true,
      backgroundColor: "#00ff00",
      backgroundOpacity: 0.3,
      startMarker: "arrow",
      endMarker: "arrow",
    };
    const shape = geometry(channel);
    expect(shape.lines[0]).toEqual({ from: { x: 0, y: 250 }, to: { x: 500, y: 0 } });
    expect(shape.lines[1]).toEqual({ from: { x: 0, y: 400 }, to: { x: 1000, y: 400 } });
    expect(shape.polygons?.[0]).toMatchObject({ color: "#00ff00", opacity: 0.3 });
    expect(shape.polygons?.[0]?.points.map((point) => point.x)).toEqual([0, 1000, 1000, 0]);
    expect(shape.polygons?.slice(1)).toHaveLength(4);
    const noFill = geometry({
      ...channel,
      background: false,
      startMarker: "normal",
      endMarker: "normal",
    });
    expect(noFill.polygons).toBeUndefined();
    expect(hitDrawingGeometry(noFill, { x: 900, y: 300 })).toBe(false);
    const text = geometry({ ...channel, text: "Range", extendLeft: false, extendRight: false });
    expect(text.text?.angle).toBeCloseTo(Math.atan2(-100, 200));
    expect(text.text?.align).toBe("left");
  });

  it("round-trips three anchors and settings while rejecting collapsed time spans or empty ranges", () => {
    for (const kind of ["flat-channel", "disjoint-channel"] as const) {
      const shape = {
        ...drawing(kind, [
          [100, 300],
          [300, 400],
          [900, 100],
        ]),
        backgroundColor: "#00ff00",
        backgroundOpacity: 0.3,
        priceLabelColor: "#ff0000",
        priceLabelFontSize: 16,
        priceLabelBold: true,
        priceLabelItalic: true,
      };
      expect(parseChartDrawings(JSON.stringify([shape]))).toEqual([shape]);
      expect(validDrawingAnchors(kind, shape.anchors)).toBe(true);
      expect(validDrawingAnchors(kind, shape.anchors.slice(0, 2))).toBe(false);
      expect(
        validDrawingAnchors(
          kind,
          drawing(kind, [
            [100, 300],
            [100, 400],
            [900, 100],
          ]).anchors,
        ),
      ).toBe(false);
      expect(
        validDrawingAnchors(
          kind,
          drawing(kind, [
            [100, 300],
            [300, 300],
            [900, 300],
          ]).anchors,
        ),
      ).toBe(false);
    }
    expect(sanitizeDrawingSettings({ backgroundColor: "invalid" })).toEqual({});
    expect(sanitizeDrawingSettings({ backgroundColor: "#00ff00" })).toEqual({
      backgroundColor: "#00ff00",
    });
  });
});

describe("regression drawing geometry", () => {
  const regression = drawing("regression-trend", [
    [100, 9999],
    [300, -9999],
  ]);
  const result = calculateChartRegression([100, 120, 110].map((close) => ({ close })))!;
  const build = (shape: ChartDrawing = regression) =>
    buildDrawingGeometry(
      shape,
      ({ time, price }) => ({ x: Number(time), y: 500 - price }),
      (price) => 500 - price,
      1000,
      500,
      undefined,
      undefined,
      { result, start: 100 as Time, end: 300 as Time },
    );
  it("projects fitted prices independently of clicked prices and maps all six handles onto bar endpoints", () => {
    const shape = build();
    expect(shape.handles).toHaveLength(6);
    expect(shape.handles.slice(0, 2)).toEqual([
      { x: 100, y: 395 },
      { x: 300, y: 385 },
    ]);
    expect(shape.handleAnchorIndices).toEqual([0, 1, 0, 1, 0, 1]);
    expect(shape.lines[0]).toMatchObject({ color: "#f23645", lineStyle: "dashed", width: 1 });
    expect(shape.polygons).toHaveLength(2);
    expect(shape.text?.value).toBe(String(result.pearsonR));
    expect(shape.text?.point.x).toBe(100);
    expect(
      build({ ...regression, anchors: regression.anchors.toReversed() }).handleAnchorIndices,
    ).toEqual([1, 0, 1, 0, 1, 0]);
    expect(geometry(regression)).toEqual({
      lines: [],
      handles: [],
      handleAnchorIndices: [],
      polygons: [],
    });
  });
  it("extends right only and respects independent styles, visibility, and the Pearson toggle", () => {
    const defaults = defaultRegressionDrawingSettings();
    const shape = build({
      ...regression,
      extendLines: true,
      regressionShowPearson: false,
      regressionUpperLine: { ...defaults.regressionUpperLine, visible: false },
      regressionBaseLine: {
        ...defaults.regressionBaseLine,
        color: "#00ff00",
        width: 4,
        lineStyle: "dotted",
      },
    });
    expect(shape.lines).toHaveLength(2);
    expect(shape.lines[0]).toMatchObject({
      from: { x: 100, y: 395 },
      to: { x: 1000, y: 350 },
      color: "#00ff00",
      width: 4,
      lineStyle: "dotted",
    });
    expect(shape.handles).toHaveLength(4);
    expect(shape.polygons).toHaveLength(1);
    expect(shape.text).toBeUndefined();
  });
  it("uses Up fill above Base and Base fill below, preserving opaque boundaries at zero opacity", () => {
    const defaults = defaultRegressionDrawingSettings();
    const shape = build({
      ...regression,
      regressionUpperLine: { ...defaults.regressionUpperLine, color: "#00ff00", opacity: 0.8 },
      regressionBaseLine: { ...defaults.regressionBaseLine, color: "#ff0000", opacity: 0 },
      regressionLowerLine: { ...defaults.regressionLowerLine, color: "#0000ff", opacity: 1 },
    });
    expect(shape.polygons?.map(({ color, opacity }) => ({ color, opacity }))).toEqual([
      { color: "#00ff00", opacity: 0.8 },
      { color: "#ff0000", opacity: 0 },
    ]);
    expect(shape.lines).toHaveLength(3);
    expect(shape.opacity).toBeUndefined();
    expect(
      sanitizeDrawingSettings({
        regressionBaseLine: { ...defaults.regressionBaseLine, opacity: 0 },
      }).regressionBaseLine?.opacity,
    ).toBe(0);
    expect(
      sanitizeDrawingSettings({
        regressionBaseLine: { ...defaults.regressionBaseLine, opacity: Infinity },
      }).regressionBaseLine?.opacity,
    ).toBeUndefined();
    const { opacity: _, ...legacy } = defaults.regressionBaseLine;
    expect(sanitizeDrawingSettings({ regressionBaseLine: legacy }).regressionBaseLine).toEqual(
      legacy,
    );
  });
  it("round-trips typed inputs and styles while rejecting corrupt values and single-bar ranges", () => {
    const shape = {
      ...regression,
      ...defaultRegressionDrawingSettings(),
      regressionSource: "hlcc4" as const,
    };
    expect(parseChartDrawings(JSON.stringify([shape]))).toEqual([shape]);
    expect(defaultRegressionDrawingSettings("trend")).toEqual({});
    expect(
      validDrawingAnchors("regression-trend", [
        { time: 100 as Time, price: 1 },
        { time: 100 as Time, price: 2 },
      ]),
    ).toBe(false);
    expect(
      sanitizeDrawingSettings({
        regressionSource: "bad",
        regressionUpperDeviation: Infinity,
        regressionLowerDeviation: 101,
        regressionBaseLine: { visible: true, color: "bad", width: 1, lineStyle: "solid" },
        regressionUseUpperDeviation: "yes",
      }),
    ).toEqual({});
  });
});
