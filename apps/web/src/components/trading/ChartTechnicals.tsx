import { formatChartInterval, type ChartInterval } from "./tradingIntervals";
import { GaugeIcon } from "lucide-react";
import {
  INDICATOR_CATALOG,
  INDICATOR_CATEGORIES,
  getIndicatorLabel,
  type ChartIndicators,
  type IndicatorKey,
  type IndicatorInputSettings,
} from "./indicatorCatalog";

export function chartTechnicalReadings(
  readings: Partial<Record<IndicatorKey, number>>,
  enabled: ChartIndicators,
  inputs: IndicatorInputSettings,
) {
  return INDICATOR_CATALOG.flatMap((definition) => {
    const value = readings[definition.key];
    if (
      definition.key === "volume" ||
      !enabled[definition.key] ||
      value === undefined ||
      !Number.isFinite(value)
    )
      return [];
    return [
      {
        key: definition.key,
        label: getIndicatorLabel(definition.key, inputs),
        detail: definition.detail,
        category: definition.category,
        value,
      },
    ];
  });
}
export function ChartTechnicals({
  symbol,
  interval,
  time,
  rows,
}: {
  symbol: string;
  interval: ChartInterval;
  time: number | null;
  rows: ReturnType<typeof chartTechnicalReadings>;
}) {
  return (
    <section
      aria-label={`${symbol} technicals`}
      className="absolute inset-0 z-30 overflow-y-auto bg-[#101013] p-5 sm:p-6"
    >
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-zinc-100">
          <GaugeIcon className="size-5" />
          <h2 className="text-lg font-medium">{symbol} technicals</h2>
        </div>
        <p className="text-xs leading-5 text-zinc-400">
          Latest enabled chart indicators · {formatChartInterval(interval)}
          {time ? (
            <>
              {" "}
              ·{" "}
              <time dateTime={new Date(time * 1000).toISOString()}>
                {new Date(time * 1000).toLocaleString()}
              </time>
            </>
          ) : null}
        </p>
      </header>
      {INDICATOR_CATEGORIES.map((category) => {
        const entries = rows.filter((row) => row.category === category);
        return entries.length ? (
          <section key={category} className="mb-6">
            <h3 className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">{category}</h3>
            <dl className="divide-y divide-white/10 rounded-lg border border-white/10 px-4">
              {entries.map((row) => (
                <div key={row.key} className="flex items-start justify-between gap-4 py-3">
                  <dt className="min-w-0">
                    <span className="block text-sm text-zinc-200">{row.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-500">{row.detail}</span>
                  </dt>
                  <dd className="shrink-0 pt-0.5 text-sm tabular-nums text-zinc-100">
                    {row.value.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null;
      })}
    </section>
  );
}
