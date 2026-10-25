import { expect, it } from "vite-plus/test";
import { backtestSignals } from "./researchBacktest.ts";
const rules = {
  stopPoints: 2,
  targetPoints: 4,
  pointValue: 10,
  contracts: 1,
  costsPerContract: 2,
  slippagePoints: 0,
  maxHoldingBars: 10,
};
const bar = (time: number, open: number, high = open + 1, low = open - 1, close = open) => ({
  time,
  open,
  high,
  low,
  close,
  volume: 10,
});
it("fills after signal, charges fees and resolves ambiguous candles conservatively", () => {
  const result = backtestSignals(
    [bar(1, 90), bar(2, 100, 106, 97), bar(3, 105)],
    [{ time: 1, direction: "long" }],
    rules,
  );
  expect(result.trades[0]).toMatchObject({
    entry: 100,
    exit: 98,
    entryTime: 2,
    reason: "stop-ambiguous-bar",
    netProfit: -22,
  });
  expect(result.summary.maxClosedTradeDrawdown).toBe(22);
});
it("fills gapped stops at the adverse opening price", () => {
  const result = backtestSignals(
    [bar(1, 90), bar(2, 100), bar(3, 94)],
    [{ time: 1, direction: "long" }],
    rules,
  );
  expect(result.trades[0]).toMatchObject({ exit: 94, netProfit: -62 });
});
it("skips overlapping signals and never enters after the dataset ends", () => {
  const result = backtestSignals(
    [bar(1, 100), bar(2, 100), bar(3, 100)],
    [1, 2, 3].map((time) => ({ time, direction: "long" })),
    rules,
  );
  expect(result.summary).toMatchObject({ tradeCount: 1, skippedSignals: 2 });
});
it("rejects unsorted data and unknown or duplicate signal timestamps", () => {
  expect(() => backtestSignals([bar(2, 100), bar(1, 100)], [], rules)).toThrow();
  expect(() =>
    backtestSignals([bar(1, 100), bar(2, 100)], [{ time: 3, direction: "long" }], rules),
  ).toThrow();
});
it("uses a known target gap before a later intrabar stop", () => {
  const result = backtestSignals(
    [bar(1, 90), bar(2, 100), bar(3, 106, 107, 97)],
    [{ time: 1, direction: "long" }],
    rules,
  );
  expect(result.trades[0]).toMatchObject({ exit: 104, reason: "target-at-open", netProfit: 38 });
});
