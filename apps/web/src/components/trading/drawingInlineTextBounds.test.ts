import { describe, expect, it } from "vite-plus/test";
import {
  clampDrawingInlineTextOrigin,
  drawingInlineTextBox,
  drawingInlineTextIntersectsPane,
} from "./drawingInlineTextBounds";

describe("inline drawing text bounds", () => {
  it("keeps right-aligned text reachable when its origin has panned beyond the pane", () => {
    const box = drawingInlineTextBox(
      { point: { x: 140, y: 50 }, align: "right", baseline: "middle" },
      60,
      24,
    )!;
    expect(drawingInlineTextIntersectsPane(box, 100, 100)).toBe(true);
    expect(
      drawingInlineTextIntersectsPane(
        drawingInlineTextBox({ point: { x: 170, y: 50 }, align: "right" }, 60, 24)!,
        100,
        100,
      ),
    ).toBe(false);
  });

  it("tests rotated labels instead of rejecting their offscreen origin", () => {
    const box = drawingInlineTextBox(
      { point: { x: 110, y: 50 }, align: "left", baseline: "top", angle: Math.PI / 2 },
      50,
      24,
    )!;
    expect(drawingInlineTextIntersectsPane(box, 100, 100)).toBe(true);
  });

  it("does not offer a hit target in the empty corner of a rotated bounding box", () => {
    const box = drawingInlineTextBox(
      { point: { x: -10, y: -10 }, align: "center", baseline: "middle", angle: Math.PI / 4 },
      20,
      20,
    )!;
    expect(Math.max(...box.map((point) => point.x))).toBeGreaterThan(0);
    expect(Math.max(...box.map((point) => point.y))).toBeGreaterThan(0);
    expect(drawingInlineTextIntersectsPane(box, 100, 100)).toBe(false);
  });

  it("uses the full multiline height when the first row is above the pane", () => {
    const position = { point: { x: 20, y: -30 }, align: "left", baseline: "top" } as const;
    expect(
      drawingInlineTextIntersectsPane(drawingInlineTextBox(position, 80, 16.8)!, 100, 100),
    ).toBe(false);
    expect(
      drawingInlineTextIntersectsPane(drawingInlineTextBox(position, 80, 67.2)!, 100, 100),
    ).toBe(true);
  });

  it("keeps editing within the pane without changing the drawing origin", () => {
    const position = { point: { x: 500, y: -100 }, align: "right", baseline: "bottom" } as const;
    const box = drawingInlineTextBox(position, 120, 36)!;
    const editor = clampDrawingInlineTextOrigin(position.point, box, 200, 100);
    expect(editor).toEqual({ x: 194, y: 42 });
    expect(position.point).toEqual({ x: 500, y: -100 });
    const moved = drawingInlineTextBox({ ...position, point: editor }, 120, 36)!;
    expect(Math.min(...moved.map((p) => p.x))).toBeGreaterThanOrEqual(6);
    expect(Math.max(...moved.map((p) => p.x))).toBeLessThanOrEqual(194);
    expect(Math.min(...moved.map((p) => p.y))).toBeGreaterThanOrEqual(6);
    expect(Math.max(...moved.map((p) => p.y))).toBeLessThanOrEqual(94);
  });

  it("clamps rotated editor bounds and preserves an already visible position", () => {
    const position = {
      point: { x: 110, y: 50 },
      align: "left",
      baseline: "top",
      angle: Math.PI / 2,
    } as const;
    const origin = clampDrawingInlineTextOrigin(
      position.point,
      drawingInlineTextBox(position, 60, 24)!,
      100,
      100,
    );
    const box = drawingInlineTextBox({ ...position, point: origin }, 60, 24)!;
    expect(Math.max(...box.map((p) => p.x))).toBeCloseTo(94);
    expect(Math.max(...box.map((p) => p.y))).toBeCloseTo(94);
    expect(clampDrawingInlineTextOrigin(origin, box, 100, 100)).toEqual(origin);
  });

  it("keeps oversized text's leading edge accessible and rejects invalid projection", () => {
    const position = { point: { x: 500, y: 500 }, baseline: "top" } as const;
    const origin = clampDrawingInlineTextOrigin(
      position.point,
      drawingInlineTextBox(position, 300, 24)!,
      100,
      100,
    );
    expect(origin.x).toBe(6);
    expect(drawingInlineTextBox({ point: { x: Infinity, y: 1 } }, 100, 20)).toBeNull();
    expect(drawingInlineTextIntersectsPane(drawingInlineTextBox(position, 100, 20)!, 0, 100)).toBe(
      false,
    );
  });
});
