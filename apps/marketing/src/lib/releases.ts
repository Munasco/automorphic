export const RELEASES_REPO = "Munasco/automorphic-releases";
export const RELEASES_URL = `https://github.com/${RELEASES_REPO}/releases`;

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}
export interface Release {
  tag_name: string;
  html_url: string;
  published_at: string;
  assets: ReleaseAsset[];
}
export type DownloadPlatform = "mac" | "windows" | "linux";

export function detectPlatform(userAgent: string): DownloadPlatform | null {
  if (/Android|iPhone|iPad|iPod/i.test(userAgent)) return null;
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "mac";
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Linux/i.test(userAgent)) return "linux";
  return null;
}

export function downloadLabel(name: string): { platform: DownloadPlatform; label: string } | null {
  if (!/^Automorphic[-.]/i.test(name)) return null;
  const arch = /(?:arm64|aarch64)/i.test(name)
    ? "ARM64"
    : /(?:x64|x86_64|amd64)/i.test(name)
      ? "Intel / AMD"
      : /universal/i.test(name)
        ? "Universal"
        : null;
  if (/\.dmg$/i.test(name))
    return {
      platform: "mac",
      label: `macOS${arch ? ` · ${arch === "ARM64" ? "Apple silicon" : arch === "Intel / AMD" ? "Intel" : arch}` : ""}`,
    };
  if (/\.exe$/i.test(name))
    return { platform: "windows", label: `Windows${arch ? ` · ${arch}` : ""}` };
  if (/\.(AppImage|deb|rpm)$/i.test(name))
    return {
      platform: "linux",
      label: `Linux${arch ? ` · ${arch}` : ""} · ${name.split(".").at(-1)}`,
    };
  return null;
}

export async function fetchLatestRelease(): Promise<Release | null> {
  const response = await fetch(
    `https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=10`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!response.ok) throw new Error("Downloads are temporarily unavailable");
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("Invalid release response");
  const prefix = `${RELEASES_URL}/download/`;
  const release = data.find(
    (r) =>
      !r.draft &&
      typeof r.tag_name === "string" &&
      Array.isArray(r.assets) &&
      r.assets.some(
        (a: ReleaseAsset) =>
          typeof a.name === "string" &&
          typeof a.browser_download_url === "string" &&
          a.browser_download_url.startsWith(prefix) &&
          downloadLabel(a.name),
      ),
  );
  if (!release) return null;
  return {
    ...release,
    assets: release.assets.filter(
      (a: ReleaseAsset) =>
        typeof a.name === "string" &&
        typeof a.browser_download_url === "string" &&
        a.browser_download_url.startsWith(prefix) &&
        downloadLabel(a.name),
    ),
  };
}
