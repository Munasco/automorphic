import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { makeWorkspaceState, parseWorkspaceValue } from "./workspaceState.ts";

it("rejects unrelated keys, malformed JSON and oversized settings", () => {
  assert.equal(parseWorkspaceValue({ key: "GEMINI_API_KEY", value: '"secret"' }), null);
  assert.equal(parseWorkspaceValue({ key: "automorphic:chart:v1", value: "invalid" }), null);
  assert.equal(parseWorkspaceValue({ key: "automorphic:chart:v1", value: "null" }), null);
  assert.equal(
    parseWorkspaceValue({
      key: "automorphic:chart:v1",
      value: JSON.stringify({ large: "x".repeat(262_144) }),
    }),
    null,
  );
  assert.deepEqual(
    parseWorkspaceValue({
      key: "automorphic:drawing-controls:v1",
      value: '{"magnetMode":"strong","keepDrawing":true}',
    }),
    { key: "automorphic:drawing-controls:v1", value: '{"magnetMode":"strong","keepDrawing":true}' },
  );
  assert.deepEqual(
    parseWorkspaceValue({
      key: "automorphic:drawing-templates:v1",
      value: '{"state":{"templates":[]},"version":0}',
    }),
    { key: "automorphic:drawing-templates:v1", value: '{"state":{"templates":[]},"version":0}' },
  );
  assert.deepEqual(
    parseWorkspaceValue({
      key: "automorphic:drawing-custom-colors:v1",
      value: '{"state":{"colors":["#123456"]},"version":0}',
    }),
    {
      key: "automorphic:drawing-custom-colors:v1",
      value: '{"state":{"colors":["#123456"]},"version":0}',
    },
  );
  assert.deepEqual(
    parseWorkspaceValue({
      key: "automorphic:drawing-defaults:v1",
      value: '{"trend":{"color":"#2962ff","width":2}}',
    }),
    { key: "automorphic:drawing-defaults:v1", value: '{"trend":{"color":"#2962ff","width":2}}' },
  );
  assert.deepEqual(
    parseWorkspaceValue({ key: "automorphic:chart-alert-sort:v1", value: '{"sort":"message"}' }),
    { key: "automorphic:chart-alert-sort:v1", value: '{"sort":"message"}' },
  );
  assert.deepEqual(
    parseWorkspaceValue({
      key: "automorphic:chart-data-table-sort:v1",
      value: '{"field":"volume","direction":"asc"}',
    }),
    { key: "automorphic:chart-data-table-sort:v1", value: '{"field":"volume","direction":"asc"}' },
  );
  assert.deepEqual(
    parseWorkspaceValue({
      key: "automorphic:chart-templates:v1",
      value: '{"state":{"templates":[]},"version":0}',
    }),
    { key: "automorphic:chart-templates:v1", value: '{"state":{"templates":[]},"version":0}' },
  );
  assert.deepEqual(
    parseWorkspaceValue({
      key: "automorphic:chart-date-navigation:v1",
      value: '{"times":{"NQU6":1789128000}}',
    }),
    { key: "automorphic:chart-date-navigation:v1", value: '{"times":{"NQU6":1789128000}}' },
  );
  assert.deepEqual(
    parseWorkspaceValue({ key: "automorphic:chart-drawings:v1:MGCV6", value: "[]" }),
    { key: "automorphic:chart-drawings:v1:MGCV6", value: "[]" },
  );
  assert.deepEqual(
    parseWorkspaceValue({
      key: "automorphic:chart-alerts:v1",
      value: '{"version":1,"alerts":[],"history":[]}',
    }),
    { key: "automorphic:chart-alerts:v1", value: '{"version":1,"alerts":[],"history":[]}' },
  );
});

it.effect("saved settings survive reopening storage and remain isolated by project", () =>
  Effect.gen(function* () {
    const store = yield* makeWorkspaceState;
    yield* store.write("first", "automorphic:chart:v1", '{"style":"line"}', 1);
    yield* store.write("second", "automorphic:chart:v1", '{"style":"area"}', 2);
    const reopened = yield* makeWorkspaceState;
    assert.deepEqual(yield* reopened.read("first"), { "automorphic:chart:v1": '{"style":"line"}' });
    yield* reopened.write("first", "automorphic:chart:v1", '{"style":"candles"}', 3);
    assert.deepEqual(yield* store.read("first"), { "automorphic:chart:v1": '{"style":"candles"}' });
    assert.deepEqual(yield* store.read("second"), { "automorphic:chart:v1": '{"style":"area"}' });
  }).pipe(Effect.provide(SqlitePersistenceMemory)),
);

it.effect(
  "drawing alerts pass request validation and preserve each workspace's history on reopen",
  () =>
    Effect.gen(function* () {
      const key = "automorphic:drawing-alerts:v1";
      const first =
        '{"version":1,"alerts":[{"id":"nq-breakout","drawingId":"opening-high","enabled":true}],"history":[{"id":"crossing-1","alertId":"nq-breakout","price":29300,"target":29299}]}';
      const second =
        '{"version":1,"alerts":[{"id":"silver-breakdown","drawingId":"opening-low","enabled":false}],"history":[]}';
      const store = yield* makeWorkspaceState;
      for (const [projectId, value] of [
        ["first", first],
        ["second", second],
      ] as const) {
        const accepted = parseWorkspaceValue({ key, value });
        assert.deepEqual(accepted, { key, value });
        yield* store.write(projectId, accepted!.key, accepted!.value, 1);
      }
      const reopened = yield* makeWorkspaceState;
      assert.deepEqual(yield* reopened.read("first"), { [key]: first });
      assert.deepEqual(yield* reopened.read("second"), { [key]: second });
      assert.deepEqual(yield* reopened.read("new-workspace"), {});

      const cleared = '{"version":1,"alerts":[],"history":[]}';
      yield* reopened.write("first", key, cleared, 2);
      const reopenedAgain = yield* makeWorkspaceState;
      assert.deepEqual(yield* reopenedAgain.read("first"), { [key]: cleared });
      assert.deepEqual(yield* reopenedAgain.read("second"), { [key]: second });
    }).pipe(Effect.provide(SqlitePersistenceMemory)),
);
