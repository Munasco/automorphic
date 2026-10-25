import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { McpServer, Tool, Toolkit } from "effect/unstable/ai";
import * as Layer from "effect/Layer";
import { McpInvocationContext, requireMcpCapability } from "../../McpInvocationContext.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { TradingWorkspace } from "../../../trading/TradingWorkspace.ts";
import { accountSnapshot } from "../../../trading/accountData.ts";
import {
  getHistoricalBars,
  listProducts,
  searchInstruments,
  type HistoryRequest,
} from "../../../trading/mcpMarketData.ts";

class TradingToolError extends Schema.TaggedError<TradingToolError>()("TradingToolError", {
  message: Schema.String,
}) {}
const dependencies = [McpInvocationContext, ProjectionSnapshotQuery, TradingWorkspace];
const base = { success: Schema.Unknown, failure: TradingToolError, dependencies };
const history = {
  symbol: Schema.String,
  interval: Schema.Finite,
  unit: Schema.Literals(["second", "minute", "day"]),
  start: Schema.String.annotate({
    description:
      "Inclusive ISO timestamp. May span years; broker retention and contract expiry still apply.",
  }),
  end: Schema.String.annotate({ description: "Exclusive ISO timestamp." }),
  limit: Schema.optionalKey(Schema.Finite),
  cursor: Schema.optionalKey(Schema.String),
};
export const TradingToolkit = Toolkit.make(
  Tool.make("trading_list_products", {
    ...base,
    description:
      "Browse the connected Tradovate product catalog, with offset pagination. Includes all catalog products, not only the chart picker symbols. Visibility does not prove market-data entitlement.",
    parameters: Schema.Struct({
      offset: Schema.optionalKey(Schema.Finite),
      limit: Schema.optionalKey(Schema.Finite),
    }),
  }).annotate(Tool.Readonly, true),
  Tool.make("trading_search_contracts", {
    ...base,
    description:
      "Search Tradovate contracts by any root, name or expiry. Use a returned contract name for history; Tradovate continuous aliases such as @NQ can be requested explicitly. No MGC/MNQ/GC/NQ allowlist.",
    parameters: Schema.Struct({ search: Schema.String, limit: Schema.optionalKey(Schema.Finite) }),
  }).annotate(Tool.Readonly, true),
  Tool.make("trading_get_bars", {
    ...base,
    description:
      "Read a bounded page of historical OHLCV bars using the connected account's market-data permissions. Supports date ranges across years. Bars are ascending; nextCursor pages backwards without duplicates. Keep all other arguments identical. At most 1000 bars/page. Empty history is not evidence of full coverage. Use exact contracts or Tradovate continuous symbols such as @NQ. Continuous roll/adjustment rules are vendor-defined; no client-side stitching is applied.",
    parameters: Schema.Struct(history),
  }).annotate(Tool.Readonly, true),
  Tool.make("trading_get_year", {
    ...base,
    description:
      "Read a year of history in pages. Convenience wrapper around trading_get_bars using UTC calendar-year boundaries. Follow nextCursor with the same year, symbol, interval and limit. Expired contracts and unavailable years may return no bars.",
    parameters: Schema.Struct({
      symbol: Schema.String,
      year: Schema.Finite,
      interval: Schema.Finite,
      unit: history.unit,
      limit: history.limit,
      cursor: history.cursor,
    }),
  }).annotate(Tool.Readonly, true),
  Tool.make("trading_get_account", {
    ...base,
    description:
      "Read accounts, positions, orders and fills visible to the connected Tradovate session. Optional accountId must belong to that session. Does not place or modify orders.",
    parameters: Schema.Struct({ accountId: Schema.optionalKey(Schema.Finite) }),
  }).annotate(Tool.Readonly, true),
  Tool.make("trading_get_workspace", {
    ...base,
    description:
      "Read this agent thread's trading workspace chart settings, indicators, drawings and saved alerts. Project scope comes from the authenticated thread, never from model input.",
  }).annotate(Tool.Readonly, true),
  Tool.make("trading_get_news", {
    ...base,
    description:
      "Read workspace macro/news research for gold or Nasdaq. Includes source attribution and timestamps; other market news is not yet provided by this feed.",
    parameters: Schema.Struct({ market: Schema.Literals(["gold", "nasdaq"]) }),
  }).annotate(Tool.Readonly, true),
  Tool.make("trading_check_risk", {
    ...base,
    description:
      "Calculate planned loss, reward/risk and maximum whole-contract size from explicit user-provided risk limits. Includes round-trip costs per contract. This is arithmetic, not an order or a recommendation.",
    parameters: Schema.Struct({
      entry: Schema.Finite,
      stop: Schema.Finite,
      target: Schema.Finite,
      direction: Schema.Literals(["long", "short"]),
      pointValue: Schema.Finite,
      riskBudget: Schema.Finite,
      roundTripCosts: Schema.optionalKey(Schema.Finite),
    }),
  }).annotate(Tool.Readonly, true),
);

