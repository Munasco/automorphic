import { describe, expect, it } from "vite-plus/test";
import type { DrawingGeometry, DrawingPoint } from "./drawingGeometry";
import { drawingIntersectsRect } from "./drawingSelectionGeometry";

const rect = { x: 40, y: 40, width: 20, height: 20 };
const line = (from: DrawingPoint, to: DrawingPoint): DrawingGeometry => ({
  lines: [{ from, to }],
  handles: [],
});
const geometry = (patch: Partial<DrawingGeometry>): DrawingGeometry => ({
  lines: [],
  handles: [],
  ...patch,
});

describe("drawing rectangle selection", () => {
  it.each([
    [
      { x: -1000, y: 50 },
      { x: 1000, y: 50 },
    ],
    [
      { x: 50, y: -1000 },
      { x: 50, y: 1000 },
    ],
    [
      { x: -100, y: -100 },
      { x: 100, y: 100 },
    ],
    [
      { x: 100, y: 100 },
      { x: -100, y: -100 },
    ],
  ])("intersects a clipped/extended segment with both anchors outside", (a, b) => {
    expect(drawingIntersectsRect(line(a, b), rect)).toBe(true);
  });

  it("does not select diagonals merely because their anchor bounding box overlaps", () => {
    expect(
      drawingIntersectsRect(line({ x: 0, y: 0 }, { x: 100, y: 100 }), {
        x: 10,
        y: 80,
        width: 10,
        height: 10,
      }),
    ).toBe(false);
    expect(drawingIntersectsRect(line({ x: 0, y: 30 }, { x: 30, y: 0 }), rect)).toBe(false);
    expect(drawingIntersectsRect(line({ x: 0, y: 50 }, { x: 39, y: 50 }), rect)).toBe(false);
  });

  it("includes actual round stroke width without treating an expanded corner box as filled", () => {
    const thick = { ...line({ x: 10, y: 37 }, { x: 90, y: 37 }), strokeWidth: 6 };
    expect(drawingIntersectsRect(thick, rect)).toBe(true);
    expect(drawingIntersectsRect({ ...thick, strokeWidth: 5 }, rect)).toBe(false);
    expect(
      drawingIntersectsRect({ ...line({ x: 38, y: 38 }, { x: 38, y: 38 }), strokeWidth: 4 }, rect),
    ).toBe(false);
    expect(
      drawingIntersectsRect({ ...line({ x: 38, y: 38 }, { x: 38, y: 38 }), strokeWidth: 6 }, rect),
    ).toBe(true);
  });

  it("checks rectangle edges but selects its interior only when filled", () => {
    const outline = geometry({ rectangle: { x: 10, y: 10, width: 80, height: 80 } });
    expect(drawingIntersectsRect(outline, rect)).toBe(false);
    expect(drawingIntersectsRect(outline, { x: 5, y: 40, width: 10, height: 10 })).toBe(true);
    expect(
      drawingIntersectsRect(
        { ...outline, rectangleFill: { color: "#ffffff", opacity: 0.2 } },
        rect,
      ),
    ).toBe(true);
    expect(
      drawingIntersectsRect({ ...outline, rectangleFill: { color: "#ffffff", opacity: 0 } }, rect),
    ).toBe(false);
    expect(
      drawingIntersectsRect(
        { ...outline, opacity: 0, rectangleFill: { color: "#ffffff", opacity: 0.2 } },
        rect,
      ),
    ).toBe(true);
  });

  it("selects filled polygon interiors, contained polygons, and crossing edges", () => {
    const polygon = (points: DrawingPoint[]) => geometry({ polygons: [{ points, opacity: 0.2 }] });
    expect(
      drawingIntersectsRect(
        polygon([
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ]),
        rect,
      ),
    ).toBe(true);
    expect(
      drawingIntersectsRect(
        polygon([
          { x: 45, y: 45 },
          { x: 55, y: 45 },
          { x: 50, y: 55 },
        ]),
        rect,
      ),
    ).toBe(true);
    expect(
      drawingIntersectsRect(
        polygon([
          { x: 0, y: 45 },
          { x: 100, y: 45 },
          { x: 0, y: 55 },
        ]),
        rect,
      ),
    ).toBe(true);
    // The marquee is in the empty notch of this concave polygon's bounding box.
    expect(
      drawingIntersectsRect(
        polygon([
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 20 },
          { x: 20, y: 20 },
          { x: 20, y: 100 },
          { x: 0, y: 100 },
        ]),
        rect,
      ),
    ).toBe(false);
  });

  it("ignores transparent strokes/fills and handles without visible artwork", () => {
    expect(
      drawingIntersectsRect({ ...line({ x: 0, y: 50 }, { x: 100, y: 50 }), opacity: 0 }, rect),
    ).toBe(false);
    expect(
      drawingIntersectsRect(
        geometry({ lines: [{ from: { x: 0, y: 50 }, to: { x: 100, y: 50 }, opacity: 0 }] }),
        rect,
      ),
    ).toBe(false);
    expect(
      drawingIntersectsRect(
        geometry({
          handles: [{ x: 50, y: 50 }],
          polygons: [
            {
              points: [
                { x: 45, y: 45 },
                { x: 55, y: 45 },
                { x: 50, y: 55 },
              ],
              opacity: 0,
            },
          ],
        }),
        rect,
      ),
    ).toBe(false);
  });

  it("hits rotated text rather than its unrotated bounding box", () => {
    const text = geometry({
      text: {
        point: { x: 50, y: 50 },
        value: "abcdef",
        fontSize: 10,
        baseline: "top",
        angle: -Math.PI / 2,
      },
    });
    expect(drawingIntersectsRect(text, { x: 52, y: 20, width: 3, height: 3 })).toBe(true);
    expect(drawingIntersectsRect(text, { x: 70, y: 52, width: 3, height: 3 })).toBe(false);
    expect(
      drawingIntersectsRect({ ...text, opacity: 0 }, { x: 52, y: 20, width: 3, height: 3 }),
    ).toBe(true);
  });

  it("respects text alignment and empty multiline rows", () => {
    const text = geometry({
      text: {
        point: { x: 50, y: 50 },
        value: "abcd\n\nabcd",
        fontSize: 10,
        baseline: "top",
        align: "right",
      },
    });
    expect(drawingIntersectsRect(text, { x: 30, y: 52, width: 3, height: 3 })).toBe(true);
    expect(drawingIntersectsRect(text, { x: 30, y: 65, width: 3, height: 3 })).toBe(false);
    expect(drawingIntersectsRect(text, { x: 30, y: 77, width: 3, height: 3 })).toBe(true);
    expect(drawingIntersectsRect(text, { x: 52, y: 52, width: 3, height: 3 })).toBe(false);
  });

  it("includes detached line and price labels", () => {
    expect(
      drawingIntersectsRect(
        geometry({
          lines: [
            {
              from: { x: 0, y: 0 },
              to: { x: 10, y: 0 },
              label: "Level",
              labelPoint: { x: 42, y: 52 },
            },
          ],
        }),
        rect,
      ),
    ).toBe(true);
    expect(
      drawingIntersectsRect(
        geometry({ priceLabels: [{ point: { x: 50, y: 50 }, value: "123.45", align: "left" }] }),
        rect,
      ),
    ).toBe(true);
  });

  it.each([
    { ...rect, x: NaN },
    { ...rect, y: Infinity },
    { ...rect, width: 0 },
    { ...rect, width: -1 },
    { ...rect, height: -1 },
    { ...rect, height: Infinity },
    { ...rect, x: Number.MAX_VALUE, width: Number.MAX_VALUE },
  ])("rejects invalid or unnormalized selection bounds %j", (invalid) => {
    expect(drawingIntersectsRect(line({ x: 0, y: 50 }, { x: 100, y: 50 }), invalid)).toBe(false);
  });

  it("ignores malformed geometry without masking other valid artwork", () => {
    const malformed = geometry({
      lines: [{ from: { x: Infinity, y: 50 }, to: { x: 50, y: 50 } }],
      polygons: [
        {
          points: [
            { x: NaN, y: 50 },
            { x: 55, y: 55 },
            { x: 45, y: 45 },
          ],
          opacity: 1,
        },
      ],
      text: { point: { x: 50, y: 50 }, value: "text", fontSize: NaN },
    });
    expect(drawingIntersectsRect(malformed, rect)).toBe(false);
    expect(
      drawingIntersectsRect(
        {
          ...malformed,
          lines: [...malformed.lines, ...line({ x: 0, y: 50 }, { x: 100, y: 50 }).lines],
        },
        rect,
      ),
    ).toBe(true);
  });
});
