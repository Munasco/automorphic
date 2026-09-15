import {
  DEFAULT_INITIAL_BALANCE,
  INDICATOR_CATALOG,
  getIndicatorInputs,
  normalizeIndicatorInputs,
  isValidInitialBalanceSettings,
  resolveInitialBalanceSettings,
  type ChartIndicators,
  type IndicatorInputSettings,
  type IndicatorInputValues,
  type IndicatorKey,
  type InitialBalanceSettings,
} from "./indicatorCatalog";
import { normalizeIndicatorAppearance, type IndicatorAppearance } from "./indicatorStyles";

export const DEFAULT_VOLUME_COLORS = { up: "#26a69a", down: "#ef5350" };
export const MAX_CHART_INDICATORS = 100;
export type ChartIndicatorInstance = {
  id: string;
  key: IndicatorKey;
  hidden: boolean;
  inputs: IndicatorInputValues;
  appearance: IndicatorAppearance;
  initialBalance?: InitialBalanceSettings;
  volumeColors?: typeof DEFAULT_VOLUME_COLORS;
};
export type ChartIndicatorPreferences = {
  indicators: ChartIndicators;
  hiddenIndicators: ChartIndicators;
  indicatorInputs: IndicatorInputSettings;
  appearance: Partial<Record<IndicatorKey, IndicatorAppearance>>;
  initialBalance: InitialBalanceSettings;
  volumeColors: typeof DEFAULT_VOLUME_COLORS;
  extraIndicators?: ChartIndicatorInstance[];
  indicatorOrder?: string[];
};
export const isIndicatorKey = (value: unknown): value is IndicatorKey =>
  typeof value === "string" && INDICATOR_CATALOG.some(({ key }) => key === value);
export const baseIndicatorKey = (id: string): IndicatorKey | null => {
  const key = id.startsWith("base:") ? id.slice(5) : null;
  return isIndicatorKey(key) ? key : null;
};
export function createIndicatorInstance(key: IndicatorKey, id: string): ChartIndicatorInstance {
  return {
    id,
    key,
    hidden: false,
    inputs: getIndicatorInputs(key),
    appearance: {},
    ...(key === "ib" ? { initialBalance: { ...DEFAULT_INITIAL_BALANCE } } : {}),
    ...(key === "volume" ? { volumeColors: { ...DEFAULT_VOLUME_COLORS } } : {}),
  };
}
/** Keep valid saved positions, then append newly available instances in their default order. */
export function normalizeIndicatorOrder(order: unknown, activeIds: readonly string[]): string[] {
  const active = new Set(activeIds);
  const result = new Set<string>();
  if (Array.isArray(order))
    for (const id of order) if (typeof id === "string" && active.has(id)) result.add(id);
  for (const id of activeIds) result.add(id);
  return [...result];
}
export function getChartIndicatorInstances(
  preferences: ChartIndicatorPreferences,
): ChartIndicatorInstance[] {
  const instances: ChartIndicatorInstance[] = [
    ...INDICATOR_CATALOG.filter(({ key }) => preferences.indicators[key]).map(({ key }) => ({
      id: `base:${key}`,
      key,
      hidden: preferences.hiddenIndicators[key],
      inputs: getIndicatorInputs(key, preferences.indicatorInputs),
      appearance: preferences.appearance[key] ?? {},
      ...(key === "ib" ? { initialBalance: preferences.initialBalance } : {}),
      ...(key === "volume" ? { volumeColors: preferences.volumeColors } : {}),
    })),
    ...(preferences.extraIndicators ?? []),
  ];
  if (!preferences.indicatorOrder?.length) return instances;
  const byId = new Map(instances.map((instance) => [instance.id, instance]));
  return normalizeIndicatorOrder(
    preferences.indicatorOrder,
    instances.map(({ id }) => id),
  ).map((id) => byId.get(id)!);
}
export const indicatorReadingKey = (instance: ChartIndicatorInstance): string =>
  instance.id === `base:${instance.key}` ? instance.key : instance.id;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const validColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value);

/** Extra rows are independent records; malformed IDs cannot alias a legacy base indicator. */
export function normalizeExtraIndicators(
  value: unknown,
  capacity = MAX_CHART_INDICATORS,
): ChartIndicatorInstance[] {
  if (!Array.isArray(value)) return [];
  const result: ChartIndicatorInstance[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (result.length >= Math.max(0, capacity)) break;
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(entry.id) ||
      seen.has(entry.id) ||
      !isIndicatorKey(entry.key) ||
      typeof entry.hidden !== "boolean" ||
      !isRecord(entry.inputs) ||
      !isRecord(entry.appearance)
    )
      continue;
    const { id, key, hidden } = entry;
    const instance = createIndicatorInstance(key, id);
    instance.hidden = hidden;
    instance.inputs = getIndicatorInputs(key, normalizeIndicatorInputs({ [key]: entry.inputs }));
    instance.appearance = normalizeIndicatorAppearance(key, entry.appearance);
    if (key === "ib" && isValidInitialBalanceSettings(entry.initialBalance))
      instance.initialBalance = resolveInitialBalanceSettings(entry.initialBalance);
    if (key === "volume" && isRecord(entry.volumeColors)) {
      instance.volumeColors = {
        up: validColor(entry.volumeColors.up) ? entry.volumeColors.up : DEFAULT_VOLUME_COLORS.up,
        down: validColor(entry.volumeColors.down)
          ? entry.volumeColors.down
          : DEFAULT_VOLUME_COLORS.down,
      };
    }
    seen.add(id);
    result.push(instance);
  }
  return result;
}
