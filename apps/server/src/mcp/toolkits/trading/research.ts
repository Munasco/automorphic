import * as Crypto from "effect/Crypto";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { McpServer, Tool, Toolkit } from "effect/unstable/ai";
import { ServerConfig } from "../../../config.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { McpInvocationContext, requireMcpCapability } from "../../McpInvocationContext.ts";
import { getHistoricalBars, type HistoryRequest } from "../../../trading/mcpMarketData.ts";
import { renderChartReport, type ChartReportInput } from "../../../trading/chartReport.ts";
import {
  backtestSignals,
  type BacktestRules,
  type BacktestSignal,
} from "../../../trading/researchBacktest.ts";

class ResearchError extends Schema.TaggedError<ResearchError>()("TradingResearchError", {
  message: Schema.String,
}) {}
const isResearchError = Schema.is(ResearchError);
const decodeJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));
const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const fail = () =>
  new ResearchError({ message: "Research artifact could not be read or saved in this workspace." });
const rules = Schema.Struct({
  stopPoints: Schema.Finite,
  targetPoints: Schema.Finite,
  pointValue: Schema.Finite,
  contracts: Schema.Int,
  costsPerContract: Schema.Finite,
  slippagePoints: Schema.Finite,
  maxHoldingBars: Schema.Int,
});
const bar = Schema.Struct({
  time: Schema.Finite,
  open: Schema.Finite,
  high: Schema.Finite,
  low: Schema.Finite,
  close: Schema.Finite,
  volume: Schema.Finite,
});
const history = Schema.Struct({
  symbol: Schema.String,
  interval: Schema.Int,
  unit: Schema.Literals(["second", "minute", "day"]),
  start: Schema.String,
  end: Schema.String,
  limit: Schema.optionalKey(Schema.Int),
  cursor: Schema.optionalKey(Schema.String),
});
const dataset = Schema.Struct({
  request: history,
  bars: Schema.Array(bar),
  nextCursor: Schema.NullOr(Schema.String),
  source: Schema.String,
  updatedAt: Schema.Finite,
});
const base = {
  success: Schema.Unknown,
  failure: ResearchError,
  dependencies: [
    McpInvocationContext,
    ProjectionSnapshotQuery,
    FileSystem.FileSystem,
    Path.Path,
    ServerConfig,
    Crypto.Crypto,
  ],
};
export const ResearchToolkit = Toolkit.make(
  Tool.make("trading_create_chart", {
    ...base,
    description:
      "Create a self-contained HTML candlestick report from a saved dataset, with numbered setup annotations and price levels. Reads actual candles, never model-supplied OHLC. Saves the selected data/provenance and annotation specification alongside the HTML. Return the path as a Markdown file link so the user can open its browser preview. Choose offset/limit to focus on a setup (at most 500 bars); annotation times must exactly match displayed candles, in epoch seconds. Does not change the live chart or activate orders/alerts.",
    parameters: Schema.Struct({
      datasetId: Schema.String,
      offset: Schema.optionalKey(Schema.Int),
      limit: Schema.optionalKey(Schema.Int),
      title: Schema.String,
      summary: Schema.String,
      annotations: Schema.Array(
        Schema.Struct({
          time: Schema.Finite,
          price: Schema.Finite,
          label: Schema.String,
          detail: Schema.String,
        }),
      ),
      levels: Schema.Array(Schema.Struct({ price: Schema.Finite, label: Schema.String })),
    }),
  }).annotate(Tool.Readonly, false),
  Tool.make("trading_export_dataset", {
    ...base,
    description:
      "Export one page of Tradovate OHLCV into a durable workspace-scoped research dataset. Repeat with datasetId and nextCursor, keeping the history request identical, to append older bars without filling model context. At most 100,000 bars per dataset. Returns a server-local file path and coverage metadata; never claims a complete multi-year series.",
    parameters: Schema.Struct({ request: history, datasetId: Schema.optionalKey(Schema.String) }),
  }).annotate(Tool.Readonly, false),
  Tool.make("trading_read_dataset", {
    ...base,
    description:
      "Read bounded pages from a previously exported workspace dataset. No additional broker requests; this is the reproducible input for analysis/backtests.",
    parameters: Schema.Struct({
      datasetId: Schema.String,
      offset: Schema.optionalKey(Schema.Int),
      limit: Schema.optionalKey(Schema.Int),
    }),
  }).annotate(Tool.Readonly, true),
  Tool.make("trading_run_backtest", {
    ...base,
    description:
      "Backtest explicit bar-close long/short signals against an exported dataset. Supply stop/target distances, contract value/quantity, round-trip fees, slippage and maximum holding bars. Entries occur next bar open; one position at a time; ambiguous stop/target candles take the stop. Saves reproducible rules, signals, summary and trades. Signal generation itself must avoid future information. Does not optimize strategies or execute orders.",
    parameters: Schema.Struct({
      datasetId: Schema.String,
      signals: Schema.Array(
        Schema.Struct({ time: Schema.Finite, direction: Schema.Literals(["long", "short"]) }),
      ),
      rules,
    }),
  }).annotate(Tool.Readonly, false),
  Tool.make("trading_get_backtest", {
    ...base,
    description:
      "Read a saved backtest summary and a bounded page of trades. Use offset/limit for large trade samples.",
    parameters: Schema.Struct({
      backtestId: Schema.String,
      offset: Schema.optionalKey(Schema.Int),
      limit: Schema.optionalKey(Schema.Int),
    }),
  }).annotate(Tool.Readonly, true),
  Tool.make("trading_save_journal", {
    ...base,
    description:
      "Save a trading plan, review or research note in this workspace journal. Preserve source dates, contract, thesis, invalidation and rule adherence. Provide an existing entryId to update that entry.",
    parameters: Schema.Struct({
      title: Schema.String,
      markdown: Schema.String,
      entryId: Schema.optionalKey(Schema.String),
    }),
  }).annotate(Tool.Readonly, false),
  Tool.make("trading_read_journal", {
    ...base,
    description: "Read one journal entry, or list this workspace's journal with offset pagination.",
    parameters: Schema.Struct({
      entryId: Schema.optionalKey(Schema.String),
      offset: Schema.optionalKey(Schema.Int),
      limit: Schema.optionalKey(Schema.Int),
    }),
  }).annotate(Tool.Readonly, true),
);
const lock = Semaphore.makeUnsafe(1);
const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const crypto = yield* Crypto.Crypto;
  const query = yield* ProjectionSnapshotQuery;
  const root = Effect.gen(function* () {
    const scope = yield* requireMcpCapability("trading");
    const thread = yield* query.getThreadShellById(scope.threadId);
    if (Option.isNone(thread)) return yield* Effect.fail(fail());
    return path.join(
      config.stateDir,
      "trading-research",
      encodeURIComponent(thread.value.projectId),
    );
  }).pipe(Effect.mapError(fail));
  const filename = (root: string, kind: string, id: string) => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid artifact ID.");
    return path.join(root, kind, `${id}.json`);
  };
  const read = (root: string, kind: string, id: string) =>
    Effect.gen(function* () {
      const target = yield* Effect.try(() => filename(root, kind, id));
      return yield* decodeJson(yield* fs.readFileString(target));
    }).pipe(Effect.mapError(fail));
  const write = (root: string, kind: string, id: string, value: unknown) =>
    Effect.gen(function* () {
      const target = yield* Effect.try(() => filename(root, kind, id));
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      const json = yield* encodeJson(value);
      if (json.length > 30_000_000)
        return yield* Effect.fail(
          new ResearchError({ message: "Research artifact exceeds 30 MB." }),
        );
      yield* fs.writeFileString(`${target}.tmp`, json, { mode: 0o600 });
      yield* fs.rename(`${target}.tmp`, target);
      return target;
    }).pipe(Effect.mapError(fail));
  const page = (offset = 0, limit = 100) => {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000
    )
      throw new Error("Use a positive page size up to 1000 and a non-negative offset.");
    return { offset, limit };
  };
  const trade = Schema.Struct({
    signalTime: Schema.Finite,
    entryTime: Schema.Finite,
    exitTime: Schema.Finite,
    direction: Schema.Literals(["long", "short"]),
    entry: Schema.Finite,
    exit: Schema.Finite,
    reason: Schema.String,
    netProfit: Schema.Finite,
  });
  const resultSchema = Schema.Struct({
    datasetId: Schema.String,
    rules,
    signals: Schema.Unknown,
    trades: Schema.Array(trade),
    summary: Schema.Unknown,
    assumptions: Schema.Unknown,
    limitations: Schema.Array(Schema.String),
    createdAt: Schema.Finite,
  });
  const journalSchema = Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    markdown: Schema.String,
    updatedAt: Schema.Finite,
  });
  return {
    trading_create_chart: (
      input: ChartReportInput & { datasetId: string; offset?: number; limit?: number },
    ) =>
      Effect.gen(function* () {
        const directory = yield* root;
        const bounds = yield* Effect.try(() => page(input.offset, input.limit ?? 150));
        if (bounds.limit > 500)
          return yield* Effect.fail(
            new ResearchError({ message: "Display at most 500 candles per report." }),
          );
        const saved = yield* Schema.decodeUnknownEffect(dataset)(
          yield* read(directory, "datasets", input.datasetId),
        );
        const bars = saved.bars.slice(bounds.offset, bounds.offset + bounds.limit);
        const evidence = {
          symbol: saved.request.symbol,
          interval: saved.request.interval,
          unit: saved.request.unit,
          source: saved.source,
          datasetId: input.datasetId,
          updatedAt: saved.updatedAt,
          generatedAt: yield* Clock.currentTimeMillis,
          totalBars: saved.bars.length,
          offset: bounds.offset,
        };
        const html = yield* Effect.try({
          try: () => renderChartReport(bars, input, evidence),
          catch: (error) =>
            new ResearchError({
              message:
                error instanceof Error ? error.message : "Chart report could not be rendered.",
            }),
        });
        const id = yield* crypto.randomUUIDv4;
        const specPath = yield* write(directory, "visuals", id, {
          ...input,
          offset: bounds.offset,
          limit: bounds.limit,
          evidence,
          bars,
        });
        const reportPath = path.join(directory, "visuals", `${id}.html`);
        yield* fs.writeFileString(reportPath, html, { flag: "wx", mode: 0o600 });
        return { reportId: id, path: reportPath, specPath, barCount: bars.length, evidence };
      }).pipe(Effect.mapError((error) => (isResearchError(error) ? error : fail()))),
    trading_export_dataset: (input: { request: HistoryRequest; datasetId?: string }) =>
      lock.withPermit(
        Effect.gen(function* () {
          const directory = yield* root;
          const previous = input.datasetId
            ? yield* Schema.decodeUnknownEffect(dataset)(
                yield* read(directory, "datasets", input.datasetId),
              )
            : undefined;
          if (previous) {
            const { cursor: _old, ...oldRequest } = previous.request;
            const { cursor: _new, ...newRequest } = input.request;
            const canonical = (r: typeof oldRequest) =>
              [r.symbol, r.interval, r.unit, r.start, r.end, r.limit ?? 500].join("|");
            if (
              canonical(oldRequest) !== canonical(newRequest) ||
              !previous.nextCursor ||
              previous.nextCursor !== input.request.cursor
            )
              return yield* Effect.fail(
                new ResearchError({
                  message: "Append using this dataset's exact request and nextCursor.",
                }),
              );
          } else if (input.request.cursor)
            return yield* Effect.fail(
              new ResearchError({
                message: "Begin a dataset without a cursor, then append pages using its datasetId.",
              }),
            );
          const response = yield* Effect.tryPromise(() => getHistoricalBars(input.request));
          const bars = [
            ...new Map(
              [...(previous?.bars ?? []), ...response.bars].map((value) => [value.time, value]),
            ).values(),
          ].sort((a, b) => a.time - b.time);
          if (bars.length > 100_000)
            return yield* Effect.fail(
              new ResearchError({
                message: "Dataset limit reached. Start a separate date partition.",
              }),
            );
          const id = input.datasetId ?? (yield* crypto.randomUUIDv4);
          const target = yield* write(directory, "datasets", id, {
            request: input.request,
            bars,
            nextCursor: response.nextCursor,
            source: "Tradovate",
            updatedAt: yield* Clock.currentTimeMillis,
          });
          return {
            datasetId: id,
            path: target,
            barCount: bars.length,
            nextCursor: response.nextCursor,
            coverage: response.coverage,
          };
        }).pipe(Effect.mapError((error) => (isResearchError(error) ? error : fail()))),
      ),
    trading_read_dataset: (input: { datasetId: string; offset?: number; limit?: number }) =>
      Effect.gen(function* () {
        const bounds = yield* Effect.try(() => page(input.offset, input.limit));
        const value = yield* Schema.decodeUnknownEffect(dataset)(
          yield* read(yield* root, "datasets", input.datasetId),
        );
        const next = bounds.offset + bounds.limit;
        return {
          ...value,
          bars: value.bars.slice(bounds.offset, next),
          totalBars: value.bars.length,
          nextOffset: next < value.bars.length ? next : null,
        };
      }).pipe(Effect.mapError(fail)),
    trading_run_backtest: (input: {
      datasetId: string;
      signals: readonly BacktestSignal[];
      rules: BacktestRules;
    }) =>
      Effect.gen(function* () {
        const directory = yield* root;
        const value = yield* Schema.decodeUnknownEffect(dataset)(
          yield* read(directory, "datasets", input.datasetId),
        );
        const result = yield* Effect.try({
          try: () => backtestSignals(value.bars, input.signals, input.rules),
          catch: (error) =>
            new ResearchError({
              message: error instanceof Error ? error.message : "Backtest failed.",
            }),
        });
        const id = yield* crypto.randomUUIDv4;
        const target = yield* write(directory, "backtests", id, {
          ...input,
          ...result,
          createdAt: yield* Clock.currentTimeMillis,
        });
        return {
          backtestId: id,
          path: target,
          summary: result.summary,
          limitations: result.limitations,
        };
      }).pipe(Effect.mapError((error) => (isResearchError(error) ? error : fail()))),
    trading_get_backtest: (input: { backtestId: string; offset?: number; limit?: number }) =>
      Effect.gen(function* () {
        const bounds = yield* Effect.try(() => page(input.offset, input.limit));
        const result = yield* Schema.decodeUnknownEffect(resultSchema)(
          yield* read(yield* root, "backtests", input.backtestId),
        );
        const { signals: _signals, ...rest } = result;
        const next = bounds.offset + bounds.limit;
        return {
          ...rest,
          trades: result.trades.slice(bounds.offset, next),
          totalTrades: result.trades.length,
          nextOffset: next < result.trades.length ? next : null,
        };
      }).pipe(Effect.mapError(fail)),
    trading_save_journal: (input: { title: string; markdown: string; entryId?: string }) =>
      lock.withPermit(
        Effect.gen(function* () {
          const directory = yield* root;
          if (!input.title.trim() || input.title.length > 200 || input.markdown.length > 100_000)
            return yield* Effect.fail(
              new ResearchError({
                message: "Use a title up to 200 characters and a note up to 100,000 characters.",
              }),
            );
          if (input.entryId) yield* read(directory, "journal", input.entryId);
          const id = input.entryId ?? (yield* crypto.randomUUIDv4);
          const target = yield* write(directory, "journal", id, {
            id,
            title: input.title,
            markdown: input.markdown,
            updatedAt: yield* Clock.currentTimeMillis,
          });
          return { entryId: id, path: target, saved: true };
        }).pipe(Effect.mapError((error) => (isResearchError(error) ? error : fail()))),
      ),
    trading_read_journal: (input: { entryId?: string; offset?: number; limit?: number }) =>
      Effect.gen(function* () {
        const directory = yield* root;
        if (input.entryId)
          return yield* Schema.decodeUnknownEffect(journalSchema)(
            yield* read(directory, "journal", input.entryId),
          );
        const bounds = yield* Effect.try(() => page(input.offset, input.limit));
        const journalDir = path.join(directory, "journal");
        if (!(yield* fs.exists(journalDir))) return { entries: [], nextOffset: null };
        const names = (yield* fs.readDirectory(journalDir))
          .filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
          .sort();
        const entries = yield* Effect.forEach(
          names.slice(bounds.offset, bounds.offset + bounds.limit),
          (name) =>
            Effect.gen(function* () {
              const { markdown: _markdown, ...summary } = yield* Schema.decodeUnknownEffect(
                journalSchema,
              )(yield* read(directory, "journal", name.slice(0, -5)));
              return summary;
            }),
        );
        return {
          entries,
          nextOffset:
            bounds.offset + bounds.limit < names.length ? bounds.offset + bounds.limit : null,
        };
      }).pipe(Effect.mapError(fail)),
  };
});
export const ResearchToolkitRegistrationLive = McpServer.toolkit(ResearchToolkit).pipe(
  Layer.provide(ResearchToolkit.toLayer(make)),
);
