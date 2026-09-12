import { ColorPicker, DrawingSelect } from "./DrawingStyleControls";
import { resolveIndicatorStyle } from "./indicatorStyles";
import { useState } from "react";
import { ChartIcon } from "./ChartIcon";
import { SolarSettingsIcon } from "./SolarSettingsIcon";
import { DrawingToolIcon } from "./DrawingToolIcon";
import { IndicatorNumberField } from "./IndicatorNumberField";
import {
  INDICATOR_INPUTS,
  getIndicatorDefinition,
  getIndicatorLabel,
  INITIAL_BALANCE_TIME_ZONES,
  DEFAULT_INITIAL_BALANCE,
  type InitialBalanceSettings,
} from "./indicatorCatalog";
import { INDICATOR_COLORS, type IndicatorReadings } from "./chartIndicatorRenderer";
import { DEFAULT_VOLUME_COLORS, type useChartPreferences } from "./chartPreferences";
import {
  getChartIndicatorInstances,
  indicatorReadingKey,
  MAX_CHART_INDICATORS,
} from "./chartIndicatorInstances";
import type { IndicatorStyle } from "./indicatorDefinition";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";

type Preferences = ReturnType<typeof useChartPreferences.getState>;
const controlClass =
  "inline-flex size-6 items-center justify-center border-r border-white/10 text-zinc-400 last:border-r-0 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400";
