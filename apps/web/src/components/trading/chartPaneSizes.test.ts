import { describe, expect, it } from "vite-plus/test";
import { normalizeChartPaneSizes, equalChartPaneSizes } from "./chartPaneSizes";

describe("saved pane sizes", () => {
  it("detaches valid factors and rejects malformed, unbounded and invalid IDs", () => {
    const input = {
      $price: 3,
      "base:rsi": 2,
      copy_1: 0.5,
      zero: 0,
      negative: -1,
      infinity: Infinity,
      huge: 1e8,
      tiny: 1e-10,
      text: "2",
      "bad:id": 1,
    };
    const result = normalizeChartPaneSizes(input);
    expect(result).toEqual({ $price: 3, "base:rsi": 2, copy_1: 0.5 });
    input.$price = 7;
    expect(result.$price).toBe(3);
    for (const value of [null, undefined, [], 3, "3"])
      expect(normalizeChartPaneSizes(value)).toEqual({});
  });
  it("bounds retained history and compares records without depending on insertion order", () => {
    expect(
      Object.keys(
        normalizeChartPaneSizes(
          Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`pane${i}`, 1])),
        ),
      ),
    ).toHaveLength(101);
    expect(equalChartPaneSizes({ $price: 3, rsi: 1 }, { rsi: 1, $price: 3 })).toBe(true);
    expect(equalChartPaneSizes({ $price: 3 }, { $price: 2 })).toBe(false);
  });
});
