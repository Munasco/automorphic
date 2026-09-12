import { describe, expect, it } from "vite-plus/test";
import {
  drawingColorAtPoint,
  drawingHexToHsv,
  drawingHsvToHex,
  normalizeDrawingColorHex,
} from "./drawingColor";

describe("drawing custom color conversion", () => {
  it.each([
    ["#ff0000", 0],
    ["#ffff00", 60],
    ["#00ff00", 120],
    ["#00ffff", 180],
    ["#0000ff", 240],
    ["#ff00ff", 300],
  ] as const)("converts %s to hue %s and back", (hex, h) => {
    expect(drawingHexToHsv(hex)).toEqual({ h, s: 1, v: 1 });
    expect(drawingHsvToHex({ h, s: 1, v: 1 })).toBe(hex);
  });
  it("round-trips dark, grey, bright and mixed byte values without losing precision", () => {
    for (const r of [0, 1, 17, 127, 128, 254, 255])
      for (const g of [0, 1, 17, 127, 128, 254, 255])
        for (const b of [0, 1, 17, 127, 128, 254, 255]) {
          const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
          expect(drawingHsvToHex(drawingHexToHsv(hex)!)).toBe(hex);
        }
    expect(drawingHexToHsv("#000000")).toEqual({ h: 0, s: 0, v: 0 });
    expect(drawingHexToHsv("#ffffff")).toEqual({ h: 0, s: 0, v: 1 });
  });
  it("accepts full hex drafts only, rejecting partial or arbitrary CSS input", () => {
    expect(normalizeDrawingColorHex(" #AbCDef ")).toBe("#abcdef");
    expect(normalizeDrawingColorHex("abcdef")).toBe("#abcdef");
    for (const value of [
      "",
      "#",
      "#123",
      "#12345",
      "#12345678",
      "red",
      "rgb(0,0,0)",
      "#gggggg",
      "url(x)",
    ]) {
      expect(normalizeDrawingColorHex(value)).toBeNull();
      expect(drawingHexToHsv(value)).toBeNull();
    }
  });
  it("wraps hue, bounds channels and rejects nonfinite colors", () => {
    expect(drawingHsvToHex({ h: -60, s: 1, v: 1 })).toBe("#ff00ff");
    expect(drawingHsvToHex({ h: 720, s: 2, v: 2 })).toBe("#ff0000");
    expect(drawingHsvToHex({ h: 120, s: -1, v: 0.5 })).toBe("#808080");
    expect(drawingHsvToHex({ h: 120, s: 1, v: -1 })).toBe("#000000");
    expect(drawingHsvToHex({ h: NaN, s: 1, v: 1 })).toBeNull();
    expect(drawingHsvToHex({ h: 120, s: Infinity, v: 1 })).toBeNull();
  });
  it("maps captured pointer positions and preserves the other color channels", () => {
    const current = { h: 120, s: 0.5, v: 0.75 },
      size = { width: 200, height: 184 };
    expect(drawingColorAtPoint(current, "plane", { x: 100, y: 46 }, size)).toEqual(current);
    expect(drawingColorAtPoint(current, "plane", { x: -30, y: 200 }, size)).toEqual({
      h: 120,
      s: 0,
      v: 0,
    });
    expect(drawingColorAtPoint(current, "hue", { x: 0, y: 92 }, size)).toEqual({
      h: 180,
      s: 0.5,
      v: 0.75,
    });
    expect(drawingColorAtPoint(current, "hue", { x: 0, y: -20 }, size)).toEqual({
      h: 360,
      s: 0.5,
      v: 0.75,
    });
    expect(
      drawingColorAtPoint(current, "plane", { x: 0, y: 0 }, { width: 0, height: 184 }),
    ).toBeNull();
    expect(current).toEqual({ h: 120, s: 0.5, v: 0.75 });
  });
});
