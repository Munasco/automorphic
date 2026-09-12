export const AUTOMORPHIC_HOME_DIRECTORY = ".automorphic";
export const DEFAULT_WORKSPACE_DIRECTORY = "my-workspace";
// Direct children reserved for application data, never selectable as workspace folders.
export const RESERVED_WORKSPACE_DIRECTORIES = new Set([
  "userdata",
  "secrets",
  "dev",
  "caches",
  "worktrees",
  "runtime",
  "logs",
  "attachments",
  "browser-artifacts",
  "themes",
  "source",
  "device",
  "telemetry",
  "desktop",
  "updates",
]);
export function isReservedWorkspaceDirectory(name: string): boolean {
  return name.startsWith(".") || RESERVED_WORKSPACE_DIRECTORIES.has(name.toLowerCase());
}
