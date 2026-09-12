import {
  CommandId,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { resolveTradingWorkspacesRoot } from "./defaultWorkspace.ts";

export class InvalidTradingWorkspaceName extends Data.TaggedError("InvalidTradingWorkspaceName")<{
  message: string;
}> {}

export function normalizeWorkspaceTitle(value: string): string | undefined {
  const title = value.trim().normalize("NFC");
  if (
    !title ||
    title.length > 80 ||
    /[<>:"/\\|?*\p{Cc}]/u.test(title) ||
    /^[.]/.test(title) ||
    /[. ]$/.test(title) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(title)
  )
    return undefined;
  return title;
}

export const makeTradingWorkspaceCreator = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const query = yield* ProjectionSnapshotQuery;
  const engine = yield* OrchestrationEngineService;
  const settings = yield* ServerSettingsService;
  const root = yield* resolveTradingWorkspacesRoot;
  const lock = yield* Semaphore.make(1);
  return Effect.fn("createTradingWorkspace")(function* (rawTitle: string) {
    const title = normalizeWorkspaceTitle(rawTitle);
    if (!title)
      return yield* Effect.fail(
        new InvalidTradingWorkspaceName({
          message:
            "Use a workspace name of 1–80 characters without path separators or reserved filename characters.",
        }),
      );
    yield* fs.makeDirectory(root, { recursive: true });
    // Match case-insensitively on all platforms so two clients cannot create case-only duplicates.
    const entries = yield* fs.readDirectory(root);
    const existingName = entries.find(
      (entry) =>
        entry.normalize("NFC").toLocaleLowerCase("en-US") === title.toLocaleLowerCase("en-US"),
    );
    const folder = path.join(root, existingName ?? title);
    if (existingName && (yield* fs.stat(folder)).type !== "Directory")
      return yield* Effect.fail(
        new InvalidTradingWorkspaceName({ message: "A file already uses this workspace name." }),
      );
    yield* fs.makeDirectory(folder, { recursive: true });
    const canonicalRoot = yield* fs.realPath(root);
    const canonicalFolder = yield* fs.realPath(folder);
    if (path.dirname(canonicalFolder) !== canonicalRoot)
      return yield* Effect.fail(
        new InvalidTradingWorkspaceName({
          message: "The workspace must be a folder inside Automorphic/Workspaces.",
        }),
      );
    const existing = yield* query.getActiveProjectByWorkspaceRoot(folder);
    const projectId = Option.isSome(existing)
      ? existing.value.id
      : ProjectId.make(yield* crypto.randomUUIDv4);
    if (Option.isNone(existing)) {
      yield* engine.dispatch({
        type: "project.create",
        commandId: CommandId.make(yield* crypto.randomUUIDv4),
        projectId,
        title: existingName ?? title,
        workspaceRoot: folder,
        createdAt: DateTime.formatIso(yield* DateTime.now),
      });
    }
    const previousThread = yield* query.getFirstActiveThreadIdByProjectId(projectId);
    if (Option.isSome(previousThread)) return { projectId, threadId: previousThread.value };
    const threadId = ThreadId.make(yield* crypto.randomUUIDv4);
    const defaults = yield* settings.getSettings;
    yield* engine.dispatch({
      type: "thread.create",
      commandId: CommandId.make(yield* crypto.randomUUIDv4),
      threadId,
      projectId,
      title: "New thread",
      modelSelection: defaults.defaultModelSelection ?? {
        instanceId: ProviderInstanceId.make("codex"),
        model: DEFAULT_MODEL,
      },
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      runtimeMode: "full-access",
      branch: null,
      worktreePath: null,
      createdAt: DateTime.formatIso(yield* DateTime.now),
    });
    return { projectId, threadId };
  }, lock.withPermit);
});
