import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  DEFAULT_MODEL,
  type OrchestrationProject,
  DEFAULT_SERVER_SETTINGS,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import * as ServerConfig from "./config.ts";
import { TradingWorkspaceHome } from "./trading/defaultWorkspace.ts";
import * as OrchestrationEngine from "./orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import * as ServerRuntimeStartup from "./serverRuntimeStartup.ts";
import * as ServerSettings from "./serverSettings.ts";
import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";

it.effect("automatic pull only updates enabled, behind, clean default-branch checkouts", () =>
  Effect.gen(function* () {
    const pulled: string[] = [];
    const git = {
      statusDetails: (cwd: string) =>
        Effect.succeed({
          isRepo: true,
          isDefaultBranch: cwd !== "/feature",
          hasUpstream: true,
          hasWorkingTreeChanges: cwd === "/dirty",
          aheadCount: cwd === "/ahead" ? 1 : 0,
          behindCount: cwd === "/current" ? 0 : 1,
        } as never),
      pullCurrentBranch: (cwd: string) =>
        Effect.sync(() => {
          pulled.push(cwd);
          return {
            status: "pulled" as const,
            refName: "main",
            upstreamRef: "origin/main",
          };
        }),
    } as unknown as GitVcsDriver.GitVcsDriver["Service"];
    const project = (workspaceRoot: string) =>
      ({ id: ProjectId.make(workspaceRoot), workspaceRoot }) as never;
    const overrides = (entries: Record<string, boolean>) => ({
      ...DEFAULT_SERVER_SETTINGS,
      projectSettingsOverrides: Object.fromEntries(
        Object.entries(entries).map(([root, defaultAutoPull]) => [
          ProjectId.make(root),
          { defaultAutoPull },
        ]),
      ),
    });

    yield* ServerRuntimeStartup.autoPullProjects(
      [
        project("/clean"),
        project("/current"),
        project("/dirty"),
        project("/ahead"),
        project("/feature"),
        project("/disabled"),
      ],
      overrides({
        "/clean": true,
        "/current": true,
        "/dirty": true,
        "/ahead": true,
        "/feature": true,
        "/disabled": false,
      }),
    ).pipe(Effect.provideService(GitVcsDriver.GitVcsDriver, git));

    assert.deepStrictEqual(pulled, ["/clean"]);

    pulled.length = 0;
    yield* ServerRuntimeStartup.autoPullProjects(
      [project("/inherited"), project("/opted-out"), project("/dirty")],
      { ...overrides({ "/opted-out": false }), defaultAutoPull: true },
    ).pipe(Effect.provideService(GitVcsDriver.GitVcsDriver, git));
    assert.deepStrictEqual(pulled, ["/inherited"]);
  }),
);

it.effect("enqueueCommand waits for readiness and then drains queued work", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const executionCount = yield* Ref.make(0);
      const commandGate = yield* ServerRuntimeStartup.makeCommandGate;

      const queuedCommandFiber = yield* commandGate
        .enqueueCommand(Ref.updateAndGet(executionCount, (count) => count + 1))
        .pipe(Effect.forkScoped);

      yield* Effect.yieldNow;
      assert.equal(yield* Ref.get(executionCount), 0);

      yield* commandGate.signalCommandReady;

      const result = yield* Fiber.join(queuedCommandFiber);
      assert.equal(result, 1);
      assert.equal(yield* Ref.get(executionCount), 1);
    }),
  ),
);

it.effect("enqueueCommand fails queued work when readiness fails", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const commandGate = yield* ServerRuntimeStartup.makeCommandGate;
      const failure = yield* Deferred.make<void, never>();

      const queuedCommandFiber = yield* commandGate
        .enqueueCommand(Deferred.await(failure).pipe(Effect.as("should-not-run")))
        .pipe(Effect.forkScoped);

      yield* commandGate.failCommandReady(
        new ServerRuntimeStartup.ServerRuntimeStartupError({
          mode: "web",
          host: "127.0.0.1",
          port: 3773,
          cause: new Error("test startup failure"),
        }),
      );

      const error = yield* Effect.flip(Fiber.join(queuedCommandFiber));
      assert.equal(error.message, "Server runtime startup failed before command readiness.");
    }),
  ),
);

