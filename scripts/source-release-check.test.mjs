import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import * as NodeTest from "node:test";
import { checkSource, externalLocalDependencies, privatePaths } from "./source-release-check.mjs";

NodeTest.test(
  "rejects private tracked state while allowing templates and public certificate fixtures",
  () => {
    const bad = [
      ".env",
      "apps/web/.env.production",
      ".t3/userdata/state.sqlite",
      "keys/signing.p12",
      "foo/id_ed25519",
      ".npmrc",
    ];
    NodeAssert.deepEqual(
      privatePaths([
        ...bad,
        ".env.example",
        "apps/backend/.env.example",
        "fixtures/cert.pem",
        "src/environment.ts",
      ]),
      bad,
    );
    const fixture =
      ".repos/alchemy-effect/packages/cloudflare-runtime/src/rolldown/test/fixtures/module-resolution/node_modules/@fixtures/example/";
    NodeAssert.deepEqual(
      privatePaths([fixture + "index.js", fixture + ".env", "node_modules/real-package/index.js"]),
      [fixture + ".env", "node_modules/real-package/index.js"],
    );
  },
);

NodeTest.test(
  "allows portable workspace dependencies and rejects machine-specific paths on both platforms",
  () => {
    NodeAssert.deepEqual(
      externalLocalDependencies({
        dependencies: {
          local: "file:./modules/local",
          workspace: "workspace:*",
          public: "^1.0.0",
          mac: "file:/Users/example/private",
          windows: "link:C:\\private\\package",
          home: "file:~/package",
          escape: "file:../../outside",
        },
      }).map(([name]) => name),
      ["mac", "windows", "home", "escape"],
    );
  },
);

NodeTest.test(
  "checks tracked content without reading ignored secrets or requiring dependency installation",
  () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "source-release-test-"));
    try {
      NodeChildProcess.execFileSync("git", ["init", "-q", root]);
      NodeFS.mkdirSync(NodePath.join(root, ".github"));
      for (const file of [
        "LICENSE",
        "THIRD_PARTY_NOTICES.md",
        "CONTRIBUTING.md",
        "CODE_OF_CONDUCT.md",
        ".github/SECURITY.md",
      ])
        NodeFS.writeFileSync(NodePath.join(root, file), "Example document\n");
      NodeFS.writeFileSync(NodePath.join(root, ".gitignore"), ".env\n");
      NodeFS.writeFileSync(NodePath.join(root, ".env"), "PRIVATE_VALUE=do-not-read\n");
      NodeFS.writeFileSync(
        NodePath.join(root, "package.json"),
        JSON.stringify({ dependencies: { portable: "file:./local" } }),
      );
      NodeChildProcess.execFileSync("git", ["add", "."], { cwd: root });
      NodeAssert.deepEqual(checkSource(root).errors, []);
      NodeChildProcess.execFileSync("git", ["add", "-f", ".env"], { cwd: root });
      NodeAssert.deepEqual(checkSource(root).errors, ["Private/runtime file is tracked: .env"]);
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  },
);
