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
export type ChartCrosshairMode = "normal" | "magnet" | "ohlc" | "hidden";
export type ChartCrosshairLineStyle = "solid" | "dotted" | "dashed" | "largeDashed";
export type ChartReplaySpeed = 0.5 | 1 | 2 | 5 | 10;
const validReplaySpeed = (value: unknown): value is ChartReplaySpeed =>
  value === 0.5 || value === 1 || value === 2 || value === 5 || value === 10;
export type ChartCrosshairLineWidth = 1 | 2 | 3;
const validCrosshairLineStyle = (value: unknown): value is ChartCrosshairLineStyle =>
  value === "solid" || value === "dotted" || value === "dashed" || value === "largeDashed";
const validCrosshairLineWidth = (value: unknown): value is ChartCrosshairLineWidth =>
  value === 1 || value === 2 || value === 3;
export type ChartGridMode = "both" | "horizontal" | "vertical" | "none";
export type ChartPriceScaleMode = "normal" | "logarithmic" | "percentage" | "indexedTo100";
const validPriceScaleMode = (value: unknown): value is ChartPriceScaleMode =>
  value === "normal" ||
  value === "logarithmic" ||
  value === "percentage" ||
  value === "indexedTo100";
export type ChartGridLineStyle = "solid" | "dotted" | "dashed";
const validGridLineStyle = (value: unknown): value is ChartGridLineStyle =>
  value === "solid" || value === "dotted" || value === "dashed";
const validGridMode = (value: unknown): value is ChartGridMode =>
  value === "both" || value === "horizontal" || value === "vertical" || value === "none";
const validCrosshairMode = (value: unknown): value is ChartCrosshairMode =>
  value === "normal" || value === "magnet" || value === "ohlc" || value === "hidden";
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
  crosshairMode: ChartCrosshairMode;
  crosshairColor: string;
  crosshairLineStyle: ChartCrosshairLineStyle;
  crosshairLineWidth: ChartCrosshairLineWidth;
  replaySpeed: ChartReplaySpeed;
  indicators: ChartIndicators;
  hiddenIndicators: ChartIndicators;
  appearance: ChartAppearance;
  indicatorInputs: IndicatorInputSettings;
  extraIndicators: ChartIndicatorInstance[];
  favoriteIndicators: IndicatorKey[];
  volumeColors: typeof DEFAULT_VOLUME_COLORS;
  initialBalance: InitialBalanceSettings;
  gridMode: ChartGridMode;
  gridLineStyle: ChartGridLineStyle;
  gridColor: string;
  thinBars: boolean;
  showBarOpen: boolean;
  showCandleWicks: boolean;
  showPriceLine: boolean;
  showPriceLabel: boolean;
  priceScaleMode: ChartPriceScaleMode;
  invertScale: boolean;
};

