import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import { randomUUID } from "../../lib/utils";
import {
  DEFAULT_VOLUME_COLORS,
  MAX_CHART_INDICATORS,
  baseIndicatorKey,
  createIndicatorInstance,
  getChartIndicatorInstances,
  isIndicatorKey,
  normalizeExtraIndicators,
  type ChartIndicatorInstance,
} from "./chartIndicatorInstances";
export { DEFAULT_VOLUME_COLORS } from "./chartIndicatorInstances";

import {
  DEFAULT_INDICATORS,
  DEFAULT_INITIAL_BALANCE,
  INDICATOR_CATALOG,
  isValidInitialBalanceSettings,
  resolveInitialBalanceSettings,
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

import { normalizeIndicatorAppearance, type IndicatorAppearance } from "./indicatorStyles";
export type { IndicatorAppearance } from "./indicatorStyles";
export type ChartAppearance = Partial<Record<IndicatorKey, IndicatorAppearance>>;
const validColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value);
const hiddenDefaults = () =>
  Object.fromEntries(INDICATOR_CATALOG.map(({ key }) => [key, false])) as ChartIndicators;

function mergeAppearance(
  key: IndicatorKey,
  previous: IndicatorAppearance,
  patch: IndicatorAppearance,
): IndicatorAppearance {
  const cleaned = normalizeIndicatorAppearance(key, patch);
  const plots = { ...previous.plots };
  for (const [id, style] of Object.entries(cleaned.plots ?? {}))
    plots[id] = { ...plots[id], ...style };
  return { ...previous, ...cleaned, ...(Object.keys(plots).length ? { plots } : {}) };
}

