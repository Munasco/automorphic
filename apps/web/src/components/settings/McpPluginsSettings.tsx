import {
  McpIntegrationDocument,
  type McpPlugin,
  validateMcpPlugins,
  exportMcpConfigurations,
} from "@t3tools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Schema from "effect/Schema";
import { Check, Plug, Plus, Search, Trash2, X } from "lucide-react";
import { useState } from "react";
import { tradingFetch } from "../trading/tradingTransport";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { SettingsSection } from "./settingsLayout";

const decodeDocument = Schema.decodeUnknownSync(McpIntegrationDocument);
const key = ["trading", "mcp-plugins"] as const;
async function request(document?: McpIntegrationDocument, signal?: AbortSignal) {
  const response = await tradingFetch(
    "/api/trading/plugins",
    document
      ? {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(document),
        }
      : signal
        ? { signal }
        : {},
  );
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "You need permission to manage this environment's connections."
        : "Could not load or save plugins. Refresh and try again.",
    );
  return decodeDocument(await response.json());
}
const example = JSON.stringify(
  { mcpServers: { research: { type: "http", url: "https://example.com/mcp" } } },
  null,
  2,
);

export function parsePluginImport(text: string, name: string): McpPlugin {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== "object") throw new Error("Enter an MCP JSON configuration.");
  const servers = "mcpServers" in raw ? raw.mcpServers : "servers" in raw ? raw.servers : null;
  if (!servers || typeof servers !== "object" || Array.isArray(servers))
    throw new Error("The configuration needs a mcpServers object.");
  const normalized = Object.fromEntries(
    Object.entries(servers).map(([id, value]) => {
      if (!value || typeof value !== "object") throw new Error("Invalid MCP server.");
      const server = value as Record<string, unknown>;
      const translated = { ...server };
      if (server.headers) {
        if (typeof server.headers !== "object" || Array.isArray(server.headers))
          throw new Error("Invalid headers.");
        const headerEnv: Record<string, string> = {};
        for (const [header, value] of Object.entries(server.headers)) {
          if (typeof value !== "string")
            throw new Error("Use environment references for credentials.");
          const bearer = /^Bearer \$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value);
          const reference = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value);
          if (header.toLowerCase() === "authorization" && bearer)
            translated.bearerTokenEnv = bearer[1];
          else if (reference) headerEnv[header] = reference[1]!;
          else
            throw new Error(
              "Use environment references for credentials, such as Bearer ${RESEARCH_TOKEN}.",
            );
        }
        translated.headerEnv = headerEnv;
        delete translated.headers;
      }
      if (server.env && typeof server.env === "object" && !Array.isArray(server.env)) {
        const env: Record<string, unknown> = {};
        const envVars = Array.isArray(server.envVars) ? [...server.envVars] : [];
        for (const [key, value] of Object.entries(server.env)) {
          if (value === `\${${key}}`) envVars.push(key);
          else env[key] = value;
        }
        translated.env = env;
        translated.envVars = envVars;
      }
      return [
        id,
        {
          ...translated,
          type: server.type ?? (server.url ? "http" : "stdio"),
          ...(!server.url && !server.args ? { args: [] } : {}),
        },
      ];
    }),
  );
  const id = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const doc = decodeDocument({
    version: 1,
    revision: 0,
    plugins: [
      {
        id,
        name,
        description: "Custom MCP integration",
        enabled: true,
        projectId: null,
        servers: normalized,
      },
    ],
  });
  validateMcpPlugins(doc.plugins);
  return doc.plugins[0]!;
}

