import { describe, expect, it } from "vite-plus/test";
import { mergeDrawingChanges } from "./drawingChanges";
import type { ChartDrawing } from "./drawingGeometry";

const original: ChartDrawing = {
  id: "line",
  kind: "trend",
  color: "#123456",
  width: 2,
  anchors: [
    { time: "2026-09-01", price: 100 },
    { time: "2026-09-03", price: 120 },
  ],
};

describe("independent line coordinate merging", () => {
  it.each(["trend", "info-line", "ray", "extended-line", "arrow"] as const)(
    "%s retains a peer's other endpoint and preserves input snapshots",
    (kind) => {
      const before = { ...original, kind };
      const after = {
        ...before,
        anchors: [{ ...before.anchors[0]!, price: 105 }, before.anchors[1]!],
      };
      const target = {
        ...before,
        anchors: [before.anchors[0]!, { ...before.anchors[1]!, price: 125 }],
      };
      const snapshots = structuredClone([before, after, target]);
      expect(mergeDrawingChanges(before, after, target).anchors).toEqual([
        { time: "2026-09-01", price: 105 },
        { time: "2026-09-03", price: 125 },
      ]);
      expect([before, after, target]).toEqual(snapshots);
    },
  );

  it.each(["horizontal", "horizontal-ray", "vertical", "crossline"] as const)(
    "%s merges time and price on the same anchor without combining BusinessDay components",
    (kind) => {
      const before: ChartDrawing = {
        ...original,
        kind,
        anchors: [{ time: { year: 2026, month: 9, day: 1 }, price: 100 }],
      };
      const after: ChartDrawing = {
        ...before,
        anchors: [{ time: { year: 2027, month: 1, day: 2 }, price: 100 }],
      };
      const target = { ...before, anchors: [{ ...before.anchors[0]!, price: 105 }] };
      expect(mergeDrawingChanges(before, after, target).anchors).toEqual([
        { time: { year: 2027, month: 1, day: 2 }, price: 105 },
      ]);
    },
  );

  it.each([
    "trend-angle",
    "channel",
    "flat-channel",
    "disjoint-channel",
    "regression-trend",
  ] as const)("%s keeps dependent geometry atomic", (kind) => {
    const before = {
      ...original,
      kind,
      anchors: [
        ...original.anchors,
        ...(["channel", "flat-channel", "disjoint-channel"].includes(kind)
          ? [{ time: "2026-09-03", price: 140 }]
          : []),
      ],
    };
    const after = {
      ...before,
      anchors: before.anchors.map((anchor, index) =>
        index === 0 ? { ...anchor, price: 105 } : anchor,
      ),
    };
    const target = {
      ...before,
      anchors: before.anchors.map((anchor, index) =>
        index === 1 ? { ...anchor, price: 125 } : anchor,
      ),
    };
    expect(mergeDrawingChanges(before, after, target).anchors).toEqual(after.anchors);
  });

  it("keeps whole-line translations atomic and avoids combining endpoints into a degenerate line", () => {
    const translated = {
      ...original,
      anchors: original.anchors.map((a) => ({ ...a, price: a.price + 10 })),
    };
    const target = {
      ...original,
      anchors: [{ ...original.anchors[0]!, price: 106 }, original.anchors[1]!],
    };
    expect(mergeDrawingChanges(original, translated, target).anchors).toEqual(translated.anchors);
    const after: ChartDrawing = {
      ...original,
      anchors: [{ time: "2026-09-02", price: 110 }, original.anchors[1]!],
    };
    const conflict: ChartDrawing = {
      ...original,
      anchors: [original.anchors[0]!, { time: "2026-09-02", price: 110 }],
    };
    expect(mergeDrawingChanges(original, after, conflict).anchors).toEqual(after.anchors);
  });

  it("keeps same-field conflicts last-writer-wins and leaves unrelated arrays atomic", () => {
    const after = {
      ...original,
      anchors: [{ ...original.anchors[0]!, price: 105 }, original.anchors[1]!],
    };
    const target = {
      ...original,
      anchors: [{ ...original.anchors[0]!, price: 110 }, original.anchors[1]!],
    };
    expect(mergeDrawingChanges(original, after, target).anchors[0]!.price).toBe(105);
    expect(
      mergeDrawingChanges(
        { ...original, stats: ["price"] },
        { ...original, stats: ["price", "bars"] },
        { ...original, stats: ["price", "angle"] },
      ).stats,
    ).toEqual(["price", "bars"]);
  });
});
