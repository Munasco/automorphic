import { describe, expect, it } from "vite-plus/test";
import type { Time } from "lightweight-charts";
import {
  buildDrawingGeometry,
  parseChartDrawings,
  sanitizeDrawingSettings,
  type ChartDrawing,
} from "./drawingGeometry";
import { defaultDrawingTemplateSettings, applyDrawingTemplate } from "./drawingTemplates";
const base: ChartDrawing = {
  id: "vertical",
  kind: "vertical",
  anchors: [{ time: 100 as Time, price: 300 }],
  color: "#2962ff",
  width: 2,
  text: "Session opens",
};
const geometry = (patch: Partial<ChartDrawing> = {}) =>
  buildDrawingGeometry(
    { ...base, ...patch },
    ({ time, price }) => ({ x: Number(time), y: 500 - price }),
    (price) => 500 - price,
    1000,
    500,
  );
describe("vertical line text", () => {
  it("centers bottom-to-top text in the pane independent of its anchor price", () => {
    expect(geometry().text).toMatchObject({
      point: { x: 100, y: 250 },
      angle: -Math.PI / 2,
      align: "center",
      baseline: "middle",
    });
    expect(geometry({ anchors: [{ time: 100 as Time, price: 50 }] }).text).toEqual(geometry().text);
    expect(geometry({ textOrientation: "horizontal" }).text).toMatchObject({
      point: { x: 100, y: 250 },
      angle: 0,
      align: "center",
      baseline: "middle",
    });
  });
  it.each(["horizontal", "vertical"] as const)(
    "keeps every %s alignment inside the pane",
    (textOrientation) => {
      for (const textPosition of ["above", "center", "below"] as const) {
        for (const textAlignment of ["left", "center", "right"] as const) {
          const text = geometry({ textOrientation, textPosition, textAlignment }).text!;
          expect(text.point.x).toBe(
            textAlignment === "left"
              ? textOrientation === "vertical"
                ? 94
                : 90
              : textAlignment === "right"
                ? textOrientation === "vertical"
                  ? 106
                  : 110
                : 100,
          );
          expect(text.point.y).toBe(
            textPosition === "above" ? 6 : textPosition === "below" ? 494 : 250,
          );
          if (textOrientation === "vertical") {
            expect(text.align).toBe(
              textPosition === "above" ? "right" : textPosition === "below" ? "left" : "center",
            );
            expect(text.baseline).toBe(
              textAlignment === "left" ? "bottom" : textAlignment === "right" ? "top" : "middle",
            );
          } else {
            expect(text.align).toBe(
              textAlignment === "left" ? "right" : textAlignment === "right" ? "left" : "center",
            );
            expect(text.baseline).toBe(
              textPosition === "above" ? "top" : textPosition === "below" ? "bottom" : "middle",
            );
          }
        }
      }
    },
  );
  it("round-trips orientation and extension, rejects malformed values, and resets templates", () => {
    const edited = { ...base, textOrientation: "horizontal" as const, extendAcrossPanes: false };
    expect(parseChartDrawings(JSON.stringify([edited]))[0]).toMatchObject(edited);
    expect(
      sanitizeDrawingSettings({ textOrientation: "diagonal", extendAcrossPanes: "false" }),
    ).toEqual({});
    expect(applyDrawingTemplate(edited, defaultDrawingTemplateSettings("vertical"))).toMatchObject({
      id: base.id,
      anchors: base.anchors,
      textOrientation: "vertical",
      textPosition: "center",
      textAlignment: "center",
      extendAcrossPanes: true,
    });
  });
});
