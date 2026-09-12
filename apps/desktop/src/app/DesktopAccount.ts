import { createAuthClient } from "better-auth/client";
import type { BetterAuthClientPlugin } from "better-auth";
import { electronClient } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import { BrowserWindow } from "electron";

// Session cookies are encrypted by the Electron auth adapter with safeStorage.
// Only the public user profile crosses the preload bridge.
let initialized = false;
export function setupDesktopAccount(stateDir: string) {
  if (initialized) return;
  const plugin = electronClient({
    protocol: "com.automorphic.account",
    signInURL: "https://ideal-mastiff-363.convex.site/desktop-start",
    storage: storage({ cwd: stateDir, configName: "account" }),
    storagePrefix: "automorphic-account",
    channelPrefix: "automorphic-account",
    disableCache: true,
    userImageProxy: { enabled: false },
  });
  const account = createAuthClient({
    baseURL: "https://ideal-mastiff-363.convex.site",
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
    scheme: true,
    bridges: true,
    getWindow: () =>
      BrowserWindow.getAllWindows().find((window) => {
        const url = window.webContents.getURL();
        return url.startsWith("t3code://app/") || url.startsWith("t3code-dev://app/");
      }) ?? BrowserWindow.getFocusedWindow(),
  });
  initialized = true;
}
