// @effect-diagnostics globalTimers:off nodeBuiltinImport:off globalFetch:off - Dedicated native broker sign-in window.
import * as Electron from "electron";
import * as NodeCrypto from "node:crypto";
import { tradovateAuthorization, tradovateBearer, tradovateTarget } from "./tradovateCapture.ts";
type Result = { connected: boolean; error?: string };
let active: Electron.BrowserWindow | null = null;
/** Credentials stay in the main process; no passwords, response bodies, or tokens enter app UI/logs. */
export async function signInTradovate(
  target: "demo" | "live",
  save: (token: string) => Promise<Result>,
): Promise<Result> {
  if (active && !active.isDestroyed()) {
    active.focus();
    return { connected: false, error: "Tradovate sign-in is already open." };
  }
  const browserSession = Electron.session.fromPartition(
    `automorphic-tradovate-${NodeCrypto.randomUUID()}`,
  );
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const window = new Electron.BrowserWindow({
    width: 1080,
    height: 800,
    minWidth: 700,
    minHeight: 560,
    title: `Sign in to Tradovate · ${target}`,
    autoHideMenuBar: true,
    backgroundColor: "#080b12",
    webPreferences: {
      session: browserSession,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  active = window;
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    try {
      const value = new URL(url);
      if (
        value.protocol !== "https:" ||
        !(value.hostname === "tradovate.com" || value.hostname.endsWith(".tradovate.com"))
      )
        event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  return new Promise((resolve) => {
    let done = false,
      busy = false;
    const sockets = new Map<string, string>(),
      attempted = new Set<string>();
    const finish = (result: Result) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      sockets.clear();
      attempted.clear();
      if (!window.isDestroyed()) {
        try {
          window.webContents.debugger.detach();
        } catch {}
        window.destroy();
      }
      if (active === window) active = null;
      void browserSession.clearStorageData().catch(() => {});
      resolve(result);
    };
    const timeout = setTimeout(
      () => finish({ connected: false, error: "Sign-in timed out. Try again when you are ready." }),
      600_000,
    );
    window.on("close", (event) => {
      if (busy && !done) event.preventDefault();
    });
    window.once("closed", () => finish({ connected: false, error: "Sign-in was cancelled." }));
    const candidate = (url: string, token: string | null) => {
      if (done || busy || !token || tradovateTarget(url) !== target || attempted.has(token)) return;
      attempted.add(token);
      busy = true;
      window.setTitle("Verifying Tradovate account access…");
      void save(token).then(
        (result) => finish(result),
        () => finish({ connected: false, error: "Could not verify Tradovate. Please try again." }),
      );
    };
    try {
      window.webContents.debugger.attach("1.3");
      window.webContents.debugger.on("message", (_event, method, params) => {
        if (done) return;
        if (method === "Network.webSocketCreated" && tradovateTarget(params.url) === target)
          sockets.set(params.requestId, params.url);
        if (method === "Network.webSocketClosed") sockets.delete(params.requestId);
        if (method === "Network.webSocketFrameSent") {
          const url = sockets.get(params.requestId);
          if (url && typeof params.response?.payloadData === "string")
            candidate(url, tradovateAuthorization(params.response.payloadData));
        }
        if (
          method === "Network.requestWillBeSent" &&
          typeof params.request?.url === "string" &&
          tradovateTarget(params.request.url) === target
        )
          candidate(params.request.url, tradovateBearer(params.request.headers ?? {}));
      });
      void window.webContents.debugger
        .sendCommand("Network.enable")
        .then(() => window.loadURL("https://trader.tradovate.com/"))
        .catch(() =>
          finish({
            connected: false,
            error: "Tradovate could not open. Check your connection and retry.",
          }),
        );
    } catch {
      finish({ connected: false, error: "The sign-in browser could not start. Please retry." });
    }
  });
}

export async function saveTradovateSession(
  endpoint: URL,
  bearer: string,
  target: "demo" | "live",
  token: string,
): Promise<Result> {
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(40_000),
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "tradovate.connect", token, environment: target }),
  });
  if (!response.ok)
    return {
      connected: false,
      error:
        "Tradovate signed in, but account access could not be verified. Check your selected environment and account permissions, then retry.",
    };
  return { connected: true };
}
