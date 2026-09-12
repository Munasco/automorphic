import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  OrchestrationThreadShell,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { McpSchema, McpServer } from "effect/unstable/ai";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { TradingWorkspace } from "../trading/TradingWorkspace.ts";
import * as ServerConfig from "../config.ts";
import { McpInvocationContext } from "./McpInvocationContext.ts";
import { TradingToolkitRegistrationLive } from "./toolkits/trading/index.ts";
import { ResearchToolkitRegistrationLive } from "./toolkits/trading/research.ts";
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  clientCapabilities: {},
  clientInfo: { name: "test", version: "1" },
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  },
  getClient: Effect.die("unused"),
});
const scope = {
  environmentId: EnvironmentId.make("env"),
  threadId: ThreadId.make("thread"),
  providerSessionId: "session",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set<"trading">(),
  issuedAt: 1,
};
const encodeTestJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const decodeChartSpec = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({ bars: Schema.Unknown, annotations: Schema.Unknown, evidence: Schema.Unknown }),
  ),
);
const decodeChartReport = Schema.decodeUnknownEffect(
  Schema.Struct({ path: Schema.String, specPath: Schema.String, barCount: Schema.Finite }),
);
const testLayer = Layer.mergeAll(
  TradingToolkitRegistrationLive,
  ResearchToolkitRegistrationLive,
).pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provide(
    Layer.mock(ProjectionSnapshotQuery)({
      getThreadShellById: () => Effect.succeed(Option.none()),
    }),
  ),
  Layer.provide(Layer.mock(TradingWorkspace)({})),
  Layer.provideMerge(
    ServerConfig.layerTest(process.cwd(), { prefix: "automorphic-mcp-trading-test-" }),
  ),
  Layer.provideMerge(NodeServices.layer),
);
it.effect(
  "registers built-in trading/research tools and refuses unscoped calls before accessing data",
  () =>
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const names = server.tools.map(({ tool }) => tool.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "trading_get_bars",
          "trading_get_year",
          "trading_search_contracts",
          "trading_export_dataset",
          "trading_run_backtest",
          "trading_save_journal",
          "trading_create_chart",
        ]),
      );
      for (const [name, args] of [
        ["trading_list_products", {}],
        ["trading_read_journal", {}],
        [
          "trading_create_chart",
          {
            datasetId: "00000000-0000-4000-8000-000000000000",
            title: "Chart",
            summary: "",
            annotations: [],
            levels: [],
          },
        ],
      ] as const) {
        const result = yield* server
          .callTool({ name, arguments: args })
          .pipe(
            Effect.provideService(McpInvocationContext, scope),
            Effect.provideService(McpSchema.McpServerClient, client),
          );
        expect(result.isError).toBe(true);
      }
    }).pipe(Effect.provide(testLayer)),
);

