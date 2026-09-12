import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { describe, expect, it, vi } from "vite-plus/test";
import { createTradingWorkspaceStorage, createTradingWorkspaceRouter } from "./workspaceStorage";

const chartKey = "automorphic:chart:v1";
const settingsKey = "automorphic:trading-settings:v1";
const payload = (values: Record<string, string> = {}) => ({
  projectId: "trading",
  title: "My Trading Workspace",
  retentionHours: 24,
  values,
});
const json = (value: unknown) => new Response(JSON.stringify(value));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function legacyStorage(values: Record<string, string>) {
  return {
    length: Object.keys(values).length,
    key: (index: number) => Object.keys(values)[index] ?? null,
    getItem: (key: string) => values[key] ?? null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
}

describe("trading workspace persistence", () => {
  it("hydrates before becoming ready and imports only absent server values", async () => {
    const legacy = legacyStorage({
      [chartKey]: "old chart",
      [settingsKey]: "legacy settings",
      unrelated: "private",
    });
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(payload({ [chartKey]: "server chart" })))
      .mockResolvedValue(json({}));
    const store = createTradingWorkspaceStorage(request, () => legacy);
    const hydration = deferred<void>();
    store.registerHydrator(async () => {
      expect(store.getItem(chartKey)).toBe("server chart");
      expect(store.getItem(settingsKey)).toBe("legacy settings");
      expect(store.getSnapshot().ready).toBe(false);
      await hydration.promise;
    });
    const initialized = store.initialize();
    hydration.resolve();
    await initialized;
    expect(store.getSnapshot()).toMatchObject({ ready: true, retentionHours: 24, error: null });
    expect(request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(request.mock.calls[1]![1]!.body as string)).toEqual({
      key: settingsKey,
      value: "legacy settings",
    });
    expect(legacy.removeItem).not.toHaveBeenCalled();
  });

  it("does not hydrate defaults or write anything after a failed load, then retries", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(Error("Offline"))
      .mockResolvedValue(json(payload({ [chartKey]: "saved" })));
    const store = createTradingWorkspaceStorage(request, () => undefined);
    const hydrate = vi.fn();
    store.registerHydrator(hydrate);
    await store.initialize();
    expect(store.getSnapshot()).toMatchObject({ ready: false, error: "Offline" });
    expect(hydrate).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
    await store.initialize();
    expect(store.getItem(chartKey)).toBe("saved");
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().ready).toBe(true);
  });

  it("shares one initialization and preserves an edit made while loading", async () => {
    const response = deferred<Response>();
    const request = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(response.promise)
      .mockResolvedValue(json({}));
    const store = createTradingWorkspaceStorage(request, () => undefined);
    const first = store.initialize();
    expect(store.initialize()).toBe(first);
    store.setItem(chartKey, "new edit");
    response.resolve(json(payload({ [chartKey]: "older server value" })));
    await first;
    expect(store.getItem(chartKey)).toBe("new edit");
    expect(JSON.parse(request.mock.calls[1]![1]!.body as string)).toEqual({
      key: chartKey,
      value: "new edit",
    });
  });

  it("serializes saves and coalesces edits without losing the newest value", async () => {
    const firstSave = deferred<Response>();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(payload()))
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValue(json({}));
    const store = createTradingWorkspaceStorage(request, () => undefined);
    await store.initialize();
    store.setItem(chartKey, "one");
    store.setItem(chartKey, "two");
    store.setItem(chartKey, "three");
    expect(request).toHaveBeenCalledTimes(2);
    firstSave.resolve(json({}));
    await store.flush();
    expect(request).toHaveBeenCalledTimes(3);
    expect(JSON.parse(request.mock.calls[2]![1]!.body as string)).toEqual({
      key: chartKey,
      value: "three",
    });
    expect(store.getSnapshot()).toMatchObject({ saving: false, error: null });
  });

  it("keeps unsaved data after a failed PUT and retries it without rehydrating", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(payload()))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValue(json({}));
    const store = createTradingWorkspaceStorage(request, () => undefined);
    const hydrate = vi.fn();
    store.registerHydrator(hydrate);
    await store.initialize();
    store.setItem(chartKey, "unsaved drawing");
    await store.flush();
    expect(store.getItem(chartKey)).toBe("unsaved drawing");
    expect(store.getSnapshot().error).toBeTruthy();
    await store.initialize();
    expect(store.getSnapshot().error).toBeNull();
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[2]![1]!.body as string)).toEqual({
      key: chartKey,
      value: "unsaved drawing",
    });
  });

  it("persists the latest retention choice without touching saved preferences", async () => {
    const response = deferred<Response>();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(payload({ [chartKey]: "chart" })))
      .mockReturnValueOnce(response.promise)
      .mockResolvedValue(json({}));
    const store = createTradingWorkspaceStorage(request, () => undefined);
    await store.initialize();
    store.setRetentionHours(168);
    store.setRetentionHours(24);
    response.resolve(json({}));
    await store.flush();
    expect(
      request.mock.calls
        .slice(1)
        .map((call) => [call[1]?.method, JSON.parse(call[1]?.body as string)]),
    ).toEqual([
      ["PATCH", { retentionHours: 168 }],
      ["PATCH", { retentionHours: 24 }],
    ]);
    expect(store.getItem(chartKey)).toBe("chart");
    expect(store.getSnapshot().retentionHours).toBe(24);
  });
});

