import { useId, useMemo } from "react";
import { ArrowLeftIcon, ChevronDownIcon } from "lucide-react";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { cn } from "../../lib/utils";
import type { Candle } from "./chartIndicators";
import { chartIntervalKey, formatChartInterval, type ChartInterval } from "./tradingIntervals";
import { MarketInstrumentIcon } from "./MarketInstrumentIcon";
import { rootFromSymbol } from "./tradingInstruments";
import {
  calculateTechnicalRatings,
  type TechnicalRatingGroup,
  type TechnicalRatingSummary,
} from "./technicalRatings";

const intervals: ReadonlyArray<{ label: string; interval: ChartInterval }> = [
  { label: "1 minute", interval: { unit: "minute", value: 1 } },
  { label: "5 minutes", interval: { unit: "minute", value: 5 } },
  { label: "15 minutes", interval: { unit: "minute", value: 15 } },
  { label: "30 minutes", interval: { unit: "minute", value: 30 } },
  { label: "1 hour", interval: { unit: "minute", value: 60 } },
  { label: "2 hours", interval: { unit: "minute", value: 120 } },
  { label: "4 hours", interval: { unit: "minute", value: 240 } },
  { label: "1 day", interval: { unit: "day", value: 1 } },
];
const moreIntervals: ReadonlyArray<{ label: string; interval: ChartInterval }> = [
  { label: "1 week", interval: { unit: "week", value: 1 } },
  { label: "1 month", interval: { unit: "month", value: 1 } },
];
const ratingColor = (rating: TechnicalRatingSummary["rating"]) =>
  rating?.includes("Sell") ? "#f23645" : rating?.includes("Buy") ? "#2962ff" : "#b2b5be";
const ratingLabel = (rating: TechnicalRatingSummary["rating"]) =>
  rating?.replace("Strong Sell", "Strong sell").replace("Strong Buy", "Strong buy") ?? "—";

