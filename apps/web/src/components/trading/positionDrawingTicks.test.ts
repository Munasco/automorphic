import { describe, expect, it } from "vite-plus/test";
import { positionAnchorsAtTicks, positionDrawingTicks } from "./positionDrawingTicks";
import type { ChartDrawing } from "./drawingGeometry";
import type { Time } from "lightweight-charts";

const position = (kind: "long-position" | "short-position", entry = 100): ChartDrawing => {
  const direction = kind === "long-position" ? 1 : -1;
  return {
    id: "position",
    kind,
    color: "#123456",
    width: 2,
    anchors: [
      { time: 100 as Time, price: entry },
      { time: 300 as Time, price: entry + direction * 2 },
      { time: 300 as Time, price: entry - direction },
    ],
  };
};

describe.each(["long-position", "short-position"] as const)("%s tick coordinates", (kind) => {
  const direction = kind === "long-position" ? 1 : -1;
  it("derives target and stop distances without rounding away fractional legacy ticks", () => {
    const drawing = position(kind);
    expect(positionDrawingTicks(drawing, 1, 0.25)).toBe(8);
    expect(positionDrawingTicks(drawing, 2, 0.25)).toBe(4);
    drawing.anchors[1]!.price = 100 + direction * 0.375;
    expect(positionDrawingTicks(drawing, 1, 0.25)).toBe(1.5);
  });

  it("cleans cancellation noise in decimal tick counts while retaining genuine fractional legacy distances", () => {
    const drawing = position(kind, 100.1);
    drawing.anchors[1]!.price = kind === "long-position" ? 103.1 : 97.1;
    expect(positionDrawingTicks(drawing, 1, 0.1)).toBe(30);
    drawing.anchors[1]!.price = kind === "long-position" ? 103.15 : 97.05;
    expect(positionDrawingTicks(drawing, 1, 0.1)).toBeCloseTo(30.5, 10);
    const large = position(kind, 1e15);
    large.anchors[1]!.price = 1e15 + direction * 0.5;
    expect(positionDrawingTicks(large, 1, 1)).toBe(0.5);
  });

  it.each([
    { tickSize: 0.25, ticks: 7, entry: 100, distance: 1.75 },
    { tickSize: 0.1, ticks: 3, entry: 0.2, distance: 0.3 },
    { tickSize: 0.00001, ticks: 7, entry: 1.23456, distance: 0.00007 },
    { tickSize: 1e-8, ticks: 3, entry: 1e-7, distance: 3e-8 },
    { tickSize: 0.25, ticks: 4, entry: -5, distance: 1 },
    { tickSize: 0.25, ticks: 4, entry: 0, distance: 1 },
  ])(
    "edits whole ticks relative to entry for tick size $tickSize at $entry",
    ({ tickSize, ticks, entry, distance }) => {
      const drawing = position(kind, entry);
      const before = structuredClone(drawing);
      for (const endpoint of [1, 2] as const) {
        const result = positionAnchorsAtTicks(drawing, endpoint, ticks, tickSize)!;
        expect(result).not.toBeNull();
        const expected = entry + direction * (endpoint === 1 ? 1 : -1) * distance;
        expect(result[endpoint]!.price).toBeCloseTo(expected, 12);
        expect(result.map(({ time }) => time)).toEqual([100, 300, 300]);
        expect(result[0]).toEqual(drawing.anchors[0]);
        expect(result[endpoint === 1 ? 2 : 1]).toEqual(drawing.anchors[endpoint === 1 ? 2 : 1]);
        expect(
          positionDrawingTicks({ ...drawing, anchors: result }, endpoint, tickSize),
        ).toBeCloseTo(ticks, 9);
      }
      expect(drawing).toEqual(before);
    },
  );

  it("cleans binary decimal artifacts without changing an off-grid entry or requested offset", () => {
    const decimal = position(kind, 0.2);
    expect(positionAnchorsAtTicks(decimal, 1, 3, 0.1)![1]!.price).toBe(
      kind === "long-position" ? 0.5 : -0.1,
    );
    const legacy = position(kind, 100.125);
    const result = positionAnchorsAtTicks(legacy, 2, 3, 0.25)!;
    expect(result[0]!.price).toBe(100.125);
    expect(result[2]!.price).toBe(100.125 - direction * 0.75);
    expect(positionDrawingTicks({ ...legacy, anchors: result }, 2, 0.25)).toBe(3);
  });

  it("rejects malformed positions, nonpositive ticks, fractional edits and unsafe arithmetic", () => {
    const drawing = position(kind);
    for (const ticks of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(positionAnchorsAtTicks(drawing, 1, ticks, 0.25)).toBeNull();
    for (const tickSize of [0, -1, NaN, Infinity]) {
      expect(positionDrawingTicks(drawing, 1, tickSize)).toBeNull();
      expect(positionAnchorsAtTicks(drawing, 1, 1, tickSize)).toBeNull();
    }
    for (const invalid of [
      { ...drawing, kind: "trend" as const },
      { ...drawing, anchors: drawing.anchors.slice(0, 2) },
      {
        ...drawing,
        anchors: drawing.anchors.map((anchor, i) => (i === 1 ? { ...anchor, price: 100 } : anchor)),
      },
      {
        ...drawing,
        anchors: drawing.anchors.map((anchor, i) =>
          i === 2 ? { ...anchor, time: NaN as Time } : anchor,
        ),
      },
    ]) {
      expect(positionDrawingTicks(invalid, 1, 0.25)).toBeNull();
      expect(positionAnchorsAtTicks(invalid, 1, 1, 0.25)).toBeNull();
    }
    expect(positionDrawingTicks(drawing, 1, Number.MIN_VALUE)).toBeNull();
    expect(positionAnchorsAtTicks(drawing, 1, 1, Number.MIN_VALUE)).toBeNull();
    expect(positionAnchorsAtTicks(drawing, 1, 2, Number.MAX_VALUE)).toBeNull();
    expect(
      positionAnchorsAtTicks(drawing, kind === "long-position" ? 1 : 2, Number.MAX_SAFE_INTEGER, 1),
    ).toBeNull();
    expect(positionDrawingTicks(drawing, 0 as 1, 0.25)).toBeNull();
    expect(positionAnchorsAtTicks(drawing, 0 as 1, 1, 0.25)).toBeNull();
  });
});
