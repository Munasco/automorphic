import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS trading_workspace_state (
    workspace_id TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL, PRIMARY KEY(workspace_id, key)
  )`;
  yield* sql`CREATE TABLE IF NOT EXISTS trading_cache_preferences (
    workspace_id TEXT PRIMARY KEY, retention_hours INTEGER NOT NULL DEFAULT 168
      CHECK(retention_hours IN (24, 168))
  )`;
  yield* sql`CREATE TABLE IF NOT EXISTS trading_news_feed (
    workspace_id TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL, fetched_at INTEGER NOT NULL
  )`;
  yield* sql`CREATE TABLE IF NOT EXISTS trading_news_analysis (
    workspace_id TEXT NOT NULL, cache_key TEXT NOT NULL, analysis_json TEXT,
    processed_at INTEGER NOT NULL, PRIMARY KEY(workspace_id, cache_key)
  )`;
});