type SavedChartPreferences = {
  style: ChartStyle;
  indicators: ChartIndicators;
  hiddenIndicators: ChartIndicators;
  appearance: ChartAppearance;
  indicatorInputs: IndicatorInputSettings;
  extraIndicators: ChartIndicatorInstance[];
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
      const next = normalizeIndicatorAppearance(key, stored);
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
    extraIndicators: normalizeExtraIndicators(
      saved.extraIndicators,
      MAX_CHART_INDICATORS - Object.values(indicators).filter(Boolean).length,
    ),
    volumeColors: {
      up: validColor(saved.volumeColors?.up) ? saved.volumeColors.up : DEFAULT_VOLUME_COLORS.up,
      down: validColor(saved.volumeColors?.down)
        ? saved.volumeColors.down
        : DEFAULT_VOLUME_COLORS.down,
    },
    initialBalance: isValidInitialBalanceSettings(saved.initialBalance)
      ? resolveInitialBalanceSettings(saved.initialBalance)
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
  extraIndicators: ChartIndicatorInstance[];
  volumeColors: typeof DEFAULT_VOLUME_COLORS;
  initialBalance: InitialBalanceSettings;
  setInitialBalance: (settings: InitialBalanceSettings) => void;
  showGrid: boolean;
  logScale: boolean;
  setStyle: (style: ChartStyle) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  toggleIndicatorVisibility: (key: IndicatorKey) => void;
  setIndicatorsHidden: (hidden: boolean) => void;
  removeAllIndicators: () => void;
  setIndicatorAppearance: (key: IndicatorKey, patch: IndicatorAppearance) => void;
  resetIndicatorAppearance: (key: IndicatorKey) => void;
  setIndicatorInputs: (key: IndicatorKey, patch: IndicatorInputValues) => void;
  resetIndicatorInputs: (key: IndicatorKey) => void;
  setVolumeColors: (colors: typeof DEFAULT_VOLUME_COLORS) => void;
  addIndicator: (key: IndicatorKey) => string | null;
  duplicateIndicatorInstance: (id: string) => string | null;
  removeIndicatorInstance: (id: string) => void;
  toggleIndicatorInstanceVisibility: (id: string) => void;
  setIndicatorInstanceInputs: (id: string, patch: IndicatorInputValues) => boolean;
  resetIndicatorInstanceInputs: (id: string) => void;
  setIndicatorInstanceAppearance: (id: string, patch: IndicatorAppearance) => void;
  resetIndicatorInstanceAppearance: (id: string) => void;
  setIndicatorInstanceInitialBalance: (id: string, settings: InitialBalanceSettings) => void;
  setIndicatorInstanceVolumeColors: (id: string, colors: typeof DEFAULT_VOLUME_COLORS) => void;
  toggleGrid: () => void;
  toggleLogScale: () => void;
}>()(
  persist(
    (set, get) => ({
      style: "candles",
      indicators: { ...DEFAULT_INDICATORS },
      hiddenIndicators: hiddenDefaults(),
      appearance: {},
      indicatorInputs: {},
      extraIndicators: [],
      volumeColors: { ...DEFAULT_VOLUME_COLORS },
      initialBalance: { ...DEFAULT_INITIAL_BALANCE },
      setInitialBalance: (settings) => {
        if (isValidInitialBalanceSettings(settings))
          set({ initialBalance: resolveInitialBalanceSettings(settings) });
      },
      showGrid: true,
      logScale: false,
      setStyle: (style) => set({ style }),
      toggleIndicator: (key) => {
        const state = get();
        if (
          !state.indicators[key] &&
          getChartIndicatorInstances(state).length >= MAX_CHART_INDICATORS
        )
          return;
        set({
          indicators: { ...state.indicators, [key]: !state.indicators[key] },
          hiddenIndicators: { ...state.hiddenIndicators, [key]: false },
        });
      },
      toggleIndicatorVisibility: (key) =>
        set((state) => ({
          hiddenIndicators: { ...state.hiddenIndicators, [key]: !state.hiddenIndicators[key] },
        })),
      setIndicatorsHidden: (hidden) =>
        set((state) => {
          const hiddenIndicators = { ...state.hiddenIndicators };
          for (const { key } of INDICATOR_CATALOG)
            if (state.indicators[key]) hiddenIndicators[key] = hidden;
          return {
            hiddenIndicators,
            extraIndicators: state.extraIndicators.map((instance) => ({ ...instance, hidden })),
          };
        }),
      removeAllIndicators: () =>
        set({
          indicators: hiddenDefaults(),
          hiddenIndicators: hiddenDefaults(),
          extraIndicators: [],
        }),
      setIndicatorAppearance: (key, patch) =>
        set((state) => {
          const next = mergeAppearance(key, state.appearance[key] ?? {}, patch);
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
      addIndicator: (key) => {
        const state = get();
        if (
          !isIndicatorKey(key) ||
          getChartIndicatorInstances(state).length >= MAX_CHART_INDICATORS
        )
          return null;
        if (!state.indicators[key]) {
          state.toggleIndicator(key);
          return `base:${key}`;
        }
        const id = randomUUID();
        set({ extraIndicators: [...state.extraIndicators, createIndicatorInstance(key, id)] });
        return id;
      },
      duplicateIndicatorInstance: (id) => {
        const state = get();
        const instances = getChartIndicatorInstances(state);
        if (instances.length >= MAX_CHART_INDICATORS) return null;
        const source = instances.find((instance) => instance.id === id);
        if (!source) return null;
        const copy = { ...structuredClone(source), id: randomUUID() };
        set({ extraIndicators: [...state.extraIndicators, copy] });
        return copy.id;
      },
      removeIndicatorInstance: (id) => {
        const state = get();
        const key = baseIndicatorKey(id);
        if (key) {
          if (state.indicators[key]) state.toggleIndicator(key);
        } else if (state.extraIndicators.some((instance) => instance.id === id))
          set({ extraIndicators: state.extraIndicators.filter((instance) => instance.id !== id) });
      },
      toggleIndicatorInstanceVisibility: (id) => {
        const state = get();
        const key = baseIndicatorKey(id);
        if (key) {
          if (state.indicators[key]) state.toggleIndicatorVisibility(key);
        } else if (state.extraIndicators.some((instance) => instance.id === id))
          set({
            extraIndicators: state.extraIndicators.map((instance) =>
              instance.id === id ? { ...instance, hidden: !instance.hidden } : instance,
            ),
          });
      },
      setIndicatorInstanceInputs: (id, patch) => {
        const state = get();
        const instance = getChartIndicatorInstances(state).find((instance) => instance.id === id);
        if (!instance) return false;
        const inputs = updateIndicatorInputs(
          instance.key,
          { [instance.key]: instance.inputs },
          patch,
        );
        if (!inputs) return false;
        if (baseIndicatorKey(id)) state.setIndicatorInputs(instance.key, patch);
        else
          set({
            extraIndicators: state.extraIndicators.map((item) =>
              item.id === id ? { ...item, inputs: inputs[instance.key]! } : item,
            ),
          });
        return true;
      },
      resetIndicatorInstanceInputs: (id) => {
        const state = get();
        const key = baseIndicatorKey(id);
        if (key) {
          if (state.indicators[key]) state.resetIndicatorInputs(key);
        } else if (state.extraIndicators.some((instance) => instance.id === id))
          set({
            extraIndicators: state.extraIndicators.map((instance) =>
              instance.id === id
                ? { ...instance, inputs: createIndicatorInstance(instance.key, id).inputs }
                : instance,
            ),
          });
      },
      setIndicatorInstanceAppearance: (id, patch) => {
        const state = get();
        const key = baseIndicatorKey(id);
        if (key) {
          if (state.indicators[key]) state.setIndicatorAppearance(key, patch);
        } else if (state.extraIndicators.some((instance) => instance.id === id))
          set({
            extraIndicators: state.extraIndicators.map((instance) =>
              instance.id === id
                ? {
                    ...instance,
                    appearance: mergeAppearance(instance.key, instance.appearance, patch),
                  }
                : instance,
            ),
          });
      },
      resetIndicatorInstanceAppearance: (id) => {
        const state = get();
        const key = baseIndicatorKey(id);
        if (key) {
          if (state.indicators[key]) state.resetIndicatorAppearance(key);
        } else if (state.extraIndicators.some((instance) => instance.id === id))
          set({
            extraIndicators: state.extraIndicators.map((instance) =>
              instance.id === id
                ? {
                    ...instance,
                    appearance: {},
                    ...(instance.key === "volume"
                      ? { volumeColors: { ...DEFAULT_VOLUME_COLORS } }
                      : {}),
                  }
                : instance,
            ),
          });
      },
      setIndicatorInstanceInitialBalance: (id, settings) => {
        if (!isValidInitialBalanceSettings(settings)) return;
        const state = get();
        if (id === "base:ib" && state.indicators.ib) state.setInitialBalance(settings);
        else if (
          state.extraIndicators.some((instance) => instance.id === id && instance.key === "ib")
        )
          set({
            extraIndicators: state.extraIndicators.map((instance) =>
              instance.id === id
                ? { ...instance, initialBalance: resolveInitialBalanceSettings(settings) }
                : instance,
            ),
          });
      },
      setIndicatorInstanceVolumeColors: (id, colors) => {
        if (!validColor(colors.up) || !validColor(colors.down)) return;
        const state = get();
        if (id === "base:volume" && state.indicators.volume) state.setVolumeColors(colors);
        else if (
          state.extraIndicators.some((instance) => instance.id === id && instance.key === "volume")
        )
          set({
            extraIndicators: state.extraIndicators.map((instance) =>
              instance.id === id ? { ...instance, volumeColors: { ...colors } } : instance,
            ),
          });
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
