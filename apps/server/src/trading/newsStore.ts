import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { Impact } from "./newsAnalysis.ts";
import type { Wire } from "./news.ts";

export const HOUR = 60 * 60_000;
export const TOMBSTONE_RETENTION = 30 * 24 * HOUR;
export type FeedSnapshot = { items: Wire[]; fetchedAt: number };
export type StoredAnalysis = { key: string; analysis: Impact | null; processedAt: number };
export interface TradingNewsStore {
  cleanup(now: number): Promise<void>;
  retention(workspaceId: string): Promise<24 | 168>;
  setRetention(workspaceId: string, hours: 24 | 168, now: number): Promise<void>;
  loadFeed(workspaceId: string): Promise<FeedSnapshot | undefined>;
  saveFeed(workspaceId: string, snapshot: FeedSnapshot): Promise<void>;
  loadAnalyses(workspaceId: string): Promise<StoredAnalysis[]>;
  saveAnalysis(workspaceId: string, key: string, analysis: Impact, now: number): Promise<void>;
}

const WireSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  url: Schema.String,
  publishedAt: Schema.String,
  source: Schema.String,
  category: Schema.String,
});
const ImpactSchema = Schema.Struct({
  status: Schema.Literal("rated"),
  direction: Schema.Literals(["bullish", "bearish", "neutral"]),
  strength: Schema.Literals(["weak", "moderate", "strong", "neutral"]),
  confidence: Schema.Finite,
  reason: Schema.String,
});
const decodeFeed = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(WireSchema)));
const encodeFeed = Schema.encodeEffect(Schema.fromJsonString(Schema.Array(WireSchema)));
const encodeAnalysis = Schema.encodeEffect(Schema.fromJsonString(ImpactSchema));
const decodeAnalysis = Schema.decodeUnknownEffect(Schema.fromJsonString(ImpactSchema));

export const makeTradingNewsStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const cleanup = Effect.fn("TradingNewsStore.cleanup")(function* (now: number) {
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`DELETE FROM trading_news_feed WHERE fetched_at <= ${now} -
        COALESCE((SELECT retention_hours FROM trading_cache_preferences WHERE workspace_id = trading_news_feed.workspace_id), 168) * ${HOUR}`;
        // Keep only the fingerprint after expiry, so reopening a stale feed cannot re-bill the AI.
        yield* sql`UPDATE trading_news_analysis SET analysis_json = NULL WHERE analysis_json IS NOT NULL AND processed_at <= ${now} -
        COALESCE((SELECT retention_hours FROM trading_cache_preferences WHERE workspace_id = trading_news_analysis.workspace_id), 168) * ${HOUR}`;
        yield* sql`DELETE FROM trading_news_analysis WHERE processed_at <= ${now - TOMBSTONE_RETENTION}`;
      }),
    );
  });
  const retention = Effect.fn("TradingNewsStore.retention")(function* (workspaceId: string) {
    const rows = yield* sql<{
      retention_hours: number;
    }>`SELECT retention_hours FROM trading_cache_preferences WHERE workspace_id = ${workspaceId}`;
    return rows[0]?.retention_hours === 24 ? (24 as const) : (168 as const);
  });
  const setRetention = Effect.fn("TradingNewsStore.setRetention")(function* (
    workspaceId: string,
    hours: 24 | 168,
    now: number,
  ) {
    yield* sql`INSERT INTO trading_cache_preferences(workspace_id, retention_hours) VALUES (${workspaceId}, ${hours})
      ON CONFLICT(workspace_id) DO UPDATE SET retention_hours = excluded.retention_hours`;
    yield* cleanup(now);
  });
  const loadFeed = Effect.fn("TradingNewsStore.loadFeed")(function* (workspaceId: string) {
    const rows = yield* sql<{
      snapshot_json: string;
      fetched_at: number;
    }>`SELECT snapshot_json, fetched_at FROM trading_news_feed WHERE workspace_id = ${workspaceId}`;
    const row = rows[0];
    return row
      ? { items: [...(yield* decodeFeed(row.snapshot_json))], fetchedAt: row.fetched_at }
      : undefined;
  });
  const saveFeed = Effect.fn("TradingNewsStore.saveFeed")(function* (
    workspaceId: string,
    snapshot: FeedSnapshot,
  ) {
    yield* sql`INSERT INTO trading_news_feed(workspace_id, snapshot_json, fetched_at)
      VALUES (${workspaceId}, ${yield* encodeFeed(snapshot.items)}, ${snapshot.fetchedAt})
      ON CONFLICT(workspace_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, fetched_at = excluded.fetched_at`;
  });
  const loadAnalyses = Effect.fn("TradingNewsStore.loadAnalyses")(function* (workspaceId: string) {
    const rows = yield* sql<{
      cache_key: string;
      analysis_json: string | null;
      processed_at: number;
    }>`SELECT cache_key, analysis_json, processed_at FROM trading_news_analysis WHERE workspace_id = ${workspaceId}`;
    return yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        return {
          key: row.cache_key,
          analysis: row.analysis_json ? yield* decodeAnalysis(row.analysis_json) : null,
          processedAt: row.processed_at,
        };
      }),
    );
  });
  const saveAnalysis = Effect.fn("TradingNewsStore.saveAnalysis")(function* (
    workspaceId: string,
    key: string,
    analysis: Impact,
    now: number,
  ) {
    yield* sql`INSERT INTO trading_news_analysis(workspace_id, cache_key, analysis_json, processed_at)
      VALUES (${workspaceId}, ${key}, ${yield* encodeAnalysis(analysis)}, ${now})
      ON CONFLICT(workspace_id, cache_key) DO UPDATE SET analysis_json = excluded.analysis_json, processed_at = excluded.processed_at`;
  });
  return { cleanup, retention, setRetention, loadFeed, saveFeed, loadAnalyses, saveAnalysis };
});

// Bridge the existing native fetch adapter to the server's captured SQL connection.
export function createTradingNewsStoreAdapter(
  store: Effect.Success<typeof makeTradingNewsStore>,
): TradingNewsStore {
  return {
    cleanup: (now) => Effect.runPromise(store.cleanup(now)),
    retention: (workspaceId) => Effect.runPromise(store.retention(workspaceId)),
    setRetention: (workspaceId, hours, now) =>
      Effect.runPromise(store.setRetention(workspaceId, hours, now)),
    loadFeed: (workspaceId) => Effect.runPromise(store.loadFeed(workspaceId)),
    saveFeed: (workspaceId, snapshot) => Effect.runPromise(store.saveFeed(workspaceId, snapshot)),
    loadAnalyses: (workspaceId) => Effect.runPromise(store.loadAnalyses(workspaceId)),
    saveAnalysis: (workspaceId, key, analysis, now) =>
      Effect.runPromise(store.saveAnalysis(workspaceId, key, analysis, now)),
  };
}