function TechnicalGauge({
  title,
  group,
  large = false,
}: {
  title: string;
  group: TechnicalRatingSummary;
  large?: boolean;
}) {
  const gradientId = useId();
  const score = group.score === null ? null : Math.max(-1, Math.min(1, group.score));
  const labels = [
    { text: "Strong sell", rating: "Strong Sell", x: 39, y: 159 },
    { text: "Sell", rating: "Sell", x: 96, y: 86 },
    { text: "Neutral", rating: "Neutral", x: 200, y: 44 },
    { text: "Buy", rating: "Buy", x: 304, y: 86 },
    { text: "Strong buy", rating: "Strong Buy", x: 361, y: 159 },
  ];
  return (
    <section aria-label={`${title} rating`} className="min-w-0 text-center">
      <h3 className={cn("font-medium text-zinc-200", large ? "text-base" : "text-sm")}>{title}</h3>
      <svg
        viewBox="0 0 400 220"
        role="img"
        aria-label={`${title}: ${ratingLabel(group.rating)}`}
        className={cn(
          "mx-auto w-full",
          large ? "max-w-[350px] @[700px]/technicals:max-w-[500px]" : "max-w-[320px]",
        )}
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="74"
            y1="200"
            x2="326"
            y2="200"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#f23645" />
            <stop offset="50%" stopColor="#a63d9e" />
            <stop offset="100%" stopColor="#2962ff" />
          </linearGradient>
        </defs>
        <path d="M 74 200 A 126 126 0 0 1 326 200" fill="none" stroke="#434343" strokeWidth="9" />
        {score !== null ? (
          <>
            <path
              d="M 74 200 A 126 126 0 0 1 326 200"
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="9"
              pathLength="100"
              strokeDasharray={`${((score + 1) / 2) * 100} 100`}
            />
            <g
              style={{ transform: `rotate(${score * 90}deg)`, transformOrigin: "200px 200px" }}
              className="transition-transform duration-300 ease-out motion-reduce:transition-none"
            >
              <path d="M 200 200 L 200 99" stroke="#d1d4dc" strokeWidth="3" strokeLinecap="round" />
            </g>
            <circle cx="200" cy="200" r="5" fill="#d1d4dc" />
          </>
        ) : null}
        {labels.map((label) => (
          <text
            key={label.rating}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            fontSize="12"
            fontWeight={group.rating === label.rating ? 500 : 400}
            fill={group.rating === label.rating ? ratingColor(group.rating) : "#737373"}
          >
            {label.text}
          </text>
        ))}
      </svg>
      <p
        className={cn("font-medium", large ? "text-2xl" : "text-base")}
        style={{ color: ratingColor(group.rating) }}
      >
        {ratingLabel(group.rating)}
      </p>
      <dl className={cn("mx-auto mt-5 flex justify-center", large ? "gap-7" : "gap-5")}>
        {(["sell", "neutral", "buy"] as const).map((action) => (
          <div key={action} className="min-w-9 text-center">
            <dt className="text-xs capitalize text-zinc-300">{action}</dt>
            <dd className={cn("mt-1 tabular-nums text-zinc-200", large ? "text-lg" : "text-base")}>
              {group.score === null ? "—" : group[action]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TechnicalTable({ title, group }: { title: string; group: TechnicalRatingGroup }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-3 text-base font-medium text-zinc-200">{title}</h3>
      <table aria-label={title} className="w-full table-fixed border-collapse text-xs">
        <thead className="border-y border-white/10 text-zinc-500">
          <tr>
            <th scope="col" className="w-[58%] py-3 pr-2 text-left font-normal">
              Name
            </th>
            <th scope="col" className="w-[22%] py-3 text-right font-normal">
              Value
            </th>
            <th scope="col" className="w-[20%] py-3 pl-3 text-right font-normal">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {group.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="py-3 pr-3 text-left font-normal leading-5 text-zinc-300">
                {row.name}
              </th>
              <td className="py-3 text-right tabular-nums text-zinc-300">
                {row.value === null
                  ? "—"
                  : row.value.toLocaleString(undefined, {
                      maximumFractionDigits: Math.abs(row.value) < 1 ? 4 : 2,
                    })}
              </td>
              <td
                className="whitespace-nowrap py-3 pl-3 text-right"
                style={{ color: ratingColor(row.action) }}
              >
                {row.action ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ChartTechnicals({
  symbol,
  name,
  interval,
  candles,
  onIntervalChange,
  onBack,
  loading = false,
  error,
  onRetry,
}: {
  symbol: string;
  name?: string;
  interval: ChartInterval;
  candles: readonly Candle[];
  onIntervalChange: (interval: ChartInterval) => void;
  onBack: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const ratings = useMemo(
    () => calculateTechnicalRatings(loading || error ? [] : candles),
    [candles, loading, error],
  );
  const key = chartIntervalKey(interval);
  const more = moreIntervals.find((option) => chartIntervalKey(option.interval) === key);
  const available = ratings.summary.buy + ratings.summary.neutral + ratings.summary.sell;
  const root = rootFromSymbol(symbol);
  return (
    <section
      aria-label={`${symbol} technicals`}
      aria-busy={loading}
      className="absolute inset-0 z-30 overflow-y-auto bg-[#080808] text-zinc-100 @container/technicals"
    >
      <header className="flex min-h-16 items-center justify-between gap-3 px-4 py-4 @[700px]/technicals:px-6">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-medium">
          {root ? <MarketInstrumentIcon root={root} className="size-5 shrink-0" /> : null}
          <span>{name || symbol}</span>
          <span className="hidden text-zinc-500 @[700px]/technicals:inline"> · Technicals</span>
        </h2>
        <button
          type="button"
          onClick={onBack}
          className="flex shrink-0 items-center gap-2 rounded px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10 focus-visible:outline-blue-400"
        >
          <ArrowLeftIcon className="size-4" />
          Back to chart
        </button>
      </header>
      <div className="px-4 pb-8 @[700px]/technicals:px-6">
        <div
          aria-label="Technicals timeframe"
          role="group"
          className="mb-7 flex flex-wrap items-center gap-1"
        >
          {intervals.map((option) => (
            <button
              type="button"
              key={chartIntervalKey(option.interval)}
              aria-label={option.label}
              aria-pressed={key === chartIntervalKey(option.interval)}
              onClick={() => onIntervalChange(option.interval)}
              className={cn(
                "rounded-md px-2.5 py-2 text-xs text-zinc-300 hover:bg-white/10 @[850px]/technicals:text-sm",
                key === chartIntervalKey(option.interval) && "bg-white/15 font-medium text-white",
              )}
            >
              <span className="@[850px]/technicals:hidden">
                {formatChartInterval(option.interval)}
              </span>
              <span className="hidden @[850px]/technicals:inline">{option.label}</span>
            </button>
          ))}
          <Menu>
            <MenuTrigger
              aria-label="More technicals timeframes"
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-2 text-xs text-zinc-300 hover:bg-white/10 @[850px]/technicals:text-sm",
                more && "bg-white/15 font-medium text-white",
              )}
            >
              {more?.label ?? "More"}
              <ChevronDownIcon className="size-3" />
            </MenuTrigger>
            <MenuPopup align="end">
              {moreIntervals.map((option) => (
                <MenuItem
                  key={option.label}
                  onClick={() => onIntervalChange(option.interval)}
                  aria-current={more?.label === option.label ? "true" : undefined}
                >
                  {option.label}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
        </div>
        {loading || error || available < 26 ? (
          <div
            role="status"
            className="mb-5 flex items-center justify-center gap-2 text-center text-xs text-zinc-500"
          >
            {loading
              ? "Loading technicals…"
              : error
                ? "Couldn’t load technicals."
                : available === 0
                  ? "Not enough history for this timeframe."
                  : `${available} of 26 indicators ready`}
            {error && onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded px-2 py-1 text-zinc-300 hover:bg-white/10"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        <TechnicalGauge title="Summary" group={ratings.summary} large />
        <div className="mt-9 grid grid-cols-2 gap-3 @[700px]/technicals:gap-12">
          <TechnicalGauge title="Oscillators" group={ratings.oscillators} />
          <TechnicalGauge title="Moving Averages" group={ratings.movingAverages} />
        </div>
        <div className="mt-10 grid gap-9 @[700px]/technicals:grid-cols-2 @[700px]/technicals:gap-12">
          <TechnicalTable title="Oscillators" group={ratings.oscillators} />
          <TechnicalTable title="Moving Averages" group={ratings.movingAverages} />
        </div>
      </div>
    </section>
  );
}
