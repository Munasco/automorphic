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

if (isElectron) {
  syncDocumentElectronPlatformClasses(navigator.platform);
  syncDocumentWindowControlsOverlayClass();
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

// A failed split-chunk fetch usually means the hashed assets went stale under
// a deploy; one guarded reload picks up the fresh index.html.
let chunkLoadFailed = false;
let reloadScheduled = false;
window.addEventListener("vite:preloadError", (event) => {
  chunkLoadFailed = true;
  if (reloadOnceForChunkLoadError()) {
    reloadScheduled = true;
    event.preventDefault();
  }
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
    if (reloadScheduled) return;
    if (!chunkLoadFailed) clearChunkReloadGuard();
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
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
    if (reloadScheduled) return;
    throw error;
  });
