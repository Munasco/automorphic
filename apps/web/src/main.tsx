import React, { lazy, Suspense } from "react";
import { AccountGate, AccountLoading } from "./account/AccountGate";
import { AccountProvider } from "./account/AccountProvider";
import ReactDOM from "react-dom/client";

import "./index.css";

import { isElectron } from "./env";
import { hasCloudPublicConfig } from "./cloud/publicConfig";
import {
  syncDocumentElectronPlatformClasses,
  syncDocumentWindowControlsOverlayClass,
} from "./lib/windowControlsOverlay";
import { clearChunkReloadGuard, reloadOnceForChunkLoadError } from "./lib/chunkReloadGuard";

const AuthenticatedWorkspace = lazy(() => import("./AuthenticatedWorkspace"));

// An HMR evaluation must reuse the root owned by this entry, and an older
// asynchronous startup must not mount after its module has been replaced.
let disposed = false;
let root: ReactDOM.Root | undefined = import.meta.hot?.data.reactRoot;
import.meta.hot?.dispose(() => {
  disposed = true;
});

if (isElectron) {
  syncDocumentElectronPlatformClasses(navigator.platform);
  syncDocumentWindowControlsOverlayClass();
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

// A failed split-chunk fetch usually means the hashed assets went stale under
// a deploy; one guarded reload picks up the fresh index.html.
let chunkLoadFailed = false;
let reloadScheduled = false;
const handlePreloadError = (event: Event) => {
  chunkLoadFailed = true;
  if (reloadOnceForChunkLoadError()) {
    reloadScheduled = true;
    event.preventDefault();
  }
};
window.addEventListener("vite:preloadError", handlePreloadError);
import.meta.hot?.dispose(() => {
  window.removeEventListener("vite:preloadError", handlePreloadError);
});

const app = (
  <AccountProvider>
    <AccountGate>
      <Suspense fallback={<AccountLoading />}>
        <AuthenticatedWorkspace />
      </Suspense>
    </AccountGate>
  </AccountProvider>
);

// Managed auth is cloud-only, and the Electron Clerk provider bundles the full
// clerk-js runtime. Loading only the selected runtime as a split chunk keeps
// every Clerk byte out of the startup graph for local-mode users, and keeps
// the bundled clerk-js out of the browser build entirely.
const managedAuthShellModule =
  clerkPublishableKey && hasCloudPublicConfig()
    ? isElectron
      ? import("./components/clerk/ElectronManagedAuthShell")
      : import("./components/clerk/BrowserManagedAuthShell")
    : null;

// Keep the boot splash until auth can render. Workspace modules load only
// inside the authenticated gate, after Convex validates the current user.
export const startup = Promise.resolve(
  managedAuthShellModule?.then((module) => module.default) ?? null,
)
  .then((ManagedAuthShell) => {
    if (reloadScheduled || disposed) return;
    if (!chunkLoadFailed) clearChunkReloadGuard();
    if (!root) {
      root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
      if (import.meta.hot) import.meta.hot.data.reactRoot = root;
    }
    root.render(
      <React.StrictMode>
        {ManagedAuthShell && clerkPublishableKey ? (
          <ManagedAuthShell publishableKey={clerkPublishableKey}>{app}</ManagedAuthShell>
        ) : (
          app
        )}
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    // Let the bootstrap entry show the error unless a reload is already scheduled.
    if (reloadScheduled || disposed) return;
    throw error;
  });
