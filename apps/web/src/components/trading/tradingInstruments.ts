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
export function isContinuousSymbol(symbol: string): boolean {
  return /^(?:@(MGC|MNQ|GC|NQ)|(MGC|MNQ|GC|NQ)[12]!)$/.test(symbol);
}

export function continuousSeriesFromSymbol(symbol: string): "front" | "deferred" | null {
  if (symbol.endsWith("1!") || symbol.startsWith("@")) return "front";
  if (symbol.endsWith("2!")) return "deferred";
  return null;
}

export function toContinuousSymbol(root: string, series: "front" | "deferred" = "front"): string {
  return `${root}${series === "deferred" ? "2!" : "1!"}`;
}

export function rootFromSymbol(symbol: string): InstrumentRoot | undefined {
  const continuousMatch = /^(?:@(MGC|MNQ|GC|NQ)|(MGC|MNQ|GC|NQ)[12]!)$/.exec(symbol);
  if (continuousMatch) {
    const root = (continuousMatch[1] || continuousMatch[2]) as InstrumentRoot;
    return isInstrumentRoot(root) ? root : undefined;
  }
  const root = symbol.startsWith("@")
    ? symbol.slice(1)
    : /^(MGC|MNQ|GC|NQ)(?:[FGHJKMNQUVXZ]\d{1,2})?$/.exec(symbol)?.[1];
  return isInstrumentRoot(root) ? root : undefined;
}
