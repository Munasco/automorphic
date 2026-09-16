import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { describe, expect, it, vi } from "vite-plus/test";
import { createTradingWorkspaceStorage, createTradingWorkspaceRouter } from "./workspaceStorage";
import { createDrawingAlertSession, DRAWING_ALERTS_KEY } from "./drawingAlerts";
import type { ChartDrawing } from "./drawingGeometry";

import { CHART_ALERT_SORT_KEY, readChartAlertSort, writeChartAlertSort } from "./chartAlertSort";

import {
  CHART_DATA_TABLE_SORT_KEY,
  readChartDataTableSort,
  writeChartDataTableSort,
} from "./chartDataTable";

import {
  CHART_DATE_NAVIGATION_KEY,
  readChartNavigationTime,
  writeChartNavigationTime,
} from "./chartDateNavigation";

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
  it("persists per-symbol navigation dates through workspace storage and restores after reload", async () => {
    const values: Record<string, string> = {};
    const request = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(init.body as string) as { key: string; value: string };
        values[body.key] = body.value;
        return json({});
      }
      return json(payload(values));
    });
    const first = createTradingWorkspaceStorage(request, () => undefined);
    await first.initialize();
    writeChartNavigationTime(first, "NQU6", 1789128000.125);
    await first.flush();
    expect(values).toEqual({ [CHART_DATE_NAVIGATION_KEY]: '{"times":{"NQU6":1789128000.125}}' });
    const reopened = createTradingWorkspaceStorage(request, () => undefined);
    await reopened.initialize();
    expect(readChartNavigationTime(reopened, "NQU6")).toBe(1789128000.125);
    expect(readChartNavigationTime(reopened, "SIU6")).toBeNull();
  });

  it("persists replay bookmarks through the request queue and restores them after reopening", async () => {
    const values: Record<string, string> = {};
    const key = "automorphic:replay-bookmarks:v1";
    const value = JSON.stringify({
      state: { bookmarks: [{ id: "open", scope: "NQU6:5m", name: "Open", time: 1789128000 }] },
      version: 0,
    });
    const request = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(init.body as string) as { key: string; value: string };
        values[body.key] = body.value;
        return json({});
      }
      return json(payload(values));
    });
    const first = createTradingWorkspaceStorage(request, () => undefined);
    await first.initialize();
    first.setItem(key, value);
    await first.flush();
    expect(values).toEqual({ [key]: value });
    const reopened = createTradingWorkspaceStorage(request, () => undefined);
    await reopened.initialize();
    expect(reopened.getItem(key)).toBe(value);
  });

  it("loads and transports chart templates through workspace storage", async () => {
    const key = "automorphic:chart-templates:v1";
    const value = JSON.stringify({
      state: {
        templates: [
          { id: "chart-one", name: "Morning", settings: { style: "candles", extraIndicators: [] } },
        ],
      },
      version: 0,
    });
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(payload({ [key]: value })))
      .mockResolvedValue(json({}));
    const store = createTradingWorkspaceStorage(request, () => undefined);
    await store.initialize();
    expect(store.getItem(key)).toBe(value);
    const updated = JSON.stringify({ state: { templates: [] }, version: 0 });
    store.setItem(key, updated);
    await store.flush();
    expect(JSON.parse(request.mock.calls[1]![1]!.body as string)).toEqual({ key, value: updated });
  });

  it("transports table ordering as JSON and restores it after reopening workspace storage", async () => {
    const values: Record<string, string> = {};
    const request = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(init.body as string) as { key: string; value: string };
        values[body.key] = body.value;
        return json({});
      }
      return json(payload(values));
    });
    const first = createTradingWorkspaceStorage(request, () => undefined);
    await first.initialize();
    writeChartDataTableSort(first, { field: "volume", direction: "asc" });
    await first.flush();
    expect(values).toEqual({ [CHART_DATA_TABLE_SORT_KEY]: '{"field":"volume","direction":"asc"}' });
    const reopened = createTradingWorkspaceStorage(request, () => undefined);
    await reopened.initialize();
    expect(readChartDataTableSort(reopened)).toEqual({ field: "volume", direction: "asc" });
    expect(request.mock.calls.filter((call) => call[1]?.method === "PUT")).toHaveLength(1);
  });

  it("loads custom palettes and keeps their writes scoped to the originating workspace", async () => {
    const key = "automorphic:drawing-custom-colors:v1";
    const palette = (color: string) => JSON.stringify({ state: { colors: [color] }, version: 0 });
    const values: Record<string, Record<string, string>> = {
      first: { [key]: palette("#112233") },
      second: { [key]: palette("#abcdef") },
    };
    const request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const id = new URL(String(input), "http://localhost").searchParams.get("projectId")!;
      if (init?.method === "PUT") {
        const body = JSON.parse(init.body as string) as { key: string; value: string };
        values[id]![body.key] = body.value;
        return json({});
      }
      return json({ ...payload(values[id]), projectId: id });
    });
    const router = createTradingWorkspaceRouter(request);
    await router.selectProject("first");
    expect(router.getSnapshot().ready).toBe(true);
    expect(router.getItem(key)).toBe(palette("#112233"));
    const first = router.capture();
    await router.selectProject("second");
    expect(router.getItem(key)).toBe(palette("#abcdef"));
    first.setItem(key, palette("#445566"));
    await first.flush();
    expect(router.getItem(key)).toBe(palette("#abcdef"));
    const writes = request.mock.calls.filter((call) => call[1]?.method === "PUT");
    expect(writes).toHaveLength(1);
    expect(String(writes[0]![0])).toContain("projectId=first");
    expect(JSON.parse(writes[0]![1]!.body as string)).toEqual({ key, value: palette("#445566") });
    await router.selectProject("first");
    expect(router.getItem(key)).toBe(palette("#445566"));
  });

  it("loads and saves remembered drawing appearance through workspace storage", async () => {
    const key = "automorphic:drawing-defaults:v1";
    const saved = JSON.stringify({ trend: { color: "#2962ff", width: 2 } });
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(payload({ [key]: saved })))
      .mockResolvedValue(json({}));
    const store = createTradingWorkspaceStorage(request, () => undefined);
    await store.initialize();
    expect(store.getSnapshot().ready).toBe(true);
    expect(store.getItem(key)).toBe(saved);
    const changed = JSON.stringify({ trend: { color: "#ff0000", width: 3 } });
    store.setItem(key, changed);
    await store.flush();
    expect(JSON.parse(request.mock.calls[1]![1]!.body as string)).toEqual({ key, value: changed });
  });

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
  it("persists alert sorting through the router and restores each workspace after reload", async () => {
    const values: Record<string, Record<string, string>> = { first: {}, second: {} };
    const request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const projectId = new URL(String(input), "http://localhost").searchParams.get("projectId")!;
      if (init?.method === "PUT") {
        const body = JSON.parse(init.body as string) as { key: string; value: string };
        values[projectId]![body.key] = body.value;
        return json({});
      }
      return json({ ...payload(values[projectId]), projectId });
    });
    const router = createTradingWorkspaceRouter(request);
    await router.selectProject("first");
    expect(readChartAlertSort(router)).toBe("newest");
    writeChartAlertSort(router, "name");
    await router.capture().flush();
    expect(values.first).toEqual({ [CHART_ALERT_SORT_KEY]: '{"sort":"name"}' });
    await router.selectProject("second");
    expect(readChartAlertSort(router)).toBe("newest");
    writeChartAlertSort(router, "message");
    await router.capture().flush();
    const reloaded = createTradingWorkspaceRouter(request);
    await reloaded.selectProject("first");
    expect(readChartAlertSort(reloaded)).toBe("name");
    await reloaded.selectProject("second");
    expect(readChartAlertSort(reloaded)).toBe("message");
    const writes = request.mock.calls.filter((call) => call[1]?.method === "PUT");
    expect(writes).toHaveLength(2);
  });

  it("restores drawing alerts and trigger history after a reload without leaking a captured session into another workspace", async () => {
    const values: Record<string, Record<string, string>> = { first: {}, second: {} };
    const request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const projectId = new URL(String(input), "http://localhost").searchParams.get("projectId")!;
      if (init?.method === "PUT") {
        const body = JSON.parse(init.body as string) as { key: string; value: string };
        values[projectId]![body.key] = body.value;
        return json({});
      }
      return json({ ...payload(values[projectId]), projectId });
    });
    const router = createTradingWorkspaceRouter(request);
    await router.selectProject("first");
    const captured = router.capture();
    const drawing: ChartDrawing = {
      id: "line",
      kind: "horizontal",
      anchors: [{ time: 1 as ChartDrawing["anchors"][number]["time"], price: 100 }],
      color: "#2962ff",
      width: 2,
    };
    let time = Date.parse("2026-09-11T12:00:00Z");
    let nextId = 0;
    const options = {
      now: () => time,
      id: () => `alert-${++nextId}`,
      projection: {
        logicalAt: () => 0,
        priceToCoordinate: (price: number) => -price,
        coordinateToPrice: (coordinate: number) => -coordinate,
      },
    };
    const context = { symbol: "NQU6", intervalKey: "minute:5" };
    const session = createDrawingAlertSession(context, captured, options);
    session.syncDrawings([drawing]);
    const alert = session.add({
      drawingId: drawing.id,
      condition: "crossing-up",
      trigger: "once",
      expiresAt: null,
      name: "NQ breakout",
      message: "Price crossed the opening level",
      notifications: { toast: true, sound: false, desktop: false },
    });
    expect(alert).not.toBeNull();
    await captured.flush();
    await router.selectProject("second");
    for (const price of [99, 101]) {
      session.observe({
        ...context,
        source: "quote",
        timestamp: ++time,
        barId: "bar-1",
        logical: 0,
        price,
      });
    }
    await captured.flush();
    const triggered = session.getSnapshot();
    expect(triggered.alerts[0]).toMatchObject({ enabled: false, disabledReason: "triggered" });
    expect(triggered.history).toHaveLength(1);
    expect(router.getItem(DRAWING_ALERTS_KEY)).toBeNull();
    expect(values.second).toEqual({});
    session.dispose();

    // A new router forces a server read instead of using the old in-memory workspace cache.
    const reopened = createTradingWorkspaceRouter(request);
    await reopened.selectProject("first");
    const restored = createDrawingAlertSession(context, reopened.capture(), options);
    restored.syncDrawings([drawing]);
    expect(restored.getSnapshot()).toEqual(triggered);
    expect(restored.setEnabled(alert!.id, true)).toBe(true);
    await reopened.flush();
    await reopened.selectProject("second");
    expect(reopened.getItem(DRAWING_ALERTS_KEY)).toBeNull();
    expect(values.second).toEqual({});
    restored.dispose();
  });

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

  it("hydrates saved alerts and keeps a captured chart session in its original workspace", async () => {
    const alertKey = "automorphic:chart-alerts:v1";
    const saved = JSON.stringify({ version: 1, alerts: [], history: [] });
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ ...payload({ [alertKey]: saved }), projectId: "A" }))
      .mockResolvedValueOnce(json({ ...payload(), projectId: "B" }))
      .mockResolvedValue(json({}));
    const router = createTradingWorkspaceRouter(request);
    await router.selectProject("A");
    const captured = router.capture();
    expect(captured.getItem(alertKey)).toBe(saved);
    await router.selectProject("B");
    captured.setItem(alertKey, '{"version":1,"alerts":[],"history":[{"id":"trigger"}]}');
    await captured.flush();
    expect(router.getItem(alertKey)).toBeNull();
    expect(request.mock.calls.at(-1)?.[0]).toBe("/api/trading/workspace?projectId=A");
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

it("persists an alert status filter through workspace storage and reload", async () => {
  const key = "automorphic:chart-alert-filter:v1";
  const values: Record<string, string> = {};
  const request = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
    if (init?.method === "PUT") {
      const body = JSON.parse(init.body as string) as { key: string; value: string };
      values[body.key] = body.value;
      return json({});
    }
    return json(payload(values));
  });
  const first = createTradingWorkspaceStorage(request, () => undefined);
  await first.initialize();
  first.setItem(key, '{"status":"Paused"}');
  await first.flush();
  expect(values).toEqual({ [key]: '{"status":"Paused"}' });
  const reopened = createTradingWorkspaceStorage(request, () => undefined);
  await reopened.initialize();
  expect(reopened.getItem(key)).toBe('{"status":"Paused"}');
});
