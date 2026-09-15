import { describe, expect, it } from "vite-plus/test";
import { clampDrawingToolbarOffset, clampFavoriteToolbarPosition } from "./drawingToolbarBounds";

describe("drawing toolbar bounds", () => {
  it("uses rendered dimensions when clamping a scaled toolbar", () => {
    expect(
      clampDrawingToolbarOffset(
        { x: 1000, y: 1000 },
        { width: 500, height: 300 },
        { width: 400, height: 40 },
        0.85,
      ),
    ).toEqual({ x: 72, y: 246 });
    expect(
      clampDrawingToolbarOffset(
        { x: -1000, y: -10 },
        { width: 500, height: 300 },
        { width: 400, height: 40 },
        0.85,
      ),
    ).toEqual({ x: -72, y: 0 });
  });
  it("preserves pointer travel in viewport pixels while inside the bounds", () => {
    expect(
      clampDrawingToolbarOffset(
        { x: 31, y: 75 },
        { width: 800, height: 500 },
        { width: 400, height: 40 },
        0.85,
      ),
    ).toEqual({ x: 31, y: 75 });
  });
  it("clamps again when the chart shrinks or the toolbar grows", () => {
    expect(
      clampDrawingToolbarOffset(
        { x: 90, y: 290 },
        { width: 420, height: 240 },
        { width: 460, height: 40 },
        0.85,
      ),
    ).toEqual({ x: 6.5, y: 186 });
    expect(
      clampDrawingToolbarOffset(
        { x: -90, y: 290 },
        { width: 420, height: 240 },
        { width: 460, height: 40 },
        1,
      ),
    ).toEqual({ x: -0, y: 180 });
  });
  it("keeps the toolbar centered at the top when there is no room to move", () => {
    expect(
      clampDrawingToolbarOffset(
        { x: 40, y: 40 },
        { width: 100, height: 20 },
        { width: 400, height: 40 },
        1,
      ),
    ).toEqual({ x: 0, y: 0 });
  });
});

describe("favorite toolbar placement", () => {
  it("keeps screen-space drag deltas unchanged and clamps measured scaled dimensions", () => {
    const chart = { width: 500, height: 300 },
      toolbar = { width: 200, height: 40 };
    expect(clampFavoriteToolbarPosition({ x: 116, y: 220 }, chart, toolbar, 0.85)).toEqual({
      x: 116,
      y: 220,
    });
    expect(clampFavoriteToolbarPosition({ x: 900, y: 900 }, chart, toolbar, 0.85)).toEqual({
      x: 322,
      y: 258,
    });
    expect(clampFavoriteToolbarPosition({ x: -90, y: -90 }, chart, toolbar, 0.85)).toEqual({
      x: 8,
      y: 8,
    });
  });
  it("reclamps a saved position when the chart shrinks or more favorites are added", () => {
    const chart = { width: 300, height: 200 };
    expect(
      clampFavoriteToolbarPosition({ x: 250, y: 170 }, chart, { width: 200, height: 40 }, 1),
    ).toEqual({ x: 92, y: 152 });
    expect(
      clampFavoriteToolbarPosition({ x: 250, y: 170 }, chart, { width: 290, height: 40 }, 1),
    ).toEqual({ x: 5, y: 152 });
  });
  it("does not produce negative coordinates before layout or when the toolbar fills the chart", () => {
    expect(
      clampFavoriteToolbarPosition(
        { x: 16, y: 180 },
        { width: 0, height: 0 },
        { width: 200, height: 40 },
        1,
      ),
    ).toEqual({ x: 0, y: 0 });
    expect(
      clampFavoriteToolbarPosition(
        { x: 16, y: 180 },
        { width: 200, height: 40 },
        { width: 200, height: 40 },
        1,
      ),
    ).toEqual({ x: 0, y: 0 });
  });
});
