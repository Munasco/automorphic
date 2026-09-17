// @effect-diagnostics globalFetch:off globalDate:off - Native broker REST adapter, bounded by request timeouts and timestamped at completion.
import type { TradingAccountRow, TradingAccountSnapshot } from "@t3tools/contracts";
import { credentials } from "./marketData.ts";

type Entity = Record<string, unknown>;
const entity = (value: unknown): value is Entity =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const text = (value: unknown) => (typeof value === "string" ? value : undefined);
const timestamp = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : undefined;

export class TradingAccountError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export function parseAccountId(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (!/^[1-9]\d*$/.test(value) || !id(Number(value)))
    throw new TradingAccountError("Choose a valid trading account.", 400);
  return Number(value);
}

/** Join fills through their orders: Tradovate fills do not carry accountId. */
export function normalizeAccountData(
  accountId: number,
  raw: { positions: Entity[]; orders: Entity[]; fills: Entity[]; versions: Entity[] },
  symbols: ReadonlyMap<number, string>,
): Pick<TradingAccountSnapshot, "positions" | "orders" | "history"> {
  const ordersById = new Map(
    raw.orders
      .filter((row) => id(row.id) && row.accountId === accountId)
      .map((row) => [row.id, row]),
  );
  const versions = new Map<unknown, Entity>();
  for (const version of raw.versions) {
    if (!id(version.id) || !ordersById.has(version.orderId)) continue;
    const previous = versions.get(version.orderId);
    if (!previous || Number(previous.id) < version.id) versions.set(version.orderId, version);
  }
  const base = (row: Entity): TradingAccountRow | null => {
    if (!id(row.id) || !id(row.contractId)) return null;
    return {
      id: row.id,
      accountId,
      contractId: row.contractId,
      symbol: symbols.get(row.contractId),
      timestamp: timestamp(row.timestamp),
    };
  };
  const positions: TradingAccountRow[] = [];
  const orders: TradingAccountRow[] = [];
  const history: TradingAccountRow[] = [];
  for (const row of raw.positions) {
    const entry = base(row);
    const netPos = number(row.netPos);
    if (!entry || row.accountId !== accountId || netPos === undefined || netPos === 0) continue;
    positions.push({ ...entry, netPos, netPrice: number(row.netPrice) });
  }
  for (const row of ordersById.values()) {
    const entry = base(row);
    if (!entry) continue;
    const version = versions.get(row.id);
    orders.push({
      ...entry,
      side: text(row.action),
      status: text(row.ordStatus),
      quantity: number(version?.orderQty),
      type: text(version?.orderType),
      price: number(version?.price),
      stopPrice: number(version?.stopPrice),
    });
  }
  for (const row of raw.fills) {
    const order = ordersById.get(row.orderId);
    const entry = base(row);
    // Unknown orders, foreign contracts and busted fills cannot be attributed safely.
    if (!entry || !order || row.contractId !== order.contractId || row.active === false) continue;
    history.push({
      ...entry,
      side: text(row.action),
      quantity: number(row.qty),
      fillPrice: number(row.price),
    });
  }
  const newest = (a: TradingAccountRow, b: TradingAccountRow) =>
    (b.timestamp ? Date.parse(b.timestamp) : 0) - (a.timestamp ? Date.parse(a.timestamp) : 0) ||
    b.id - a.id;
  return {
    positions: positions.sort(newest),
    orders: orders.sort(newest),
    history: history.sort(newest),
  };
}

// Read-only endpoints documented at https://api.tradovate.com/.
// /fill/list provides the broker's currently available fills, not a historical report archive.
export async function accountSnapshot(
  requestedAccountId?: number,
): Promise<TradingAccountSnapshot> {
  const session = await credentials().catch(() => {
    throw new TradingAccountError("Configure a Tradovate session on the server.", 503);
  });
  const read = async (path: string): Promise<Entity[]> => {
    const response = await fetch(`https://${session.environment}.tradovateapi.com/v1/${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${session.token}` },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw new TradingAccountError(
          "Tradovate rejected account access. Check the server session and API permissions.",
        );
      if (response.status === 429)
        throw new TradingAccountError("Tradovate rate limit reached. Retry shortly.", 429);
      throw new TradingAccountError("Tradovate account data is temporarily unavailable.");
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body) || !body.every(entity))
      throw new TradingAccountError("Tradovate returned an invalid account response.");
    return body;
  };
  const accounts = (await read("account/list")).flatMap((row) =>
    id(row.id) && typeof row.name === "string" ? [{ id: row.id, name: row.name }] : [],
  );
  const accountId = requestedAccountId ?? accounts[0]?.id ?? null;
  if (accountId !== null && !accounts.some((account) => account.id === accountId))
    throw new TradingAccountError(
      "This trading account is not available in the current session.",
      404,
    );
  const common = {
    accounts,
    accountId,
    environment: session.environment as "demo" | "live",
    fetchedAt: new Date().toISOString(),
    historyScope: "available-session-fills" as const,
  };
  if (accountId === null) return { ...common, positions: [], orders: [], history: [] };
  const [positions, orders, fills, versions] = await Promise.all([
    read("position/list"),
    read("order/list"),
    read("fill/list"),
    read("orderVersion/list"),
  ]);
  const raw = { positions, orders, fills, versions };
  const rows = normalizeAccountData(accountId, raw, new Map());
  const contractIds = [
    ...new Set([...rows.positions, ...rows.orders, ...rows.history].map((row) => row.contractId)),
  ];
  const symbols = new Map<number, string>();
  // Bounded batches keep URL size reasonable; the UI falls back to exact contract IDs if lookup fails.
  for (let offset = 0; offset < contractIds.length; offset += 100) {
    const ids = contractIds.slice(offset, offset + 100);
    const contracts = await read(`contract/items?ids=${ids.join(",")}`).catch(() => []);
    for (const contract of contracts)
      if (id(contract.id) && ids.includes(contract.id) && typeof contract.name === "string")
        symbols.set(contract.id, contract.name);
  }
  return {
    ...common,
    fetchedAt: new Date().toISOString(),
    ...normalizeAccountData(accountId, raw, symbols),
  };
}