it.effect(
  "resolveWelcomeBase identifies the trading workspace instead of the launched code folder",
  () =>
    Effect.gen(function* () {
      const welcome = yield* ServerRuntimeStartup.resolveWelcomeBase.pipe(
        Effect.provideService(TradingWorkspaceHome, "/tmp/mock-automorphic-home"),
        Effect.provideService(ServerConfig.ServerConfig, {
          cwd: "/tmp/startup-project",
          stateDir: "/tmp/automorphic-startup-state",
        } as never),
        Effect.provide(NodeServices.layer),
      );

      assert.deepStrictEqual(welcome, {
        cwd: "/tmp/mock-automorphic-home/.automorphic/my-workspace",
        projectName: "My workspace",
      });
    }),
);

it.effect("resolveAutoBootstrapWelcomeTargets returns existing project and thread ids", () => {
  const bootstrapProjectId = ProjectId.make("project-startup-bootstrap");
  const bootstrapThreadId = ThreadId.make("thread-startup-bootstrap");

  return Effect.gen(function* () {
    const dispatchCalls = yield* Ref.make<ReadonlyArray<string>>([]);
    const targets = yield* ServerRuntimeStartup.resolveAutoBootstrapWelcomeTargets.pipe(
      Effect.provideService(TradingWorkspaceHome, "/tmp/mock-automorphic-home"),
      Effect.provideService(
        FileSystem.FileSystem,
        FileSystem.makeNoop({
          makeDirectory: () => Effect.void,
          writeFileString: () => Effect.void,
        }),
      ),
      Effect.provide(ServerSettings.layerTest()),
      Effect.provideService(ServerConfig.ServerConfig, {
        cwd: "/tmp/startup-project",
        stateDir: "/tmp/automorphic-startup-state",
        autoBootstrapProjectFromCwd: true,
      } as never),
      Effect.provideService(ProjectionSnapshotQuery.ProjectionSnapshotQuery, {
        getUserInputActivity: () => Effect.die("unused"),
        getCommandReadModel: () => Effect.die("unused"),
        getSnapshot: () => Effect.die("unused"),
        getShellSnapshot: () => Effect.die("unused"),
        getArchivedShellSnapshot: () => Effect.die("unused"),
        getSnapshotSequence: () => Effect.die("unused"),
        getCounts: () => Effect.die("unused"),
        getEventReplayStats: () => Effect.die("unused"),
        getActiveProjectByWorkspaceRoot: () =>
          Effect.succeed(
            Option.some({
              id: bootstrapProjectId,
              title: "Startup Project",
              workspaceRoot: "/tmp/startup-project",
              defaultModelSelection: {
                instanceId: ProviderInstanceId.make("codex"),
                model: DEFAULT_MODEL,
              },
              scripts: [],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              deletedAt: null,
            }),
          ),
        getProjectShellById: () => Effect.die("unused"),
        getFirstActiveThreadIdByProjectId: () => Effect.succeed(Option.some(bootstrapThreadId)),
        getImportedAgentSessionSources: () => Effect.die("unused"),
        getThreadCheckpointContext: () => Effect.succeed(Option.none()),
        getFullThreadDiffContext: () => Effect.succeed(Option.none()),
        getThreadRuntimeContext: () => Effect.die("unused"),
        getTurnStartMessage: () => Effect.die("unused"),
        getThreadShellById: () => Effect.succeed(Option.none()),
        getThreadDetailById: () => Effect.die("unused"),
        getThreadDetailSnapshot: () => Effect.die("unused"),
        searchThreads: () => Effect.succeed({ matches: [] }),
      }),
      Effect.provideService(OrchestrationEngine.OrchestrationEngineService, {
        readEvents: () => Stream.empty,
        readThreadEvents: () => Stream.empty,
        getThreadReplayStats: () => Effect.die("unused thread replay stats"),
        dispatch: (command) =>
          Ref.update(dispatchCalls, (calls) => [...calls, command.type]).pipe(
            Effect.as({ sequence: 1 }),
          ),
        streamDomainEvents: Stream.empty,
        subscribeDomainEvents: Effect.succeed(Stream.empty),
        latestSequence: Effect.succeed(0),
      } satisfies OrchestrationEngine.OrchestrationEngineService["Service"]),
      Effect.provide(NodeServices.layer),
    );

    assert.deepStrictEqual(targets, {
      bootstrapProjectId,
      bootstrapThreadId,
      bootstrapProjectCreated: false,
      bootstrapThreadCreated: false,
    });
    assert.deepStrictEqual(yield* Ref.get(dispatchCalls), []);
  });
});

