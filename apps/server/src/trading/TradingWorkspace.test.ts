import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  type OrchestrationProject,
  type OrchestrationProjectShell,
  ProjectId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { TradingWorkspace, TradingWorkspaceLive } from "./TradingWorkspace.ts";

const query = {
  getActiveProjectByWorkspaceRoot: () =>
    Effect.succeed(
      Option.some({
        id: ProjectId.make("default"),
        title: "My workspace",
      } as OrchestrationProject),
    ),
  getProjectShellById: (id: ProjectId) =>
    Effect.succeed(
      id === "gold" || id === "nasdaq"
        ? Option.some({ id, title: String(id) } as unknown as OrchestrationProjectShell)
        : Option.none(),
    ),
} as unknown as ProjectionSnapshotQuery["Service"];

it.effect(
  "selects active projects, isolates their data and retention, and rejects unknown project keys",
  () =>
    Effect.gen(function* () {
      const workspace = yield* TradingWorkspace;
      yield* workspace.save("automorphic:chart:v1", '{"style":"line"}', "gold");
      yield* workspace.save("automorphic:chart:v1", '{"style":"area"}', "nasdaq");
      yield* workspace.setRetention(24, "gold");
      const gold = yield* workspace.snapshot("gold");
      const nasdaq = yield* workspace.snapshot("nasdaq");
      assert.equal(gold.isDefault, false);
      assert.equal((yield* workspace.snapshot()).isDefault, true);
      assert.equal(gold.retentionHours, 24);
      assert.equal(nasdaq.retentionHours, 168);
      assert.equal(gold.values["automorphic:chart:v1"], '{"style":"line"}');
      assert.equal(nasdaq.values["automorphic:chart:v1"], '{"style":"area"}');
      assert.equal((yield* workspace.snapshot()).projectId, "default");
      assert.deepEqual((yield* workspace.snapshot()).values, {});
      assert.equal(
        (yield* workspace.save("automorphic:chart:v1", "{}", "nonexistent").pipe(Effect.flip))._tag,
        "TradingWorkspaceStarting",
      );
    }).pipe(
      Effect.provide(
        TradingWorkspaceLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              SqlitePersistenceMemory,
              NodeServices.layer,
              Layer.succeed(ProjectionSnapshotQuery, query),
            ),
          ),
        ),
      ),
    ),
);
