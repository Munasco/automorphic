import { beforeEach, describe, expect, it } from "vite-plus/test";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useRightPanelStore, selectActiveRightPanel } from "../../rightPanelStore";
import {
  initializeTradingWorkspacePanel,
  isManagedTradingWorkspace,
  useTradingPanelDefaults,
} from "./tradingWorkspacePanel";
const ref = scopeThreadRef("test" as EnvironmentId, ThreadId.make("trading-default"));
beforeEach(() => {
  useRightPanelStore.setState({ byThreadKey: {}, userActionRevisionByThreadKey: {} });
  useTradingPanelDefaults.setState({ initialized: {} });
});
describe("default workspace trading surface", () => {
  it("opens once and never reopens after the user closes all surfaces or reloads", () => {
    initializeTradingWorkspacePanel(ref);
    expect(selectActiveRightPanel(useRightPanelStore.getState().byThreadKey, ref)).toBe("trading");
    useRightPanelStore.getState().closeAllSurfaces(ref);
    // Simulate reload: user action revisions are session-only, while initialized is persisted.
    useRightPanelStore.setState({ userActionRevisionByThreadKey: {} });
    initializeTradingWorkspacePanel(ref);
    expect(selectActiveRightPanel(useRightPanelStore.getState().byThreadKey, ref)).toBeNull();
    expect(useTradingPanelDefaults.getState().initialized[scopedThreadKey(ref)]).toBe(true);
  });
  it("preserves an existing selected or closed panel", () => {
    useRightPanelStore.getState().open(ref, "files");
    useRightPanelStore.getState().close(ref);
    initializeTradingWorkspacePanel(ref);
    expect(selectActiveRightPanel(useRightPanelStore.getState().byThreadKey, ref)).toBeNull();
    expect(useRightPanelStore.getState().byThreadKey[scopedThreadKey(ref)]?.activeSurfaceId).toBe(
      "files",
    );
  });
  it("recognizes only a managed workspace root, including Windows paths", () => {
    expect(isManagedTradingWorkspace("/Users/me/.automorphic/my-workspace")).toBe(true);
    expect(isManagedTradingWorkspace("C:\\Users\\me\\.automorphic\\Research")).toBe(true);
    expect(isManagedTradingWorkspace("/Users/me/.automorphic/userdata")).toBe(false);
    expect(isManagedTradingWorkspace("/Users/me/.automorphic/.env")).toBe(false);
    expect(isManagedTradingWorkspace("/Users/me/.automorphic/Research/src")).toBe(false);
    expect(isManagedTradingWorkspace("/Users/me/Automorphic/Workspaces/My Trading Workspace")).toBe(
      true,
    );
    expect(isManagedTradingWorkspace("C:\\Users\\me\\Automorphic\\Workspaces\\Research")).toBe(
      true,
    );
    expect(isManagedTradingWorkspace("/Users/me/Automorphic/Workspaces/Research/src")).toBe(false);
    expect(isManagedTradingWorkspace("/Users/me/repository")).toBe(false);
  });
});
