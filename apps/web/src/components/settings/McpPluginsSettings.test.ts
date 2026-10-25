import { expect, it } from "vite-plus/test";
import { exportMcpConfigurations, type McpPlugin } from "@t3tools/contracts";
import { parsePluginImport } from "./McpPluginsSettings";
it("imports a native Claude HTTP config without copying secrets into storage", () => {
  const plugin = parsePluginImport(
    JSON.stringify({
      mcpServers: {
        research: {
          type: "http",
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer ${RESEARCH_TOKEN}", "X-Api-Key": "${RESEARCH_KEY}" },
        },
      },
    }),
    "My research",
  );
  expect(plugin.servers.research).toEqual({
    type: "http",
    url: "https://example.com/mcp",
    bearerTokenEnv: "RESEARCH_TOKEN",
    headerEnv: { "X-Api-Key": "RESEARCH_KEY" },
  });
});
it("rejects raw HTTP credentials and imports stdio environment references", () => {
  expect(() =>
    parsePluginImport(
      JSON.stringify({
        mcpServers: {
          data: { url: "https://example.com/mcp", headers: { Authorization: "Bearer secret" } },
        },
      }),
      "Data",
    ),
  ).toThrow("environment references");
  const plugin = parsePluginImport(
    JSON.stringify({
      mcpServers: {
        data: {
          command: "node",
          args: ["data.js"],
          env: { DATA_KEY: "${DATA_KEY}", MODE: "read" },
        },
      },
    }),
    "Data",
  );
  expect(plugin.servers.data).toMatchObject({ envVars: ["DATA_KEY"], env: { MODE: "read" } });
});
it("exports portable Claude and Codex formats without including disabled plugins", () => {
  const plugin: McpPlugin = {
    id: "custom",
    name: "Custom",
    description: "",
    projectId: null,
    enabled: true,
    servers: {
      data: { type: "http", url: "https://example.com/mcp", bearerTokenEnv: "DATA_TOKEN" },
    },
  };
  const result = exportMcpConfigurations([plugin, { ...plugin, id: "disabled", enabled: false }]);
  expect(JSON.parse(result.claude).mcpServers["custom--data"].headers.Authorization).toBe(
    "Bearer ${DATA_TOKEN}",
  );
  expect(result.codex).toContain('[mcp_servers."custom--data"]');
  expect(result.codex).toContain('bearer_token_env_var = "DATA_TOKEN"');
  expect(result.codex).not.toContain("disabled");
});