it.effect(
  "creates a reproducible chart from scoped saved candles and rejects a foreign dataset",
  () =>
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const config = yield* ServerConfig.ServerConfig;
      const datasetId = "00000000-0000-4000-8000-000000000001";
      const directory = path.join(config.stateDir, "trading-research", "project-a", "datasets");
      const bars = [100, 200, 300].map((time) => ({
        time,
        open: 10,
        high: 13,
        low: 9,
        close: 12,
        volume: 50,
      }));
      yield* fs.makeDirectory(directory, { recursive: true });
      yield* fs.writeFileString(
        path.join(directory, `${datasetId}.json`),
        yield* encodeTestJson({
          request: {
            symbol: "NQU6",
            interval: 5,
            unit: "minute",
            start: "1970-01-01T00:00:00Z",
            end: "1970-01-02T00:00:00Z",
          },
          bars,
          nextCursor: null,
          source: "Test fixture",
          updatedAt: 100000,
        }),
      );
      const args = {
        datasetId,
        offset: 1,
        limit: 2,
        title: "Setup review",
        summary: "Fixture only",
        annotations: [{ time: 200, price: 9, label: "Support", detail: "Observed low" }],
        levels: [{ price: 8, label: "Invalidation" }],
      };
      const call = (arguments_: Record<string, unknown>, threadId = scope.threadId) =>
        server.callTool({ name: "trading_create_chart", arguments: arguments_ }).pipe(
          Effect.provideService(McpInvocationContext, {
            ...scope,
            threadId,
            capabilities: new Set(["trading"] as const),
          }),
          Effect.provideService(McpSchema.McpServerClient, client),
        );
      const result = yield* call(args);
      expect(result.isError).not.toBe(true);
      const report = yield* decodeChartReport(result.structuredContent);
      expect(report.barCount).toBe(2);
      expect(yield* fs.readFileString(report.path)).toContain("Setup review");
      const saved = yield* decodeChartSpec(yield* fs.readFileString(report.specPath));
      expect(saved.bars).toEqual(bars.slice(1));
      expect(saved.annotations).toEqual(args.annotations);
      expect(saved.evidence).toMatchObject({
        datasetId,
        symbol: "NQU6",
        source: "Test fixture",
        totalBars: 3,
        offset: 1,
      });
      expect((yield* call(args, ThreadId.make("other-thread"))).isError).toBe(true);
      expect((yield* call({ ...args, offset: 20 })).isError).toBe(true);
      expect((yield* call({ ...args, datasetId: "../../project-a/datasets/secret" })).isError).toBe(
        true,
      );
    }).pipe(Effect.provide(scopedLayer)),
);
it.effect("rejects a trading credential whose thread no longer exists", () =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const result = yield* server.callTool({ name: "trading_get_workspace", arguments: {} }).pipe(
      Effect.provideService(McpInvocationContext, {
        ...scope,
        capabilities: new Set(["trading"] as const),
      }),
      Effect.provideService(McpSchema.McpServerClient, client),
    );
    expect(result.isError).toBe(true);
  }).pipe(Effect.provide(testLayer)),
);

const decodeSavedEntry = Schema.decodeUnknownSync(Schema.Struct({ entryId: Schema.String }));
const decodeThread = Schema.decodeUnknownSync(OrchestrationThreadShell);
const scopedLayer = ResearchToolkitRegistrationLive.pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provide(
    Layer.mock(ProjectionSnapshotQuery)({
      getThreadShellById: (id) =>
        Effect.succeedSome(
          decodeThread({
            id,
            projectId: id === "thread" ? "project-a" : "project-b",
            title: "Research",
            modelSelection: { instanceId: "codex", model: "gpt-5.6-sol" },
            runtimeMode: "full-access",
            branch: null,
            worktreePath: null,
            latestTurn: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            session: null,
            latestUserMessageAt: null,
            hasPendingApprovals: false,
            hasPendingUserInput: false,
            hasActionableProposedPlan: false,
          }),
        ),
    }),
  ),
  Layer.provideMerge(
    ServerConfig.layerTest(process.cwd(), { prefix: "automorphic-research-isolation-test-" }),
  ),
  Layer.provideMerge(NodeServices.layer),
);
it.effect("persists a journal through MCP and prevents another workspace reading its ID", () =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const call = (name: string, args: Record<string, unknown>, threadId = scope.threadId) =>
      server.callTool({ name, arguments: args }).pipe(
        Effect.provideService(McpInvocationContext, {
          ...scope,
          threadId,
          capabilities: new Set(["trading"] as const),
        }),
        Effect.provideService(McpSchema.McpServerClient, client),
      );
    const saved = yield* call("trading_save_journal", {
      title: "Trade review",
      markdown: "Followed the entry plan.",
    });
    expect(saved.isError).not.toBe(true);
    const { entryId } = decodeSavedEntry(saved.structuredContent);
    const listed = yield* call("trading_read_journal", { entryId });
    expect(listed.isError).not.toBe(true);
    expect(
      listed.content.some((item) => item.type === "text" && item.text.includes("Trade review")),
    ).toBe(true);
    const other = yield* call("trading_read_journal", { entryId }, ThreadId.make("other-thread"));
    expect(other.isError).toBe(true);
    expect(
      other.content.some((item) => item.type === "text" && item.text.includes("Trade review")),
    ).toBe(false);
  }).pipe(Effect.provide(scopedLayer)),
);