it.effect.each([
  {
    mode: "web",
    autoBootstrapProjectFromCwd: false,
    legacy: false,
    conflict: false,
    oldHome: false,
  },
  {
    mode: "web",
    autoBootstrapProjectFromCwd: true,
    legacy: false,
    conflict: false,
    oldHome: false,
  },
  {
    mode: "desktop",
    autoBootstrapProjectFromCwd: false,
    legacy: false,
    conflict: false,
    oldHome: false,
  },
  {
    mode: "web",
    autoBootstrapProjectFromCwd: false,
    legacy: true,
    conflict: false,
    oldHome: false,
  },
  { mode: "web", autoBootstrapProjectFromCwd: false, legacy: true, conflict: true, oldHome: false },
  { mode: "web", autoBootstrapProjectFromCwd: false, legacy: true, conflict: false, oldHome: true },
  {
    mode: "web",
    autoBootstrapProjectFromCwd: false,
    legacy: false,
    conflict: false,
    oldHome: true,
  },
] as const)("trading workspace persists independently of launch directory: %j", (options) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const stateDir = yield* fs.makeTempDirectoryScoped({ prefix: "automorphic-workspace-" });
      const workspaceRoot = `${stateDir}/.automorphic/my-workspace`;
      const projects = new Map<string, OrchestrationProject>();
      const threads = new Map<ProjectId, ThreadId>();
      const commands: string[] = [];
      const legacyRoot = options.oldHome
        ? `${stateDir}/Automorphic/Workspaces/My workspace`
        : `${stateDir}/workspaces/trading`;
      const threadTitles = new Map<ThreadId, string>();
      if (options.legacy || options.oldHome) {
        yield* fs.makeDirectory(legacyRoot, { recursive: true });
        yield* fs.writeFileString(`${legacyRoot}/strategy.md`, "Preserve my research");
      }
      if (options.legacy) {
        const id = ProjectId.make("legacy-trading-project");
        projects.set(legacyRoot, {
          id,
          title: "My Trading Workspace",
          workspaceRoot: legacyRoot,
          defaultModelSelection: null,
          scripts: [],
          createdAt: "2026-09-11T00:00:00.000Z",
          updatedAt: "2026-09-11T00:00:00.000Z",
          deletedAt: null,
        });
        threads.set(id, ThreadId.make("legacy-trading-thread"));
        threadTitles.set(ThreadId.make("legacy-trading-thread"), "Market research");
      }
      const bootstrap = (cwd: string) =>
        ServerRuntimeStartup.resolveAutoBootstrapWelcomeTargets.pipe(
          Effect.provideService(TradingWorkspaceHome, stateDir),
          Effect.provide(ServerSettings.layerTest()),
          Effect.provideService(ServerConfig.ServerConfig, { stateDir, cwd, ...options } as never),
          Effect.provideService(ProjectionSnapshotQuery.ProjectionSnapshotQuery, {
            getActiveProjectByWorkspaceRoot: (root: string) =>
              Effect.sync(() => Option.fromUndefinedOr(projects.get(root))),
            getFirstActiveThreadIdByProjectId: (id: ProjectId) =>
              Effect.sync(() => Option.fromUndefinedOr(threads.get(id))),
            getThreadShellById: (id: ThreadId) =>
              Effect.sync(() => Option.some({ id, title: threadTitles.get(id) })),
          } as unknown as ProjectionSnapshotQuery.ProjectionSnapshotQuery["Service"]),
          Effect.provideService(OrchestrationEngine.OrchestrationEngineService, {
            dispatch: (
              command: Parameters<
                OrchestrationEngine.OrchestrationEngineService["Service"]["dispatch"]
              >[0],
            ) =>
              Effect.sync(() => {
                commands.push(command.type);
                if (command.type === "project.create") {
                  assert.equal(command.title, "My workspace");
                  assert.equal(command.workspaceRoot, workspaceRoot);
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
                } else if (command.type === "project.meta.update") {
                  const legacy = projects.get(legacyRoot)!;
                  assert.equal(command.projectId, legacy.id);
                  assert.equal(command.workspaceRoot, workspaceRoot);
                  projects.delete(legacyRoot);
                  projects.set(workspaceRoot, {
                    ...legacy,
                    workspaceRoot,
                    title: command.title ?? legacy.title,
                  });
                } else if (command.type === "thread.create") {
                  assert.equal(command.title, "New thread");
                  threads.set(command.projectId, command.threadId);
                  threadTitles.set(command.threadId, command.title);
                } else if (command.type === "thread.meta.update") {
                  assert.equal(command.title, "New thread");
                  assert.equal(command.threadId, "legacy-trading-thread");
                  threadTitles.set(command.threadId, command.title!);
                }
                return { sequence: commands.length };
              }),
          } as unknown as OrchestrationEngine.OrchestrationEngineService["Service"]),
        );

      if (options.conflict) {
        yield* fs.makeDirectory(workspaceRoot, { recursive: true });
        yield* fs.writeFileString(`${workspaceRoot}/existing.md`, "Keep existing files");
        yield* Effect.flip(bootstrap("/source/apps/server"));
        assert.equal(yield* fs.readFileString(`${legacyRoot}/strategy.md`), "Preserve my research");
        assert.equal(
          yield* fs.readFileString(`${workspaceRoot}/existing.md`),
          "Keep existing files",
        );
        assert.deepStrictEqual(commands, []);
        return;
      }
      const first = yield* bootstrap("/source/apps/server");
      assert.equal(yield* fs.exists(workspaceRoot), true);
      assert.include(
        yield* fs.readFileString(`${workspaceRoot}/AGENTS.md`),
        "Automorphic trading workspace",
      );
      assert.include(yield* fs.readFileString(`${workspaceRoot}/CLAUDE.md`), "@AGENTS.md");
      yield* fs.writeFileString(`${workspaceRoot}/AGENTS.md`, "Personal trading rules");
      assert.equal(first.bootstrapProjectCreated, !options.legacy);
      assert.equal(first.bootstrapThreadCreated, !options.legacy);
      if (options.legacy) {
        assert.equal(first.bootstrapProjectId, "legacy-trading-project");
        assert.equal(first.bootstrapThreadId, "legacy-trading-thread");
      }
      if (options.legacy || options.oldHome) {
        assert.equal(
          yield* fs.readFileString(`${workspaceRoot}/strategy.md`),
          "Preserve my research",
        );
        assert.equal(yield* fs.exists(legacyRoot), false);
      }
      assert.equal(projects.get(workspaceRoot)?.title, "My workspace");
      assert.equal(threadTitles.get(first.bootstrapThreadId!), "New thread");
      const project = projects.get(workspaceRoot)!;
      projects.set(workspaceRoot, { ...project, title: "My renamed workspace" });
      const restarted = yield* bootstrap("/another/launch/directory");
      assert.deepStrictEqual(restarted, {
        ...first,
        bootstrapProjectCreated: false,
        bootstrapThreadCreated: false,
      });
      assert.equal(projects.get(workspaceRoot)?.title, "My renamed workspace");
      assert.equal(
        yield* fs.readFileString(`${workspaceRoot}/AGENTS.md`),
        "Personal trading rules",
      );
      assert.deepStrictEqual(
        commands,
        options.legacy
          ? ["project.meta.update", "thread.meta.update"]
          : ["project.create", "thread.create"],
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  ),
);

