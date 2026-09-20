import { describe, expect, it } from "vite-plus/test";
import {
  applyBackAdjustment,
  calculateBackAdjustmentOffset,
  type RollEvent,
} from "./backAdjustment";
import type { Candle } from "./chartIndicators";

const mockRollEvents: RollEvent[] = [
  {
    id: "roll-1",
    root: "MNQ",
    timestamp: 1000,
    fromContract: "MNQM6",
    toContract: "MNQU6",
    spread: 40.0,
    formattedDate: "Jun 11, 2026",
  },
  {
    id: "roll-2",
    root: "MNQ",
    timestamp: 2000,
    fromContract: "MNQU6",
    toContract: "MNQZ6",
    spread: 35.0,
    formattedDate: "Sep 10, 2026",
  },
];

const mockBars: Candle[] = [
  // Before roll-1 (time: 500) -> should get roll-1 spread + roll-2 spread = 75.0
  { time: 500, open: 18000, high: 18050, low: 17950, close: 18020, volume: 100 },
  // Between roll-1 and roll-2 (time: 1500) -> should get roll-2 spread = 35.0
  { time: 1500, open: 18100, high: 18150, low: 18050, close: 18120, volume: 120 },
  // After roll-2 (time: 2500) -> front month, should get 0 offset
  { time: 2500, open: 18200, high: 18250, low: 18150, close: 18220, volume: 150 },
];

describe("backAdjustment", () => {
  it("computes cumulative Panama offset for older bars", () => {
    expect(calculateBackAdjustmentOffset(500, mockRollEvents)).toBe(75.0);
    expect(calculateBackAdjustmentOffset(1500, mockRollEvents)).toBe(35.0);
    expect(calculateBackAdjustmentOffset(2500, mockRollEvents)).toBe(0);
  });

  it("shifts bars backward when backAdjustment is enabled", () => {
    const adjusted = applyBackAdjustment(mockBars, mockRollEvents, true);
    expect(adjusted).toHaveLength(3);

    // Bar 0: +75.0
    expect(adjusted[0]!.open).toBe(18075);
    expect(adjusted[0]!.high).toBe(18125);
    expect(adjusted[0]!.low).toBe(18025);
    expect(adjusted[0]!.close).toBe(18095);
    expect(adjusted[0]!.volume).toBe(100);

    // Bar 1: +35.0
    expect(adjusted[1]!.open).toBe(18135);
    expect(adjusted[1]!.close).toBe(18155);

    // Bar 2: +0 (current front month stays raw)
    expect(adjusted[2]!.open).toBe(18200);
    expect(adjusted[2]!.close).toBe(18220);
  });

  it("leaves bars unmodified when backAdjustment is disabled", () => {
    const unadjusted = applyBackAdjustment(mockBars, mockRollEvents, false);
    expect(unadjusted).toEqual(mockBars);
  });

  it("handles empty bars or empty roll events gracefully", () => {
    expect(applyBackAdjustment([], mockRollEvents, true)).toEqual([]);
    expect(applyBackAdjustment(mockBars, [], true)).toEqual(mockBars);
  });
});
