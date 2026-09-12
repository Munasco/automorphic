import { tradingFetch } from "./tradingTransport";
import { useEffect, useSyncExternalStore } from "react";

const endpoint = "/api/trading/workspace";
const preferenceKeys = new Set([
  "automorphic:chart:v1",
  "automorphic:trading-settings:v1",
  "automorphic:trading:v1",
  "automorphic:chart-alerts:v1",
  "automorphic:drawing-controls:v1",
]);
const isWorkspaceKey = (key: string) =>
  preferenceKeys.has(key) || key.startsWith("automorphic:chart-drawings:v1:");
type Workspace = {
  projectId: string;
  isDefault?: boolean;
  title: string;
  retentionHours: 24 | 168;
  values: Record<string, string>;
};
type Snapshot = {
  projectId: string | null;
  ready: boolean;
  saving: boolean;
  error: string | null;
  title: string;
  retentionHours: 24 | 168;
};

function parseWorkspace(value: unknown): Workspace {
  if (!value || typeof value !== "object") throw Error("Invalid trading workspace.");
  const result = value as Partial<Workspace>;
  if (
    typeof result.projectId !== "string" ||
    typeof result.title !== "string" ||
    (result.retentionHours !== 24 && result.retentionHours !== 168) ||
    !result.values ||
    typeof result.values !== "object" ||
    Array.isArray(result.values) ||
    Object.entries(result.values).some(
      ([key, item]) => !isWorkspaceKey(key) || typeof item !== "string",
    )
  )
    throw Error("Invalid trading workspace.");
  return result as Workspace;
}

