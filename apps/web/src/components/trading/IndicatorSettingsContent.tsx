import { IndicatorNameField } from "./IndicatorNameField";
import type { ChartInterval } from "./tradingIntervals";
import { IndicatorTimeframeControls } from "./IndicatorTimeframeControls";
import { useState } from "react";
import { ColorPicker, DrawingSelect } from "./DrawingStyleControls";
import { resolveIndicatorStyle } from "./indicatorStyles";
import { IndicatorTimeField } from "./IndicatorTimeField";
import { IndicatorNumberField } from "./IndicatorNumberField";
import {
  INDICATOR_INPUTS,
  getIndicatorDefinition,
  getIndicatorLabel,
  INITIAL_BALANCE_TIME_ZONES,
  DEFAULT_INITIAL_BALANCE,
  type InitialBalanceSettings,
} from "./indicatorCatalog";
import { DEFAULT_VOLUME_COLORS, type useChartPreferences } from "./chartPreferences";
import {
  getChartIndicatorInstances,
  MAX_CHART_INDICATORS,
  type ChartIndicatorInstance,
} from "./chartIndicatorInstances";
import type { IndicatorStyle } from "./indicatorDefinition";
import { PopoverTitle } from "../ui/popover";
import { cn } from "../../lib/utils";

type Preferences = ReturnType<typeof useChartPreferences.getState>;
const inputClass = "rounded border border-white/15 bg-zinc-900 px-2 py-1 text-xs text-zinc-200";

