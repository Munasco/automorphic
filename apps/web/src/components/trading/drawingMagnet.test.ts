import { expect, it } from "vite-plus/test";
import type { DrawingAnchor } from "./drawingGeometry";
import { snapDrawingAnchor } from "./drawingMagnet";

const candle = { time: 100 as DrawingAnchor["time"], open: 90, high: 100, low: 70, close: 85 };
const anchor: DrawingAnchor = { time: 101 as DrawingAnchor["time"], price: 103 };
const project = (price: number) => 200 - price;
it("locks weak magnets onto the candle's nearest OHLC within twelve screen pixels", () => {
  expect(snapDrawingAnchor(anchor, { x: 1, y: 94 }, candle, "weak", project)).toEqual({
    time: 100,
    price: 100,
  });
  expect(snapDrawingAnchor(anchor, { x: 1, y: 116 }, candle, "weak", project)).toEqual({
    time: 100,
    price: 85,
  });
  expect(snapDrawingAnchor(anchor, { x: 1, y: 130 }, candle, "weak", project)).toEqual({
    time: 100,
    price: 70,
  });
  expect(snapDrawingAnchor(anchor, { x: 1, y: 87 }, candle, "weak", project)).toBe(anchor);
});
it("strong mode locks even far away, while off and empty future space stay unsnapped", () => {
  expect(snapDrawingAnchor(anchor, { x: 1, y: 1 }, candle, "strong", project)).toEqual({
    time: 100,
    price: 100,
  });
  expect(snapDrawingAnchor(anchor, { x: 1, y: 100 }, candle, "off", project)).toBe(anchor);
  expect(snapDrawingAnchor(anchor, { x: 1, y: 100 }, undefined, "strong", project)).toBe(anchor);
});
it("rejects invalid candle prices and unmappable scale coordinates", () => {
  expect(snapDrawingAnchor(anchor, { x: 1, y: 100 }, candle, "strong", () => null)).toBe(anchor);
  expect(snapDrawingAnchor(anchor, { x: 1, y: 100 }, candle, "strong", () => NaN)).toBe(anchor);
  expect(
    snapDrawingAnchor(anchor, { x: 1, y: 100 }, { ...candle, high: NaN }, "strong", project),
  ).toEqual({ time: 100, price: 90 });
});
