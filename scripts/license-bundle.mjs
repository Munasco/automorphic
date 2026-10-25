import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

export function needsLicenseReview(license) {
  return (
    !license ||
    /unknown|unlicensed|see license|lgpl|mpl|proprietary/i.test(license) ||
    (/gpl/i.test(license) && !/^\((?:MIT|BSD-[23]-Clause) OR GPL-[^)]+\)$/.test(license))
  );
}

function legalFiles(root, relative = "") {
  const result = [];
  for (const entry of NodeFS.readdirSync(NodePath.join(root, relative), { withFileTypes: true })) {
    const path = NodePath.join(relative, entry.name);
    // Do not follow symlinks into another package or a private location.
    if (
      entry.isFile() &&
      /^(?:licen[cs]e|copying|notice|copyright|authors)(?:[._-]|$)/i.test(entry.name)
    )
      result.push(path);
    else if (entry.isDirectory() && /^(?:licenses|licences)$/i.test(entry.name)) {
      for (const name of NodeFS.readdirSync(NodePath.join(root, path))) {
        const child = NodePath.join(path, name);
        if (NodeFS.lstatSync(NodePath.join(root, child)).isFile()) result.push(child);
      }
    }
  }
  return result.sort();
}

export function createLicenseBundle(report, output) {
  if (NodeFS.existsSync(output) && NodeFS.readdirSync(output).length)
    throw new Error("Use an empty output directory to avoid stale notices.");
  NodeFS.mkdirSync(output, { recursive: true });
  const components = new Map();
  const review = [];
  for (const group of Object.values(report)) {
    if (!Array.isArray(group))
      throw new Error("Expected JSON from pnpm licenses list --prod --json.");
    for (const item of group) {
      const sources = (item.paths ?? [])
        .filter((path) => NodeFS.existsSync(NodePath.join(path, "package.json")))
        .map((path) => ({
          path,
          pkg: JSON.parse(NodeFS.readFileSync(NodePath.join(path, "package.json"), "utf8")),
        }));
      // pnpm may report lockfile variants that are not installed on this host.
      // Keep them visible as unresolved; never silently drop them from the inventory.
      for (const version of item.versions ?? []) {
        if (!sources.some(({ pkg }) => pkg.version === version))
          sources.push({ path: null, pkg: { name: item.name, version } });
      }
      for (const { path, pkg } of sources) {
        const name = pkg.name;
        const version = pkg.version ?? "0.0.0-workspace";
        if (typeof name !== "string" || !name) throw new Error("Package name is missing.");
        const license = typeof pkg.license === "string" ? pkg.license : item.license || "Unknown";
        const key = `${name}@${version}`;
        // Include every installed variant's legal files, including platform-specific packages.
        const destination = NodePath.join(
          output,
          "packages",
          NodeCrypto.createHash("sha256").update(key).digest("hex").slice(0, 24),
        );
        NodeFS.mkdirSync(destination, { recursive: true });
        const files = path ? legalFiles(path) : [];
        for (const file of files) {
          const target = NodePath.join(destination, file);
          NodeFS.mkdirSync(NodePath.resolve(target, ".."), { recursive: true });
          NodeFS.copyFileSync(NodePath.join(path, file), target);
        }
        if (components.has(key)) continue;
        const purl = `pkg:npm/${name.split("/").map(encodeURIComponent).join("/")}@${encodeURIComponent(version)}`;
        components.set(key, {
          type: "library",
          "bom-ref": purl,
          name,
          version,
          purl,
          licenses: [{ license: { name: license } }],
          properties: [
            {
              name: "automorphic:notice-directory",
              value: `packages/${destination.split(/[\\/]/).at(-1)}`,
            },
          ],
        });
        if (needsLicenseReview(license) || files.length === 0) {
          review.push({
            name,
            version,
            license,
            reasons: [
              ...(needsLicenseReview(license)
                ? ["Review license obligations; metadata is not permission to redistribute."]
                : []),
              ...(files.length === 0
                ? [
                    path
                      ? "No packaged license/notice file found; obtain it from the exact upstream release."
                      : "Package is listed by pnpm but is not installed on this host; collect its notices on the target build host.",
                  ]
                : []),
            ],
          });
        }
      }
    }
  }
  if (components.size === 0) throw new Error("No installed packages found in license report.");
  const sorted = [...components.values()].sort((a, b) => a["bom-ref"].localeCompare(b["bom-ref"]));
  const sbom = { bomFormat: "CycloneDX", specVersion: "1.6", version: 1, components: sorted };
  NodeFS.writeFileSync(
    NodePath.join(output, "sbom.cdx.json"),
    JSON.stringify(sbom, null, 2) + "\n",
  );
  review.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
  NodeFS.writeFileSync(
    NodePath.join(output, "review-required.json"),
    JSON.stringify(review, null, 2) + "\n",
  );
  return { components: components.size, review: review.length };
}

if (
  process.argv[1] &&
  import.meta.url === NodeURL.pathToFileURL(NodePath.resolve(process.argv[1])).href
) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw new Error(
      "Usage: node scripts/license-bundle.mjs <pnpm-license-report.json> <output-directory>",
    );
  const result = createLicenseBundle(
    JSON.parse(NodeFS.readFileSync(input, "utf8")),
    NodePath.resolve(output),
  );
  console.log(
    `Inventoried ${result.components} dependency versions; ${result.review} require review.`,
  );
  console.log(
    "Review the generated report before redistribution. This is not a legal clearance or a complete native-binary inventory.",
  );
}
