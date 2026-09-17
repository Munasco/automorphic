import { describe, expect, it } from "vite-plus/test";
import { effectiveMcpServers, validateMcpPlugins, type McpPlugin } from "@t3tools/contracts";
import { claudeMcpConfiguration, codexMcpArguments } from "./customProviderConfig.ts";
const plugin: McpPlugin = {
  id: "research",
  name: "Research",
  description: "",
  enabled: true,
  projectId: null,
  servers: {
    data: { type: "http", url: "https://example.com/mcp", bearerTokenEnv: "RESEARCH_TOKEN" },
  },
};
describe("custom MCP provider configuration", () => {
  it("inherits defaults in every workspace and isolates project-only plugins", () => {
    const local = { ...plugin, id: "project", projectId: "workspace-a" };
    expect(Object.keys(effectiveMcpServers([plugin, local], "workspace-b"))).toEqual([
      "research--data",
    ]);
    expect(Object.keys(effectiveMcpServers([plugin, local], "workspace-a"))).toHaveLength(2);
    expect(
      Object.keys(effectiveMcpServers([{ ...plugin, enabled: false }], "workspace-a")),
    ).toHaveLength(0);
  });
  it("injects the same HTTP connection using each provider's native format", () => {
    const servers = effectiveMcpServers([plugin], "a");
    expect(codexMcpArguments(servers)).toContain(
      'mcp_servers."research--data".bearer_token_env_var="RESEARCH_TOKEN"',
    );
    expect(JSON.stringify(codexMcpArguments(servers))).not.toContain("secret-value");
    expect(
      claudeMcpConfiguration(servers, { RESEARCH_TOKEN: "secret-value" })["research--data"],
    ).toEqual({
      type: "http",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer secret-value" },
    });
    expect(() => claudeMcpConfiguration(servers, {})).toThrow("RESEARCH_TOKEN");
  });
  it("passes executable arguments without a shell and resolves only named environment variables", () => {
    const servers = {
      local: {
        type: "stdio" as const,
        command: "node",
        args: ["a script.js", "$(touch /tmp/not-run)"],
        envVars: ["DATA_KEY"],
      },
    };
    expect(claudeMcpConfiguration(servers, { DATA_KEY: "x", UNRELATED: "y" }).local).toMatchObject({
      command: "node",
      args: servers.local.args,
      env: { DATA_KEY: "x" },
    });
    expect(codexMcpArguments(servers)).toContain(
      'mcp_servers."local".args=["a script.js","$(touch /tmp/not-run)"]',
    );
  });
  it("rejects reserved names, duplicate plugins and credential URLs", () => {
    expect(() => validateMcpPlugins([plugin, plugin])).toThrow();
    expect(() =>
      validateMcpPlugins([{ ...plugin, servers: { "t3-code": plugin.servers.data! } }]),
    ).toThrow();
    expect(() =>
      validateMcpPlugins([
        {
          ...plugin,
          servers: { data: { type: "http", url: "https://example.com/mcp?token=secret" } },
        },
      ]),
    ).toThrow();
  });
});
