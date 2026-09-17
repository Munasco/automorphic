// @effect-diagnostics globalFetch:off globalDate:off - Plain RSS adapter shared with deterministic parser tests.
import { XMLParser } from "fast-xml-parser";
import { createWireAnalysis, type NewsInstrument } from "./newsAnalysis.ts";
import { HOUR, type TradingNewsStore, type FeedSnapshot } from "./newsStore.ts";
export type Wire = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  category: string;
};
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
/** Each workspace owns its persisted snapshot and analysis cache, sharing the server SQLite. */
export function createLiveWires(store: TradingNewsStore, workspaceId: string, now = Date.now) {
  let snapshot: FeedSnapshot | undefined;
  let request: Promise<FeedSnapshot> | undefined;
  let retentionMs = 168 * HOUR;
  let analyze: ReturnType<typeof createWireAnalysis>;
  let initialized: Promise<void> | undefined;
  const initialize = () =>
    (initialized ??= (async () => {
      await store.cleanup(now());
      retentionMs = (await store.retention(workspaceId)) * HOUR;
      snapshot = await store.loadFeed(workspaceId);
      analyze = createWireAnalysis({
        initial: await store.loadAnalyses(workspaceId),
        retentionMs: () => retentionMs,
        save: (key, result, timestamp) => store.saveAnalysis(workspaceId, key, result, timestamp),
      });
    })().catch((error) => {
      initialized = undefined;
      throw error;
    }));
  return async (root: NewsInstrument = "MGC") => {
    await initialize();
    // Opening the panel catches up after downtime; hourly server cleanup also purges idle workspaces.
    await store.cleanup(now());
    retentionMs = (await store.retention(workspaceId)) * HOUR;
    if (snapshot && snapshot.fetchedAt <= now() - retentionMs) snapshot = undefined;
    let stale = false;
    if (!snapshot || now() - snapshot.fetchedAt >= 60_000) {
      try {
        request ??= (async () => {
          const response = await fetch("https://www.investinglive.com/feed/", {
            signal: AbortSignal.timeout(10_000),
            headers: { Accept: "application/rss+xml" },
          });
          if (!response.ok) throw new Error("News feed unavailable.");
          const items = parseWires(await response.text());
          if (!items.length) throw new Error("News feed returned no headlines.");
          const next = { items, fetchedAt: now() };
          await store.saveFeed(workspaceId, next);
          return next;
        })();
        snapshot = await request;
      } catch {
        if (!snapshot) throw new Error("News feed is unavailable. Try again shortly.");
        stale = true;
      } finally {
        request = undefined;
      }
    }
    return { ...snapshot, stale, ...(await analyze!(snapshot!.items, root)) };
  };
}