const failure = () =>
  new TradingToolError({
    message:
      "The trading request could not be completed. Check the connected Tradovate session and workspace.",
  });
const make = Effect.gen(function* () {
  const query = yield* ProjectionSnapshotQuery;
  const workspace = yield* TradingWorkspace;
  const scope = Effect.gen(function* () {
    const invocation = yield* requireMcpCapability("trading");
    const thread = yield* query.getThreadShellById(invocation.threadId);
    if (Option.isNone(thread))
      return yield* Effect.fail(
        new TradingToolError({ message: "This agent's workspace no longer exists." }),
      );
    return thread.value.projectId;
  }).pipe(Effect.mapError(failure));
  const read = <A>(operation: () => Promise<A>) =>
    Effect.gen(function* () {
      yield* scope;
      return yield* Effect.tryPromise({
        try: operation,
        catch: (error) =>
          new TradingToolError({
            message: error instanceof Error ? error.message : "Trading request failed.",
          }),
      });
    });
  return {
    trading_list_products: (input: { offset?: number; limit?: number }) =>
      read(() => listProducts(input.offset, input.limit)),
    trading_search_contracts: (input: { search: string; limit?: number }) =>
      read(() => searchInstruments(input.search, input.limit)),
    trading_get_bars: (input: HistoryRequest) => read(() => getHistoricalBars(input)),
    trading_get_year: (input: {
      symbol: string;
      year: number;
      interval: number;
      unit: "second" | "minute" | "day";
      limit?: number;
      cursor?: string;
    }) =>
      read(async () => {
        if (!Number.isInteger(input.year) || input.year < 1970 || input.year > 9998)
          throw new Error("Choose a valid calendar year.");
        return getHistoricalBars({
          ...input,
          start: `${input.year}-01-01T00:00:00Z`,
          end: `${input.year + 1}-01-01T00:00:00Z`,
        });
      }),
    trading_get_account: (input: { accountId?: number }) =>
      read(() => accountSnapshot(input.accountId)),
    trading_get_workspace: () =>
      Effect.gen(function* () {
        return yield* workspace.snapshot(yield* scope);
      }).pipe(Effect.mapError(failure)),
    trading_get_news: (input: { market: "gold" | "nasdaq" }) =>
      Effect.gen(function* () {
        return yield* workspace.news(input.market === "gold" ? "MGC" : "NQ", yield* scope);
      }).pipe(Effect.mapError(failure)),
    trading_check_risk: (input: RiskInput) => read(async () => calculateRisk(input)),
  };
});
export interface RiskInput {
  entry: number;
  stop: number;
  target: number;
  direction: "long" | "short";
  pointValue: number;
  riskBudget: number;
  roundTripCosts?: number;
}
export function calculateRisk(input: RiskInput) {
  const costs = input.roundTripCosts ?? 0;
  if (
    ![input.entry, input.stop, input.target, input.pointValue, input.riskBudget, costs].every(
      Number.isFinite,
    ) ||
    input.pointValue <= 0 ||
    input.riskBudget < 0 ||
    costs < 0
  )
    throw new Error("Use finite prices, a positive point value and non-negative budget and costs.");
  const sign = input.direction === "long" ? 1 : -1;
  const risk = (input.entry - input.stop) * sign * input.pointValue + costs;
  const reward = (input.target - input.entry) * sign * input.pointValue - costs;
  if ((input.entry - input.stop) * sign <= 0 || (input.target - input.entry) * sign <= 0)
    throw new Error("Stop and target must be on the correct sides of entry.");
  return {
    riskPerContract: risk,
    rewardPerContract: reward,
    rewardToRisk: reward / risk,
    maxContracts: Math.floor(input.riskBudget / risk),
    assumptions: { pointValue: input.pointValue, roundTripCosts: costs },
  };
}
export const TradingToolkitRegistrationLive = McpServer.toolkit(TradingToolkit).pipe(
  Layer.provide(TradingToolkit.toLayer(make)),
);
