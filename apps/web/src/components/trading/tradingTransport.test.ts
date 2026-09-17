import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { __resetDesktopPrimaryAuthForTests } from "../../environments/primary/desktopAuth";
import { createTradingWorkspaceStorage } from "./workspaceStorage";
import { openTradingStream, tradingFetch, type TradingStreamFailure } from "./tradingTransport";

function desktop() {
  vi.stubGlobal("window", {
    location: { href: "t3code://app/#/environment/thread", origin: "t3code://app" },
    desktopBridge: {
      getLocalEnvironmentBootstraps: () => [
        {
          id: "primary",
          label: "Local",
          httpBaseUrl: "http://127.0.0.1:4567",
          wsBaseUrl: "ws://127.0.0.1:4567",
        },
      ],
      getLocalEnvironmentBearerToken: async () => "test-desktop-session",
    },
  });
}
afterEach(() => {
  __resetDesktopPrimaryAuthForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("trading transport", () => {
  it("loads and saves a packaged desktop workspace using its authenticated HTTP backend", async () => {
    desktop();
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          projectId: "project-A",
          title: "My workspace",
          retentionHours: 168,
          values: {},
        }),
      ),
    );
    vi.stubGlobal("fetch", request);
    const workspace = createTradingWorkspaceStorage(undefined, () => undefined, "project-A");
    await workspace.initialize();
    expect(workspace.getSnapshot().ready).toBe(true);
    request.mockResolvedValue(new Response(JSON.stringify({ saved: true })));
    workspace.setItem("automorphic:chart:v1", "saved-settings");
    await workspace.flush();
    expect(request).toHaveBeenCalledTimes(2);
    for (const [url, init] of request.mock.calls) {
      expect(url).toBe("http://127.0.0.1:4567/api/trading/workspace?projectId=project-A");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-desktop-session");
      expect(init?.credentials).toBe("omit");
    }
    expect(request.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(request.mock.calls[1]?.[1]?.body).toContain("saved-settings");
  });

  it("keeps browser cookie auth, encoded queries, caller headers and cancellation", async () => {
    vi.stubGlobal("window", {
      location: { href: "http://localhost:5733/thread", origin: "http://localhost:5733" },
    });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", request);
    const abort = new AbortController();
    await tradingFetch("/api/trading/contracts?root=MGC&symbol=A%2FB", {
      signal: abort.signal,
      headers: { Accept: "application/json" },
    });
    expect(request.mock.calls[0]?.[0]).toBe(
      "http://localhost:5733/api/trading/contracts?root=MGC&symbol=A%2FB",
    );
    const init = request.mock.calls[0]?.[1];
    expect(init?.credentials).toBe("include");
    expect(init?.signal).toBe(abort.signal);
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
  });

  it("does not forward the app bearer to an arbitrary URL", async () => {
    desktop();
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(tradingFetch("https://example.com/api/trading/account")).rejects.toThrow(
      "Invalid trading endpoint",
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("streams authenticated SSE with split UTF-8/CRLF frames and cancels without reconnecting", async () => {
    desktop();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
      cancel,
    });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    vi.stubGlobal("fetch", request);
    const onMessage = vi.fn();
    const onError = vi.fn();
    const stream = openTradingStream("/api/trading/stream?symbol=MGCZ6&interval=15", {
      onMessage,
      onError,
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    const frame = new TextEncoder().encode(
      ': heartbeat\r\n\r\ndata: {"message":"€"}\r\n\r\ndata: one\r\ndata: two\r\n\r\n',
    );
    for (const byte of frame) controller.enqueue(new Uint8Array([byte]));
    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledTimes(2));
    expect(onMessage.mock.calls.map(([data]) => data)).toEqual(['{"message":"€"}', "one\ntwo"]);
    expect(new Headers(request.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer test-desktop-session",
    );
    stream.close();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
    expect(onError).not.toHaveBeenCalled();
    expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it.each([401, 403, 502, 503, 504])(
    "reports HTTP %i without forwarding broker HTML or response details",
    async (status) => {
      const request = vi.fn<typeof fetch>().mockResolvedValue(
        new Response("<html>Temporary error: internal upstream detail</html>", {
          status,
          headers: { "Content-Type": "text/html" },
        }),
      );
      const onMessage = vi.fn();
      let stream: ReturnType<typeof openTradingStream>;
      const failure = await new Promise<TradingStreamFailure | undefined>((resolve) => {
        stream = openTradingStream("/api/trading/stream", { onMessage, onError: resolve }, request);
      });
      expect(failure).toEqual({ kind: "http", status });
      expect(onMessage).not.toHaveBeenCalled();
      stream!.close();
    },
  );
  it("distinguishes a network failure without exposing the thrown request detail", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("private request detail"));
    let stream: ReturnType<typeof openTradingStream>;
    const failure = await new Promise<TradingStreamFailure | undefined>((resolve) => {
      stream = openTradingStream(
        "/api/trading/stream",
        { onMessage: vi.fn(), onError: resolve },
        request,
      );
    });
    expect(failure).toEqual({ kind: "network" });
    stream!.close();
  });
  it("reports stream HTTP failures so the existing chart reconnect loop can retry", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    const onError = vi.fn();
    const onMessage = vi.fn();
    const stream = openTradingStream("/api/trading/stream", { onMessage, onError }, request);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onMessage).not.toHaveBeenCalled();
    stream.close();
  });
});
