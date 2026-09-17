import { describe, expect, it } from "vite-plus/test";
import { previousCloseColors } from "./previousCloseColors";
const palette = {
  up: "#11aa11",
  down: "#aa1111",
  wickUp: "#22aa22",
  wickDown: "#aa2222",
  borderUp: "#33aa33",
  borderDown: "#aa3333",
};

describe("previous close bar colors", () => {
  it.each([
    [{ open: 110, close: 105 }, { close: 100 }, true],
    [{ open: 90, close: 95 }, { close: 100 }, false],
    [{ open: 110, close: 100 }, { close: 100 }, true],
    [{ open: 90, close: 95 }, undefined, true],
    [{ open: 110, close: 105 }, undefined, false],
    [{ open: 100, close: 100 }, undefined, true],
    [{ open: 110, close: 105 }, { close: NaN }, false],
  ] as const)("uses chronological close comparison for %j against %j", (bar, previous, up) => {
    expect(previousCloseColors(bar, previous, true, palette)).toEqual({
      color: up ? palette.up : palette.down,
      wickColor: up ? palette.wickUp : palette.wickDown,
      borderColor: up ? palette.borderUp : palette.borderDown,
    });
  });
  it("removes overrides when disabled and inherits body colors for unspecified wick/border colors", () => {
    const bar = { open: 110, close: 105 },
      previous = { close: 100 };
    expect(previousCloseColors(bar, previous, false, palette)).toEqual({});
    expect(
      previousCloseColors(bar, previous, true, { up: palette.up, down: palette.down }),
    ).toEqual({ color: palette.up, wickColor: palette.up, borderColor: palette.up });
  });
  it("same-bar updates compare against the completed bar, and historical corrections affect the next candle", () => {
    const previous = { close: 100 };
    expect(previousCloseColors({ open: 110, close: 105 }, previous, true, palette).color).toBe(
      palette.up,
    );
    expect(previousCloseColors({ open: 110, close: 103 }, previous, true, palette).color).toBe(
      palette.up,
    );
    expect(previousCloseColors({ open: 110, close: 99 }, previous, true, palette).color).toBe(
      palette.down,
    );
    expect(
      previousCloseColors({ open: 110, close: 105 }, { close: 106 }, true, palette).color,
    ).toBe(palette.down);
  });
});
