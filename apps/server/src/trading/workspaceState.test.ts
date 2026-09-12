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
