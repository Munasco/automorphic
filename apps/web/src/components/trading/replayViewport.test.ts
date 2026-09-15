import { describe, expect, it } from "vite-plus/test";
import { replayViewport } from "./replayViewport";

describe("replay viewport", () => {
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
