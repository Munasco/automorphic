import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_OVERLAY_LAYOUT,
  mergeOverlayStyle,
  overlayCollisionBoundary,
} from "./overlay-layout";

describe("generic overlay layout styles", () => {
  it("leaves ordinary overlays and callback identity unchanged without a measured container", () => {
    const style = { color: "red", maxWidth: 480 };
    const callback = (state: { open: boolean }) => ({ opacity: state.open ? 1 : 0 });
    expect(mergeOverlayStyle(style, DEFAULT_OVERLAY_LAYOUT.popupStyle)).toBe(style);
    expect(mergeOverlayStyle(callback, DEFAULT_OVERLAY_LAYOUT.popupStyle)).toBe(callback);
    expect(mergeOverlayStyle(undefined, DEFAULT_OVERLAY_LAYOUT.dialogStyle)).toBeUndefined();
  });
  it("retains caller appearance while enforcing zoom and inverse container limits", () => {
    const style = { color: "red", maxHeight: 1000, zoom: 1 };
    const merged = mergeOverlayStyle(style, { zoom: 0.85, maxHeight: 400, maxWidth: 600 });
    expect(merged).toEqual({ color: "red", zoom: 0.85, maxHeight: 400, maxWidth: 600 });
    expect(style).toEqual({ color: "red", maxHeight: 1000, zoom: 1 });
  });
  it("evaluates stateful styles for each state and supports an absent callback result", () => {
    const merged = mergeOverlayStyle(
      (state: { open: boolean }) => (state.open ? { color: "blue" } : undefined),
      { zoom: 0.9 },
    );
    expect(typeof merged).toBe("function");
    if (typeof merged !== "function") throw Error("Expected stateful style");
    expect(merged({ open: true })).toEqual({ color: "blue", zoom: 0.9 });
    expect(merged({ open: false })).toEqual({ zoom: 0.9 });
  });
});

it("uses unscaled viewport bounds for collision detection and leaves unmeasured overlays alone", () => {
  expect(overlayCollisionBoundary(DEFAULT_OVERLAY_LAYOUT)).toBeUndefined();
  expect(overlayCollisionBoundary({ measured: true, bounds: null })).toBeUndefined();
  expect(
    overlayCollisionBoundary({
      measured: true,
      bounds: { left: 410, top: 110, right: 900, bottom: 600, width: 490, height: 490 },
    }),
  ).toEqual({ x: 410, y: 110, width: 490, height: 490 });
});
