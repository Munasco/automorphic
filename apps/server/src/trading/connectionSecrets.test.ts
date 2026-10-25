// @effect-diagnostics nodeBuiltinImport:off - Private filesystem fixture.
import { it, expect } from "vite-plus/test";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { connectionSecrets } from "./connectionSecrets.ts";
it("stores credentials atomically with private permissions outside fixtures", async () => {
  const directory = await NodeFSP.mkdtemp(
    NodePath.join(NodeOS.tmpdir(), "automorphic-secrets-test-"),
  );
  try {
    const store = connectionSecrets(directory);
    expect(await store.read("telegram")).toBeNull();
    await store.write("telegram", { session: "fixture-session" });
    expect(await store.read("telegram")).toEqual({ session: "fixture-session" });
    // oxlint-disable-next-line t3code/no-global-process-runtime -- Native filesystem permission assertions apply only on POSIX hosts.
    if (NodeOS.platform() !== "win32") {
      expect((await NodeFSP.stat(directory)).mode & 0o777).toBe(0o700);
      expect((await NodeFSP.stat(NodePath.join(directory, "telegram.json"))).mode & 0o777).toBe(
        0o600,
      );
    }
    expect(await NodeFSP.readdir(directory)).toEqual(["telegram.json"]);
    await store.remove("telegram");
    expect(await store.read("telegram")).toBeNull();
  } finally {
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});
