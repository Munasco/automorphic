import { describe, expect, it } from "vite-plus/test";
import { calculateChartOverlayLayout } from "./chartOverlayLayout";

const viewport = { left: 0, top: 0, width: 1800, height: 1000 };
describe("chart overlay layout", () => {
  it("centers dialogs on a chart offset within the viewport without scaling its coordinates", () => {
    const result = calculateChartOverlayLayout(
      { left: 400, top: 100, width: 1000, height: 700 },
      viewport,
    );
    expect(result.scale).toBe(1);
    expect(result.bounds).toEqual({
      left: 408,
      top: 108,
      right: 1392,
      bottom: 792,
      width: 984,
      height: 684,
    });
    expect(result.dialogViewportStyle).toMatchObject({
      left: 408,
      top: 108,
      width: 984,
      height: 684,
    });
    expect(result.dialogViewportStyle.transform).toBeUndefined();
    expect(result.popupStyle).toEqual({ zoom: 1, maxWidth: 984, maxHeight: 684 });
  });
  it("scales compact controls and text, with inverse bounds preventing double shrink", () => {
    const result = calculateChartOverlayLayout(
      { left: 300, top: 200, width: 500, height: 400 },
      viewport,
    );
    expect(result.scale).toBe(0.85);
    expect(result.popupStyle.zoom).toBe(0.85);
    expect(Number(result.popupStyle.maxWidth) * result.scale).toBeCloseTo(484);
    expect(Number(result.popupStyle.maxHeight) * result.scale).toBeCloseTo(384);
    expect(result.dialogStyle.overflowY).toBe("auto");
    expect(result.dialogViewportStyle.left).toBe(308);
  });
  it("clamps partially obscured charts to the visible viewport, including viewport offsets", () => {
    const result = calculateChartOverlayLayout(
      { left: -100, top: 50, width: 900, height: 800 },
      { left: 20, top: 100, width: 600, height: 400 },
    );
    expect(result.bounds).toEqual({
      left: 28,
      top: 108,
      right: 612,
      bottom: 492,
      width: 584,
      height: 384,
    });
  });
  it("retains usable bounds for tiny panels and keeps offscreen dialogs reachable", () => {
    const tiny = calculateChartOverlayLayout({ left: 0, top: 0, width: 10, height: 8 }, viewport);
    expect(tiny.bounds).toMatchObject({ width: 5, height: 4 });
    expect(tiny.scale).toBe(0.85);
    const outside = calculateChartOverlayLayout(
      { left: 3000, top: 0, width: 500, height: 400 },
      viewport,
    );
    expect(outside.bounds).toMatchObject({ left: 8, top: 8, right: 1792, bottom: 992 });
  });
  it("interpolates the compact scale and rejects unavailable or invalid measurements", () => {
    expect(
      calculateChartOverlayLayout({ left: 0, top: 0, width: 810, height: 650 }, viewport).scale,
    ).toBe(0.9);
    for (const width of [0, -1, NaN, Infinity]) {
      const result = calculateChartOverlayLayout({ left: 0, top: 0, width, height: 400 }, viewport);
      expect(result).toMatchObject({ measured: false, scale: 1, bounds: null, popupStyle: {} });
    }
  });
});
