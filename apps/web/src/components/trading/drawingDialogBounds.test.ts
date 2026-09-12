import { describe, expect, it } from "vite-plus/test";
import { getDrawingDialogBounds } from "./drawingDialogBounds";

describe("drawing settings dialog bounds", () => {
  it("fixes the observed 400px Visibility tab overflow using the actual constrained width", () => {
    expect(getDrawingDialogBounds({ left: 12, top: 68 }, 460, { width: 400, height: 740 })).toEqual(
      {
        left: 12,
        top: 68,
        width: 376,
        maxHeight: 660,
      },
    );
    expect(
      getDrawingDialogBounds({ left: -72, top: 68 }, 460, { width: 400, height: 740 }),
    ).toEqual({
      left: 12,
      top: 68,
      width: 376,
      maxHeight: 660,
    });
  });

  it("preserves the desktop top anchor across narrower and wider tabs", () => {
    const position = { left: 500, top: 200 },
      viewport = { width: 1440, height: 900 };
    expect(getDrawingDialogBounds(position, 380, viewport)).toEqual({
      left: 500,
      top: 200,
      width: 380,
      maxHeight: 688,
    });
    expect(getDrawingDialogBounds(position, 460, viewport)).toEqual({
      left: 500,
      top: 200,
      width: 460,
      maxHeight: 688,
    });
    expect(position).toEqual({ left: 500, top: 200 });
    expect(viewport).toEqual({ width: 1440, height: 900 });
  });

  it("clamps both horizontal sides and updates width after a viewport shrink", () => {
    expect(
      getDrawingDialogBounds({ left: 880, top: 100 }, 460, { width: 1000, height: 800 }),
    ).toMatchObject({ left: 528, width: 460 });
    expect(
      getDrawingDialogBounds({ left: 528, top: 100 }, 460, { width: 320, height: 800 }),
    ).toMatchObject({ left: 12, width: 296 });
    expect(
      getDrawingDialogBounds({ left: -200, top: -20 }, 380, { width: 1000, height: 800 }),
    ).toMatchObject({ left: 12, top: 12 });
  });

  it("moves up only when needed to keep usable content and footer space after height changes", () => {
    expect(
      getDrawingDialogBounds({ left: 12, top: 200 }, 380, { width: 400, height: 500 }),
    ).toMatchObject({ top: 200, maxHeight: 288 });
    expect(
      getDrawingDialogBounds({ left: 12, top: 200 }, 380, { width: 400, height: 300 }),
    ).toMatchObject({ top: 48, maxHeight: 240 });
    expect(
      getDrawingDialogBounds({ left: 12, top: 200 }, 380, { width: 400, height: 180 }),
    ).toMatchObject({ top: 12, maxHeight: 156 });
    expect(
      getDrawingDialogBounds(
        { left: 12, top: 200 },
        380,
        { width: 400, height: 300 },
        { minHeight: 200 },
      ),
    ).toMatchObject({ top: 88, maxHeight: 200 });
  });

  it("keeps fractional coordinates and extremely small viewports finite and contained", () => {
    expect(
      getDrawingDialogBounds({ left: 12.5, top: 40.25 }, 380.5, { width: 800, height: 600 }),
    ).toEqual({ left: 12.5, top: 40.25, width: 380.5, maxHeight: 547.75 });
    const bounds = getDrawingDialogBounds({ left: -50, top: 200 }, 460, { width: 10, height: 8 })!;
    expect(bounds).toEqual({ left: 5, top: 4, width: 0, maxHeight: 0 });
    expect(bounds.left + bounds.width).toBeLessThanOrEqual(10);
    expect(bounds.top + bounds.maxHeight).toBeLessThanOrEqual(8);
  });

  it("rejects invalid measurements rather than emitting invalid inline CSS", () => {
    const position = { left: 12, top: 40 },
      viewport = { width: 400, height: 740 };
    for (const value of [Number.NaN, Infinity, -Infinity]) {
      expect(getDrawingDialogBounds({ ...position, left: value }, 380, viewport)).toBeNull();
      expect(getDrawingDialogBounds({ ...position, top: value }, 380, viewport)).toBeNull();
      expect(getDrawingDialogBounds(position, value, viewport)).toBeNull();
      expect(getDrawingDialogBounds(position, 380, { ...viewport, height: value })).toBeNull();
    }
    expect(getDrawingDialogBounds(position, 0, viewport)).toBeNull();
    expect(getDrawingDialogBounds(position, 380, { ...viewport, width: 0 })).toBeNull();
    expect(getDrawingDialogBounds(position, 380, viewport, { margin: -1 })).toBeNull();
    expect(getDrawingDialogBounds(position, 380, viewport, { minHeight: -1 })).toBeNull();
  });
});
