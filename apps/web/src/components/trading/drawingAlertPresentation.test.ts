import { describe, expect, it } from "vite-plus/test";
import type { Time } from "lightweight-charts";
import type { DrawingAlertEvent } from "./drawingAlerts";
import { drawingAlertTargetLabel } from "./drawingAlertPresentation";

const common = {
  id: "event",
  alertId: "alert",
  drawingId: "line",
  symbol: "NQU6",
  intervalKey: "minute:5",
  condition: "crossing" as const,
  price: 24300.5,
  barId: "bar",
  triggeredAt: 1,
  sampleAt: 1,
};
const timeEvent = (targetTime: Time): DrawingAlertEvent => ({
  ...common,
  targetKind: "time",
  targetTime,
  barTime: targetTime,
});

describe("drawing alert target labels", () => {
  it("keeps price targets as prices", () => {
    expect(drawingAlertTargetLabel({ ...common, targetKind: "price", target: 24301.25 })).toBe(
      "Line 24,301.25",
    );
  });
  it("identifies the channel boundary that triggered", () => {
    expect(
      drawingAlertTargetLabel({
        ...common,
        targetKind: "price",
        target: 24301.25,
        channelBoundary: "upper",
      }),
    ).toBe("Upper channel 24,301.25");
    expect(
      drawingAlertTargetLabel({
        ...common,
        targetKind: "price",
        target: 24000,
        channelBoundary: "lower",
      }),
    ).toBe("Lower channel 24,000");
  });
  it("shows both channel bounds for region alerts", () => {
    expect(
      drawingAlertTargetLabel({
        ...common,
        condition: "entering-channel",
        targetKind: "price",
        target: 24301.25,
        channelRange: { lower: 24000, upper: 24301.25 },
      }),
    ).toBe("Channel 24,000 – 24,301.25");
  });
  it("identifies rectangle zones in alert history and exports", () => {
    expect(
      drawingAlertTargetLabel({
        ...common,
        condition: "exiting-rectangle",
        targetKind: "price",
        target: 24301.25,
        channelRange: { lower: 24000, upper: 24301.25 },
      }),
    ).toBe("Rectangle 24,000 – 24,301.25");
  });
  it.each([
    ["above-rectangle", "Upper rectangle"],
    ["below-rectangle", "Lower rectangle"],
  ] as const)("identifies the watched edge for %s", (condition, label) => {
    expect(
      drawingAlertTargetLabel({ ...common, condition, targetKind: "price", target: 24301.25 }),
    ).toBe(`${label} 24,301.25`);
  });
  it("shows a vertical boundary as a UTC date and time, never as a price", () => {
    expect(drawingAlertTargetLabel(timeEvent((Date.UTC(2026, 8, 12, 14, 30) / 1000) as Time))).toBe(
      "Vertical line · Sep 12, 2026, 02:30 PM UTC",
    );
  });
  it("preserves calendar dates without shifting them into the previous local day", () => {
    expect(drawingAlertTargetLabel(timeEvent("2026-09-12"))).toBe("Vertical line · 2026-09-12");
    expect(drawingAlertTargetLabel(timeEvent({ year: 2026, month: 9, day: 12 }))).toBe(
      "Vertical line · 2026-09-12",
    );
  });
  it("does not misrepresent synthetic tick positions as wall-clock dates", () => {
    expect(drawingAlertTargetLabel({ ...timeEvent(1 as Time), intervalKey: "tick:100" })).toBe(
      "Vertical line",
    );
    expect(drawingAlertTargetLabel(timeEvent(Number.MAX_VALUE as Time))).toBe("Vertical line");
  });
});
