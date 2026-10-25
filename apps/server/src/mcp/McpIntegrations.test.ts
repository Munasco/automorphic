import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { readMcpIntegrations, writeMcpIntegrations } from "./McpIntegrations.ts";
import * as ServerConfig from "../config.ts";
const testLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "automorphic-plugin-store-test-",
}).pipe(Layer.provideMerge(NodeServices.layer));
it.effect("persists custom plugins and rejects stale concurrent updates", () =>
  Effect.gen(function* () {
    const initial = yield* readMcpIntegrations;
    expect(initial.plugins).toEqual([]);
    const next = {
      ...initial,
      plugins: [
        {
          id: "research",
          name: "Research",
          description: "",
          projectId: null,
          enabled: true,
          servers: {
            data: {
              type: "http" as const,
              url: "https://example.com/mcp",
              bearerTokenEnv: "RESEARCH_TOKEN",
            },
          },
        },
      ],
    };
    const saved = yield* writeMcpIntegrations(next);
    expect(saved.revision).toBe(1);
    expect((yield* readMcpIntegrations).plugins).toEqual(next.plugins);
    const stale = yield* writeMcpIntegrations(next).pipe(Effect.result);
    expect(stale._tag).toBe("Failure");
    expect((yield* readMcpIntegrations).revision).toBe(1);
  }).pipe(Effect.provide(testLayer)),
);
