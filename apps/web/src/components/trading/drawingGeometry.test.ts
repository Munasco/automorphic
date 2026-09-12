import { describe, expect, it } from "vite-plus/test";
import type { Time } from "lightweight-charts";
import {
  buildDrawingGeometry,
  hitDrawingGeometry,
  hitDrawingHandle,
  validDrawingAnchors,
  DRAWING_ANCHORS,
  maximumDrawingAnchors,
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
