import type { Candle, IndicatorPoint } from "./chartIndicators";
import type { InitialBalanceSettings } from "./initialBalanceSettings";
import type { InitialBalanceRange, InitialBalanceStats } from "./initialBalance";

export type IndicatorInputKey = string;
export type IndicatorInputDescriptor = {
  key: IndicatorInputKey;
  label: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
};
export type IndicatorInputValues = Partial<Record<IndicatorInputKey, number>>;

export type IndicatorStyle = { color?: string; lineWidth?: number };
export type IndicatorStyleDefinition = {
  key: string;
  label: string;
  color: string;
  lineWidth: number;
  primary?: boolean;
  legacyColor?: boolean;
  kind?: "line" | "fill";
};
export type IndicatorContext = {
  bars: readonly Candle[];
  inputs: IndicatorInputValues;
  interval: number;
  session: InitialBalanceSettings;
};
export type IndicatorPlot = {
  id: string;
  points: readonly IndicatorPoint[];
  styleKey?: string;
  title?: string;
  primary?: boolean;
  histogram?: boolean;
  positiveStyleKey?: string;
  negativeStyleKey?: string;
  bounds?: [number, number];
  levels?: number[];
  steps?: boolean;
  invisible?: boolean;
  volumeFormat?: boolean;
  overlay?: {
    kind: "initial-balance";
    range: InitialBalanceRange;
    settings: InitialBalanceSettings;
  };
};
export type IndicatorResult = {
  plots: IndicatorPlot[];
  reading?: number | undefined;
  status?: string;
  sessionStats?: InitialBalanceStats | null;
};
/** One definition owns discovery, settings, calculation, and visual defaults. The renderer owns chart instances. */
export type IndicatorDefinition<K extends string = string> = {
  key: K;
  label: string;
  detail: string;
  category: "Overlays" | "Oscillators" | "Session";
  placement: "overlay" | "pane" | "volume";
  enabledByDefault?: boolean;
  inputs: readonly IndicatorInputDescriptor[];
  styles: readonly IndicatorStyleDefinition[];
  repairInputs?: (values: IndicatorInputValues) => IndicatorInputValues;
  validateInputs?: (values: IndicatorInputValues) => boolean;
  calculate: (context: IndicatorContext) => IndicatorResult;
};
export const defineIndicator = <K extends string>(definition: IndicatorDefinition<K>) => definition;
