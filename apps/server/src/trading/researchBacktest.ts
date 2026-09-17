import type { Candle } from "./marketData.ts";
export interface BacktestSignal {
  time: number;
  direction: "long" | "short";
}
export interface BacktestRules {
  stopPoints: number;
  targetPoints: number;
  pointValue: number;
  contracts: number;
  costsPerContract: number;
  slippagePoints: number;
  maxHoldingBars: number;
}
/** Signals are decisions after the timestamped bar closes; entries always use the next bar's open. */
export function backtestSignals(
  bars: readonly Candle[],
  signals: readonly BacktestSignal[],
  rules: BacktestRules,
) {
  if (bars.length < 2 || bars.length > 100_000 || signals.length > 50_000)
    throw new Error("Use 2–100,000 bars and at most 50,000 signals.");
  if (
    ![
      rules.stopPoints,
      rules.targetPoints,
      rules.pointValue,
      rules.contracts,
      rules.costsPerContract,
      rules.slippagePoints,
      rules.maxHoldingBars,
    ].every(Number.isFinite) ||
    rules.stopPoints <= 0 ||
    rules.targetPoints <= 0 ||
    rules.pointValue <= 0 ||
    !Number.isInteger(rules.contracts) ||
    rules.contracts < 1 ||
    rules.costsPerContract < 0 ||
    rules.slippagePoints < 0 ||
    !Number.isInteger(rules.maxHoldingBars) ||
    rules.maxHoldingBars < 1
  )
    throw new Error("Invalid risk, size, cost or holding-period assumptions.");
  const index = new Map(bars.map((bar, i) => [bar.time, i]));
  if (
    index.size !== bars.length ||
    bars.some(
      (bar, i) =>
        ![bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) ||
        bar.high < Math.max(bar.open, bar.close, bar.low) ||
        bar.low > Math.min(bar.open, bar.close) ||
        (i > 0 && bar.time <= bars[i - 1]!.time),
    )
  )
    throw new Error("Bars must be unique, valid and sorted ascending.");
  const seen = new Set<number>();
  for (const signal of signals) {
    if (
      !index.has(signal.time) ||
      seen.has(signal.time) ||
      !["long", "short"].includes(signal.direction)
    )
      throw new Error("Signals must refer to unique bar timestamps in this dataset.");
    seen.add(signal.time);
  }
  const trades: Array<{
    signalTime: number;
    entryTime: number;
    exitTime: number;
    direction: "long" | "short";
    entry: number;
    exit: number;
    reason: string;
    netProfit: number;
  }> = [];
  let lastExit = -1;
  let skipped = 0;
  for (const signal of [...signals].sort((a, b) => a.time - b.time)) {
    const entryIndex = index.get(signal.time)! + 1;
    if (entryIndex >= bars.length || entryIndex <= lastExit) {
      skipped++;
      continue;
    }
    const sign = signal.direction === "long" ? 1 : -1;
    const entryBar = bars[entryIndex]!;
    const entry = entryBar.open + sign * rules.slippagePoints;
    const stop = entry - sign * rules.stopPoints;
    const target = entry + sign * rules.targetPoints;
    let exitIndex = Math.min(bars.length - 1, entryIndex + rules.maxHoldingBars - 1);
    let exit = bars[exitIndex]!.close;
    let reason = exitIndex === bars.length - 1 ? "dataset-end" : "holding-period";
    for (let i = entryIndex; i <= exitIndex; i++) {
      const bar = bars[i]!;
      if (i > entryIndex && (sign === 1 ? bar.open >= target : bar.open <= target)) {
        // The opening print is known to precede the candle's later high/low.
        exit = target;
        exitIndex = i;
        reason = "target-at-open";
        break;
      }
      const stopped = sign === 1 ? bar.low <= stop : bar.high >= stop;
      const targetHit = sign === 1 ? bar.high >= target : bar.low <= target;
      if (stopped) {
        exit = sign === 1 ? Math.min(stop, bar.open) : Math.max(stop, bar.open);
        exitIndex = i;
        reason = targetHit ? "stop-ambiguous-bar" : "stop";
        break;
      }
      if (targetHit) {
        exit = target;
        exitIndex = i;
        reason = "target";
        break;
      }
    }
    exit -= sign * rules.slippagePoints;
    lastExit = exitIndex;
    trades.push({
      signalTime: signal.time,
      entryTime: entryBar.time,
      exitTime: bars[exitIndex]!.time,
      direction: signal.direction,
      entry,
      exit,
      reason,
      netProfit:
        ((exit - entry) * sign * rules.pointValue - rules.costsPerContract) * rules.contracts,
    });
  }
  let equity = 0,
    peak = 0,
    drawdown = 0,
    profits = 0,
    losses = 0;
  for (const trade of trades) {
    equity += trade.netProfit;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
    if (trade.netProfit > 0) profits += trade.netProfit;
    else losses -= trade.netProfit;
  }
  const winners = trades.filter((trade) => trade.netProfit > 0).length;
  return {
    trades,
    summary: {
      tradeCount: trades.length,
      skippedSignals: skipped,
      winners,
      winRate: trades.length ? winners / trades.length : null,
      netProfit: equity,
      expectancy: trades.length ? equity / trades.length : null,
      profitFactor: losses ? profits / losses : null,
      maxClosedTradeDrawdown: drawdown,
    },
    assumptions: rules,
    limitations: [
      "User-supplied signals must themselves be free of future information; the engine cannot verify their generation.",
      "Entries use the next bar open. One position at a time. Stops win if a candle touches both stop and target.",
      "OHLC simulation; no liquidity or queue modelling. Dataset gaps and contract rolls require separate validation.",
    ],
  };
}