/** Server-owned preferences; legacy browser values are imported only into missing server keys. */
export function createTradingWorkspaceStorage(
  request: typeof fetch = tradingFetch,
  legacy: () => Storage | undefined = () => {
    try {
      return globalThis.localStorage;
    } catch {
      return undefined;
    }
  },
  projectId: string | null = null,
) {
  const workspaceEndpoint = projectId
    ? `${endpoint}?projectId=${encodeURIComponent(projectId)}`
    : endpoint;
  let snapshot: Snapshot = {
    projectId,
    ready: false,
    saving: false,
    error: null,
    title: "My workspace",
    retentionHours: 168,
  };
  const values = new Map<string, string>();
  const pending = new Map<string, string>();
  const listeners = new Set<() => void>();
  const hydrators = new Set<() => void | Promise<void>>();
  let initialization: Promise<void> | undefined;
  let flushing: Promise<void> | undefined;
  let loaded = false;
  let retentionPending: 24 | 168 | undefined;
  const update = (patch: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  const send = async (method: string, body?: unknown) => {
    const response = await request(workspaceEndpoint, {
      method,
      credentials: "same-origin",
      signal: AbortSignal.timeout(20_000),
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    if (!response.ok) throw Error("Trading workspace could not sync. Retry to save your changes.");
    return response;
  };
  const flush = (): Promise<void> => {
    if (flushing) return flushing;
    if (!loaded || (!pending.size && retentionPending === undefined)) return Promise.resolve();
    update({ saving: true, error: null });
    flushing = (async () => {
      try {
        while (pending.size || retentionPending !== undefined) {
          const entry = pending.entries().next().value;
          if (entry) {
            const [key, value] = entry;
            await send("PUT", { key, value });
            // A new edit may arrive while the previous value is being saved.
            if (pending.get(key) === value) pending.delete(key);
          } else if (retentionPending !== undefined) {
            const retentionHours = retentionPending;
            await send("PATCH", { retentionHours });
            if (retentionPending === retentionHours) retentionPending = undefined;
          }
        }
      } catch (error) {
        update({
          error: error instanceof Error ? error.message : "Trading workspace could not sync.",
        });
      } finally {
        flushing = undefined;
        update({ saving: false });
      }
    })();
    return flushing;
  };
  const initialize = (): Promise<void> => {
    if (initialization) return initialization;
    if (loaded) return flush();
    update({ error: null });
    initialization = (async () => {
      try {
        const data = parseWorkspace(await (await send("GET")).json());
        if (projectId !== null && data.projectId !== projectId)
          throw Error("The server returned a different workspace. Retry to reconnect.");
        for (const [key, value] of Object.entries(data.values)) {
          if (!pending.has(key)) values.set(key, value);
        }
        try {
          const old = projectId === null || data.isDefault === true ? legacy() : undefined;
          if (old)
            for (let index = 0; index < old.length; index++) {
              const key = old.key(index);
              if (!key || !isWorkspaceKey(key) || values.has(key)) continue;
              const value = old.getItem(key);
              if (value === null) continue;
              values.set(key, value);
              pending.set(key, value);
            }
        } catch {
          /* Private browsing may prevent legacy storage access. */
        }
        await Promise.all([...hydrators].map((hydrate) => hydrate()));
        loaded = true;
        update({
          ready: true,
          title: data.title,
          retentionHours: retentionPending ?? data.retentionHours,
        });
        void flush();
      } catch (error) {
        update({
          error: error instanceof Error ? error.message : "Trading workspace could not load.",
        });
      } finally {
        initialization = undefined;
      }
    })();
    return initialization;
  };
  return {
    initialize,
    flush,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    registerHydrator: (hydrate: () => void | Promise<void>) => {
      hydrators.add(hydrate);
      if (loaded) void hydrate();
    },
    setRetentionHours: (retentionHours: 24 | 168) => {
      retentionPending = retentionHours;
      update({ retentionHours });
      void flush();
    },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (!isWorkspaceKey(key)) throw Error("Invalid trading preference key.");
      if (values.get(key) === value) return;
      values.set(key, value);
      pending.set(key, value);
      void flush();
    },
    removeItem: (key: string) => {
      // Persist's clearStorage is not used by the UI. A null JSON value restores defaults.
      values.set(key, "null");
      pending.set(key, "null");
      void flush();
    },
  };
}

/** One request queue per project; changing the visible project never retargets an in-flight save. */
export function createTradingWorkspaceRouter(request: typeof fetch = tradingFetch) {
  const stores = new Map<string | null, ReturnType<typeof createTradingWorkspaceStorage>>();
  const listeners = new Set<() => void>();
  const hydrators = new Set<() => void | Promise<void>>();
  let activeId: string | null = null;
  let hydratedId: string | null | undefined;
  let generation = 0;
  let hydrating = 0;
  let selection: Promise<void> | undefined;
  let unsubscribe: (() => void) | undefined;
  const storeFor = (id: string | null) => {
    let store = stores.get(id);
    if (!store) {
      store = createTradingWorkspaceStorage(request, undefined, id);
      stores.set(id, store);
    }
    return store;
  };
  let snapshot = storeFor(activeId).getSnapshot();
  const publish = () => {
    snapshot = {
      ...storeFor(activeId).getSnapshot(),
      ready: hydratedId === activeId && storeFor(activeId).getSnapshot().ready,
    };
    listeners.forEach((listener) => listener());
  };
  const selectProject = (projectId: string | null): Promise<void> => {
    if (activeId === projectId && selection) return selection;
    if (activeId === projectId && hydratedId === activeId) return storeFor(activeId).flush();
    activeId = projectId;
    hydratedId = undefined;
    const currentGeneration = ++generation;
    const selected = storeFor(projectId);
    unsubscribe?.();
    unsubscribe = selected.subscribe(publish);
    publish();
    selection = (async () => {
      await selected.initialize();
      if (currentGeneration !== generation || !selected.getSnapshot().ready) return;
      hydrating++;
      try {
        // Synchronous storage reads let Zustand replace each view before we expose the chart.
        await Promise.all([...hydrators].map((hydrate) => hydrate()));
        if (currentGeneration === generation) hydratedId = projectId;
      } finally {
        hydrating--;
        if (currentGeneration === generation) publish();
      }
    })().finally(() => {
      if (currentGeneration === generation) selection = undefined;
    });
    return selection;
  };
  return {
    selectProject,
    // Long-lived chart sessions must keep writing to the project they opened in.
    capture: () => storeFor(activeId),
    initialize: () => selectProject(activeId),
    flush: () => storeFor(activeId).flush(),
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    registerHydrator: (hydrate: () => void | Promise<void>) => {
      hydrators.add(hydrate);
      if (hydratedId === activeId) {
        hydrating++;
        Promise.resolve(hydrate()).finally(() => {
          hydrating--;
        });
      }
    },
    getItem: (key: string) => storeFor(activeId).getItem(key),
    setItem: (key: string, value: string) => {
      if (!hydrating) storeFor(activeId).setItem(key, value);
    },
    removeItem: (key: string) => {
      if (!hydrating) storeFor(activeId).removeItem(key);
    },
    setRetentionHours: (value: 24 | 168) => storeFor(activeId).setRetentionHours(value),
  };
}

export const tradingWorkspaceStorage = createTradingWorkspaceRouter();

export function useTradingWorkspace(projectId?: string | null) {
  const storage = tradingWorkspaceStorage;
  const state = useSyncExternalStore(storage.subscribe, storage.getSnapshot);
  useEffect(() => {
    const sync = () => {
      void (projectId === undefined ? storage.initialize() : storage.selectProject(projectId));
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
    };
    // A replacement store during development must initialize even when the project is unchanged.
  }, [projectId, storage]);
  return projectId === undefined || state.projectId === projectId
    ? state
    : { ...state, ready: false };
}
