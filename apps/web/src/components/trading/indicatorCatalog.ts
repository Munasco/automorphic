import { INDICATOR_DEFINITIONS } from "./indicatorDefinitions";
import type { IndicatorInputDescriptor, IndicatorInputValues } from "./indicatorDefinition";
export type {
  IndicatorInputDescriptor,
  IndicatorInputKey,
  IndicatorInputValues,
} from "./indicatorDefinition";
export {
  INITIAL_BALANCE_TIME_ZONES,
  DEFAULT_INITIAL_BALANCE,
  resolveInitialBalanceSettings,
  isValidInitialBalanceSettings,
  type InitialBalanceSettings,
} from "./initialBalanceSettings";
export type ChartStyle = "candles" | "bars" | "line" | "area";
export const INDICATOR_CATEGORIES = ["Overlays", "Oscillators", "Session"] as const;
export const INDICATOR_CATALOG = INDICATOR_DEFINITIONS;
export type IndicatorKey = (typeof INDICATOR_DEFINITIONS)[number]["key"];
export type ChartIndicators = Record<IndicatorKey, boolean>;
export type IndicatorInputSettings = Partial<Record<IndicatorKey, IndicatorInputValues>>;
export const DEFAULT_INDICATORS = Object.fromEntries(
  INDICATOR_DEFINITIONS.map((item) => [item.key, item.enabledByDefault ?? false]),
) as ChartIndicators;
export const INDICATOR_INPUTS = Object.fromEntries(
  INDICATOR_DEFINITIONS.map((item) => [item.key, item.inputs]),
) as Record<IndicatorKey, readonly IndicatorInputDescriptor[]>;
export const getIndicatorDefinition = (key: IndicatorKey) =>
  INDICATOR_DEFINITIONS.find((item) => item.key === key)!;
const validInput = (value: unknown, descriptor: IndicatorInputDescriptor): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= descriptor.min &&
  value <= descriptor.max &&
  (descriptor.step !== 1 || Number.isInteger(value));

/** Merge only known, valid inputs; older workspace preferences receive the original defaults. */
export function getIndicatorInputs(
  key: IndicatorKey,
  settings: IndicatorInputSettings = {},
): IndicatorInputValues {
  const result: IndicatorInputValues = {};
  for (const descriptor of INDICATOR_INPUTS[key]) {
    const value = settings[key]?.[descriptor.key];
    result[descriptor.key] = validInput(value, descriptor) ? value : descriptor.defaultValue;
  }
  if (getIndicatorDefinition(key).validateInputs?.(result) === false) {
    const repair = getIndicatorDefinition(key).repairInputs;
    if (repair) return repair(result);
    for (const descriptor of INDICATOR_INPUTS[key])
      result[descriptor.key] = descriptor.defaultValue;
  }
  return result;
}

export function normalizeIndicatorInputs(value: unknown): IndicatorInputSettings {
  if (!value || typeof value !== "object") return {};
  const input = value as IndicatorInputSettings;
  const result: IndicatorInputSettings = {};
  for (const { key } of INDICATOR_CATALOG) {
    if (!input[key] || typeof input[key] !== "object" || !INDICATOR_INPUTS[key].length) continue;
    result[key] = getIndicatorInputs(key, input);
  }
  return result;
}

/** Reject invalid edits atomically, including MACD's fast < slow relationship. */
export function updateIndicatorInputs(
  key: IndicatorKey,
  current: IndicatorInputSettings,
  patch: IndicatorInputValues,
): IndicatorInputSettings | null {
  for (const [name, value] of Object.entries(patch)) {
    const descriptor = INDICATOR_INPUTS[key].find((input) => input.key === name);
    if (!descriptor || !validInput(value, descriptor)) return null;
  }
  if (!INDICATOR_INPUTS[key].length) return null;
  const next = { ...getIndicatorInputs(key, current), ...patch };
  if (getIndicatorDefinition(key).validateInputs?.(next) === false) return null;
  return { ...current, [key]: next };
}

export function getIndicatorLabel(
  key: IndicatorKey,
  settings: IndicatorInputSettings = {},
): string {
  const label = INDICATOR_CATALOG.find((item) => item.key === key)!.label;
  const inputs = getIndicatorInputs(key, settings);
  const values = INDICATOR_INPUTS[key].map((input) => inputs[input.key]);
  return values.length ? `${label.replace(/ \d+$/, "")} ${values.join(" / ")}` : label;
}

export function findIndicators(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return INDICATOR_CATALOG.filter((indicator) => {
    const searchable =
      `${indicator.key} ${indicator.label} ${indicator.detail} ${indicator.category}`.toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}
