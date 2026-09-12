import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { HOUR, makeTradingNewsStore, TOMBSTONE_RETENTION } from "./newsStore.ts";
import { createNewsAnalyst, headlineCacheKey, type Impact } from "./newsAnalysis.ts";

const impact: Impact = {
  status: "rated",
  direction: "bullish",
  strength: "weak",
  confidence: 0.6,
  reason: "Lower yields could support gold, with limited headline context.",
};
const now = Date.parse("2026-09-11T20:00:00Z");
const headline = {
  id: "https://example.com/headline",
  title: "Yields fall",
  publishedAt: "2026-09-11T20:00:00.000Z",
};

it.effect("retains results across analyst instances without a second provider call", () =>
  Effect.gen(function* () {
    const store = yield* makeTradingNewsStore;
    const key = headlineCacheKey(headline, "MGC");
    yield* store.saveAnalysis("trading", key, impact, now);
    const reopened = yield* makeTradingNewsStore;
    const initial = yield* reopened.loadAnalyses("trading");
    let calls = 0;
    const analyst = createNewsAnalyst(
      async () => {
        calls++;
        return new Map([[headline.id, impact]]);
      },
      () => now + HOUR,
      {
        initial,
        retentionMs: () => 168 * HOUR,
        save: () => Promise.resolve(),
      },
    );
    assert.equal(analyst.annotate([headline], "MGC", true).items[0]?.analysis.status, "rated");
    yield* Effect.promise(() => analyst.settled("MGC"));
    assert.equal(calls, 0);
    assert.deepEqual(yield* store.loadAnalyses("other-workspace"), []);
  }).pipe(Effect.provide(SqlitePersistenceMemory)),
);

it.effect(
  "expires temporary data at each workspace retention boundary, preserving saved work and fingerprints",
  () =>
    Effect.gen(function* () {
      const store = yield* makeTradingNewsStore;
      const sql = yield* SqlClient.SqlClient;
      yield* store.saveAnalysis("day", "a", impact, now);
      yield* store.saveAnalysis("week", "a", impact, now);
      yield* store.saveFeed("day", { items: [], fetchedAt: now });
      yield* store.saveFeed("week", { items: [], fetchedAt: now });
      yield* sql`INSERT INTO trading_workspace_state(workspace_id, key, value_json, updated_at) VALUES ('day', 'drawings', '[1]', ${now})`;
      yield* store.setRetention("day", 24, now);
      yield* store.cleanup(now + 24 * HOUR);
      assert.equal(yield* store.loadFeed("day"), undefined);
      assert.equal((yield* store.loadAnalyses("day"))[0]?.analysis, null);
      assert.equal((yield* store.loadAnalyses("week"))[0]?.analysis?.status, "rated");
      assert.ok(yield* store.loadFeed("week"));
      yield* store.cleanup(now + 168 * HOUR);
      assert.equal(yield* store.loadFeed("week"), undefined);
      assert.equal((yield* store.loadAnalyses("week"))[0]?.analysis, null);
      const saved = yield* sql<{
        value_json: string;
      }>`SELECT value_json FROM trading_workspace_state WHERE workspace_id = 'day'`;
      assert.equal(saved[0]?.value_json, "[1]");
      yield* store.cleanup(now + TOMBSTONE_RETENTION);
      assert.deepEqual(yield* store.loadAnalyses("day"), []);
    }).pipe(Effect.provide(SqlitePersistenceMemory)),
);

it.effect("expired fingerprints and old headlines cannot trigger reanalysis after restart", () =>
  Effect.gen(function* () {
    const store = yield* makeTradingNewsStore;
    yield* store.saveAnalysis("trading", headlineCacheKey(headline, "MGC"), impact, now);
    yield* store.setRetention("trading", 24, now);
    yield* store.cleanup(now + 25 * HOUR);
    const initial = yield* store.loadAnalyses("trading");
    let calls = 0;
    const classifier = async () => {
      calls++;
      return new Map([[headline.id, impact]]);
    };
    for (const seeds of [initial, []]) {
      const analyst = createNewsAnalyst(classifier, () => now + 25 * HOUR, {
        initial: seeds,
        retentionMs: () => 24 * HOUR,
        save: () => Promise.resolve(),
      });
      assert.equal(analyst.annotate([headline], "MGC", true).items[0]?.analysis.status, "unrated");
      yield* Effect.promise(() => analyst.settled("MGC"));
    }
    assert.equal(calls, 0);
  }).pipe(Effect.provide(SqlitePersistenceMemory)),
);
