import { IndicatorSettingsContent } from "./IndicatorSettingsContent";
import { ChartIcon } from "./ChartIcon";
import { SolarSettingsIcon } from "./SolarSettingsIcon";
import { DrawingToolIcon } from "./DrawingToolIcon";
import { INDICATOR_INPUTS, getIndicatorDefinition, getIndicatorLabel } from "./indicatorCatalog";
import { INDICATOR_COLORS, type IndicatorReadings } from "./chartIndicatorRenderer";
import type { useChartPreferences } from "./chartPreferences";
import { getChartIndicatorInstances, indicatorReadingKey } from "./chartIndicatorInstances";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { useRef, useState } from "react";

type Preferences = ReturnType<typeof useChartPreferences.getState>;
const controlClass =
  "inline-flex size-6 items-center justify-center border-r border-white/10 text-zinc-400 last:border-r-0 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400";
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
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const settingsReturnFocus = useRef<HTMLElement | null>(null);
  const collapsed = settings.indicatorLegendCollapsed;
  const added = getChartIndicatorInstances(settings);
  if (settingsId && (collapsed || !added.some((instance) => instance.id === settingsId)))
    setSettingsId(null);
  const counts = new Map<string, number>();
  for (const instance of added) counts.set(instance.key, (counts.get(instance.key) ?? 0) + 1);
  const indices = new Map<string, number>();
  if (!added.length) return null;
  return (
    <div
      className="mt-1 flex flex-col items-start text-xs"
      style={{ color: settings.chartTextColor }}
    >
      {!collapsed &&
        added.map((instance) => {
          const { id, key, hidden, inputs, appearance } = instance;
          const { detail } = getIndicatorDefinition(key);
          const label = getIndicatorLabel(key, { [key]: inputs });
          const index = (indices.get(key) ?? 0) + 1;
          indices.set(key, index);
          const accessible = (text: string) =>
            (counts.get(key) ?? 0) > 1 ? `${text}, instance ${index}` : text;
          const color = appearance.color ?? INDICATOR_COLORS[key];
          const description =
            key === "ib"
              ? (initialBalanceStatuses?.[id] ?? initialBalanceStatus) ||
                "Waiting for opening-session candles."
              : key === "vwap"
                ? "VWAP uses loaded bars, reset at 5 p.m. Chicago time."
                : INDICATOR_INPUTS[key].length
                  ? INDICATOR_INPUTS[key]
                      .map((input) => {
                        const value = inputs[input.key] ?? input.defaultValue;
                        const displayValue =
                          input.kind === "boolean"
                            ? value === 0
                              ? "Off"
                              : "On"
                            : (input.options?.find((option) => option.value === value)?.label ??
                              value);
                        return `${input.label}: ${displayValue}`;
                      })
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
                    <button
                      type="button"
                      aria-label={accessible(`Edit ${label}`)}
                      aria-haspopup="dialog"
                      aria-expanded={settingsId === id}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        settingsReturnFocus.current = event.currentTarget;
                        setSettingsId(id);
                      }}
                      onClick={(event) => {
                        if (event.detail !== 0) return;
                        event.stopPropagation();
                        settingsReturnFocus.current = event.currentTarget;
                        setSettingsId(id);
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.nativeEvent.isComposing ||
                          (event.key !== "Enter" && event.key !== " ")
                        )
                          return;
                        event.preventDefault();
                        event.stopPropagation();
                        settingsReturnFocus.current = event.currentTarget;
                        setSettingsId(id);
                      }}
                      className={cn(
                        "shrink-0 rounded outline-none focus-visible:ring-1 focus-visible:ring-blue-400",
                        hidden && "text-zinc-600",
                      )}
                    />
                  }
                >
                  {key === "volume"
                    ? "Vol"
                    : getIndicatorLabel(key, { [key]: inputs }, settings.showIndicatorInputs)}
                </TooltipTrigger>
                <TooltipPopup>{description}</TooltipPopup>
              </Tooltip>
              <div
                className={cn(
                  "relative flex min-h-6 items-center",
                  settings.showIndicatorValues ? "min-w-[6.25rem]" : "min-w-[3.25rem]",
                )}
              >
                {settings.showIndicatorValues && (
                  <span className={cn("tabular-nums", hidden && "invisible")} style={{ color }}>
                    {readings[indicatorReadingKey(instance)]?.toLocaleString(
                      "en-US",
                      key === "volume" || key === "obv"
                        ? { notation: "compact", maximumFractionDigits: 2 }
                        : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                    ) ?? "—"}
                  </span>
                )}
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
                  <Popover
                    open={settingsId === id}
                    onOpenChange={(next) => {
                      setSettingsId((current) => (next ? id : current === id ? null : current));
                    }}
                  >
                    <PopoverTrigger
                      onClick={(event) => {
                        settingsReturnFocus.current = event.currentTarget;
                      }}
                      className={controlClass}
                      aria-label={accessible(`${label} settings`)}
                      title={`${label} settings`}
                    >
                      <SolarSettingsIcon className="size-4" />
                    </PopoverTrigger>
                    <PopoverPopup
                      finalFocus={() =>
                        (!settingsId || settingsId === id) &&
                        settingsReturnFocus.current?.isConnected
                          ? settingsReturnFocus.current
                          : false
                      }
                      align="start"
                      className="max-h-[min(70vh,36rem)] w-72 overflow-y-auto"
                    >
                      <IndicatorSettingsContent
                        instance={instance}
                        settings={settings}
                        accessible={accessible}
                        description={description}
                      />
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
              onClick={() => settings.setIndicatorLegendCollapsed(!collapsed)}
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
