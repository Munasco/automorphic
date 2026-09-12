import { describe, expect, it } from "vite-plus/test";
import type { Time } from "lightweight-charts";
import {
  buildDrawingGeometry,
  hitDrawingGeometry,
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
