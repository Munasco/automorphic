import { describe, expect, it } from "vite-plus/test";
import { replayViewport } from "./replayViewport";

describe("replay viewport", () => {
  it.each([0, 12, 20, 100])("honors a %s-bar margin on seeks without changing zoom", (margin) => {
    const range = replayViewport({ from: 20, to: 125 }, 120, 19, true, margin);
    expect(range).toEqual({ from: 18 + margin - 105, to: 18 + margin });
    expect(replayViewport(range, 19, 20, false, margin)).toEqual({
      from: range.from + 1,
      to: range.to + 1,
    });
  });
  it("preserves a manually positioned or narrow viewport when the replay head is outside it", () => {
    for (const margin of [0, 20, 100])
      expect(replayViewport({ from: 30, to: 60 }, 19, 20, false, margin)).toEqual({
        from: 30,
        to: 60,
      });
    const narrow = replayViewport({ from: 0, to: 30 }, 120, 19, true, 100);
    expect(narrow).toEqual({ from: 88, to: 118 });
    expect(replayViewport(narrow, 19, 20, false, 100)).toEqual(narrow);
  });
  it("restores the live range independently of the current margin", () => {
    expect(replayViewport({ from: 20, to: 139 }, 120, 120, false, 0)).toEqual({
      from: 20,
      to: 139,
    });
  });
  it.each([-1, 101, NaN, Infinity, 1.5])("falls back for invalid margin %s", (margin) => {
    expect(replayViewport({ from: 20, to: 125 }, 120, 19, true, margin)).toEqual({
      from: -82,
      to: 23,
    });
  });
  it("keeps zoom on replay entry, even with little history before the head", () => {
    expect(replayViewport({ from: 20, to: 125 }, 120, 19, true)).toEqual({ from: -82, to: 23 });
  });
  it("advances by candle count without repeatedly fitting history", () => {
    expect(replayViewport({ from: 20, to: 125 }, 120, 121, false)).toEqual({ from: 21, to: 126 });
    expect(replayViewport({ from: 20, to: 125 }, 120, 125, false)).toEqual({ from: 25, to: 130 });
  });
  it("leaves a manually panned viewport alone", () => {
    expect(replayViewport({ from: 0, to: 60 }, 120, 121, false)).toEqual({ from: 0, to: 60 });
    expect(replayViewport({ from: 125, to: 140 }, 120, 121, false)).toEqual({ from: 125, to: 140 });
  });
  it("repositions explicit backward and forward seeks without changing zoom", () => {
    expect(replayViewport({ from: 0, to: 60 }, 120, 10, true)).toEqual({ from: -46, to: 14 });
    expect(replayViewport({ from: 0, to: 60 }, 120, 300, true)).toEqual({ from: 244, to: 304 });
  });
  it("uses a stable default for uninitialized or invalid ranges", () => {
    for (const range of [null, { from: NaN, to: 20 }, { from: 10, to: 10 }])
      expect(replayViewport(range, 120, 19, true)).toEqual({ from: -82, to: 23 });
  });
});
