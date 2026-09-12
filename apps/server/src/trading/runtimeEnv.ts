// @effect-diagnostics nodeBuiltinImport:off - Native credential-file adapter shared by HTTP integrations.
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
export function resolveTradingEnvironmentFile(
  env: NodeJS.ProcessEnv = process.env,
  home = NodeOS.homedir(),
): string {
  return env.AUTOMORPHIC_ENV_FILE || NodePath.join(home, ".automorphic", ".env");
}

// Bundled into the desktop server too; no dev wrapper is required for token synchronization.
import { renewTradovateSession } from "../../../../scripts/lib/tradovate-session.mjs";
export function createTradingSessionSync(
  renew: typeof renewTradovateSession = renewTradovateSession,
  now: () => number = Date.now,
) {
  const attempts = new Map<string, { at: number; pending: Promise<void> }>();
  return async (envPath: string): Promise<void> => {
    const previous = attempts.get(envPath);
    if (previous && now() - previous.at < 60_000) return previous.pending;
    const pending = renew({ envPath }).then(
      () => {},
      () => {},
    );
    attempts.set(envPath, { at: now(), pending });
    await pending;
  };
}
export const synchronizeTradingSession = createTradingSessionSync();
