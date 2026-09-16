import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

const SETTINGS_KEYS = new Set([
  "automorphic:trading-settings:v1",
  "automorphic:chart:v1",
  "automorphic:trading:v1",
  "automorphic:chart-alerts:v1",
  "automorphic:chart-alert-sort:v1",
  "automorphic:chart-alert-filter:v1",
  "automorphic:chart-data-table-sort:v1",
  "automorphic:chart-data-table-scope:v1",
  "automorphic:chart-templates:v1",
  "automorphic:replay-bookmarks:v1",
  "automorphic:chart-date-navigation:v1",
  "automorphic:drawing-alerts:v1",
  "automorphic:drawing-controls:v1",
  "automorphic:drawing-templates:v1",
  "automorphic:drawing-custom-colors:v1",
  "automorphic:drawing-defaults:v1",
  "automorphic:drawing-favorites:v1",
]);
export function parseWorkspaceValue(input: unknown): { key: string; value: string } | null {
  if (!input || typeof input !== "object") return null;
  const { key, value } = input as Record<string, unknown>;
  if (typeof key !== "string" || typeof value !== "string" || value.length > 262_144) return null;
  if (
    !SETTINGS_KEYS.has(key) &&
    !/^automorphic:chart-drawings:v1:[A-Za-z0-9%._!-]{1,80}$/.test(key)
  )
    return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
  } catch {
    return null;
  }
  return { key, value };
}

export const makeWorkspaceState = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const read = Effect.fn("TradingWorkspaceState.read")(function* (workspaceId: string) {
    const rows = yield* sql<{
      key: string;
      value_json: string;
    }>`SELECT key, value_json FROM trading_workspace_state WHERE workspace_id = ${workspaceId}`;
    return Object.fromEntries(rows.map((row) => [row.key, row.value_json]));
  });
  const write = Effect.fn("TradingWorkspaceState.write")(function* (
    workspaceId: string,
    key: string,
    value: string,
    now: number,
  ) {
    yield* sql`INSERT INTO trading_workspace_state(workspace_id, key, value_json, updated_at)
      VALUES (${workspaceId}, ${key}, ${value}, ${now})
      ON CONFLICT(workspace_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`;
  });
  return { read, write };
});