export function McpPluginsSettings() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => request(undefined, signal),
    staleTime: 10_000,
  });
  const mutation = useMutation({
    mutationFn: (document: McpIntegrationDocument) => request(document),
    onSuccess: (data) => client.setQueryData(key, data),
  });
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [json, setJson] = useState(example);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const save = async (plugins: readonly McpPlugin[]) => {
    if (!query.data) return;
    validateMcpPlugins(plugins);
    await mutation.mutateAsync({ ...query.data, plugins });
  };
  const exportConfig = (kind: "claude" | "codex") => {
    if (!query.data) return;
    const contents = exportMcpConfigurations(query.data.plugins)[kind];
    const url = URL.createObjectURL(new Blob([contents], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = kind === "claude" ? ".mcp.json" : "config.toml";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const submit = async () => {
    try {
      setError(null);
      const imported = parsePluginImport(json, name);
      const plugin = {
        ...imported,
        projectId: query.data?.plugins.find((item) => item.id === editing)?.projectId ?? null,
      };
      await save([...(query.data?.plugins ?? []).filter((item) => item.id !== editing), plugin]);
      setAdding(false);
      setEditing(null);
      setName("");
      setJson(example);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check the plugin configuration.");
    }
  };
  const plugins = (query.data?.plugins ?? []).filter((plugin) =>
    `${plugin.name} ${plugin.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <SettingsSection id="plugins" title="Plugins">
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">
          Connect your research tools. Trading data and workspace tools are included automatically.
        </p>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search plugins"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search plugins"
              className="pl-8"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAdding(true);
              setEditing(null);
              setName("");
              setJson(example);
              setError(null);
            }}
          >
            <Plus className="size-4" /> Add
          </Button>
        </div>
        {(query.error || mutation.error) && (
          <p role="alert" className="text-sm text-destructive">
            {(query.error ?? mutation.error)?.message}
          </p>
        )}
        {query.isPending && <p className="text-sm text-muted-foreground">Loading plugins…</p>}
        {!query.isPending && !query.error && !plugins.length && (
          <div className="rounded-lg border border-border/50 px-5 py-8 text-center">
            <Plug className="mx-auto mb-3 size-6 text-muted-foreground" />
            <p className="text-sm">
              {search ? "No matching plugins" : "Add your first connection"}
            </p>
          </div>
        )}
        <div className="divide-y divide-border/50">
          {plugins.map((plugin) => (
            <div key={plugin.id} className="flex min-w-0 items-center gap-3 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60">
                <Plug className="size-5 text-blue-400" />
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setEditing(plugin.id);
                  setName(plugin.name);
                  setJson(JSON.stringify({ mcpServers: plugin.servers }, null, 2));
                  setAdding(true);
                  setError(null);
                }}
              >
                <span className="block truncate text-sm font-medium">{plugin.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {Object.keys(plugin.servers).length} connection
                  {Object.keys(plugin.servers).length === 1 ? "" : "s"} ·{" "}
                  {plugin.projectId ? "Workspace" : "All workspaces"}
                </span>
              </button>
              <Button
                size="sm"
                variant="ghost"
                disabled={mutation.isPending}
                aria-label={`${plugin.enabled ? "Disable" : "Enable"} ${plugin.name}`}
                onClick={() =>
                  void save(
                    query.data!.plugins.map((item) =>
                      item.id === plugin.id ? { ...item, enabled: !item.enabled } : item,
                    ),
                  ).catch(() => undefined)
                }
              >
                {plugin.enabled ? <Check className="size-4 text-blue-400" /> : "Enable"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={mutation.isPending}
                aria-label={`Remove ${plugin.name}`}
                onClick={() =>
                  void save(query.data!.plugins.filter((item) => item.id !== plugin.id)).catch(
                    () => undefined,
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        {!!query.data?.plugins.length && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => exportConfig("claude")}>
              Export Claude config
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exportConfig("codex")}>
              Export Codex config
            </Button>
          </div>
        )}
        {adding && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{editing ? "Edit plugin" : "Add plugin"}</h3>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Close plugin editor"
                onClick={() => setAdding(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <Input
              aria-label="Plugin name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Plugin name"
            />
            <label className="block text-xs text-muted-foreground" htmlFor="mcp-plugin-json">
              MCP configuration
            </label>
            <Textarea
              id="mcp-plugin-json"
              value={json}
              onChange={(event) => setJson(event.target.value)}
              className="min-h-48 font-mono text-xs"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Paste a .mcp.json server configuration. HTTP and local command servers work with
              Claude and Codex. Use bearerTokenEnv, headerEnv or envVars for credentials configured
              on the server.
            </p>
            <p className="text-xs text-muted-foreground">
              Connections apply to all workspaces when a new agent session starts. Local command
              servers run on this environment.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              size="sm"
              disabled={!name.trim() || mutation.isPending || !query.data}
              onClick={() => void submit()}
            >
              {mutation.isPending ? "Saving…" : "Save plugin"}
            </Button>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
