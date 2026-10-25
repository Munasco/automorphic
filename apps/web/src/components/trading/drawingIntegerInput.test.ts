import { describe, expect, it } from "vite-plus/test";
import { acceptsDrawingIntegerInsertion, isDrawingIntegerDraft } from "./drawingIntegerInput";

describe("bar coordinate input", () => {
  it("rejects a decimal key without converting later digits into a rounded bar", () => {
    let value = "12";
    for (const key of [".", "6"]) {
      const input = { value, selectionStart: value.length, selectionEnd: value.length };
      if (acceptsDrawingIntegerInsertion(input, key)) value += key;
    }
    expect(value).toBe("126");
  });

  it("allows signed replacement and deletion drafts while rejecting decimal or plus replacements", () => {
    const selected = { value: "258", selectionStart: 0, selectionEnd: 3 };
    expect(acceptsDrawingIntegerInsertion(selected, "-12")).toBe(true);
    expect(acceptsDrawingIntegerInsertion(selected, "-")).toBe(true);
    expect(acceptsDrawingIntegerInsertion(selected, "")).toBe(true);
    for (const replacement of ["258.9", "+258", "2e3", "2,580", " 258 ", "12\n3", "12\n"])
      expect(acceptsDrawingIntegerInsertion(selected, replacement)).toBe(false);
    // Validation must not move the caret or mutate a rejected selection.
    expect(selected).toEqual({ value: "258", selectionStart: 0, selectionEnd: 3 });
  });

  it("honors the selected substring when inserting or replacing a minus sign", () => {
    expect(
      acceptsDrawingIntegerInsertion({ value: "123", selectionStart: 0, selectionEnd: 0 }, "-"),
    ).toBe(true);
    expect(
      acceptsDrawingIntegerInsertion({ value: "-123", selectionStart: 0, selectionEnd: 1 }, "-"),
    ).toBe(true);
    expect(
      acceptsDrawingIntegerInsertion({ value: "-123", selectionStart: 2, selectionEnd: 3 }, "9"),
    ).toBe(true);
    expect(
      acceptsDrawingIntegerInsertion({ value: "-123", selectionStart: 0, selectionEnd: 0 }, "-"),
    ).toBe(false);
    expect(
      acceptsDrawingIntegerInsertion({ value: "123", selectionStart: 1, selectionEnd: 2 }, "-"),
    ).toBe(false);
  });

  it("accepts empty and negative integer drafts but rejects a whole invalid input event", () => {
    for (const value of ["", "-", "0", "-0", "123", "-123", "0012"])
      expect(isDrawingIntegerDraft(value)).toBe(true);
    for (const value of ["12.6", "+12", "--12", "12-", "1e2", "NaN", "Infinity"])
      expect(isDrawingIntegerDraft(value)).toBe(false);
  });
});
