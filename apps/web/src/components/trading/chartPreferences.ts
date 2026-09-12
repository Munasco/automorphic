import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { tradingWorkspaceStorage } from "./workspaceStorage";

import {
  DEFAULT_INDICATORS,
  DEFAULT_INITIAL_BALANCE,
  INDICATOR_CATALOG,
  isValidInitialBalanceSettings,
  normalizeIndicatorInputs,
  updateIndicatorInputs,
  type IndicatorInputSettings,
  type IndicatorInputValues,
  type ChartStyle,
  type ChartIndicators,
  type IndicatorKey,
  type InitialBalanceSettings,
} from "./indicatorCatalog";
export type {
  ChartStyle,
  IndicatorKey,
  ChartIndicators,
  InitialBalanceSettings,
} from "./indicatorCatalog";

export type IndicatorAppearance = { color?: string; lineWidth?: number };
export type ChartAppearance = Partial<Record<IndicatorKey, IndicatorAppearance>>;
export const DEFAULT_VOLUME_COLORS = { up: "#26a69a", down: "#ef5350" };
const validColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value);
const hiddenDefaults = () =>
  Object.fromEntries(INDICATOR_CATALOG.map(({ key }) => [key, false])) as ChartIndicators;

type SavedChartPreferences = {
  style: ChartStyle;
  indicators: ChartIndicators;
  hiddenIndicators: ChartIndicators;
  appearance: ChartAppearance;
  indicatorInputs: IndicatorInputSettings;
  volumeColors: typeof DEFAULT_VOLUME_COLORS;
  initialBalance: InitialBalanceSettings;
  showGrid: boolean;
  logScale: boolean;
};

/** Old saved charts keep their choices while newly introduced indicators stay disabled. */
export function normalizeChartPreferences(value: unknown): SavedChartPreferences {
  const saved = value && typeof value === "object" ? (value as Partial<SavedChartPreferences>) : {};
  const indicators = { ...DEFAULT_INDICATORS };
  const hiddenIndicators = hiddenDefaults();
  const appearance: ChartAppearance = {};
  for (const { key } of INDICATOR_CATALOG) {
    const enabled = saved.indicators?.[key];
    if (typeof enabled === "boolean") indicators[key] = enabled;
    hiddenIndicators[key] = saved.hiddenIndicators?.[key] === true;
    const stored = saved.appearance?.[key];
    if (stored && typeof stored === "object") {
      const next: IndicatorAppearance = {};
      if (validColor(stored.color)) next.color = stored.color;
      if (typeof stored.lineWidth === "number" && [1, 2, 3, 4].includes(stored.lineWidth))
        next.lineWidth = stored.lineWidth;
      if (Object.keys(next).length) appearance[key] = next;
    }
  }
  return {
    style:
      saved.style === "bars" || saved.style === "line" || saved.style === "area"
        ? saved.style
        : "candles",
    indicators,
    hiddenIndicators,
    appearance,
    indicatorInputs: normalizeIndicatorInputs(saved.indicatorInputs),
    volumeColors: {
      up: validColor(saved.volumeColors?.up) ? saved.volumeColors.up : DEFAULT_VOLUME_COLORS.up,
      down: validColor(saved.volumeColors?.down)
        ? saved.volumeColors.down
        : DEFAULT_VOLUME_COLORS.down,
    },
    initialBalance: isValidInitialBalanceSettings(saved.initialBalance)
      ? { ...saved.initialBalance }
      : { ...DEFAULT_INITIAL_BALANCE },
    showGrid: typeof saved.showGrid === "boolean" ? saved.showGrid : true,
    logScale: typeof saved.logScale === "boolean" ? saved.logScale : false,
  };
}
export const useChartPreferences = create<{
  style: ChartStyle;
  indicators: ChartIndicators;
  hiddenIndicators: ChartIndicators;
  appearance: ChartAppearance;
  indicatorInputs: IndicatorInputSettings;
  volumeColors: typeof DEFAULT_VOLUME_COLORS;
  initialBalance: InitialBalanceSettings;
  setInitialBalance: (settings: InitialBalanceSettings) => void;
  showGrid: boolean;
  logScale: boolean;
  setStyle: (style: ChartStyle) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  toggleIndicatorVisibility: (key: IndicatorKey) => void;
  setIndicatorAppearance: (key: IndicatorKey, patch: IndicatorAppearance) => void;
  resetIndicatorAppearance: (key: IndicatorKey) => void;
  setIndicatorInputs: (key: IndicatorKey, patch: IndicatorInputValues) => void;
  resetIndicatorInputs: (key: IndicatorKey) => void;
  setVolumeColors: (colors: typeof DEFAULT_VOLUME_COLORS) => void;
  toggleGrid: () => void;
  toggleLogScale: () => void;
}>()(
  persist(
    (set) => ({
      style: "candles",
      indicators: { ...DEFAULT_INDICATORS },
      hiddenIndicators: hiddenDefaults(),
      appearance: {},
      indicatorInputs: {},
      volumeColors: { ...DEFAULT_VOLUME_COLORS },
      initialBalance: { ...DEFAULT_INITIAL_BALANCE },
      setInitialBalance: (settings) => {
        if (isValidInitialBalanceSettings(settings)) set({ initialBalance: { ...settings } });
      },
      showGrid: true,
      logScale: false,
      setStyle: (style) => set({ style }),
      toggleIndicator: (key) =>
        set((state) => ({
          indicators: { ...state.indicators, [key]: !state.indicators[key] },
          hiddenIndicators: { ...state.hiddenIndicators, [key]: false },
        })),
      toggleIndicatorVisibility: (key) =>
        set((state) => ({
          hiddenIndicators: { ...state.hiddenIndicators, [key]: !state.hiddenIndicators[key] },
        })),
      setIndicatorAppearance: (key, patch) =>
        set((state) => {
          const previous = state.appearance[key] ?? {};
          const next = { ...previous };
          if (validColor(patch.color)) next.color = patch.color;
          if (typeof patch.lineWidth === "number" && [1, 2, 3, 4].includes(patch.lineWidth))
            next.lineWidth = patch.lineWidth;
          return { appearance: { ...state.appearance, [key]: next } };
        }),
      resetIndicatorAppearance: (key) =>
        set((state) => {
          const appearance = { ...state.appearance };
          delete appearance[key];
          return {
            appearance,
            ...(key === "volume" ? { volumeColors: { ...DEFAULT_VOLUME_COLORS } } : {}),
          };
        }),
      setIndicatorInputs: (key, patch) =>
        set((state) => {
          const indicatorInputs = updateIndicatorInputs(key, state.indicatorInputs, patch);
          return indicatorInputs ? { indicatorInputs } : state;
        }),
      resetIndicatorInputs: (key) =>
        set((state) => {
          const indicatorInputs = { ...state.indicatorInputs };
          delete indicatorInputs[key];
          return { indicatorInputs };
        }),
      setVolumeColors: (colors) => {
        if (validColor(colors.up) && validColor(colors.down)) set({ volumeColors: { ...colors } });
      },
      toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
      toggleLogScale: () => set((state) => ({ logScale: !state.logScale })),
    }),
    {
      name: "automorphic:chart:v1",
      storage: createJSONStorage(() => tradingWorkspaceStorage),
      skipHydration: true,
      merge: (persisted, current) => ({ ...current, ...normalizeChartPreferences(persisted) }),
    },
  ),
);

tradingWorkspaceStorage.registerHydrator(() => {
  useChartPreferences.setState(useChartPreferences.getInitialState(), true);
  return useChartPreferences.persist.rehydrate();
});