/** Old saved charts keep their choices while newly introduced indicators stay disabled. */
export function normalizeChartPreferences(value: unknown): SavedChartPreferences {
  const saved =
    value && typeof value === "object"
      ? (value as Partial<SavedChartPreferences> & { showGrid?: unknown; logScale?: unknown })
      : {};
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
      saved.style === "hollow" ||
      saved.style === "heikin-ashi" ||
      saved.style === "bars" ||
      saved.style === "line" ||
      saved.style === "area"
        ? saved.style
        : "candles",
    crosshairMode: validCrosshairMode(saved.crosshairMode) ? saved.crosshairMode : "normal",
    indicators,
    hiddenIndicators,
    appearance,
    indicatorInputs: normalizeIndicatorInputs(saved.indicatorInputs),
    favoriteIndicators: Array.isArray(saved.favoriteIndicators)
      ? [...new Set(saved.favoriteIndicators.filter(isIndicatorKey))]
      : [],
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
    replaySpeed: validReplaySpeed(saved.replaySpeed) ? saved.replaySpeed : 1,
    crosshairColor: validColor(saved.crosshairColor) ? saved.crosshairColor : "#9598A1",
    crosshairLineStyle: validCrosshairLineStyle(saved.crosshairLineStyle)
      ? saved.crosshairLineStyle
      : "largeDashed",
    crosshairLineWidth: validCrosshairLineWidth(saved.crosshairLineWidth)
      ? saved.crosshairLineWidth
      : 1,
    gridMode: validGridMode(saved.gridMode)
      ? saved.gridMode
      : saved.showGrid === false
        ? "none"
        : "both",
    gridLineStyle: validGridLineStyle(saved.gridLineStyle) ? saved.gridLineStyle : "solid",
    gridColor: validColor(saved.gridColor) ? saved.gridColor : "#171a23",
    thinBars: typeof saved.thinBars === "boolean" ? saved.thinBars : true,
    showBarOpen: typeof saved.showBarOpen === "boolean" ? saved.showBarOpen : true,
    showCandleWicks: typeof saved.showCandleWicks === "boolean" ? saved.showCandleWicks : true,
    showPriceLine: typeof saved.showPriceLine === "boolean" ? saved.showPriceLine : true,
    showPriceLabel: typeof saved.showPriceLabel === "boolean" ? saved.showPriceLabel : true,
    priceScaleMode: validPriceScaleMode(saved.priceScaleMode)
      ? saved.priceScaleMode
      : saved.logScale === true
        ? "logarithmic"
        : "normal",
    invertScale: typeof saved.invertScale === "boolean" ? saved.invertScale : false,
  };
}
export const useChartPreferences = create<{
  style: ChartStyle;
  crosshairMode: ChartCrosshairMode;
  crosshairColor: string;
  crosshairLineStyle: ChartCrosshairLineStyle;
  crosshairLineWidth: ChartCrosshairLineWidth;
  replaySpeed: ChartReplaySpeed;
  indicators: ChartIndicators;
  hiddenIndicators: ChartIndicators;
  appearance: ChartAppearance;
  indicatorInputs: IndicatorInputSettings;
  extraIndicators: ChartIndicatorInstance[];
  favoriteIndicators: IndicatorKey[];
  volumeColors: typeof DEFAULT_VOLUME_COLORS;
  initialBalance: InitialBalanceSettings;
  setInitialBalance: (settings: InitialBalanceSettings) => void;
  gridMode: ChartGridMode;
  gridLineStyle: ChartGridLineStyle;
  gridColor: string;
  thinBars: boolean;
  showBarOpen: boolean;
  showCandleWicks: boolean;
  showPriceLine: boolean;
  showPriceLabel: boolean;
  priceScaleMode: ChartPriceScaleMode;
  invertScale: boolean;
  setStyle: (style: ChartStyle) => void;
  setCrosshairMode: (mode: ChartCrosshairMode) => void;
  setReplaySpeed: (speed: ChartReplaySpeed) => void;
  setCrosshairColor: (color: string) => void;
  setCrosshairLineStyle: (style: ChartCrosshairLineStyle) => void;
  setCrosshairLineWidth: (width: ChartCrosshairLineWidth) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  toggleFavoriteIndicator: (key: IndicatorKey) => void;
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
  setGridMode: (mode: ChartGridMode) => void;
  setGridLineStyle: (style: ChartGridLineStyle) => void;
  setGridColor: (color: string) => void;
  toggleThinBars: () => void;
  toggleBarOpen: () => void;
  toggleCandleWicks: () => void;
  togglePriceLine: () => void;
  togglePriceLabel: () => void;
  setPriceScaleMode: (mode: ChartPriceScaleMode) => void;
  toggleInvertScale: () => void;
}>()(
  persist(
    (set, get) => ({
      style: "candles",
      crosshairMode: "normal",
      crosshairColor: "#9598A1",
      crosshairLineStyle: "largeDashed",
      crosshairLineWidth: 1,
      replaySpeed: 1,
      indicators: { ...DEFAULT_INDICATORS },
      hiddenIndicators: hiddenDefaults(),
      appearance: {},
      indicatorInputs: {},
      extraIndicators: [],
      favoriteIndicators: [],
      volumeColors: { ...DEFAULT_VOLUME_COLORS },
      initialBalance: { ...DEFAULT_INITIAL_BALANCE },
      setInitialBalance: (settings) => {
        if (isValidInitialBalanceSettings(settings))
          set({ initialBalance: resolveInitialBalanceSettings(settings) });
      },
      gridMode: "both",
      gridLineStyle: "solid",
      gridColor: "#171a23",
      thinBars: true,
      showBarOpen: true,
      showCandleWicks: true,
      showPriceLine: true,
      showPriceLabel: true,
      priceScaleMode: "normal",
      invertScale: false,
      setStyle: (style) => set({ style }),
      setCrosshairMode: (crosshairMode) => {
        if (validCrosshairMode(crosshairMode) && crosshairMode !== get().crosshairMode)
          set({ crosshairMode });
      },
      setReplaySpeed: (replaySpeed) => {
        if (validReplaySpeed(replaySpeed) && replaySpeed !== get().replaySpeed)
          set({ replaySpeed });
      },
      setCrosshairColor: (crosshairColor) => {
        if (validColor(crosshairColor) && crosshairColor !== get().crosshairColor)
          set({ crosshairColor });
      },
      setCrosshairLineStyle: (crosshairLineStyle) => {
        if (
          validCrosshairLineStyle(crosshairLineStyle) &&
          crosshairLineStyle !== get().crosshairLineStyle
        )
          set({ crosshairLineStyle });
      },
      setCrosshairLineWidth: (crosshairLineWidth) => {
        if (
          validCrosshairLineWidth(crosshairLineWidth) &&
          crosshairLineWidth !== get().crosshairLineWidth
        )
          set({ crosshairLineWidth });
      },
      toggleFavoriteIndicator: (key) => {
        if (!isIndicatorKey(key)) return;
        set((state) => ({
          favoriteIndicators: state.favoriteIndicators.includes(key)
            ? state.favoriteIndicators.filter((favorite) => favorite !== key)
            : [...state.favoriteIndicators, key],
        }));
      },
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
      setGridMode: (gridMode) => {
        if (validGridMode(gridMode) && gridMode !== get().gridMode) set({ gridMode });
      },
      setGridLineStyle: (gridLineStyle) => {
        if (validGridLineStyle(gridLineStyle) && gridLineStyle !== get().gridLineStyle)
          set({ gridLineStyle });
      },
      setGridColor: (gridColor) => {
        if (validColor(gridColor) && gridColor !== get().gridColor) set({ gridColor });
      },
      toggleThinBars: () => set((state) => ({ thinBars: !state.thinBars })),
      toggleBarOpen: () => set((state) => ({ showBarOpen: !state.showBarOpen })),
      toggleCandleWicks: () => set((state) => ({ showCandleWicks: !state.showCandleWicks })),
      togglePriceLine: () => set((state) => ({ showPriceLine: !state.showPriceLine })),
      togglePriceLabel: () => set((state) => ({ showPriceLabel: !state.showPriceLabel })),
      setPriceScaleMode: (priceScaleMode) => {
        if (validPriceScaleMode(priceScaleMode) && priceScaleMode !== get().priceScaleMode)
          set({ priceScaleMode });
      },
      toggleInvertScale: () => set((state) => ({ invertScale: !state.invertScale })),
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
