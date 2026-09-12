import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { detectPlatform, downloadLabel, fetchLatestRelease, RELEASES_URL } from "./releases";
afterEach(() => vi.unstubAllGlobals());
describe("Automorphic desktop downloads", () => {
  it("detects desktop systems without suggesting a phone installer", () => {
    expect(detectPlatform("Mozilla Macintosh Mac OS X")).toBe("mac");
    expect(detectPlatform("Mozilla Windows NT 10.0")).toBe("windows");
    expect(detectPlatform("Mozilla X11 Linux x86_64")).toBe("linux");
    expect(detectPlatform("Mozilla Android Linux")).toBeNull();
    expect(detectPlatform("Mozilla iPhone Mac OS X")).toBeNull();
  });
  it("labels installers and excludes updater and unrelated assets", () => {
    expect(downloadLabel("Automorphic-1.0-arm64.dmg")).toEqual({
      platform: "mac",
      label: "macOS · Apple silicon",
    });
    expect(downloadLabel("Automorphic-1.0-x64.exe")?.platform).toBe("windows");
    expect(downloadLabel("Automorphic-1.0-x86_64.AppImage")?.platform).toBe("linux");
    for (const name of [
      "T3-Code-arm64.dmg",
      "Automorphic-arm64.dmg.blockmap",
      "latest.yml",
      "Automorphic-debug.zip",
    ])
      expect(downloadLabel(name)).toBeNull();
  });
  it("only exposes installers from the public Automorphic release repository", async () => {
    const good = {
      name: "Automorphic-arm64.dmg",
      browser_download_url: `${RELEASES_URL}/download/v1/Automorphic-arm64.dmg`,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            { draft: true, tag_name: "draft", assets: [good] },
            {
              draft: false,
              tag_name: "v1",
              assets: [
                good,
                { ...good, browser_download_url: "https://elsewhere.test/installer.dmg" },
                {
                  name: "latest.yml",
                  browser_download_url: `${RELEASES_URL}/download/v1/latest.yml`,
                },
              ],
            },
          ]),
        ),
      ),
    );
    const release = await fetchLatestRelease();
    expect(release?.tag_name).toBe("v1");
    expect(release?.assets).toEqual([good]);
  });
  it("handles an unpublished release and a failed API separately", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("[]"))
        .mockResolvedValueOnce(new Response("{}", { status: 403 })),
    );
    expect(await fetchLatestRelease()).toBeNull();
    await expect(fetchLatestRelease()).rejects.toThrow("temporarily unavailable");
  });
});
