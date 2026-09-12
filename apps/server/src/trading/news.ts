// @effect-diagnostics globalFetch:off globalDate:off - Plain RSS adapter shared with deterministic parser tests.
import { XMLParser } from "fast-xml-parser";
import { analyzeWires, type NewsInstrument } from "./newsAnalysis.ts";
export type Wire = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  category: string;
};
let cached: { items: Wire[]; fetchedAt: number } | undefined;
let pending: Promise<{ items: Wire[]; fetchedAt: number }> | undefined;
export function parseWires(xml: string): Wire[] {
  const parsed = new XMLParser({ ignoreAttributes: true, processEntities: true }).parse(xml);
  const entries = parsed?.rss?.channel?.item;
  const items = Array.isArray(entries) ? entries : entries ? [entries] : [];
  return items.slice(0, 40).flatMap((item): Wire[] => {
    const title = typeof item.title === "string" ? item.title.replace(/<[^>]*>/g, "").trim() : "";
    const url = typeof item.link === "string" ? item.link : "";
    const timestamp = Date.parse(item.pubDate);
    if (
      !title ||
      !/^https:\/\/(www\.)?investinglive\.com\//.test(url) ||
      !Number.isFinite(timestamp)
    )
      return [];
    const category = Array.isArray(item.category) ? item.category[0] : item.category;
    return [
      {
        id: url,
        title,
        url,
        publishedAt: new Date(timestamp).toISOString(),
        source: "investingLive",
        category: typeof category === "string" ? category : "News",
      },
    ];
  });
}
async function feed() {
  if (cached && Date.now() - cached.fetchedAt < 60_000) return { ...cached, stale: false };
  try {
    pending ??= (async () => {
      const response = await fetch("https://www.investinglive.com/feed/", {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/rss+xml" },
      });
      if (!response.ok) throw new Error("News feed unavailable.");
      const items = parseWires(await response.text());
      if (!items.length) throw new Error("News feed returned no headlines.");
      cached = { items, fetchedAt: Date.now() };
      return cached;
    })();
    return { ...(await pending), stale: false };
  } catch {
    if (cached) return { ...cached, stale: true };
    throw new Error("News feed is unavailable. Try again shortly.");
  } finally {
    pending = undefined;
  }
}

export async function liveWires(root: NewsInstrument = "MGC") {
  const snapshot = await feed();
  return { ...snapshot, ...(await analyzeWires(snapshot.items, root)) };
}
