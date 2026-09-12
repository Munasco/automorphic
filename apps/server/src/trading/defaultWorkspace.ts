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
  return path.join(home, "Automorphic", "Workspaces");
});

export const resolveDefaultTradingWorkspaceRoot = Effect.gen(function* () {
  const root = yield* resolveTradingWorkspacesRoot;
  const path = yield* Path.Path;
  return path.join(root, DEFAULT_TRADING_WORKSPACE_TITLE);
});
