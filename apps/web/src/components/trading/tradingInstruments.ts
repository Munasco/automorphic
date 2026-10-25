export const INSTRUMENTS = {
  MGC: { name: "Micro Gold Futures", exchange: "COMEX", family: "gold" },
  MNQ: { name: "Micro E-mini Nasdaq-100 Futures", exchange: "CME", family: "nasdaq" },
  GC: { name: "Gold Futures", exchange: "COMEX", family: "gold" },
  NQ: { name: "E-mini Nasdaq-100 Futures", exchange: "CME", family: "nasdaq" },
} as const;

export type InstrumentRoot = keyof typeof INSTRUMENTS;
export const INSTRUMENT_ROOTS = Object.keys(INSTRUMENTS) as InstrumentRoot[];
export function isInstrumentRoot(value: unknown): value is InstrumentRoot {
  return typeof value === "string" && Object.hasOwn(INSTRUMENTS, value);
}
export function rootFromSymbol(symbol: string): InstrumentRoot | undefined {
  const root = symbol.startsWith("@")
    ? symbol.slice(1)
    : /^(MGC|MNQ|GC|NQ)(?:[FGHJKMNQUVXZ]\d{1,2})?$/.exec(symbol)?.[1];
  return isInstrumentRoot(root) ? root : undefined;
}
