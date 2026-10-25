import { describe, expect, it } from "vite-plus/test";
import { drawingCopyName, drawingKindLabel } from "./drawingNames";

describe("drawing display and copy names", () => {
  it("uses the settings title for unnamed copies, including nonliteral tool labels", () => {
    expect(drawingKindLabel("regression-trend")).toBe("Regression trend");
    expect(drawingCopyName({ kind: "regression-trend" })).toBe("Regression trend copy");
    expect(drawingCopyName({ kind: "channel" })).toBe("Parallel channel copy");
    expect(drawingCopyName({ kind: "horizontal-ray", name: "", text: "" })).toBe(
      "Horizontal Ray copy",
    );
  });

  it("preserves custom-name priority, annotation fallback and the existing length limit", () => {
    expect(drawingCopyName({ kind: "trend", name: "A+ setup", text: "Wait for the retest" })).toBe(
      "A+ setup copy",
    );
    expect(drawingCopyName({ kind: "trend", text: "Wait for the retest" })).toBe(
      "Wait for the retest copy",
    );
    expect(drawingCopyName({ kind: "text", text: "First row\nSecond row" })).toBe(
      "First row\nSecond row copy",
    );
    expect(drawingCopyName({ kind: "trend", name: "x".repeat(90) })).toBe("x".repeat(80));
  });
});
