import { useEffect, useState, type RefObject } from "react";
import type { IChartApi } from "lightweight-charts";
import type { InitialBalanceStats } from "./initialBalance";

const price = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function InitialBalanceDashboard({
  chart,
  hostRef,
  stats,
}: {
  chart: IChartApi;
  hostRef: RefObject<HTMLDivElement | null>;
  stats: InitialBalanceStats;
}) {
  const [paneHeight, setPaneHeight] = useState(() => chart.panes()[0]?.getHeight() ?? 0);
  useEffect(() => {
    const canvas = hostRef.current?.querySelector("canvas");
    if (!canvas) return;
    const resize = () => setPaneHeight(chart.panes()[0]?.getHeight() ?? 0);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, [chart, hostRef]);
  const rows = [
    ["Session", stats.sessionName],
    ["IB status", stats.status],
    ["IB range", price(stats.range)],
    ["ATR (14)", price(stats.atr)],
    ["Range / ATR", stats.rangeAtrPercent === null ? "—" : `${price(stats.rangeAtrPercent)}%`],
    ["Position", stats.position],
    [
      "To boundary",
      `${stats.distance > 0 ? "+" : ""}${price(stats.distance)} (${stats.nearestBoundary})`,
    ],
    [
      "IB volume",
      stats.volume === null
        ? "—"
        : stats.volume.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 }),
    ],
  ];
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-[5]"
      style={{ height: paneHeight }}
    >
      <details
        open
        className="pointer-events-auto absolute bottom-3 right-20 max-h-[calc(100%-24px)] w-48 overflow-y-auto rounded border border-white/10 bg-[#0b0d12]/85 text-[11px] text-zinc-300 shadow-sm"
      >
        <summary className="cursor-pointer px-2.5 py-1.5 font-medium text-zinc-400">
          Initial balance
        </summary>
        <dl aria-label="Initial balance dashboard" className="px-2.5 pb-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 py-0.5">
              <dt className="text-zinc-500">{label}</dt>
              <dd
                className={`text-right tabular-nums ${label === "IB status" ? (stats.status === "Locked" ? "text-emerald-400" : "text-amber-400") : ""}`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