const inputClass = "rounded border border-white/15 bg-zinc-900 px-2 py-1 text-xs text-zinc-200";
export function IndicatorLegend({
  settings,
  readings,
  initialBalanceStatus,
  initialBalanceStatuses,
}: {
  settings: Preferences;
  readings: IndicatorReadings;
  initialBalanceStatus: string;
  initialBalanceStatuses?: Readonly<Record<string, string>>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [inputResetVersions, setInputResetVersions] = useState<Record<string, number>>({});
  const added = getChartIndicatorInstances(settings);
  const counts = new Map<string, number>();
  for (const instance of added) counts.set(instance.key, (counts.get(instance.key) ?? 0) + 1);
  const indices = new Map<string, number>();
  if (!added.length) return null;
  return (
    <div className="mt-1 flex flex-col items-start text-xs text-zinc-400">
      {!collapsed &&
        added.map((instance) => {
          const { id, key, hidden, inputs, appearance } = instance;
          const { detail, styles } = getIndicatorDefinition(key);
          const label = getIndicatorLabel(key, { [key]: inputs });
          const index = (indices.get(key) ?? 0) + 1;
          indices.set(key, index);
          const accessible = (text: string) =>
            (counts.get(key) ?? 0) > 1 ? `${text}, instance ${index}` : text;
          const initialBalance = instance.initialBalance ?? DEFAULT_INITIAL_BALANCE;
          const volumeColors = instance.volumeColors ?? DEFAULT_VOLUME_COLORS;
          const color = appearance.color ?? INDICATOR_COLORS[key];
          const description =
            key === "ib"
              ? (initialBalanceStatuses?.[id] ?? initialBalanceStatus) ||
                "Waiting for opening-session candles."
              : key === "vwap"
                ? "VWAP uses loaded bars, reset at 5 p.m. Chicago time."
                : INDICATOR_INPUTS[key].length
                  ? INDICATOR_INPUTS[key]
                      .map((input) => `${input.label}: ${inputs[input.key] ?? input.defaultValue}`)
                      .join(" · ")
                  : detail;
          return (
            <div
              key={id}
              className="pointer-events-auto group/indicator relative flex min-h-6 max-w-full items-center gap-2 rounded hover:bg-white/[0.025] focus-within:bg-white/[0.025]"
              data-indicator={key}
              data-indicator-instance={id}
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      tabIndex={0}
                      className={cn(
                        "shrink-0 rounded outline-none focus-visible:ring-1 focus-visible:ring-blue-400",
                        hidden && "text-zinc-600",
                      )}
                    />
                  }
                >
                  {key === "volume" ? "Vol" : label}
                </TooltipTrigger>
                <TooltipPopup>{description}</TooltipPopup>
              </Tooltip>
              <div className="relative flex min-w-[6.25rem] items-center">
                <span className={cn("tabular-nums", hidden && "invisible")} style={{ color }}>
                  {readings[indicatorReadingKey(instance)]?.toLocaleString(
                    "en-US",
                    key === "volume" || key === "obv"
                      ? { notation: "compact", maximumFractionDigits: 2 }
                      : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                  ) ?? "—"}
                </span>
                <div className="absolute -right-1 z-10 inline-flex overflow-hidden rounded border border-white/15 bg-[#14171d] opacity-0 pointer-events-none group-hover/indicator:pointer-events-auto group-hover/indicator:opacity-100 group-focus-within/indicator:pointer-events-auto group-focus-within/indicator:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          className={controlClass}
                          aria-label={accessible(`${hidden ? "Show" : "Hide"} ${label}`)}
                          onClick={() => settings.toggleIndicatorInstanceVisibility(id)}
                        />
                      }
                    >
                      <DrawingToolIcon name={hidden ? "eye-off" : "eye"} className="size-4" />
                    </TooltipTrigger>
                    <TooltipPopup>{`${hidden ? "Show" : "Hide"} ${label}`}</TooltipPopup>
                  </Tooltip>
                  <Popover>
                    <PopoverTrigger
                      className={controlClass}
                      aria-label={accessible(`${label} settings`)}
                      title={`${label} settings`}
                    >
                      <SolarSettingsIcon className="size-4" />
                    </PopoverTrigger>
                    <PopoverPopup
                      align="start"
                      className="max-h-[min(70vh,36rem)] w-72 overflow-y-auto"
                    >
                      <PopoverTitle className="mb-4 text-sm">{label}</PopoverTitle>
                      <div className="space-y-3 text-xs">
                        <label className="flex items-center justify-between">
                          Visible
                          <input
                            type="checkbox"
                            aria-label={accessible(`Show ${label}`)}
                            checked={!hidden}
                            onChange={() => settings.toggleIndicatorInstanceVisibility(id)}
                          />
                        </label>
                        {INDICATOR_INPUTS[key]
                          .filter(
                            (input) =>
                              !input.shownWhen ||
                              inputs[input.shownWhen.key] === input.shownWhen.value,
                          )
                          .map((input) => (
                            <div
                              key={input.key}
                              className="flex items-center justify-between gap-2"
                            >
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
                                  resetKey={inputResetVersions[id] ?? 0}
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
                              setInputResetVersions((versions) => ({
                                ...versions,
                                [id]: (versions[id] ?? 0) + 1,
                              }));
                            }}
                            className="text-zinc-400 hover:text-white"
                          >
                            Reset inputs
                          </button>
                        ) : null}
                        {key === "volume"
                          ? (["up", "down"] as const).map((direction) => (
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
                            ))
                          : styles
                              .filter(
                                (plotStyle) =>
                                  !plotStyle.shownWhen ||
                                  inputs[plotStyle.shownWhen.key] === plotStyle.shownWhen.value,
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
                                  <div
                                    key={plotStyle.key}
                                    className="space-y-2 border-t border-white/10 pt-3"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          aria-label={accessible(
                                            `Show ${label} ${plotStyle.label}`,
                                          )}
                                          checked={style.visible}
                                          onChange={(event) =>
                                            update({ visible: event.target.checked })
                                          }
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
                                        Line width
                                        <DrawingSelect
                                          label={accessible(`${label} ${plotStyle.label} width`)}
                                          value={String(style.lineWidth)}
                                          onChange={(value) => update({ lineWidth: Number(value) })}
                                          options={[1, 2, 3, 4].map(
                                            (width) => [String(width), `${width} px`] as const,
                                          )}
                                          className="w-20"
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
                              <input
                                type="time"
                                className={inputClass}
                                aria-label={accessible("Initial balance session start")}
                                value={initialBalance.startTime}
                                onChange={(event) =>
                                  settings.setIndicatorInstanceInitialBalance(id, {
                                    ...initialBalance,
                                    startTime: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="flex items-center justify-between">
                              Session end
                              <input
                                type="time"
                                aria-label={accessible("Initial balance session end")}
                                className={inputClass}
                                value={initialBalance.sessionEndTime ?? "16:00"}
                                onChange={(event) =>
                                  settings.setIndicatorInstanceInitialBalance(id, {
                                    ...initialBalance,
                                    sessionEndTime: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="flex items-center justify-between">
                              Duration
                              <input
                                type="number"
                                min={1}
                                max={240}
                                className={cn(inputClass, "w-20")}
                                aria-label={accessible("Initial balance minutes")}
                                value={initialBalance.durationMinutes}
                                onChange={(event) =>
                                  settings.setIndicatorInstanceInitialBalance(id, {
                                    ...initialBalance,
                                    durationMinutes: Number(event.target.value),
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
                              options={INITIAL_BALANCE_TIME_ZONES.map(
                                (zone) => [zone, zone] as const,
                              )}
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
                                  value={
                                    initialBalance.backgroundColor ??
                                    DEFAULT_INITIAL_BALANCE.backgroundColor
                                  }
                                  opacity={
                                    initialBalance.backgroundOpacity ??
                                    DEFAULT_INITIAL_BALANCE.backgroundOpacity
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
                                <label
                                  key={option}
                                  className="flex items-center justify-between gap-3"
                                >
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
                        <p className="border-t border-white/10 pt-3 leading-relaxed text-zinc-500">
                          {description}
                        </p>
                      </div>
                    </PopoverPopup>
                  </Popover>
                </div>
              </div>
            </div>
          );
        })}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="pointer-events-auto mt-2 inline-flex h-7 min-w-9 items-center justify-center gap-1 px-2 rounded border border-white/15 text-zinc-500 hover:text-zinc-200"
              aria-label={collapsed ? "Expand indicator legend" : "Collapse indicator legend"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            />
          }
        >
          <ChartIcon name="chevron-down" size={12} className={collapsed ? "" : "rotate-180"} />
          {collapsed && <span className="pr-1 text-[10px]">{added.length}</span>}
        </TooltipTrigger>
        <TooltipPopup>{collapsed ? "Expand indicators" : "Collapse indicators"}</TooltipPopup>
      </Tooltip>
    </div>
  );
}
