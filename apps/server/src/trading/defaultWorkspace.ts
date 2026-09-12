import {
  AUTOMORPHIC_HOME_DIRECTORY,
  DEFAULT_WORKSPACE_DIRECTORY,
} from "@t3tools/shared/automorphicPaths";
import * as NodeOS from "node:os";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

export const DEFAULT_TRADING_WORKSPACE_TITLE = "My workspace";

export class TradingWorkspaceHome extends Context.Reference<string>(
  "automorphic/TradingWorkspaceHome",
  { defaultValue: () => NodeOS.homedir() },
) {}

// User workspaces are ordinary home folders, separate from environment databases.
export const resolveTradingWorkspacesRoot = Effect.gen(function* () {
  const home = yield* TradingWorkspaceHome;
  const path = yield* Path.Path;
  return path.join(home, AUTOMORPHIC_HOME_DIRECTORY);
});

export const resolveDefaultTradingWorkspaceRoot = Effect.gen(function* () {
  const root = yield* resolveTradingWorkspacesRoot;
  const path = yield* Path.Path;
  return path.join(root, DEFAULT_WORKSPACE_DIRECTORY);
});

export const resolveLegacyTradingWorkspaceRoots = Effect.gen(function* () {
  const home = yield* TradingWorkspaceHome;
  const path = yield* Path.Path;
  return [
    path.join(home, "Automorphic", "Workspaces", "My workspace"),
    path.join(home, "Automorphic", "Workspaces", "My Trading Workspace"),
    path.join(home, AUTOMORPHIC_HOME_DIRECTORY, "My workspace"),
  ];
});
