import * as NodeServices from "@effect/platform-node/NodeServices";
import { type OrchestrationProject, ProjectId, ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as ServerSettings from "../serverSettings.ts";
import { TradingWorkspaceHome } from "./defaultWorkspace.ts";
import { makeTradingWorkspaceCreator, normalizeWorkspaceTitle } from "./createWorkspace.ts";

it("accepts ordinary titles and rejects traversal, reserved names and control characters", () => {
  assert.equal(normalizeWorkspaceTitle("  Gold research  "), "Gold research");
  for (const input of [
    "",
    "..",
    "userdata",
    "SECRETS",
    "caches",
    "dev",
    "runtime",
    ".env",
    ".hidden",
    "../other",
    "a/b",
    "a\\b",
    "C:\\outside",
    "bad\u0000name",
    "CON",
    "LPT1.txt",
    "bad.",
    "x".repeat(81),
  ])
    assert.equal(normalizeWorkspaceTitle(input), undefined);
});

it.effect(
  "creates a home folder and starter thread, then reuses them across concurrent case variants and creator restarts",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const home = yield* fs.makeTempDirectoryScoped({ prefix: "automorphic-create-" });
        const projects = new Map<string, OrchestrationProject>();
        const threads = new Map<ProjectId, ThreadId>();
        const commands: string[] = [];
        const query = {
          getActiveProjectByWorkspaceRoot: (root: string) =>
            Effect.sync(() => Option.fromUndefinedOr(projects.get(root))),
          getFirstActiveThreadIdByProjectId: (id: ProjectId) =>
            Effect.sync(() => Option.fromUndefinedOr(threads.get(id))),
        } as unknown as ProjectionSnapshotQuery["Service"];
        const engine = {
          dispatch: (command: Parameters<OrchestrationEngineService["Service"]["dispatch"]>[0]) =>
            Effect.sync(() => {
              commands.push(command.type);
              if (command.type === "project.create")
                projects.set(command.workspaceRoot, {
                  id: command.projectId,
                  title: command.title,
                  workspaceRoot: command.workspaceRoot,
                  defaultModelSelection: null,
                  scripts: [],
                  createdAt: command.createdAt,
                  updatedAt: command.createdAt,
                  deletedAt: null,
                });
              if (command.type === "thread.create") {
                assert.equal(command.title, "New thread");
                threads.set(command.projectId, command.threadId);
              }
              return { sequence: commands.length };
            }),
        } as unknown as OrchestrationEngineService["Service"];
        const make = makeTradingWorkspaceCreator.pipe(
          Effect.provideService(TradingWorkspaceHome, home),
          Effect.provideService(ProjectionSnapshotQuery, query),
          Effect.provideService(OrchestrationEngineService, engine),
          Effect.provide(ServerSettings.layerTest()),
        );
        const create = yield* make;
        const [first, second] = yield* Effect.all(
          [create("Gold research"), create("gold RESEARCH")],
          { concurrency: "unbounded" },
        );
        assert.deepEqual(first, second);
        const folder = `${home}/.automorphic/Gold research`;
        assert.equal(yield* fs.exists(folder), true);
        assert.include(
          yield* fs.readFileString(`${folder}/AGENTS.md`),
          "Automorphic trading workspace",
        );
        assert.include(yield* fs.readFileString(`${folder}/CLAUDE.md`), "@AGENTS.md");
        assert.equal(
          yield* fs.readFileString(`${folder}/.agents/skills/trading-workflow/SKILL.md`),
          yield* fs.readFileString(`${folder}/.claude/skills/trading-workflow/SKILL.md`),
        );
        yield* fs.writeFileString(`${folder}/AGENTS.md`, "My own trading plan");
        yield* fs.writeFileString(`${folder}/CLAUDE.md`, "My Claude instructions");
        yield* fs.writeFileString(`${folder}/notes.md`, "Keep this research");
        const reopened = yield* make;
        assert.deepEqual(yield* reopened("GOLD RESEARCH"), first);
        assert.equal(yield* fs.readFileString(`${folder}/notes.md`), "Keep this research");
        assert.equal(yield* fs.readFileString(`${folder}/AGENTS.md`), "My own trading plan");
        assert.equal(yield* fs.readFileString(`${folder}/CLAUDE.md`), "My Claude instructions");
        assert.deepEqual(commands, ["project.create", "thread.create"]);
        const defaultWorkspace = yield* create("My workspace");
        assert.equal(yield* fs.exists(`${home}/.automorphic/my-workspace`), true);
        assert.deepEqual(yield* create("my-workspace"), defaultWorkspace);
        assert.include(
          yield* fs.readFileString(`${home}/.automorphic/my-workspace/AGENTS.md`),
          "Backtests and benchmarking",
        );
        yield* fs.makeDirectory(`${home}/.automorphic/userdata`, { recursive: true });
        yield* fs.symlink(`${home}/.automorphic/userdata`, `${home}/.automorphic/Protected alias`);
        assert.equal(
          (yield* create("Protected alias").pipe(Effect.flip))._tag,
          "InvalidTradingWorkspaceName",
        );
        yield* fs.writeFileString(`${home}/.automorphic/Blocked`, "a file");
        assert.equal(
          (yield* create("Blocked").pipe(Effect.flip))._tag,
          "InvalidTradingWorkspaceName",
        );
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
);
