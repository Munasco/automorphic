import { describe, expect, it } from "vite-plus/test";
import { histogramPhase } from "./histogramPhase";

describe("histogram phase", () => {
  it.each([
    { value: 3, previous: 2, phase: "positive" },
    { value: 2, previous: 3, phase: "positiveFalling" },
    { value: -3, previous: -2, phase: "negative" },
    { value: -2, previous: -3, phase: "negativeRising" },
  ] as const)("classifies $previous to $value as $phase", ({ value, previous, phase }) => {
    expect(histogramPhase(value, previous)).toBe(phase);
  });

  it("uses the current sign at zero crossings and treats zero as nonnegative", () => {
    expect(histogramPhase(2, -2)).toBe("positive");
    expect(histogramPhase(-2, 2)).toBe("negative");
    expect(histogramPhase(0, -2)).toBe("positive");
    expect(histogramPhase(0, 2)).toBe("positiveFalling");
    expect(histogramPhase(-0, -2)).toBe("positive");
    expect(histogramPhase(2, 0)).toBe("positive");
    expect(histogramPhase(-2, 0)).toBe("negative");
  });

  it("requires a strict rise and assigns equal values by their current sign", () => {
    expect(histogramPhase(2, 2)).toBe("positiveFalling");
    expect(histogramPhase(0, 0)).toBe("positiveFalling");
    expect(histogramPhase(-0, 0)).toBe("positiveFalling");
    expect(histogramPhase(-2, -2)).toBe("negative");
    expect(histogramPhase(0.000001, 0)).toBe("positive");
    expect(histogramPhase(-0.000001, -0.000002)).toBe("negativeRising");
  });

  it.each([undefined, NaN, Infinity, -Infinity])(
    "uses sign alone when the first bar or a gap supplies previous=%s",
    (previous) => {
      expect(histogramPhase(2, previous)).toBe("positive");
      expect(histogramPhase(0, previous)).toBe("positive");
      expect(histogramPhase(-0, previous)).toBe("positive");
      expect(histogramPhase(-2, previous)).toBe("negative");
    },
  );

  it("keeps no history between calls, so missing-bar boundaries reset the comparison", () => {
    expect(histogramPhase(2, 10)).toBe("positiveFalling");
    expect(histogramPhase(2, undefined)).toBe("positive");
    expect(histogramPhase(-2, -10)).toBe("negativeRising");
    expect(histogramPhase(-2, undefined)).toBe("negative");
    expect(histogramPhase(2, 10)).toBe("positiveFalling");
  });
});