it.effect.each([
  { existing: false, machineModel: null, projectModel: null },
  { existing: false, machineModel: "claude-sonnet-4-6", projectModel: null },
  { existing: true, machineModel: "claude-sonnet-4-6", projectModel: null },
  { existing: true, machineModel: "claude-sonnet-4-6", projectModel: "gpt-5.4" },
])("auto-bootstrap model precedence: %j", ({ existing, machineModel, projectModel }) =>
  Effect.gen(function* () {
    const machineSelection = machineModel
      ? { instanceId: ProviderInstanceId.make("claude-code"), model: machineModel }
      : null;
    const projectSelection = projectModel
      ? { instanceId: ProviderInstanceId.make("codex"), model: projectModel }
      : null;
    const dispatchCalls = yield* Ref.make<
      ReadonlyArray<{
        readonly type: string;
        readonly defaultModelSelection?: unknown;
        readonly modelSelection?: unknown;
      }>
    >([]);
    const targets = yield* ServerRuntimeStartup.resolveAutoBootstrapWelcomeTargets.pipe(
      Effect.provideService(TradingWorkspaceHome, "/tmp/mock-automorphic-home"),
      Effect.provideService(
        FileSystem.FileSystem,
        FileSystem.makeNoop({
          makeDirectory: () => Effect.void,
          writeFileString: () => Effect.void,
        }),
      ),
      Effect.provide(
        ServerSettings.layerTest({
          defaultModelSelection: machineSelection,
          projectSettingsOverrides:
            existing && projectSelection
              ? {
                  [ProjectId.make("existing-project")]: { defaultModelSelection: projectSelection },
                }
              : {},
        }),
      ),
      Effect.provideService(ServerConfig.ServerConfig, {
        cwd: "/tmp/startup-project",
        stateDir: "/tmp/automorphic-startup-state",
        autoBootstrapProjectFromCwd: true,
      } as never),
      Effect.provideService(ProjectionSnapshotQuery.ProjectionSnapshotQuery, {
        getUserInputActivity: () => Effect.die("unused"),
        getCommandReadModel: () => Effect.die("unused"),
        getSnapshot: () => Effect.die("unused"),
        getShellSnapshot: () => Effect.die("unused"),
        getArchivedShellSnapshot: () => Effect.die("unused"),
        getSnapshotSequence: () => Effect.die("unused"),
        getCounts: () => Effect.die("unused"),
        getEventReplayStats: () => Effect.die("unused"),
        getActiveProjectByWorkspaceRoot: () =>
          Effect.succeed(
            existing
              ? Option.some({
                  id: ProjectId.make("existing-project"),
                  title: "Startup Project",
                  workspaceRoot: "/tmp/startup-project",
                  defaultModelSelection: null,
                  scripts: [],
                  createdAt: "2026-01-01T00:00:00.000Z",
                  updatedAt: "2026-01-01T00:00:00.000Z",
                  deletedAt: null,
                })
              : Option.none(),
          ),
        getProjectShellById: () => Effect.die("unused"),
        getFirstActiveThreadIdByProjectId: () => Effect.succeed(Option.none()),
        getImportedAgentSessionSources: () => Effect.die("unused"),
        getThreadCheckpointContext: () => Effect.succeed(Option.none()),
        getFullThreadDiffContext: () => Effect.succeed(Option.none()),
        getThreadRuntimeContext: () => Effect.die("unused"),
        getTurnStartMessage: () => Effect.die("unused"),
        getThreadShellById: () => Effect.succeed(Option.none()),
        getThreadDetailById: () => Effect.die("unused"),
        getThreadDetailSnapshot: () => Effect.die("unused"),
        searchThreads: () => Effect.succeed({ matches: [] }),
      }),
      Effect.provideService(OrchestrationEngine.OrchestrationEngineService, {
        readEvents: () => Stream.empty,
        readThreadEvents: () => Stream.empty,
        getThreadReplayStats: () => Effect.die("unused thread replay stats"),
        dispatch: (command) =>
          Ref.update(dispatchCalls, (calls) => [...calls, command]).pipe(
            Effect.as({ sequence: 1 }),
          ),
        streamDomainEvents: Stream.empty,
        subscribeDomainEvents: Effect.succeed(Stream.empty),
        latestSequence: Effect.succeed(0),
      } satisfies OrchestrationEngine.OrchestrationEngineService["Service"]),
      Effect.provide(NodeServices.layer),
    );

    assert.equal(typeof targets.bootstrapProjectId, "string");
    assert.equal(typeof targets.bootstrapThreadId, "string");
    assert.equal(targets.bootstrapProjectCreated, !existing);
    assert.equal(targets.bootstrapThreadCreated, true);
    const commands = yield* Ref.get(dispatchCalls);
    assert.deepStrictEqual(
      commands.map((command) => command.type),
      existing ? ["thread.create"] : ["project.create", "thread.create"],
    );
    if (!existing) assert.equal("defaultModelSelection" in commands[0]!, false);
    assert.deepStrictEqual(
      commands.at(-1)?.modelSelection,
      projectSelection ??
        machineSelection ?? {
          instanceId: ProviderInstanceId.make("codex"),
          model: DEFAULT_MODEL,
        },
    );
  }),
);

