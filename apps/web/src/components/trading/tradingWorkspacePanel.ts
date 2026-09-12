import { useEffect } from "react";
import { scopeProjectRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolveStorage } from "../../lib/storage";
import { useProject } from "../../state/entities";
import { useRightPanelStore } from "../../rightPanelStore";

// Separate from panel contents: closing the last surface intentionally removes its panel entry.
export const useTradingPanelDefaults = create<{ initialized: Record<string, true> }>()(
  persist(() => ({ initialized: {} }), {
    name: "automorphic:trading-panel-defaults:v1",
    storage: createJSONStorage(() =>
      resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
    ),
  }),
);

export function initializeTradingWorkspacePanel(ref: ScopedThreadRef) {
  const key = scopedThreadKey(ref);
  const defaults = useTradingPanelDefaults.getState();
  if (defaults.initialized[key]) return;
  useTradingPanelDefaults.setState({ initialized: { ...defaults.initialized, [key]: true } });
  const panels = useRightPanelStore.getState();
  if (panels.byThreadKey[key] || panels.getUserActionRevision(ref) > 0) return;
  panels.open(ref, "trading");
}

export function isManagedTradingWorkspace(path: string) {
  return /\/Automorphic\/Workspaces\/[^/]+\/?$/.test(path.replaceAll("\\", "/"));
}

export function useDefaultTradingWorkspacePanel(
  ref: ScopedThreadRef | null,
  projectId: ProjectId | null,
) {
  const project = useProject(
    ref && projectId ? scopeProjectRef(ref.environmentId, projectId) : null,
  );
  const workspaceRoot = project?.workspaceRoot;
  useEffect(() => {
    if (ref && workspaceRoot && isManagedTradingWorkspace(workspaceRoot))
      initializeTradingWorkspacePanel(ref);
  }, [ref, workspaceRoot]);
}
