import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

type Analysis =
  | { status: "pending" | "unrated"; reason: string }
  | {
      status: "rated";
      direction: "bullish" | "bearish" | "neutral";
      strength: "weak" | "moderate" | "strong" | "neutral";
      confidence: number;
      reason: string;
    };
type Wire = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  category: string;
  analysis?: Analysis;
};
const FILTERS = ["All news", "Bullish", "Bearish", "Neutral"] as const;

export function LiveWires({ root = "MGC" }: { root?: "MGC" | "NQ" }) {
  const [feed, setFeed] = useState<{ root: string; items: Wire[]; updated: number }>({
    root,
    items: [],
    updated: 0,
  });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All news");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      let delay = 60_000;
      try {
        const response = await fetch(`/api/trading/news?root=${root}`, {
          signal: abort.signal,
          credentials: "same-origin",
        });
        if (!response.ok) throw Error("News feed unavailable");
        const data = await response.json();
        if (!Array.isArray(data.items)) throw Error("No headlines received");
        if (abort.signal.aborted) return;
        setFeed({ root, items: data.items, updated: data.fetchedAt });
        setError(data.stale ? "Showing cached headlines. Feed is reconnecting." : "");
        if (data.analysisStatus === "pending") delay = 2500;
      } catch {
        if (!abort.signal.aborted) setError("News feed unavailable. Retrying shortly.");
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void load(), delay);
    };
    void load();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [refresh, root]);
  const items = feed.root === root ? feed.items : [];
  const filtered =
    filter === "All news"
      ? items
      : items.filter(
          (item) =>
            item.analysis?.status === "rated" && item.analysis.direction === filter.toLowerCase(),
        );
  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col bg-[#0c0c0e]"
      aria-label={`Live Wires for ${root}`}
    >
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "size-1.5 rounded-full",
              error ? "bg-amber-400" : items.length ? "bg-blue-500" : "bg-zinc-600",
            )}
          />
          <h2 className="text-xs font-semibold tracking-wide text-zinc-400">Live Wires</h2>
          <span className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-zinc-300">
            {root}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Refresh news"
                onClick={() => setRefresh((value) => value + 1)}
                className="rounded p-1 text-zinc-500 hover:text-zinc-200"
              />
            }
          >
            <RefreshCw className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup>
            Refresh news
            {feed.updated
              ? ` · Updated ${new Date(feed.updated).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </TooltipPopup>
        </Tooltip>
      </header>
      <nav
        aria-label="News impact filters"
        className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/5 p-2"
      >
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1.5 text-[11px]",
              filter === item
                ? "border-zinc-200 bg-zinc-200 font-semibold text-zinc-950"
                : "border-white/10 bg-white/5 text-zinc-400 hover:text-white",
            )}
          >
            {item}
          </button>
        ))}
      </nav>
      {error && (
        <p role="status" className="px-3 py-2 text-xs text-amber-400">
          {error}
        </p>
      )}
      <div className="min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto px-3">
        {!filtered.length && (
          <p className="px-1 py-5 text-xs text-zinc-500">
            {items.length
              ? "No headlines match this impact filter."
              : error
                ? "Waiting for the feed."
                : "Loading headlines…"}
          </p>
        )}
        {filtered.map((item) => (
          <NewsItem key={item.id} item={item} root={root} />
        ))}
      </div>
    </section>
  );
}

function NewsItem({ item, root }: { item: Wire; root: "MGC" | "NQ" }) {
  const analysis = item.analysis;
  const rated = analysis?.status === "rated" ? analysis : undefined;
  const direction = rated?.direction;
  const strength = rated ? { neutral: 0, weak: 1, moderate: 2, strong: 3 }[rated.strength] : 0;
  const tone =
    direction === "bullish"
      ? "text-emerald-400"
      : direction === "bearish"
        ? "text-rose-400"
        : "text-zinc-500";
  const Icon =
    direction === "bullish" ? ArrowUpRight : direction === "bearish" ? ArrowDownRight : Minus;
  return (
    <article className="px-1 py-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[11px]">
        <Tooltip>
          <TooltipTrigger
            aria-label={
              rated
                ? `${direction}, ${rated.strength} impact on ${root}`
                : analysis?.status === "pending"
                  ? "Analyzing headline"
                  : "Unrated headline"
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-white/5",
              tone,
            )}
          >
            <Icon className="size-3.5" />
            {rated ? (
              [1, 2, 3].map((level) => (
                <span
                  key={level}
                  className={cn(
                    "size-1 rounded-full",
                    strength >= level ? "bg-current" : "bg-zinc-800",
                  )}
                />
              ))
            ) : (
              <span aria-hidden="true">{analysis?.status === "pending" ? "…" : "?"}</span>
            )}
          </TooltipTrigger>
          <TooltipPopup className="max-w-72">
            {rated ? (
              <>
                <span className="capitalize">
                  {direction} · {rated.strength}
                </span>
                <p className="mt-1">
                  {root}: {rated.reason}
                </p>
              </>
            ) : (
              (analysis?.reason ?? "Analysis unavailable")
            )}
          </TooltipPopup>
        </Tooltip>
        <time
          dateTime={item.publishedAt}
          aria-label={new Date(item.publishedAt).toLocaleString()}
          className="ml-auto text-zinc-600"
        >
          {new Date(item.publishedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}{" "}
          ·{" "}
          {new Date(item.publishedAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[13px] font-medium leading-relaxed text-zinc-200 hover:text-white"
            />
          }
        >
          {item.title}
        </TooltipTrigger>
        <TooltipPopup>Read on {item.source}</TooltipPopup>
      </Tooltip>
    </article>
  );
}