describe("project-scoped trading storage", () => {
  it.each([true, false])(
    "imports legacy preferences into an explicitly selected default workspace only (default=%s)",
    async (isDefault) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({ ...payload(), projectId: "selected", isDefault }))
        .mockResolvedValue(json({}));
      const store = createTradingWorkspaceStorage(
        request,
        () => legacyStorage({ [chartKey]: "legacy chart" }),
        "selected",
      );
      await store.initialize();
      expect(store.getItem(chartKey)).toBe(isDefault ? "legacy chart" : null);
      expect(request).toHaveBeenCalledTimes(isDefault ? 2 : 1);
    },
  );

  it("switches hydration to the selected project and ignores a late previous response", async () => {
    const a = deferred<Response>();
    const request = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(a.promise)
      .mockResolvedValueOnce(json({ ...payload({ [chartKey]: "B chart" }), projectId: "B" }));
    const router = createTradingWorkspaceRouter(request);
    const hydrated: Array<string | null> = [];
    router.registerHydrator(() => {
      hydrated.push(router.getItem(chartKey));
    });
    const openingA = router.selectProject("A");
    const openingB = router.selectProject("B");
    await openingB;
    a.resolve(json({ ...payload({ [chartKey]: "A chart" }), projectId: "A" }));
    await openingA;
    expect(hydrated).toEqual(["B chart"]);
    expect(router.getSnapshot()).toMatchObject({ ready: true, projectId: "B" });
    expect(router.getItem(chartKey)).toBe("B chart");
    await router.selectProject("A");
    expect(router.getItem(chartKey)).toBe("A chart");
  });

  it("keeps queued writes attached to their original project across a switch", async () => {
    const savingA = deferred<Response>();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ ...payload(), projectId: "A" }))
      .mockReturnValueOnce(savingA.promise)
      .mockResolvedValueOnce(json({ ...payload(), projectId: "B" }))
      .mockResolvedValue(json({}));
    const router = createTradingWorkspaceRouter(request);
    await router.selectProject("A");
    router.setItem(chartKey, "A first");
    router.setItem(chartKey, "A newest");
    const saving = router.flush();
    await router.selectProject("B");
    router.setItem(chartKey, "B edit");
    await router.flush();
    savingA.resolve(json({}));
    await saving;
    const puts = request.mock.calls
      .filter(([, options]) => options?.method === "PUT")
      .map(([url, options]) => [url, JSON.parse(options!.body as string).value]);
    expect(puts).toEqual([
      ["/api/trading/workspace?projectId=A", "A first"],
      ["/api/trading/workspace?projectId=B", "B edit"],
      ["/api/trading/workspace?projectId=A", "A newest"],
    ]);
    expect(router.getItem(chartKey)).toBe("B edit");
  });

  it("does not save reset defaults while hydrating a workspace with no saved key", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ ...payload({ [chartKey]: "saved A" }), projectId: "A" }))
      .mockResolvedValueOnce(json({ ...payload(), projectId: "B" }));
    const router = createTradingWorkspaceRouter(request);
    let visible = "default";
    router.registerHydrator(() => {
      visible = "default";
      router.setItem(chartKey, "default");
      visible = router.getItem(chartKey) ?? visible;
    });
    await router.selectProject("A");
    expect(visible).toBe("saved A");
    await router.selectProject("B");
    expect(visible).toBe("default");
    expect(request).toHaveBeenCalledTimes(2);
    expect(router.getItem(chartKey)).toBeNull();
  });
});

describe("Zustand workspace hydration", () => {
  it("shows a retryable error if the server returns a different workspace", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ ...payload(), projectId: "wrong" }));
    const router = createTradingWorkspaceRouter(request);
    await router.selectProject("wanted");
    expect(router.getSnapshot()).toMatchObject({ projectId: "wanted", ready: false });
    expect(router.getSnapshot().error).toContain("different workspace");
  });
  it("finishes loading the requested server project with real persisted stores, even while migrated writes are pending", async () => {
    const projectId = "requested-project";
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        ...payload({ [chartKey]: JSON.stringify({ state: { style: "area" }, version: 0 }) }),
        projectId,
      }),
    );
    const router = createTradingWorkspaceRouter(request);
    const preferences = create<{ style: string }>()(
      persist(() => ({ style: "candles" }), {
        name: chartKey,
        skipHydration: true,
        storage: createJSONStorage(() => router),
      }),
    );
    router.registerHydrator(() => {
      preferences.setState(preferences.getInitialState(), true);
      return preferences.persist.rehydrate();
    });
    await router.selectProject(projectId);
    expect(router.getSnapshot()).toMatchObject({ projectId, ready: true, error: null });
    expect(preferences.getState().style).toBe("area");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("exposes loaded values without waiting for legacy import writes to finish", async () => {
    const pendingSave = deferred<Response>();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ ...payload(), isDefault: true }))
      .mockReturnValueOnce(pendingSave.promise);
    const store = createTradingWorkspaceStorage(request, () =>
      legacyStorage({ [chartKey]: "imported" }),
    );
    await store.initialize();
    expect(store.getSnapshot()).toMatchObject({ ready: true, saving: true });
    expect(store.getItem(chartKey)).toBe("imported");
    pendingSave.resolve(json({}));
    await store.flush();
  });
});
