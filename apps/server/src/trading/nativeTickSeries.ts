export type NativeTickSize = 10 | 100 | 1000;
export type NativeTickCandle = {
  time: number;
  /** Vendor-reported bar timestamp, before display-coordinate disambiguation. */
  actualTime: number;
  barId: string;
  tradeCount: number;
  complete: boolean;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
type NativeBar = Omit<NativeTickCandle, "time" | "barId">;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function decode(value: unknown, size: NativeTickSize): NativeBar | null {
  const bar = record(value);
  if (!bar || typeof bar.timestamp !== "string") return null;
  const actualTime = Date.parse(bar.timestamp) / 1000;
  if (
    !Number.isFinite(actualTime) ||
    !finite(bar.open) ||
    !finite(bar.high) ||
    !finite(bar.low) ||
    !finite(bar.close) ||
    !finite(bar.upVolume) ||
    !finite(bar.downVolume) ||
    !finite(bar.upTicks) ||
    !finite(bar.downTicks)
  )
    return null;
  const volume = bar.upVolume + bar.downVolume,
    tradeCount = bar.upTicks + bar.downTicks;
  if (
    bar.upVolume < 0 ||
    bar.downVolume < 0 ||
    bar.upTicks < 0 ||
    bar.downTicks < 0 ||
    !Number.isSafeInteger(tradeCount) ||
    tradeCount < 1 ||
    tradeCount > size ||
    !Number.isFinite(volume) ||
    bar.high < Math.max(bar.open, bar.close) ||
    bar.low > Math.min(bar.open, bar.close)
  )
    return null;
  return {
    actualTime,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume,
    tradeCount,
    complete: tradeCount === size,
  };
}

/** Native count bars have no vendor bar ID. History rows remain distinct even when all fields
 * match. Live updates are accepted only when their identity follows unambiguously from time
 * and an unfinished final bar; otherwise the caller must replace the entire snapshot.
 * https://partner.tradovate.com/overview/core-concepts/web-sockets/market-data/market-data-request-reference
 */
export function createNativeTickSeries(
  size: NativeTickSize,
  options: { historicalId: number; realtimeId: number; historyLimit?: number },
) {
  const historyLimit = options.historyLimit ?? 500;
  if (
    ![10, 100, 1000].includes(size) ||
    !Number.isSafeInteger(options.historicalId) ||
    !Number.isSafeInteger(options.realtimeId) ||
    !Number.isSafeInteger(historyLimit) ||
    historyLimit < 1 ||
    historyLimit > 10_000
  )
    throw new Error("Choose valid subscription IDs and a bounded native tick history.");
  const pending: NativeBar[] = [],
    queued: NativeBar[] = [];
  let bars: NativeTickCandle[] = [],
    loaded = false,
    historyReceived = 0,
    historyCollisions = 0,
    invalidated: string | undefined;
  const metadata = () => ({
    source: "native-tick-bars" as const,
    historyCoverage: "native-vendor-bars" as const,
    historyComplete: false,
    historyBarsRequested: historyLimit,
    historyBarsReceived: historyReceived,
    historicalTimestampCollisions: historyCollisions,
    availableBars: bars.length,
    identity: "snapshot-timestamp-ordinal" as const,
  });
  const empty = () => ({
    bars: [] as NativeTickCandle[],
    historical: !loaded,
    snapshot: false,
    metadata: metadata(),
  });
  const failure = (message: string) => {
    invalidated = message;
    return { ...empty(), resetRequired: message };
  };
  const append = (target: NativeTickCandle[], bar: NativeBar, ordinal: number) => {
    const last = target.at(-1),
      previousTime = last?.time ?? -Infinity;
    const step = Math.max(0.000001, Math.abs(previousTime) * Number.EPSILON * 2);
    target.push({
      ...bar,
      time: Math.max(
        bar.actualTime,
        Number.isFinite(previousTime) ? previousTime + step : -Infinity,
      ),
      barId: `native:${size}:${bar.actualTime}:${ordinal}`,
    });
  };
  const update = (target: NativeTickCandle[], incoming: NativeBar[]): string | undefined => {
    for (const bar of incoming) {
      const last = target.at(-1);
      if (!last || bar.actualTime > last.actualTime) {
        append(target, bar, 0);
        continue;
      }
      if (bar.actualTime < last.actualTime)
        return "An older native tick update requires a fresh chart snapshot.";
      if (last.complete)
        return "A native tick update shares a completed bar timestamp; refreshing to preserve every bar.";
      if (
        bar.tradeCount < last.tradeCount ||
        bar.volume < last.volume ||
        bar.open !== last.open ||
        bar.high < last.high ||
        bar.low > last.low
      )
        return "A native tick correction cannot be identified safely; refreshing the chart snapshot.";
      target[target.length - 1] = { ...bar, time: last.time, barId: last.barId };
    }
    return undefined;
  };
  return {
    metadata,
    accept(value: unknown) {
      if (invalidated) return failure(invalidated);
      const packet = record(value);
      if (!packet || (packet.id !== options.historicalId && packet.id !== options.realtimeId))
        return empty();
      if (packet.bars !== undefined && !Array.isArray(packet.bars))
        return failure("Invalid native tick history requires a fresh chart snapshot.");
      const incoming: NativeBar[] = [];
      for (const value of (packet.bars as unknown[] | undefined) ?? []) {
        const bar = decode(value, size);
        if (!bar) return failure("Invalid native tick bar requires a fresh chart snapshot.");
        incoming.push(bar);
      }
      if (!loaded) {
        if (options.historicalId !== options.realtimeId && packet.id === options.realtimeId) {
          queued.push(...incoming);
          if (queued.length > 10_000)
            return failure("Native tick updates exceeded the bounded history buffer.");
          return empty(); // A realtime EOH must never complete the historical subscription.
        }
        pending.push(...incoming);
        if (pending.length > 10_000)
          return failure("Native tick history exceeded the bounded response limit.");
        if (packet.eoh !== true) return empty();
        pending.sort((a, b) => a.actualTime - b.actualTime); // Stable sort retains payload order for timestamp ties.
        const snapshot: NativeTickCandle[] = [];
        let ordinal = 0;
        for (const bar of pending) {
          ordinal = snapshot.at(-1)?.actualTime === bar.actualTime ? ordinal + 1 : 0;
          if (ordinal) historyCollisions++;
          append(snapshot, bar, ordinal);
        }
        historyReceived = snapshot.length;
        const reason = update(snapshot, queued);
        if (reason) return failure(reason);
        bars = snapshot;
        pending.length = 0;
        queued.length = 0;
        loaded = true;
        return {
          bars: bars.map((bar) => ({ ...bar })),
          historical: true,
          snapshot: true,
          metadata: metadata(),
        };
      }
      // Tradovate may return the same ID for both phases; EOH is then the only boundary.
      if (options.historicalId !== options.realtimeId && packet.id === options.historicalId)
        return incoming.length
          ? failure("Additional historical native tick bars require a new snapshot.")
          : empty();
      const next = bars.map((bar) => ({ ...bar }));
      const reason = update(next, incoming);
      if (reason) return failure(reason); // Preflight leaves all published keys unchanged on ambiguity.
      const changed = incoming.length
        ? next.slice(
            incoming[0]!.actualTime === bars.at(-1)?.actualTime
              ? Math.max(0, bars.length - 1)
              : bars.length,
          )
        : [];
      bars = next.slice(-Math.max(historyLimit, historyReceived));
      return { bars: changed, historical: false, snapshot: false, metadata: metadata() };
    },
  };
}
