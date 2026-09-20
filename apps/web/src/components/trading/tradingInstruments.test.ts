import { describe, expect, it } from "vite-plus/test";
import { rootFromSymbol } from "./tradingInstruments";
describe("chart symbol families", () => {
  it("recognizes dated contracts and continuous series without accepting malformed roots", () => {
    for (const symbol of ["MNQ", "MNQZ6", "@MNQ"]) expect(rootFromSymbol(symbol)).toBe("MNQ");
    expect(rootFromSymbol("@MGC")).toBe("MGC");
    for (const symbol of ["@MNQZ6", "@@MNQ", "@UNKNOWN"])
      expect(rootFromSymbol(symbol)).toBeUndefined();
  });
});
