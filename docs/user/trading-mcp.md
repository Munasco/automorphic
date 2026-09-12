# Trading MCP and custom plugins

Automorphic attaches its authenticated MCP server to agent sessions automatically. The built-in trading tools are part of the workspace, so they do not appear as installed plugins. A new workspace needs no copied broker token or generated credential file.

## Research with built-in tools

Agents receive trading tools automatically in new sessions. Ask for market history, account context, news, a reproducible backtest or a trade review. Research datasets, backtests and journal entries belong to the thread's workspace. The MCP can search the full connected Tradovate catalog; the chart picker's four markets do not limit it. Catalog visibility does not guarantee market-data entitlement, and these tools do not submit orders.

### History and years

Example `trading_get_bars` arguments:

```json
{
  "symbol": "ESU6",
  "interval": 1,
  "unit": "minute",
  "start": "2026-09-01T00:00:00Z",
  "end": "2026-09-12T00:00:00Z",
  "limit": 500
}
```

`start` is inclusive and `end` exclusive. Each page is ascending. Continue backwards with `nextCursor`, retaining all other arguments. The cursor binds the symbol, interval, range and page size. An empty page ends traversal but does not prove that the requested history exists or that its coverage is complete.

Supported units are second, minute and day, using the server's supported interval sizes. `trading_get_year` substitutes `year` for `start`/`end`. Exact expiry contracts and broker continuous aliases such as `@NQ` are passed to Tradovate; continuous series use the vendor's roll/adjustment rules. The MCP performs no implied stitching or adjustment. Retention, expired contracts, market sessions and missing permissions can limit the returned sample.

Exports append one page at a time using `datasetId` and the returned cursor, with a 100,000-bar ceiling per dataset. Partition larger studies by dates. Paths refer to the environment server's filesystem; agents running there can use them for further analysis. Research files are durable independently of news-cache retention.

### Backtest assumptions

Supply a saved `datasetId`, a list of `{time, direction}` signals, and explicit stop/target distances, point value, quantity, round-trip fees, slippage and maximum holding bars. Signal times must match dataset bars. Entries use the following bar's open. Positions do not overlap. Stops take precedence on ambiguous candles, except when an opening print establishes that a target filled first. Results contain the full assumptions and limitations, trade count, win rate, net P&L, expectancy, profit factor and closed-trade drawdown.

The engine cannot establish that user-generated signals avoid future information. It does not optimize strategies or validate dataset completeness; those remain explicit parts of the research process.

## Custom integrations

Settings → Integrations → Plugins manages optional MCP connections and server bundles. Add/edit, enable/disable and remove are persisted to the environment with revision checks. Global plugins apply to newly started Claude and Codex sessions in every workspace. Existing sessions retain the connections they started with. The stored schema also supports a project-scoped plugin via `projectId`.

HTTP servers and stdio servers use each provider's native transport. Stdio command/arguments are passed without a shell. Saving connections requires the environment's `access:write` scope. Built-ins are not part of this list and cannot be overwritten by a custom server name.

An import accepts Claude's `.mcp.json` shape, with credentials expressed as environment references:

```json
{
  "mcpServers": {
    "research": {
      "type": "http",
      "url": "https://your-server.example/mcp",
      "headers": { "Authorization": "Bearer ${RESEARCH_TOKEN}" }
    }
  }
}
```

The settings store normalizes this to `bearerTokenEnv`. It also accepts `headerEnv` (header → server environment-variable name), and stdio `envVars`. Configure credential variables on the environment server. Resolved values are never exported into workspace files or returned by plugin settings.

Export buttons produce optional connections in `.mcp.json` (Claude) or `config.toml` (Codex). A Codex connection looks like:

```toml
[mcp_servers."research--data"]
url = "https://your-server.example/mcp"
bearer_token_env_var = "RESEARCH_TOKEN"
```

Codex's project location is `.codex/config.toml`, or use its user configuration. Automorphic's built-in credential is injected at runtime and deliberately omitted from these portable exports.