it.effect(
  "resolveAutoBootstrapWelcomeTargets preserves a project created before thread failure",
  () =>
    Effect.gen(function* () {
      const dispatchCalls = yield* Ref.make<ReadonlyArray<string>>([]);
      const targets = yield* ServerRuntimeStartup.resolveAutoBootstrapWelcomeTargets.pipe(
        Effect.provideService(TradingWorkspaceHome, "/tmp/mock-automorphic-home"),
        Effect.provideService(
          FileSystem.FileSystem,
          FileSystem.makeNoop({
            makeDirectory: () => Effect.void,
            writeFileString: () => Effect.void,
          }),
        ),
        Effect.provide(ServerSettings.layerTest()),
        Effect.provideService(ServerConfig.ServerConfig, {
          cwd: "/tmp/startup-project",
          stateDir: "/tmp/automorphic-startup-state",
          autoBootstrapProjectFromCwd: true,
        } as never),
        Effect.provideService(ProjectionSnapshotQuery.ProjectionSnapshotQuery, {
          getUserInputActivity: () => Effect.die("unused"),
          getCommandReadModel: () => Effect.die("unused"),
          getSnapshot: () => Effect.die("unused"),
          getShellSnapshot: () => Effect.die("unused"),
          getArchivedShellSnapshot: () => Effect.die("unused"),
          getSnapshotSequence: () => Effect.die("unused"),
          getCounts: () => Effect.die("unused"),
          getEventReplayStats: () => Effect.die("unused"),
          getActiveProjectByWorkspaceRoot: () => Effect.succeed(Option.none()),
          getProjectShellById: () => Effect.die("unused"),
          getFirstActiveThreadIdByProjectId: () => Effect.die("thread lookup failed"),
          getImportedAgentSessionSources: () => Effect.die("unused"),
          getThreadCheckpointContext: () => Effect.succeed(Option.none()),
          getFullThreadDiffContext: () => Effect.succeed(Option.none()),
          getThreadRuntimeContext: () => Effect.die("unused"),
          getTurnStartMessage: () => Effect.die("unused"),
          getThreadShellById: () => Effect.succeed(Option.none()),
          getThreadDetailById: () => Effect.die("unused"),
          getThreadDetailSnapshot: () => Effect.die("unused"),
          searchThreads: () => Effect.succeed({ matches: [] }),
        }),
        Effect.provideService(OrchestrationEngine.OrchestrationEngineService, {
          readEvents: () => Stream.empty,
          readThreadEvents: () => Stream.empty,
          getThreadReplayStats: () => Effect.die("unused thread replay stats"),
          dispatch: (command) =>
            Ref.update(dispatchCalls, (calls) => [...calls, command.type]).pipe(
              Effect.as({ sequence: 1 }),
            ),
          streamDomainEvents: Stream.empty,
          subscribeDomainEvents: Effect.succeed(Stream.empty),
          latestSequence: Effect.succeed(0),
        } satisfies OrchestrationEngine.OrchestrationEngineService["Service"]),
        Effect.provide(NodeServices.layer),
      );

      assert.equal(typeof targets.bootstrapProjectId, "string");
      assert.equal(targets.bootstrapProjectCreated, true);
      assert.equal(targets.bootstrapThreadId, undefined);
      assert.equal(targets.bootstrapThreadCreated, undefined);
      assert.deepStrictEqual(yield* Ref.get(dispatchCalls), ["project.create"]);
    }),
);

