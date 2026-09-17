import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { HtmlDocumentPreview } from "./HtmlDocumentPreview";

let renderer: ReactTestRenderer | undefined;
afterEach(() => {
  if (renderer) act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe("HTML document preview loading", () => {
  it("shows an actionable error for a failed asset instead of rendering the error response", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    await act(async () => {
      renderer = create(
        <HtmlDocumentPreview src="https://example.test/asset/index.html" title="Report" />,
      );
    });
    expect(renderer!.root.findAllByType("iframe")).toHaveLength(0);
    expect(renderer!.root.findByProps({ role: "alert" }).findByType("p").children).toEqual([
      "Unable to load this preview.",
    ]);
    await act(async () => renderer!.root.findByType("button").props.onClick());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("cancels the previous file request when another report is selected", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        signals.push(options.signal);
        return new Promise(() => {});
      }),
    );
    await act(async () => {
      renderer = create(
        <HtmlDocumentPreview src="https://example.test/first.html" title="First" />,
      );
    });
    await act(async () => {
      renderer!.update(
        <HtmlDocumentPreview src="https://example.test/second.html" title="Second" />,
      );
    });
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    act(() => renderer!.unmount());
    expect(signals[1]?.aborted).toBe(true);
    renderer = undefined;
  });
});
