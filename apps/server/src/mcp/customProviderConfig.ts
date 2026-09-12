import type { CustomMcpServer } from "@t3tools/contracts";

export function codexMcpArguments(servers: Readonly<Record<string, CustomMcpServer>> = {}) {
  const args: string[] = [];
  for (const [name, server] of Object.entries(servers)) {
    const set = (key: string, value: unknown) =>
      args.push("-c", `mcp_servers.${JSON.stringify(name)}.${key}=${JSON.stringify(value)}`);
    if (server.type === "http") {
      set("url", server.url);
      if (server.bearerTokenEnv) set("bearer_token_env_var", server.bearerTokenEnv);
      for (const [header, variable] of Object.entries(server.headerEnv ?? {}))
        set(`env_http_headers.${JSON.stringify(header)}`, variable);
    } else {
      set("command", server.command);
      set("args", server.args);
      if (server.envVars?.length) set("env_vars", server.envVars);
      for (const [key, value] of Object.entries(server.env ?? {}))
        set(`env.${JSON.stringify(key)}`, value);
    }
  }
  return args;
}

export function claudeMcpConfiguration(
  servers: Readonly<Record<string, CustomMcpServer>> = {},
  env: NodeJS.ProcessEnv = process.env,
) {
  const result: Record<
    string,
    | { type: "http"; url: string; headers: Record<string, string> }
    | { type: "stdio"; command: string; args: string[]; env: Record<string, string> }
  > = {};
  const variable = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`MCP requires the server environment variable ${name}.`);
    return value;
  };
  for (const [name, server] of Object.entries(servers)) {
    if (server.type === "http") {
      const headers = Object.fromEntries(
        Object.entries(server.headerEnv ?? {}).map(([header, name]) => [header, variable(name)]),
      );
      if (server.bearerTokenEnv)
        headers.Authorization = `Bearer ${variable(server.bearerTokenEnv)}`;
      result[name] = { type: "http", url: server.url, headers };
    } else
      result[name] = {
        type: "stdio",
        command: server.command,
        args: [...server.args],
        env: {
          ...server.env,
          ...Object.fromEntries((server.envVars ?? []).map((name) => [name, variable(name)])),
        },
      };
  }
  return result;
}
