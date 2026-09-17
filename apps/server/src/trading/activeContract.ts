// @effect-diagnostics globalTimers:off globalDate:off - A short-lived market-data connection reads contract activity.
export interface ActiveContractCandidate {
  id: number;
  name: string;
  expirationDate: string;
  firstIntentDate?: string;
}
export interface ContractActivity {
  volume: number;
  openInterest: number;
}

export function activeCandidates(contracts: ActiveContractCandidate[], now = Date.now()) {
  return contracts
    .filter((contract) => {
      const expiry = Date.parse(contract.expirationDate);
      const delivery = contract.firstIntentDate ? Date.parse(contract.firstIntentDate) : expiry;
      return (
        Number.isFinite(expiry) && Number.isFinite(delivery) && Math.min(expiry, delivery) > now
      );
    })
    .sort((a, b) => Date.parse(a.expirationDate) - Date.parse(b.expirationDate))
    .slice(0, 3);
}

export function mostActiveContract(
  candidates: ActiveContractCandidate[],
  activity: ReadonlyMap<number, ContractActivity>,
) {
  // Never silently substitute the nearest month when activity is unavailable.
  if (!candidates.length || candidates.some((contract) => !activity.has(contract.id)))
    throw new Error("Could not confirm the active contract. Please retry.");
  const ranked = [...candidates].sort((a, b) => {
    const left = activity.get(a.id)!;
    const right = activity.get(b.id)!;
    return (
      right.volume - left.volume ||
      right.openInterest - left.openInterest ||
      Date.parse(a.expirationDate) - Date.parse(b.expirationDate)
    );
  });
  const winner = ranked[0]!;
  const values = activity.get(winner.id)!;
  if (values.volume <= 0 && values.openInterest <= 0)
    throw new Error("No trading activity is available to select the active contract.");
  return { id: winner.id, name: winner.name };
}

export function readContractActivity(candidates: ActiveContractCandidate[], token: string) {
  return new Promise<Map<number, ContractActivity>>((resolve, reject) => {
    if (!candidates.length) {
      reject(new Error("No current contracts available."));
      return;
    }
    const ws = new WebSocket("wss://md.tradovateapi.com/v1/websocket");
    const activity = new Map<number, ContractActivity>();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      ws.close(); // Closing also releases every quote subscription.
      if (error) reject(error);
      else resolve(activity);
    };
    const timeout = setTimeout(
      () => finish(new Error("Active contract lookup timed out. Please retry.")),
      10_000,
    );
    ws.addEventListener("error", () => finish(new Error("Could not read contract activity.")));
    ws.addEventListener("close", () => finish(new Error("Contract activity connection closed.")));
    ws.addEventListener("message", (event) => {
      try {
        const raw = String(event.data);
        if (raw === "o") ws.send(`authorize\n1\n\n${token}`);
        if (raw === "h") ws.send("[]");
        if (!raw.startsWith("a")) return;
        for (const message of JSON.parse(raw.slice(1))) {
          if (message.s && message.s !== 200) {
            finish(new Error("Could not read contract activity."));
            return;
          }
          if (message.i === 1)
            candidates.forEach((contract, index) => {
              ws.send(
                `md/subscribeQuote\n${index + 2}\n\n${JSON.stringify({ symbol: contract.name })}`,
              );
            });
          for (const quote of message.d?.quotes ?? []) {
            if (!candidates.some((contract) => contract.id === quote.contractId)) continue;
            const volume = quote.entries?.TotalTradeVolume?.size;
            const openInterest = quote.entries?.OpenInterest?.size;
            if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0) continue;
            activity.set(quote.contractId, {
              volume,
              openInterest:
                typeof openInterest === "number" &&
                Number.isFinite(openInterest) &&
                openInterest >= 0
                  ? openInterest
                  : 0,
            });
          }
        }
        if (activity.size === candidates.length) finish();
      } catch {
        finish(new Error("Invalid contract activity response."));
      }
    });
  });
}
