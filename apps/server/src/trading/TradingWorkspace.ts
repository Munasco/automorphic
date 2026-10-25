import { ProjectId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { resolveDefaultTradingWorkspaceRoot } from "./defaultWorkspace.ts";
import { createTradingNewsStoreAdapter, makeTradingNewsStore } from "./newsStore.ts";
import { createLiveWires } from "./news.ts";
import { makeWorkspaceState } from "./workspaceState.ts";

class TradingWorkspaceStarting extends Data.TaggedError("TradingWorkspaceStarting") {}

const make = Effect.gen(function* () {
  const query = yield* ProjectionSnapshotQuery;
  const workspaceRoot = yield* resolveDefaultTradingWorkspaceRoot;
  const state = yield* makeWorkspaceState;
  const store = yield* makeTradingNewsStore;
  const adapter = createTradingNewsStoreAdapter(store);
  const readers = new Map<string, ReturnType<typeof createLiveWires>>();
  const cleanup = Effect.gen(function* () {
    yield* store.cleanup(yield* Clock.currentTimeMillis);
  });
  yield* cleanup;
  yield* cleanup.pipe(
    Effect.catch(() => Effect.logWarning("Trading cache cleanup will retry.")),
    Effect.repeat(Schedule.spaced("1 hour")),
    Effect.forkScoped,
  );
  const project = Effect.fn("TradingWorkspace.project")(function* (selectedProjectId?: string) {
    if (selectedProjectId) {
      const match = yield* query.getProjectShellById(ProjectId.make(selectedProjectId));
      if (Option.isNone(match)) return yield* Effect.fail(new TradingWorkspaceStarting());
      return match.value;
    }
    const match = yield* query.getActiveProjectByWorkspaceRoot(workspaceRoot);
    if (Option.isNone(match)) return yield* Effect.fail(new TradingWorkspaceStarting());
    return match.value;
  });
  const snapshot = Effect.fn("TradingWorkspace.snapshot")(function* (selectedProjectId?: string) {
    const current = yield* project(selectedProjectId);
    const defaultProject = yield* query.getActiveProjectByWorkspaceRoot(workspaceRoot);
    yield* cleanup;
    return {
      projectId: current.id,
      isDefault: Option.isSome(defaultProject) && defaultProject.value.id === current.id,
      title: current.title,
      retentionHours: yield* store.retention(current.id),
      values: yield* state.read(current.id),
    };
  });
  const save = Effect.fn("TradingWorkspace.save")(function* (
    key: string,
    value: string,
    selectedProjectId?: string,
  ) {
    const current = yield* project(selectedProjectId);
    yield* state.write(current.id, key, value, yield* Clock.currentTimeMillis);
  });
  const setRetention = Effect.fn("TradingWorkspace.setRetention")(function* (
    hours: 24 | 168,
    selectedProjectId?: string,
  ) {
    const current = yield* project(selectedProjectId);
    yield* store.setRetention(current.id, hours, yield* Clock.currentTimeMillis);
  });
  const news = Effect.fn("TradingWorkspace.news")(function* (
    root: "MGC" | "NQ",
    selectedProjectId?: string,
  ) {
    const current = yield* project(selectedProjectId);
    let read = readers.get(current.id);
    if (!read) {
      read = createLiveWires(adapter, current.id);
      readers.set(current.id, read);
    }
    const reader = read;
    return yield* Effect.tryPromise(() => reader(root));
  });
  return { snapshot, save, setRetention, news };
});
export class TradingWorkspace extends Context.Service<
  TradingWorkspace,
  Effect.Success<typeof make>
>()("t3/trading/TradingWorkspace") {}
export const TradingWorkspaceLive = Layer.effect(TradingWorkspace, make);
