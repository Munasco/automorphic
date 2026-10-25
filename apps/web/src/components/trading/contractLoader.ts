import type { FuturesContract } from "./SymbolPicker";
import { rootFromSymbol, type InstrumentRoot } from "./tradingInstruments";

export type ContractResult =
  | { root: InstrumentRoot; contracts: FuturesContract[]; error?: never }
  | { root: InstrumentRoot; error: string; contracts?: never };

/** Publish each market immediately; a slow or failed market cannot block the others. */
export async function loadMarketContracts(
  roots: readonly InstrumentRoot[],
  signal: AbortSignal,
  request: typeof fetch,
  publish: (result: ContractResult) => void,
) {
  await Promise.all(
    roots.map(async (root) => {
      try {
        const response = await request(`/api/trading/contracts?root=${root}`, { signal });
        if (!response.ok) throw new Error(`Could not load ${root}. Please retry.`);
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error("Invalid contract response.");
        const contracts = data
          .filter(
            (item): item is { id: number; name: string } =>
              typeof item === "object" &&
              item !== null &&
              Number.isSafeInteger(item.id) &&
              item.id > 0 &&
              typeof item.name === "string" &&
              rootFromSymbol(item.name) === root,
          )
          .map((item) => ({ ...item, root }));
        if (!contracts.length) throw new Error(`No ${root} contract available. Please retry.`);
        if (!signal.aborted) publish({ root, contracts });
      } catch (error) {
        if (!signal.aborted)
          publish({
            root,
            error: error instanceof Error ? error.message : `Could not load ${root}. Please retry.`,
          });
      }
    }),
  );
}
