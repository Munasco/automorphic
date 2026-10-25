export type TickBarSize = 1 | 10 | 100 | 1000;
export type RawTrade = {
  id: number;
  tradeDate: number;
  timeMs: number;
  price: number;
  volume: number;
};
export type TickCandle = {
  /** A unique chart coordinate. Calendar calculations must use actualTime. */
  time: number;
  actualTime: number;
  actualEndTime: number;
  firstTradeId: number;
  lastTradeId: number;
  barId: string;
  tradeDate: number;
  tradeCount: number;
  complete: boolean;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function tickHistoryRequestLimit(size: TickBarSize) {
  return Math.min(100_000, Math.max(12_000, size * 100));
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Decode vendor raw packets, not the ambiguous timestamp-only aggregated bars.
 * https://partner.tradovate.com/overview/core-concepts/web-sockets/market-data/tick-charts
 */
export function decodeTickPacket(value: unknown): { trades: RawTrade[]; invalidTrades: number } {
  const packet = record(value);
  if (!packet || !Array.isArray(packet.tks)) return { trades: [], invalidTrades: 0 };
  if (
    !finite(packet.bt) ||
    !finite(packet.bp) ||
    !finite(packet.ts) ||
    packet.ts <= 0 ||
    !finite(packet.td) ||
    !Number.isSafeInteger(packet.td)
  ) {
    return { trades: [], invalidTrades: packet.tks.length };
  }
  const trades: RawTrade[] = [];
  let invalidTrades = 0;
  for (const value of packet.tks) {
    const tick = record(value);
    if (
      !tick ||
      !finite(tick.id) ||
      !Number.isSafeInteger(tick.id) ||
      tick.id < 0 ||
      !finite(tick.t) ||
      !finite(tick.p) ||
      !finite(tick.s) ||
      tick.s < 0
    ) {
      invalidTrades++;
      continue;
    }
    const timeMs = packet.bt + tick.t;
    const price = (packet.bp + tick.p) * packet.ts;
    if (!Number.isSafeInteger(timeMs) || Math.abs(timeMs) > 8.64e15 || !Number.isFinite(price)) {
      invalidTrades++;
      continue;
    }
    trades.push({ id: tick.id, tradeDate: packet.td, timeMs, price, volume: tick.s });
  }
  return { trades, invalidTrades };
}

const identity = (trade: RawTrade) => `${trade.tradeDate}:${trade.id}`;
const compare = (left: RawTrade, right: RawTrade) =>
  left.timeMs - right.timeMs || left.tradeDate - right.tradeDate || left.id - right.id;
const identical = (left: RawTrade, right: RawTrade) =>
  left.timeMs === right.timeMs && left.price === right.price && left.volume === right.volume;

type TradeGroup = { trades: RawTrade[]; bar: TickCandle };

export function createTickSeries(
  size: TickBarSize,
  options: { historyLimit?: number; retainedLimit?: number } = {},
) {
  const historyLimit = options.historyLimit ?? tickHistoryRequestLimit(size);
  const retainedLimit = options.retainedLimit ?? historyLimit;
  if (
    ![1, 10, 100, 1000].includes(size) ||
    !Number.isSafeInteger(historyLimit) ||
    historyLimit < size ||
    historyLimit > 100_000 ||
    !Number.isSafeInteger(retainedLimit) ||
    retainedLimit < size ||
    retainedLimit > 100_000
  )
    throw new Error("Choose bounded raw-trade history and retention limits.");
  const pending = new Map<string, RawTrade>();
  const indexed = new Map<string, { trade: RawTrade; group: TradeGroup }>();
  const groups: TradeGroup[] = [];
  let loaded = false;
  let historyReceived = 0;
  let duplicates = 0;
  let corrections = 0;
  let invalidated: string | undefined;
  let lastTrade: RawTrade | undefined;
  let lastDisplayTime = -Infinity;
  let origin: RawTrade | undefined;

  const metadata = () => ({
    source: "raw-trades" as const,
    groupingOrigin: "oldest-loaded-trade" as const,
    groupingStartTime: origin ? origin.timeMs / 1000 : null,
    groupingFirstTradeId: origin?.id ?? null,
    rawHistoryRequested: historyLimit,
    rawHistoryReceived: historyReceived,
    historyCoverage: "limited-sampled-vendor-history" as const,
    historyComplete: false,
    historyWarning:
      "Vendor one-tick history can omit trades. Each displayed bar is a returned trade; historical trade and volume totals are incomplete.",
    retainedTrades: indexed.size,
    availableBars: groups.length,
    completeBars: groups.filter((group) => group.bar.complete).length,
    duplicateTrades: duplicates,
    correctedTrades: corrections,
  });
  const failure = (reason: string) => {
    invalidated = reason;
    return {
      bars: [] as TickCandle[],
      historical: !loaded,
      snapshot: false,
      metadata: metadata(),
      resetRequired: reason,
    };
  };
  const rebuild = (group: TradeGroup) => {
    const first = group.trades[0]!,
      last = group.trades.at(-1)!;
    group.bar = {
      ...group.bar,
      actualTime: first.timeMs / 1000,
      actualEndTime: last.timeMs / 1000,
      firstTradeId: first.id,
      lastTradeId: last.id,
      tradeCount: group.trades.length,
      complete: group.trades.length === size,
      open: first.price,
      high: Math.max(...group.trades.map((trade) => trade.price)),
      low: Math.min(...group.trades.map((trade) => trade.price)),
      close: last.price,
      volume: group.trades.reduce((total, trade) => total + trade.volume, 0),
    };
  };
  const append = (trade: RawTrade) => {
    let group = groups.at(-1);
    if (!group || group.trades.length === size || group.bar.tradeDate !== trade.tradeDate) {
      // Numeric LWC time keys preserve fractions. A microsecond is representable at current epochs;
      // scale the step for distant dates so keys remain strictly increasing without rounding real time.
      const step = Math.max(0.000001, Math.abs(lastDisplayTime) * Number.EPSILON * 2);
      const time = Math.max(
        trade.timeMs / 1000,
        Number.isFinite(lastDisplayTime) ? lastDisplayTime + step : -Infinity,
      );
      group = {
        trades: [],
        bar: {
          time,
          actualTime: trade.timeMs / 1000,
          actualEndTime: trade.timeMs / 1000,
          firstTradeId: trade.id,
          lastTradeId: trade.id,
          barId: `${size}:${identity(trade)}`,
          tradeDate: trade.tradeDate,
          tradeCount: 0,
          complete: false,
          open: trade.price,
          high: trade.price,
          low: trade.price,
          close: trade.price,
          volume: 0,
        },
      };
      lastDisplayTime = time;
      groups.push(group);
    }
    group.trades.push(trade);
    indexed.set(identity(trade), { trade, group });
    lastTrade = trade;
    return group;
  };
  const trim = () => {
    let remaining = indexed.size,
      count = 0;
    while (remaining > retainedLimit && count < groups.length - 1) {
      const group = groups[count++]!;
      remaining -= group.trades.length;
      for (const trade of group.trades) indexed.delete(identity(trade));
    }
    if (count) groups.splice(0, count);
  };

  return {
    metadata,
    accept(packet: unknown, endOfHistory = false) {
      if (invalidated) return failure(invalidated);
      const decoded = decodeTickPacket(packet);
      if (decoded.invalidTrades)
        return failure("Invalid raw trade data requires a fresh tick history.");
      if (!loaded) {
        for (const trade of decoded.trades) {
          const previous = pending.get(identity(trade));
          if (previous && identical(previous, trade)) duplicates++;
          else pending.set(identity(trade), trade);
        }
        if (pending.size > historyLimit)
          return failure("Raw trade history exceeded the bounded request limit.");
        if (!endOfHistory)
          return {
            bars: [] as TickCandle[],
            historical: true,
            snapshot: false,
            metadata: metadata(),
          };
        const ordered = [...pending.values()].sort(compare);
        historyReceived = ordered.length;
        origin = ordered[0];
        for (const trade of ordered) append(trade);
        for (const group of groups) rebuild(group);
        pending.clear();
        loaded = true;
        trim();
        return {
          bars: groups.map((group) => ({ ...group.bar })),
          historical: true,
          snapshot: true,
          metadata: metadata(),
        };
      }

      // Preflight the whole packet so late data never partially mutates an already displayed sequence.
      const incoming = new Map<string, RawTrade>();
      for (const trade of decoded.trades) incoming.set(identity(trade), trade);
      const ordered = [...incoming.values()].sort(compare);
      for (const trade of ordered) {
        const existing = indexed.get(identity(trade));
        if (existing && existing.trade.timeMs !== trade.timeMs)
          return failure("A trade timestamp correction requires a fresh tick history.");
        if (!existing && lastTrade && compare(trade, lastTrade) <= 0)
          return failure(
            "A late or expired raw trade requires a fresh tick history; displayed bars were not regrouped.",
          );
      }
      const changed = new Set<TradeGroup>();
      for (const trade of ordered) {
        const existing = indexed.get(identity(trade));
        if (existing) {
          if (identical(existing.trade, trade)) {
            duplicates++;
            continue;
          }
          const index = existing.group.trades.indexOf(existing.trade);
          existing.group.trades[index] = trade;
          indexed.set(identity(trade), { trade, group: existing.group });
          changed.add(existing.group);
          corrections++;
        } else {
          origin ??= trade;
          changed.add(append(trade));
        }
      }
      for (const group of changed) rebuild(group);
      trim();
      const retained = new Set(groups);
      return {
        bars: [...changed]
          .filter((group) => retained.has(group))
          .map((group) => ({ ...group.bar }))
          .sort((a, b) => a.time - b.time),
        historical: false,
        snapshot: false,
        metadata: metadata(),
      };
    },
  };
}