export function IndicatorSettingsContent({
  interval,
  instance,
  settings,
  accessible,
  description,
  hiddenOnTimeframe = false,
}: {
  interval: ChartInterval;
  instance: ChartIndicatorInstance;
  settings: Preferences;
  accessible: (text: string) => string;
  description: string;
  hiddenOnTimeframe?: boolean;
}) {
  const { id, key, hidden, inputs, appearance } = instance;
  const { styles, placement } = getIndicatorDefinition(key);
  const label = getIndicatorLabel(key, { [key]: inputs });
  const initialBalance = instance.initialBalance ?? DEFAULT_INITIAL_BALANCE;
  const volumeColors = instance.volumeColors ?? DEFAULT_VOLUME_COLORS;
  const added = getChartIndicatorInstances(settings);
  const position = added.findIndex((item) => item.id === id);
  const [inputResetVersion, setInputResetVersion] = useState(0);
  return (
    <>
      <PopoverTitle className="mb-4 text-sm">{label}</PopoverTitle>
      <div className="space-y-3 text-xs">
        <IndicatorNameField
          key={id}
          label={accessible("Indicator name")}
          value={appearance.displayName ?? ""}
          placeholder={label}
          onCommit={(displayName) => settings.setIndicatorInstanceAppearance(id, { displayName })}
        />
        <label className="flex items-center justify-between">
          Visible
          <input
            type="checkbox"
            aria-label={accessible(`Show ${label}`)}
            checked={!hidden}
            onChange={() => settings.toggleIndicatorInstanceVisibility(id)}
          />
        </label>
        {hiddenOnTimeframe && (
          <p role="status" className="text-zinc-400">
            Hidden on this timeframe.
          </p>
        )}
        <IndicatorTimeframeControls
          interval={interval}
          value={appearance.timeframeVisibility}
          accessible={accessible}
          onChange={(timeframeVisibility) =>
            settings.setIndicatorInstanceAppearance(id, { timeframeVisibility })
          }
        />
        <div className="flex items-center justify-between gap-3">
          <span>Order</span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={position <= 0}
              onClick={() => settings.moveIndicatorInstance(id, "up")}
              aria-label={accessible(`Move ${label} up`)}
              className="rounded border border-white/15 px-2 py-1 hover:bg-white/10 disabled:opacity-30"
            >
              Move up
            </button>
            <button
              type="button"
              disabled={position < 0 || position >= added.length - 1}
              onClick={() => settings.moveIndicatorInstance(id, "down")}
              aria-label={accessible(`Move ${label} down`)}
              className="rounded border border-white/15 px-2 py-1 hover:bg-white/10 disabled:opacity-30"
            >
              Move down
            </button>
          </div>
        </div>
        {INDICATOR_INPUTS[key]
          .filter(
            (input) => !input.shownWhen || inputs[input.shownWhen.key] === input.shownWhen.value,
          )
          .map((input) => (
            <div key={input.key} className="flex items-center justify-between gap-2">
              <span>{input.label}</span>
              {input.kind === "boolean" ? (
                <input
                  type="checkbox"
                  aria-label={accessible(`${label} ${input.label}`)}
                  checked={(inputs[input.key] ?? input.defaultValue) !== 0}
                  onChange={(event) =>
                    settings.setIndicatorInstanceInputs(id, {
                      [input.key]: Number(event.target.checked),
                    })
                  }
                />
              ) : input.kind === "select" ? (
                <DrawingSelect
                  label={accessible(`${label} ${input.label}`)}
                  value={String(inputs[input.key] ?? input.defaultValue)}
                  options={(input.options ?? []).map(
                    (option) => [String(option.value), option.label] as const,
                  )}
                  onChange={(value) =>
                    settings.setIndicatorInstanceInputs(id, {
                      [input.key]: Number(value),
                    })
                  }
                  className="max-w-40"
                />
              ) : (
                <IndicatorNumberField
                  label={accessible(`${label} ${input.label}`)}
                  min={input.min}
                  max={input.max}
                  step={input.step}
                  className={cn(inputClass, "w-20")}
                  value={inputs[input.key] ?? input.defaultValue}
                  resetKey={inputResetVersion}
                  onCommit={(value) =>
                    settings.setIndicatorInstanceInputs(id, { [input.key]: value })
                  }
                />
              )}
            </div>
          ))}
        {INDICATOR_INPUTS[key].length > 0 ? (
          <button
            type="button"
            onClick={() => {
              settings.resetIndicatorInstanceInputs(id);
              setInputResetVersion((version) => version + 1);
            }}
            className="text-zinc-400 hover:text-white"
          >
            Reset inputs
          </button>
        ) : null}
        {(key === "macd" || key === "ao" || (key === "volume" && id !== "base:volume")) && (
          <label className="flex items-center justify-between border-t border-white/10 pt-3">
            Histogram price label
            <input
              type="checkbox"
              aria-label={accessible(`${label} histogram price label`)}
              checked={appearance.histogramPriceLabel ?? true}
              onChange={(event) =>
                settings.setIndicatorInstanceAppearance(id, {
                  histogramPriceLabel: event.target.checked,
                })
              }
            />
          </label>
        )}
        {key === "volume" &&
          (["up", "down"] as const).map((direction) => (
            <label key={direction} className="flex items-center justify-between">
              {direction === "up" ? "Up volume" : "Down volume"}
              <input
                type="color"
                aria-label={accessible(`${direction} volume color`)}
                value={volumeColors[direction]}
                onChange={(event) =>
                  settings.setIndicatorInstanceVolumeColors(id, {
                    ...volumeColors,
                    [direction]: event.target.value,
                  })
                }
                className="h-7 w-9 cursor-pointer rounded border border-white/15 bg-transparent"
              />
            </label>
          ))}
        {styles
          .filter(
            (plotStyle) =>
              !plotStyle.shownWhen || inputs[plotStyle.shownWhen.key] === plotStyle.shownWhen.value,
          )
          .map((plotStyle) => {
            const style = resolveIndicatorStyle(key, plotStyle.key, appearance);
            const update = (patch: IndicatorStyle) =>
              settings.setIndicatorInstanceAppearance(id, {
                plots: {
                  [plotStyle.key]: {
                    ...appearance?.plots?.[plotStyle.key],
                    ...patch,
                  },
                },
              });
            return (
              <div key={plotStyle.key} className="space-y-2 border-t border-white/10 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={accessible(`Show ${label} ${plotStyle.label}`)}
                      checked={style.visible}
                      onChange={(event) => update({ visible: event.target.checked })}
                    />
                    {plotStyle.label}
                  </label>
                  <ColorPicker
                    label={accessible(`${label} ${plotStyle.label} color`)}
                    value={style.color}
                    onChange={(color) => update({ color })}
                    opacity={style.opacity}
                    onOpacityChange={(opacity) => update({ opacity })}
                  />
                </div>
                {plotStyle.kind !== "fill" && (
                  <label className="flex items-center justify-between">
                    {plotStyle.kind === "markers" ? "Thickness" : "Line width"}
                    <DrawingSelect
                      label={accessible(`${label} ${plotStyle.label} width`)}
                      value={String(style.lineWidth)}
                      onChange={(value) => update({ lineWidth: Number(value) })}
                      options={[1, 2, 3, 4].map((width) => [String(width), `${width} px`] as const)}
                      className="w-20"
                    />
                  </label>
                )}
                {plotStyle.kind !== "fill" &&
                  plotStyle.kind !== "markers" &&
                  id !== "base:volume" && (
                    <label className="flex items-center justify-between">
                      Price scale label
                      <input
                        type="checkbox"
                        aria-label={accessible(`${label} ${plotStyle.label} price label`)}
                        checked={
                          style.showPriceLabel ??
                          (placement === "pane" || (key === "volume" && id !== "base:volume"))
                        }
                        onChange={(event) => update({ showPriceLabel: event.target.checked })}
                      />
                    </label>
                  )}
              </div>
            );
          })}
        {key === "ib" && (
          <>
            <label className="flex items-center justify-between">
              Session start
              <IndicatorTimeField
                resetKey={inputResetVersion}
                className={inputClass}
                label={accessible("Initial balance session start")}
                value={initialBalance.startTime}
                onCommit={(startTime) =>
                  settings.setIndicatorInstanceInitialBalance(id, {
                    ...initialBalance,
                    startTime,
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between">
              Session end
              <IndicatorTimeField
                resetKey={inputResetVersion}
                label={accessible("Initial balance session end")}
                className={inputClass}
                value={initialBalance.sessionEndTime ?? "16:00"}
                onCommit={(sessionEndTime) =>
                  settings.setIndicatorInstanceInitialBalance(id, {
                    ...initialBalance,
                    sessionEndTime,
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between">
              Duration
              <IndicatorNumberField
                min={1}
                max={240}
                step={1}
                resetKey={inputResetVersion}
                className={cn(inputClass, "w-20")}
                label={accessible("Initial balance minutes")}
                value={initialBalance.durationMinutes}
                onCommit={(durationMinutes) =>
                  settings.setIndicatorInstanceInitialBalance(id, {
                    ...initialBalance,
                    durationMinutes,
                  })
                }
              />
            </label>
            <DrawingSelect
              label={accessible("Initial balance time zone")}
              value={initialBalance.timeZone}
              onChange={(timeZone) =>
                settings.setIndicatorInstanceInitialBalance(id, {
                  ...initialBalance,
                  timeZone: timeZone as InitialBalanceSettings["timeZone"],
                })
              }
              options={INITIAL_BALANCE_TIME_ZONES.map((zone) => [zone, zone] as const)}
              className="w-full"
            />
            <div className="space-y-3 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={accessible("First-hour background")}
                    checked={initialBalance.showBox ?? true}
                    onChange={(event) =>
                      settings.setIndicatorInstanceInitialBalance(id, {
                        ...initialBalance,
                        showBox: event.target.checked,
                      })
                    }
                  />
                  Background
                </label>
                <ColorPicker
                  label={accessible("Initial balance background color")}
                  value={initialBalance.backgroundColor ?? DEFAULT_INITIAL_BALANCE.backgroundColor}
                  opacity={
                    initialBalance.backgroundOpacity ?? DEFAULT_INITIAL_BALANCE.backgroundOpacity
                  }
                  onChange={(backgroundColor) =>
                    settings.setIndicatorInstanceInitialBalance(id, {
                      ...initialBalance,
                      backgroundColor,
                    })
                  }
                  onOpacityChange={(backgroundOpacity) =>
                    settings.setIndicatorInstanceInitialBalance(id, {
                      ...initialBalance,
                      backgroundOpacity,
                    })
                  }
                />
              </div>
              {(
                [
                  ["showMidpoint", "50% midpoint"],
                  ["showQuarters", "25% and 75% levels"],
                  ["showExpansions", "0.5× and 1× expansions"],
                  ["showLabels", "Price labels"],
                  ["showHistory", "Historical sessions"],
                  ["showDashboard", "Session dashboard"],
                ] as const
              ).map(([option, title]) => (
                <label key={option} className="flex items-center justify-between gap-3">
                  {title}
                  <input
                    type="checkbox"
                    aria-label={accessible(title)}
                    checked={initialBalance[option] ?? true}
                    onChange={(event) =>
                      settings.setIndicatorInstanceInitialBalance(id, {
                        ...initialBalance,
                        [option]: event.target.checked,
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </>
        )}
        <div className="flex items-center justify-between border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => {
              if (key === "ib")
                settings.setIndicatorInstanceInitialBalance(id, {
                  ...initialBalance,
                  showMidpoint: true,
                  showQuarters: true,
                  showBox: true,
                  backgroundColor: DEFAULT_INITIAL_BALANCE.backgroundColor,
                  backgroundOpacity: DEFAULT_INITIAL_BALANCE.backgroundOpacity,
                  showLabels: true,
                  showExpansions: true,
                  showHistory: true,
                  showDashboard: true,
                });
              settings.resetIndicatorInstanceAppearance(id);
            }}
            className="rounded px-2 py-1.5 hover:bg-white/10"
          >
            Reset appearance
          </button>
          <button
            type="button"
            disabled={added.length >= MAX_CHART_INDICATORS}
            onClick={() => settings.duplicateIndicatorInstance(id)}
            className="rounded px-2 py-1.5 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => settings.removeIndicatorInstance(id)}
            className="rounded px-2 py-1.5 text-red-400 hover:bg-white/10"
          >
            Remove
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            if (settings.resetIndicatorInstance(id)) setInputResetVersion((version) => version + 1);
          }}
          className="w-full rounded border border-white/15 px-2 py-1.5 hover:bg-white/10"
        >
          Restore defaults
        </button>
        <p className="border-t border-white/10 pt-3 leading-relaxed text-zinc-500">{description}</p>
      </div>
    </>
  );
}
