import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

export function privatePaths(files) {
  return files.filter((file) => {
    const parts = file.replaceAll("\\", "/").split("/");
    const name = parts.at(-1);
    const vendorModuleFixture =
      /^\.repos\/alchemy-effect\/packages\/cloudflare-runtime\/src\/rolldown\/test\/fixtures\/(?:cloudflare-imports|module-resolution)\/node_modules\/@fixtures\/[^/]+\/[^/]+\.(?:js|json)$/.test(
        file,
      );
    return (
      (/^\.env(?:\.|$)/.test(name) && name !== ".env.example") ||
      /^(?:id_rsa|id_ed25519|\.npmrc|\.pypirc)$/.test(name) ||
      /\.(?:sqlite(?:3)?(?:-wal|-shm)?|db|p12|pfx|p8|keystore)$/i.test(name) ||
      parts.some((part) => [".automorphic", ".t3", ".vercel"].includes(part)) ||
      (parts.includes("node_modules") && !vendorModuleFixture) ||
      file.startsWith(".github/pr-assets/")
    );
  });
}

export function externalLocalDependencies(manifest, directory = ".", root = ".") {
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
  };
  return Object.entries(dependencies).filter(([, value]) => {
    if (typeof value !== "string" || !/^(?:file|link):/.test(value)) return false;
    const target = value.replace(/^(?:file|link):/, "");
    const fromRoot = NodePath.relative(NodePath.resolve(root), NodePath.resolve(directory, target));
    return (
      NodePath.isAbsolute(target) ||
      /^[A-Za-z]:[\\/]/.test(target) ||
      target.startsWith("~") ||
      fromRoot === ".." ||
      fromRoot.startsWith("../") ||
      fromRoot.startsWith("..\\") ||
      NodePath.isAbsolute(fromRoot)
    );
  });
}

export function checkSource(root) {
  const files = NodeChildProcess.execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
  const errors = privatePaths(files).map((file) => `Private/runtime file is tracked: ${file}`);
  for (const file of files.filter(
    (file) => file.endsWith("package.json") && !file.startsWith(".repos/"),
  )) {
    const manifest = JSON.parse(NodeFS.readFileSync(NodePath.resolve(root, file), "utf8"));
    for (const [name] of externalLocalDependencies(
      manifest,
      NodePath.dirname(NodePath.resolve(root, file)),
      root,
    )) {
      errors.push(`Machine-specific dependency in ${file}: ${name}`);
    }
  }
  for (const file of [
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    ".github/SECURITY.md",
  ]) {
    try {
      if (!NodeFS.readFileSync(NodePath.resolve(root, file), "utf8").trim())
        errors.push(`Empty release document: ${file}`);
    } catch {
      errors.push(`Missing release document: ${file}`);
    }
  }
  return { files: files.length, errors };
}

if (
  process.argv[1] &&
  import.meta.url === NodeURL.pathToFileURL(NodePath.resolve(process.argv[1])).href
) {
  const result = checkSource(process.cwd());
  for (const error of result.errors) console.error(error);
  console.log(
    `Checked ${result.files} tracked paths; ${result.errors.length} source-hygiene errors.`,
  );
  console.log("This check does not scan secret values or Git history. Run Gitleaks separately.");
  process.exitCode = result.errors.length ? 1 : 0;
}
