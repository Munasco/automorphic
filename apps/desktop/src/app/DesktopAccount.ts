// @effect-diagnostics nodeBuiltinImport:off -- OS callback registration is synchronous at the Electron adapter boundary.
// @effect-diagnostics globalFetch:off globalConsole:off -- Better Auth fetch adapter logs only request path, status and duration.
import { createAuthClient } from "better-auth/client";
import type { BetterAuthClientPlugin } from "better-auth";
import { electronClient } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import { app, BrowserWindow } from "electron";
import * as NodePath from "node:path";
import * as NodePerfHooks from "node:perf_hooks";

const ACCOUNT_PROTOCOL = "com.automorphic.account";
const pendingLinks: string[] = [];
let acceptLink: ((url: string) => void) | undefined;
const receiveLink = (url: string) => {
  if (!url.startsWith(`${ACCOUNT_PROTOCOL}:/`)) return;
  if (acceptLink) acceptLink(url);
  else pendingLinks.push(url);
};

// Capture cold-start callbacks before the asynchronous desktop services initialize.
app.on("open-url", (event, url) => {
  if (!url.startsWith(`${ACCOUNT_PROTOCOL}:/`)) return;
  event.preventDefault();
  receiveLink(url);
});
app.on("second-instance", (_event, args) => args.forEach(receiveLink));

// Session cookies are encrypted by the Electron auth adapter with safeStorage.
// Only the public user profile crosses the preload bridge.
let initialized = false;
export function setupDesktopAccount(stateDir: string) {
  if (initialized) return;
  const plugin = electronClient({
    protocol: ACCOUNT_PROTOCOL,
    signInURL: "https://ideal-mastiff-363.convex.site/desktop-start",
    storage: storage({ cwd: stateDir, configName: "account" }),
    storagePrefix: "automorphic-account",
    channelPrefix: "automorphic-account",
    disableCache: true,
    userImageProxy: { enabled: false },
  });
  const account = createAuthClient({
    baseURL: "https://ideal-mastiff-363.convex.site",
    fetchOptions: {
      timeout: 10_000,
      customFetchImpl: async (input, init) => {
        const started = NodePerfHooks.performance.now();
        const path = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        ).pathname;
        try {
          const response = await fetch(input, init);
          console.info("[account] request", {
            path,
            status: response.status,
            durationMs: Math.round(NodePerfHooks.performance.now() - started),
          });
          return response;
        } catch (error) {
          console.info("[account] request failed", {
            path,
            durationMs: Math.round(NodePerfHooks.performance.now() - started),
          });
          throw error;
        }
      },
    },
    plugins: [
      {
        ...plugin,
        // The published fetch hook declarations predate exactOptionalPropertyTypes.
        fetchPlugins: plugin.fetchPlugins as unknown as NonNullable<
          BetterAuthClientPlugin["fetchPlugins"]
        >,
      },
    ],
  });
  account.setupMain({
    csp: false,
    // The desktop already owns its single-instance lifecycle. External account
    // links do not need a Chromium scheme registered before Electron's ready event.
    scheme: false,
    bridges: true,
    getWindow: () =>
      BrowserWindow.getAllWindows().find((window) => {
        const url = window.webContents.getURL();
        return (
          url.startsWith("automorphic://app/") ||
          url.startsWith("automorphic-dev://app/") ||
          url.startsWith("t3code://app/") ||
          url.startsWith("t3code-dev://app/")
        );
      }) ?? BrowserWindow.getFocusedWindow(),
  });
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(ACCOUNT_PROTOCOL, process.execPath, [
      NodePath.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient(ACCOUNT_PROTOCOL);
  }
  acceptLink = (rawUrl) => {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return;
    }
    if (
      url.protocol !== `${ACCOUNT_PROTOCOL}:` ||
      `/${url.hostname}${url.pathname}` !== "/auth/callback" ||
      !url.hash.startsWith("#token=")
    )
      return;
    // Keep state validation, PKCE, token exchange and encrypted storage in the SDK.
    void account
      .authenticate({ token: url.hash.slice(7), fetchOptions: { throw: true } })
      .catch(() => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send("automorphic-account:error");
        }
      });
  };
  for (const url of [...pendingLinks.splice(0), ...process.argv]) receiveLink(url);
  initialized = true;
}
