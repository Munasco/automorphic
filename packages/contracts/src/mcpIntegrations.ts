import * as Schema from "effect/Schema";

const ServerName = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,47}$/));
const StringMap = Schema.Record(Schema.String, Schema.String);
/** Secrets are references to server environment variables, never values exported to workspaces. */
export const CustomMcpServer = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("http"),
    url: Schema.String,
    bearerTokenEnv: Schema.optionalKey(Schema.String),
    headerEnv: Schema.optionalKey(StringMap),
  }),
  Schema.Struct({
    type: Schema.Literal("stdio"),
    command: Schema.String,
    args: Schema.Array(Schema.String),
    env: Schema.optionalKey(StringMap),
    envVars: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
]);
export type CustomMcpServer = typeof CustomMcpServer.Type;
export const McpPlugin = Schema.Struct({
  id: ServerName,
  name: Schema.String,
  description: Schema.String,
  enabled: Schema.Boolean,
  projectId: Schema.NullOr(Schema.String),
  servers: Schema.Record(ServerName, CustomMcpServer),
});
export type McpPlugin = typeof McpPlugin.Type;
export const McpIntegrationDocument = Schema.Struct({
  version: Schema.Literal(1),
  revision: Schema.Int,
  plugins: Schema.Array(McpPlugin),
});
export type McpIntegrationDocument = typeof McpIntegrationDocument.Type;

export function validateMcpPlugins(plugins: readonly McpPlugin[]) {
  if (plugins.length > 50) throw new Error("At most 50 plugins can be configured.");
  const ids = new Set<string>();
  for (const plugin of plugins) {
    if (ids.has(plugin.id)) throw new Error("Plugin IDs must be unique.");
    ids.add(plugin.id);
    if (!plugin.name.trim() || plugin.name.length > 100 || plugin.description.length > 1000)
      throw new Error("Enter a short plugin name and description.");
    const servers = Object.entries(plugin.servers);
    if (!servers.length || servers.length > 10)
      throw new Error("A plugin must contain between 1 and 10 MCP servers.");
    for (const [name, server] of servers) {
      if (name === "t3-code" || name === "automorphic")
        throw new Error("This server name is reserved for built-in tools.");
      if (server.type === "http") {
        const url = new URL(server.url);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw new Error(
            "Use an HTTP(S) endpoint without credentials, query parameters or fragments. Supply authentication through environment variables.",
          );
        for (const variable of [server.bearerTokenEnv, ...Object.values(server.headerEnv ?? {})]) {
          if (variable !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable))
            throw new Error("Use a valid server environment variable name for authentication.");
        }
        for (const header of Object.keys(server.headerEnv ?? {}))
          if (!/^[A-Za-z0-9-]+$/.test(header)) throw new Error("Invalid HTTP header name.");
      } else {
        if (!server.command.trim() || server.command.length > 500 || server.args.length > 100)
          throw new Error("Enter an executable and at most 100 arguments.");
        for (const variable of [...Object.keys(server.env ?? {}), ...(server.envVars ?? [])])
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable))
            throw new Error("Invalid environment variable name.");
        for (const [key] of Object.entries(server.env ?? {}))
          if (/TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY/i.test(key))
            throw new Error("Use envVars to reference credentials from the server environment.");
      }
    }
  }
}

export function effectiveMcpServers(plugins: readonly McpPlugin[], projectId: string | null) {
  const result: Record<string, CustomMcpServer> = {};
  for (const plugin of plugins) {
    if (!plugin.enabled || (plugin.projectId !== null && plugin.projectId !== projectId)) continue;
    for (const [name, server] of Object.entries(plugin.servers))
      result[`${plugin.id}--${name}`] = server;
  }
  return result;
}

/** Portable client files contain environment references, never resolved credentials. */
export function exportMcpConfigurations(plugins: readonly McpPlugin[]) {
  const servers = effectiveMcpServers(plugins, null);
  const claude: Record<string, unknown> = {};
  const toml: string[] = [];
  const quoted = (value: string) => JSON.stringify(value);
  for (const [name, server] of Object.entries(servers)) {
    toml.push(`[mcp_servers.${quoted(name)}]`);
    if (server.type === "http") {
      const headers = Object.fromEntries(
        Object.entries(server.headerEnv ?? {}).map(([header, variable]) => [
          header,
          `\${${variable}}`,
        ]),
      );
      if (server.bearerTokenEnv) headers.Authorization = `Bearer \${${server.bearerTokenEnv}}`;
      claude[name] = {
        type: "http",
        url: server.url,
        ...(Object.keys(headers).length ? { headers } : {}),
      };
      toml.push(`url = ${quoted(server.url)}`);
      if (server.bearerTokenEnv)
        toml.push(`bearer_token_env_var = ${quoted(server.bearerTokenEnv)}`);
      if (Object.keys(server.headerEnv ?? {}).length) {
        toml.push(`[mcp_servers.${quoted(name)}.env_http_headers]`);
        for (const [header, variable] of Object.entries(server.headerEnv ?? {}))
          toml.push(`${quoted(header)} = ${quoted(variable)}`);
      }
    } else {
      claude[name] = {
        type: "stdio",
        command: server.command,
        args: server.args,
        env: {
          ...server.env,
          ...Object.fromEntries(
            (server.envVars ?? []).map((variable) => [variable, `\${${variable}}`]),
          ),
        },
      };
      toml.push(`command = ${quoted(server.command)}`, `args = ${JSON.stringify(server.args)}`);
      if (server.envVars?.length) toml.push(`env_vars = ${JSON.stringify(server.envVars)}`);
      if (Object.keys(server.env ?? {}).length) {
        toml.push(`[mcp_servers.${quoted(name)}.env]`);
        for (const [variable, value] of Object.entries(server.env ?? {}))
          toml.push(`${quoted(variable)} = ${quoted(value)}`);
      }
    }
    toml.push("");
  }
  return { claude: JSON.stringify({ mcpServers: claude }, null, 2), codex: toml.join("\n") };
}
