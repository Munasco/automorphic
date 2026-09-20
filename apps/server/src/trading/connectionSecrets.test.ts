// @effect-diagnostics nodeBuiltinImport:off - Private filesystem fixture.
import { it, expect } from "vite-plus/test";
import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";
import { connectionSecrets } from "./connectionSecrets.ts";
it("stores credentials atomically with private permissions outside fixtures", async () => {
  const directory = await FS.mkdtemp(Path.join(OS.tmpdir(), "automorphic-secrets-test-"));
  try {
    const store = connectionSecrets(directory);
    expect(await store.read("telegram")).toBeNull();
    await store.write("telegram", { session: "fixture-session" });
    expect(await store.read("telegram")).toEqual({ session: "fixture-session" });
    if (process.platform !== "win32") {
      expect((await FS.stat(directory)).mode & 0o777).toBe(0o700);
      expect((await FS.stat(Path.join(directory, "telegram.json"))).mode & 0o777).toBe(0o600);
    }
    expect(await FS.readdir(directory)).toEqual(["telegram.json"]);
    await store.remove("telegram");
    expect(await store.read("telegram")).toBeNull();
  } finally {
    await FS.rm(directory, { recursive: true, force: true });
  }
});
