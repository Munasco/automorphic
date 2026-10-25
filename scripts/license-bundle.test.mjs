import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";
import { createLicenseBundle, needsLicenseReview } from "./license-bundle.mjs";

NodeTest.test(
  "flags non-permissive or unknown metadata without rejecting a permissive dual-license choice",
  () => {
    for (const value of [
      "Unknown",
      "UNLICENSED",
      "SEE LICENSE IN README.md",
      "LGPL-3.0",
      "MPL-2.0",
      "GPL-3.0",
      "(GPL-2.0 OR GPL-3.0)",
    ])
      NodeAssert.equal(needsLicenseReview(value), true);
    for (const value of ["MIT", "Apache-2.0", "(MIT OR GPL-3.0-or-later)"])
      NodeAssert.equal(needsLicenseReview(value), false);
  },
);

NodeTest.test(
  "collects license text and portable SBOM, deduplicates versions, and flags absent notices",
  () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "license-bundle-test-"));
    try {
      const pkg = NodePath.join(root, "input");
      NodeFS.mkdirSync(pkg);
      NodeFS.writeFileSync(
        NodePath.join(pkg, "package.json"),
        JSON.stringify({ name: "@example/component", version: "1.2.3", license: "MIT" }),
      );
      NodeFS.writeFileSync(NodePath.join(pkg, "LICENSE"), "Example license text");
      NodeFS.writeFileSync(NodePath.join(root, "private"), "private data");
      NodeFS.symlinkSync(NodePath.join(root, "private"), NodePath.join(pkg, "NOTICE"));
      const item = { paths: [pkg], license: "MIT" };
      const out = NodePath.join(root, "output");
      NodeAssert.deepEqual(createLicenseBundle({ MIT: [item, item] }, out), {
        components: 1,
        review: 0,
      });
      const serialized = NodeFS.readFileSync(NodePath.join(out, "sbom.cdx.json"), "utf8");
      NodeAssert.equal(serialized.includes(root), false);
      const sbom = JSON.parse(serialized);
      NodeAssert.equal(sbom.components[0].purl, "pkg:npm/%40example/component@1.2.3");
      const directory = NodePath.join(
        out,
        "packages",
        NodeFS.readdirSync(NodePath.join(out, "packages"))[0],
      );
      NodeAssert.deepEqual(NodeFS.readdirSync(directory), ["LICENSE"]);
      NodeAssert.equal(
        NodeFS.readFileSync(NodePath.join(directory, "LICENSE"), "utf8"),
        "Example license text",
      );
      NodeAssert.throws(() => createLicenseBundle({ MIT: [item] }, out), /empty output directory/);
      const absent = NodePath.join(root, "absent");
      NodeAssert.deepEqual(
        createLicenseBundle(
          {
            MIT: [
              {
                name: "missing-platform",
                versions: ["1.0.0"],
                paths: [NodePath.join(root, "not-installed")],
                license: "MIT",
              },
            ],
          },
          absent,
        ),
        { components: 1, review: 1 },
      );
      NodeAssert.match(
        NodeFS.readFileSync(NodePath.join(absent, "review-required.json"), "utf8"),
        /not installed on this host/,
      );
      NodeFS.rmSync(NodePath.join(pkg, "LICENSE"));
      NodeAssert.equal(
        createLicenseBundle({ MIT: [item] }, NodePath.join(root, "missing-notice")).review,
        1,
      );
      NodeAssert.throws(
        () => createLicenseBundle({}, NodePath.join(root, "empty")),
        /No installed packages/,
      );
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  },
);
