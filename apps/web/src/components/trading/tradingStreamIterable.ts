import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Adapt complete snapshot callbacks to a cancellable stream, retaining at most one unread snapshot. */
export async function* tradingStreamIterable<T>(
  signal: AbortSignal,
  subscribe: (emit: (snapshot: T) => void) => () => void,
  initialValue: T,
): AsyncGenerator<T> {
  if (signal.aborted) return;
  let pending: { value: T } | undefined;
  let wake: (() => void) | undefined;
  let dispose = () => {};
  let closed = false;
  const cleanup = () => {
    closed = true;
    const close = dispose;
    dispose = () => {};
    close();
  };
  const onAbort = () => {
    cleanup();
    wake?.();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    dispose = subscribe((value) => {
      if (closed || signal.aborted) return;
      pending = { value };
      wake?.();
    });
    if (signal.aborted) return;
    // A cache value must exist even if the provider never sends data, so refetch can cancel/restart.
    yield initialValue;
    while (!signal.aborted) {
      if (!pending)
        await new Promise<void>((resolve) => {
          wake = resolve;
          if (pending || signal.aborted) resolve();
        });
      wake = undefined;
      if (signal.aborted) break;
      const snapshot = pending;
      pending = undefined;
      if (snapshot) yield snapshot.value;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    cleanup();
  }
}

/** Disabling one view must not terminate a stream still used by another active view. */
export function cancelInactiveTradingStream(
  client: QueryClient,
  queryKey: QueryKey,
): Promise<void> {
  const query = client.getQueryCache().find({ queryKey, exact: true });
  return query && !query.isActive()
    ? client.cancelQueries({ queryKey, exact: true })
    : Promise.resolve();
}
