import { describe, expect, it } from "vite-plus/test";
import {
  clampDrawingInlineTextOrigin,
  drawingInlineTextBox,
  drawingInlineTextIntersectsPane,
  fitDrawingInlineTextSize,
} from "./drawingInlineTextBounds";

describe("inline drawing text bounds", () => {
  it("preserves requested dimensions when the rotated text already fits", () => {
    for (const angle of [0, Math.PI / 4, -Math.PI / 2, Math.PI])
      expect(fitDrawingInlineTextSize(120, 36, angle, 400, 300)).toEqual({
        width: 120,
        height: 36,
      });
  });

  it.each([Math.PI / 2, -Math.PI / 2])(
    "fits long vertical text at angle %s without shortening its row height",
    (angle) => {
      const fitted = fitDrawingInlineTextSize(1440, 18.8, angle, 1800, 540);
      expect(fitted.width).toBeCloseTo(528);
      expect(fitted.height).toBe(18.8);
    },
  );

  it.each([Math.PI / 4, -Math.PI / 4])(
    "balances multiline viewport dimensions at angle %s",
    (angle) => {
      const fitted = fitDrawingInlineTextSize(1000, 300, angle, 300, 300);
      expect(fitted.width).toBeCloseTo(288 / Math.SQRT2);
      expect(fitted.height).toBeCloseTo(288 / Math.SQRT2);
    },
  );

  it("fits near-axis angles, narrow panes and multiline text without overflowing after origin clamping", () => {
    for (const angle of [
      0,
      1e-12,
      -1e-12,
      Math.PI / 6,
      Math.PI / 4,
      -Math.PI / 4,
      Math.PI / 2,
      Math.PI / 2 + 1e-12,
    ]) {
      for (const [paneWidth, paneHeight] of [
        [1800, 540],
        [300, 600],
        [80, 60],
        [13, 13],
      ]) {
        const size = fitDrawingInlineTextSize(1400, 250, angle, paneWidth!, paneHeight!);
        expect(size.width).toBeGreaterThan(0);
        expect(size.height).toBeGreaterThan(0);
        expect(size.width).toBeLessThanOrEqual(1400);
        expect(size.height).toBeLessThanOrEqual(250);
        const placement = {
          point: { x: -500, y: 2000 },
          align: "center",
          baseline: "middle",
          angle,
        } as const;
        const box = drawingInlineTextBox(placement, size.width, size.height)!;
        const origin = clampDrawingInlineTextOrigin(placement.point, box, paneWidth!, paneHeight!);
        const moved = drawingInlineTextBox(
          { ...placement, point: origin },
          size.width,
          size.height,
        )!;
        expect(Math.min(...moved.map((p) => p.x))).toBeGreaterThanOrEqual(6 - 1e-9);
        expect(Math.min(...moved.map((p) => p.y))).toBeGreaterThanOrEqual(6 - 1e-9);
        expect(Math.max(...moved.map((p) => p.x))).toBeLessThanOrEqual(paneWidth! - 6 + 1e-9);
        expect(Math.max(...moved.map((p) => p.y))).toBeLessThanOrEqual(paneHeight! - 6 + 1e-9);
      }
    }
  });

  it("returns finite dimensions for invalid inputs and zero space when the pane cannot fit margins", () => {
    expect(fitDrawingInlineTextSize(NaN, Infinity, NaN, 100, 100)).toEqual({ width: 1, height: 1 });
    expect(fitDrawingInlineTextSize(-10, 20, Infinity, 100, 100)).toEqual({ width: 1, height: 20 });
    for (const [width, height] of [
      [NaN, 100],
      [100, Infinity],
      [-1, 100],
      [100, 0],
      [12, 100],
    ])
      expect(fitDrawingInlineTextSize(200, 40, 0, width!, height!)).toEqual({
        width: 0,
        height: 0,
      });
  });

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