it.effect("resolveAutoBootstrapWelcomeTargets preserves typed UUID generation failures", () =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const uuidError = PlatformError.systemError({
      _tag: "Unknown",
      module: "Crypto",
      method: "randomUUIDv4",
      description: "UUID generation unavailable",
    });
    const dispatchCalls = yield* Ref.make<ReadonlyArray<string>>([]);

    const error = yield* ServerRuntimeStartup.resolveAutoBootstrapWelcomeTargets.pipe(
      Effect.provideService(TradingWorkspaceHome, "/tmp/mock-automorphic-home"),
      Effect.provideService(
        FileSystem.FileSystem,
        FileSystem.makeNoop({
          makeDirectory: () => Effect.void,
          writeFileString: () => Effect.void,
        }),
      ),
      Effect.provide(ServerSettings.layerTest()),
      Effect.provideService(ServerConfig.ServerConfig, {
        cwd: "/tmp/startup-project",
        stateDir: "/tmp/automorphic-startup-state",
        autoBootstrapProjectFromCwd: true,
      } as never),
      Effect.provideService(ProjectionSnapshotQuery.ProjectionSnapshotQuery, {
        getUserInputActivity: () => Effect.die("unused"),
        getCommandReadModel: () => Effect.die("unused"),
        getSnapshot: () => Effect.die("unused"),
        getShellSnapshot: () => Effect.die("unused"),
        getArchivedShellSnapshot: () => Effect.die("unused"),
        getSnapshotSequence: () => Effect.die("unused"),
        getCounts: () => Effect.die("unused"),
        getEventReplayStats: () => Effect.die("unused"),
        getActiveProjectByWorkspaceRoot: () => Effect.succeed(Option.none()),
        getProjectShellById: () => Effect.die("unused"),
        getFirstActiveThreadIdByProjectId: () => Effect.succeed(Option.none()),
        getImportedAgentSessionSources: () => Effect.die("unused"),
        getThreadCheckpointContext: () => Effect.succeed(Option.none()),
        getFullThreadDiffContext: () => Effect.succeed(Option.none()),
        getThreadRuntimeContext: () => Effect.die("unused"),
        getTurnStartMessage: () => Effect.die("unused"),
        getThreadShellById: () => Effect.succeed(Option.none()),
        getThreadDetailById: () => Effect.die("unused"),
        getThreadDetailSnapshot: () => Effect.die("unused"),
        searchThreads: () => Effect.succeed({ matches: [] }),
      }),
      Effect.provideService(OrchestrationEngine.OrchestrationEngineService, {
        readEvents: () => Stream.empty,
        readThreadEvents: () => Stream.empty,
        getThreadReplayStats: () => Effect.die("unused thread replay stats"),
        dispatch: (command) =>
          Ref.update(dispatchCalls, (calls) => [...calls, command.type]).pipe(
            Effect.as({ sequence: 1 }),
          ),
        streamDomainEvents: Stream.empty,
        subscribeDomainEvents: Effect.succeed(Stream.empty),
        latestSequence: Effect.succeed(0),
      } satisfies OrchestrationEngine.OrchestrationEngineService["Service"]),
      Effect.provideService(Crypto.Crypto, {
        ...crypto,
        randomUUIDv4: Effect.fail(uuidError),
      }),
      Effect.flip,
    );

    assert.strictEqual(error, uuidError);
    assert.deepStrictEqual(yield* Ref.get(dispatchCalls), []);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("completeAutoBootstrapWelcome settles failures without bootstrap targets", () =>
  Effect.gen(function* () {
    const completion = yield* ServerRuntimeStartup.completeAutoBootstrapWelcome(
      Effect.fail("bootstrap failed"),
    );

    assert.deepStrictEqual(completion, { bootstrapStatus: "complete" });
  }),
);

it.effect("completeAutoBootstrapWelcome settles unexpected defects", () =>
  Effect.gen(function* () {
    const completion = yield* ServerRuntimeStartup.completeAutoBootstrapWelcome(
      Effect.die("bootstrap defect"),
    );

    assert.deepStrictEqual(completion, { bootstrapStatus: "complete" });
  }),
);

it.effect("completeAutoBootstrapWelcome settles an empty bootstrap result", () =>
  Effect.gen(function* () {
    const completion = yield* ServerRuntimeStartup.completeAutoBootstrapWelcome(Effect.succeed({}));

    assert.deepStrictEqual(completion, { bootstrapStatus: "complete" });
  }),
);
