import { useState, type ReactNode } from "react";
import { ChartIcon } from "./ChartIcon";
import { SolarSettingsIcon } from "./SolarSettingsIcon";
import {
  INDICATOR_CATALOG,
  INITIAL_BALANCE_TIME_ZONES,
  type InitialBalanceSettings,
} from "./indicatorCatalog";
import { INDICATOR_COLORS, type IndicatorReadings } from "./chartIndicatorRenderer";
import type { useChartPreferences } from "./chartPreferences";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";

type Preferences = ReturnType<typeof useChartPreferences.getState>;
const controlClass =
  "inline-flex size-6 items-center justify-center border-r border-white/10 text-zinc-400 last:border-r-0 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400";
const inputClass = "rounded border border-white/15 bg-zinc-900 px-2 py-1 text-xs text-zinc-200";
function Action({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type="button" aria-label={label} onClick={onClick} className={controlClass} />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}
function Eye({ hidden }: { hidden: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {hidden && <path d="m3 3 18 18" />}
    </svg>
  );
}
export function IndicatorLegend({
  settings,
  readings,
  initialBalanceStatus,
}: {
  settings: Preferences;
  readings: IndicatorReadings;
  initialBalanceStatus: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const added = INDICATOR_CATALOG.filter(({ key }) => settings.indicators[key]);
  if (!added.length) return null;
  return (
    <div className="mt-1 flex flex-col items-start text-xs text-zinc-400">
      {!collapsed &&
        added.map(({ key, label, detail }) => {
          const hidden = settings.hiddenIndicators[key];
          const color = settings.appearance[key]?.color ?? INDICATOR_COLORS[key];
          const description =
            key === "ib"
              ? initialBalanceStatus || "Waiting for opening-session candles."
              : key === "vwap"
                ? "VWAP uses loaded bars, reset at 5 p.m. Chicago time."
                : detail;
          return (
            <div
              key={key}
              className="group/indicator relative flex min-h-6 max-w-full items-center gap-2 rounded hover:bg-white/[0.025] focus-within:bg-white/[0.025]"
              data-indicator={key}
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
                <span
                  className={cn(
                    "tabular-nums group-hover/indicator:invisible group-focus-within/indicator:invisible",
                    hidden && "invisible",
                  )}
                  style={{ color }}
                >
                  {readings[key]?.toLocaleString(
                    "en-US",
                    key === "volume" || key === "obv"
                      ? { notation: "compact", maximumFractionDigits: 2 }
                      : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                  ) ?? "—"}
                </span>
                <div className="absolute left-0 z-10 inline-flex overflow-hidden rounded border border-white/15 bg-[#14171d] opacity-0 pointer-events-none group-hover/indicator:pointer-events-auto group-hover/indicator:opacity-100 group-focus-within/indicator:pointer-events-auto group-focus-within/indicator:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
                  <Action
                    label={`${hidden ? "Show" : "Hide"} ${label}`}
                    onClick={() => settings.toggleIndicatorVisibility(key)}
                  >
                    <Eye hidden={hidden} />
                  </Action>
                  <Popover>
                    <PopoverTrigger
                      className={controlClass}
                      aria-label={`${label} settings`}
                      title={`${label} settings`}
                    >
                      <SolarSettingsIcon className="size-4" />
                    </PopoverTrigger>
                    <PopoverPopup align="start" className="w-64">
                      <PopoverTitle className="mb-4 text-sm">{label}</PopoverTitle>
                      <div className="space-y-3 text-xs">
                        {key === "volume" ? (
                          (["up", "down"] as const).map((direction) => (
                            <label key={direction} className="flex items-center justify-between">
                              {direction === "up" ? "Up volume" : "Down volume"}
                              <input
                                type="color"
                                aria-label={`${direction} volume color`}
                                value={settings.volumeColors[direction]}
                                onChange={(event) =>
                                  settings.setVolumeColors({
                                    ...settings.volumeColors,
                                    [direction]: event.target.value,
                                  })
                                }
                                className="h-7 w-9 cursor-pointer rounded border border-white/15 bg-transparent"
                              />
                            </label>
                          ))
                        ) : (
                          <>
                            <label className="flex items-center justify-between">
                              {key === "macd" || key === "adx" || key === "stochastic"
                                ? "Primary line"
                                : "Line color"}
                              <input
                                type="color"
                                aria-label={`${label} line color`}
                                value={color}
                                onChange={(event) =>
                                  settings.setIndicatorAppearance(key, {
                                    color: event.target.value,
                                  })
                                }
                                className="h-7 w-9 cursor-pointer rounded border border-white/15 bg-transparent"
                              />
                            </label>
                            <label className="flex items-center justify-between">
                              Line width
                              <select
                                className={inputClass}
                                value={settings.appearance[key]?.lineWidth ?? 1}
                                onChange={(event) =>
                                  settings.setIndicatorAppearance(key, {
                                    lineWidth: Number(event.target.value),
                                  })
                                }
                              >
                                {[1, 2, 3, 4].map((width) => (
                                  <option key={width} value={width}>
                                    {width} px
                                  </option>
                                ))}
                              </select>
                            </label>
                          </>
                        )}
                        {key === "ib" && (
                          <>
                            <label className="flex items-center justify-between">
                              Session start
                              <input
                                type="time"
                                className={inputClass}
                                value={settings.initialBalance.startTime}
                                onChange={(event) =>
                                  settings.setInitialBalance({
                                    ...settings.initialBalance,
                                    startTime: event.target.value,
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
                                aria-label="Initial balance minutes"
                                value={settings.initialBalance.durationMinutes}
                                onChange={(event) =>
                                  settings.setInitialBalance({
                                    ...settings.initialBalance,
                                    durationMinutes: Number(event.target.value),
                                  })
                                }
                              />
                            </label>
                            <select
                              aria-label="Initial balance time zone"
                              className={cn(inputClass, "w-full")}
                              value={settings.initialBalance.timeZone}
                              onChange={(event) =>
                                settings.setInitialBalance({
                                  ...settings.initialBalance,
                                  timeZone: event.target
                                    .value as InitialBalanceSettings["timeZone"],
                                })
                              }
                            >
                              {INITIAL_BALANCE_TIME_ZONES.map((zone) => (
                                <option key={zone}>{zone}</option>
                              ))}
                            </select>
                          </>
                        )}
                        <p className="border-t border-white/10 pt-3 leading-relaxed text-zinc-500">
                          {description}
                        </p>
                      </div>
                    </PopoverPopup>
                  </Popover>
                  <Action label={`Remove ${label}`} onClick={() => settings.toggleIndicator(key)}>
                    <ChartIcon name="trash" size={15} />
                  </Action>
                  <Popover>
                    <PopoverTrigger
                      className={controlClass}
                      aria-label={`More ${label} options`}
                      title="More"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <circle cx="5" cy="12" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="19" cy="12" r="1.5" />
                      </svg>
                    </PopoverTrigger>
                    <PopoverPopup align="start" className="w-44" viewportClassName="p-1">
                      <button
                        type="button"
                        onClick={() => settings.resetIndicatorAppearance(key)}
                        className="w-full rounded px-3 py-2 text-left text-xs hover:bg-white/10"
                      >
                        Reset appearance
                      </button>
                      <button
                        type="button"
                        onClick={() => settings.toggleIndicator(key)}
                        className="w-full rounded px-3 py-2 text-left text-xs hover:bg-white/10"
                      >
                        Remove
                      </button>
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
              className="mt-0.5 inline-flex h-4 min-w-6 items-center justify-center rounded border border-white/15 text-zinc-500 hover:text-zinc-200"
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
