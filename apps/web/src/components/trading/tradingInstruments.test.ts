import { describe, expect, it } from "vite-plus/test";
import {
  rootFromSymbol,
  isContinuousSymbol,
  continuousSeriesFromSymbol,
  toContinuousSymbol,
} from "./tradingInstruments";
describe("chart symbol families", () => {
  it("recognizes dated contracts and continuous series without accepting malformed roots", () => {
    for (const symbol of ["MNQ", "MNQZ6", "@MNQ", "MNQ1!", "MNQ2!"])
      expect(rootFromSymbol(symbol)).toBe("MNQ");
    expect(rootFromSymbol("@MGC")).toBe("MGC");
    expect(rootFromSymbol("MGC1!")).toBe("MGC");
    expect(rootFromSymbol("NQ2!")).toBe("NQ");
    for (const symbol of ["@MNQZ6", "@@MNQ", "@UNKNOWN", "INVALID1!"])
      expect(rootFromSymbol(symbol)).toBeUndefined();
  });

  it("identifies continuous symbols and their front/deferred series", () => {
    expect(isContinuousSymbol("MNQ1!")).toBe(true);
    expect(isContinuousSymbol("NQ2!")).toBe(true);
    expect(isContinuousSymbol("@MNQ")).toBe(true);
    expect(isContinuousSymbol("MNQU6")).toBe(false);
    expect(isContinuousSymbol("MNQ")).toBe(false);

    expect(continuousSeriesFromSymbol("MNQ1!")).toBe("front");
    expect(continuousSeriesFromSymbol("@MNQ")).toBe("front");
    expect(continuousSeriesFromSymbol("MNQ2!")).toBe("deferred");
    expect(continuousSeriesFromSymbol("MNQU6")).toBeNull();

    expect(toContinuousSymbol("MNQ", "front")).toBe("MNQ1!");
    expect(toContinuousSymbol("NQ", "deferred")).toBe("NQ2!");
  });
});
