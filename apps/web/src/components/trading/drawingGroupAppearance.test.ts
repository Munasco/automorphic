import { describe, expect, it } from "vite-plus/test";
import { getDrawingGroupAppearance } from "./drawingGroupAppearance";
import { defaultRegressionDrawingSettings, type ChartDrawing } from "./drawingGeometry";

const drawing = (patch: Partial<ChartDrawing> = {}): ChartDrawing => ({
  id: "line",
  kind: "trend",
  anchors: [],
  color: "#112233",
  width: 1,
  ...patch,
});

function regression(width: number): ChartDrawing {
  const settings = defaultRegressionDrawingSettings();
  const line = { color: "#445566", width, lineStyle: "dashed" as const };
  return drawing({
    kind: "regression-trend",
    regressionBaseLine: { ...settings.regressionBaseLine, ...line },
    regressionUpperLine: { ...settings.regressionUpperLine, ...line },
    regressionLowerLine: { ...settings.regressionLowerLine, ...line },
  });
}

describe("group toolbar effective line appearance", () => {
  it("detects differing regression rail widths despite matching generic widths", () => {
    expect(getDrawingGroupAppearance([regression(2), regression(4)])).toEqual({
      appearance: { color: "#445566", width: 2, lineStyle: "dashed", lineOpacity: 1 },
      mixed: { color: false, width: true, lineStyle: false, lineOpacity: false },
    });
  });

  it("displays a uniform nested regression width rather than the generic default", () => {
    const state = getDrawingGroupAppearance([regression(2), regression(2)]);
    expect(state?.appearance.width).toBe(2);
    expect(state?.mixed.width).toBe(false);
  });

  it("includes differences within one regression and resolves missing rail defaults", () => {
    const state = getDrawingGroupAppearance([drawing({ kind: "regression-trend" })]);
    expect(state?.appearance).toMatchObject({ color: "#f23645", width: 1, lineStyle: "dashed" });
    expect(state?.mixed).toMatchObject({ color: true, width: true, lineStyle: true });
  });

  it("resolves channel inheritance and includes disabled levels affected by group edits", () => {
    const channel = drawing({
      kind: "channel",
      lineOpacity: 0.7,
      levels: [
        { value: 0, visible: true },
        { value: 1, visible: true, width: 3 },
        { value: 0.5, visible: false, color: "#abcdef", lineStyle: "dotted", opacity: 0 },
      ],
    });
    const before = structuredClone(channel);
    expect(getDrawingGroupAppearance([channel])).toEqual({
      appearance: { color: "#112233", width: 1, lineStyle: "solid", lineOpacity: 0.7 },
      mixed: { color: true, width: true, lineStyle: true, lineOpacity: true },
    });
    expect(channel).toEqual(before);
  });

  it("uses ordinary line defaults for implicit and empty channel levels", () => {
    for (const levels of [undefined, []]) {
      const channel = drawing({ kind: "channel", ...(levels ? { levels } : {}) });
      expect(getDrawingGroupAppearance([channel])).toEqual(getDrawingGroupAppearance([drawing()]));
    }
  });

  it("compares effective values across ordinary lines, channels and regression rails", () => {
    const ordinary = drawing({ color: "#445566", width: 2, lineStyle: "dashed" });
    const channel = drawing({
      kind: "channel",
      levels: [{ value: 0, visible: true, color: "#445566", width: 2, lineStyle: "dashed" }],
    });
    expect(getDrawingGroupAppearance([ordinary, channel, regression(2)])).toEqual({
      appearance: { color: "#445566", width: 2, lineStyle: "dashed", lineOpacity: 1 },
      mixed: { color: false, width: false, lineStyle: false, lineOpacity: false },
    });
    expect(getDrawingGroupAppearance([ordinary, channel, regression(4)])?.mixed.width).toBe(true);
  });

  it("does not reinterpret regression band opacity as line opacity", () => {
    const first = regression(2);
    const second = regression(2);
    first.regressionBaseLine!.opacity = 0;
    second.regressionBaseLine!.opacity = 1;
    expect(getDrawingGroupAppearance([first, second])?.mixed.lineOpacity).toBe(false);
    expect(getDrawingGroupAppearance([first, second])?.appearance.lineOpacity).toBe(1);
  });

  it("returns no appearance for an empty selection and retains ordinary differences", () => {
    expect(getDrawingGroupAppearance([])).toBeNull();
    expect(getDrawingGroupAppearance([drawing(), drawing({ width: 4, lineOpacity: 0 })])).toEqual({
      appearance: { color: "#112233", width: 1, lineStyle: "solid", lineOpacity: 1 },
      mixed: { color: false, width: true, lineStyle: false, lineOpacity: true },
    });
  });
});
