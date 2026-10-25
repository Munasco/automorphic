import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";
import { createDrawingAlertSession } from "./drawingAlerts";
import type { ChartDrawing } from "./drawingGeometry";
import type { ChartDrawingsController } from "./useChartDrawings";
import { useDrawingAlerts, type DrawingAlertsController } from "./useDrawingAlerts";

const workspace = vi.hoisted(() => {
  const values = new Map<string, string>();
  const snapshot = { projectId: "sound-test", ready: true };
  return {
    values,
    snapshot,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
  };
});
vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    subscribe: () => () => {},
    getSnapshot: () => workspace.snapshot,
    capture: () => workspace.storage,
  },
}));
vi.mock("./drawingPrimitive", () => ({
  drawingTimeCoordinate: (_chart: unknown, _series: unknown, time: Time) => Number(time),
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: vi.fn() } }));

const line: ChartDrawing = {
  id: "line",
  kind: "horizontal",
  color: "#2962ff",
  width: 2,
  anchors: [{ time: 1 as Time, price: 100 }],
};
const drawings = {
  objects: [line],
  getCommittedDrawings: () => [line],
} as unknown as ChartDrawingsController;
const chart = {
  timeScale: () => ({ coordinateToLogical: (x: number) => x }),
} as unknown as IChartApi;
const series = {
  priceToCoordinate: (price: number) => price,
  coordinateToPrice: (y: number) => y,
} as unknown as ISeriesApi<SeriesType>;
const interval = { unit: "minute", value: 5 } as const;
let controller: DrawingAlertsController;
let renderer: ReactTestRenderer | undefined;
let documentEvents: EventTarget;
let addListener: ReturnType<typeof vi.spyOn>;
let removeListener: ReturnType<typeof vi.spyOn>;
const contexts: FakeAudioContext[] = [];
class FakeAudioContext {
  state: AudioContextState = "suspended";
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  constructor() {
    contexts.push(this);
  }
}
function Chart({
  symbol = "NQU6",
  mounted = true,
  onController,
}: {
  symbol?: string;
  mounted?: boolean;
  onController?: (controller: DrawingAlertsController) => void;
}) {
  const result = useDrawingAlerts({
    chart: mounted ? chart : null,
    series,
    symbol,
    interval,
    drawings,
    logScale: false,
  });
  useLayoutEffect(() => {
    controller = result;
    onController?.(result);
  });
  return null;
}
function seed({ sound = true, symbol = "NQU6", intervalKey = "minute:5" } = {}) {
  const session = createDrawingAlertSession({ symbol, intervalKey }, workspace.storage, {
    projection: { logicalAt: Number, priceToCoordinate: Number, coordinateToPrice: Number },
  });
  session.syncDrawings([line]);
  expect(
    session.add({
      drawingId: line.id,
      condition: "crossing",
      trigger: "once",
      expiresAt: null,
      notifications: { sound, toast: false, desktop: false },
    }),
  ).not.toBeNull();
  session.dispose();
}
async function mount(props = {}) {
  await act(() => {
    renderer = create(<Chart {...props} />);
  });
}
async function gesture(type = "pointerdown") {
  await act(async () => {
    documentEvents.dispatchEvent(new Event(type));
  });
}
beforeEach(() => {
  workspace.values.clear();
  contexts.length = 0;
  documentEvents = new EventTarget();
  // Node's EventTarget does not remove capture listeners with the browser's
  // boolean overload. Normalize it to options while retaining native dispatch.
  const document = {
    addEventListener: (type: string, callback: EventListener, capture: boolean) =>
      documentEvents.addEventListener(type, callback, { capture }),
    removeEventListener: (type: string, callback: EventListener, capture: boolean) =>
      documentEvents.removeEventListener(type, callback, { capture }),
  };
  addListener = vi.spyOn(document, "addEventListener");
  removeListener = vi.spyOn(document, "removeEventListener");
  vi.stubGlobal("document", document);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saved drawing alert sound", () => {
  it("primes saved sound from an ordinary gesture, reuses it, and resumes after suspension", async () => {
    seed();
    await mount();
    expect(controller.alerts).toHaveLength(1);
    expect(contexts).toHaveLength(0);
    await gesture();
    expect(contexts).toHaveLength(1);
    const context = contexts[0]!;
    expect(context.state).toBe("running");
    await gesture("keydown");
    expect(contexts).toHaveLength(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
    context.state = "suspended";
    await gesture("keydown");
    expect(context.resume).toHaveBeenCalledTimes(2);
    expect(context.state).toBe("running");
  });
  it.each([{ sound: false }, { symbol: "GCZ6" }, { intervalKey: "minute:1" }])(
    "does not activate audio for a silent or unrelated saved alert: %j",
    async (options) => {
      seed(options);
      await mount();
      expect(addListener).not.toHaveBeenCalled();
      await gesture();
      await gesture("keydown");
      expect(contexts).toHaveLength(0);
    },
  );
  it("waits for a mounted chart and removes activation listeners when its context changes", async () => {
    seed();
    await mount({ mounted: false });
    await gesture();
    expect(contexts).toHaveLength(0);
    await act(() => renderer!.update(<Chart />));
    await gesture();
    expect(contexts).toHaveLength(1);
    contexts[0]!.state = "suspended";
    await act(() => renderer!.update(<Chart symbol="GCZ6" />));
    await gesture("keydown");
    expect(contexts[0]!.resume).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
    expect(removeListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);
  });
  it("closes audio on unmount and no longer responds to gestures", async () => {
    seed();
    await mount();
    await gesture();
    const context = contexts[0]!;
    await act(() => renderer!.unmount());
    renderer = undefined;
    expect(context.close).toHaveBeenCalledTimes(1);
    await gesture();
    expect(contexts).toHaveLength(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
  });
  it("handles a rejected resume and retries on the next gesture", async () => {
    seed();
    await mount();
    await gesture();
    const context = contexts[0]!;
    context.state = "suspended";
    context.resume.mockRejectedValueOnce(new Error("Audio permission denied"));
    await gesture();
    expect(context.state).toBe("suspended");
    await gesture("keydown");
    expect(context.state).toBe("running");
    expect(context.resume).toHaveBeenCalledTimes(3);
  });
});

describe("drawing alert views sharing one workspace", () => {
  it("updates two mounted hook views after additions, edits and deletion without reopening either", async () => {
    let first!: DrawingAlertsController, second!: DrawingAlertsController;
    const onFirst = (value: DrawingAlertsController) => {
      first = value;
    };
    const onSecond = (value: DrawingAlertsController) => {
      second = value;
    };
    await act(() => {
      renderer = create(
        <>
          <Chart onController={onFirst} />
          <Chart onController={onSecond} />
        </>,
      );
    });
    const input = {
      drawingId: "line",
      condition: "crossing" as const,
      trigger: "once" as const,
      expiresAt: null,
    };
    await act(async () => {
      expect(await first.create({ ...input, name: "A" })).toBeNull();
    });
    await act(async () => {
      expect(await second.create({ ...input, name: "B" })).toBeNull();
    });
    expect(first.alerts.map((alert) => alert.name)).toEqual(["A", "B"]);
    expect(second.alerts).toEqual(first.alerts);
    const a = first.alerts[0]!;
    await act(async () => {
      expect(await second.update(a.id, { ...input, name: "Edited" })).toBeNull();
    });
    expect(first.alerts[0]!.name).toBe("Edited");
    await act(() => {
      expect(first.remove(a.id)).toBe(true);
    });
    expect(second.alerts.map((alert) => alert.name)).toEqual(["B"]);
    expect(first.alerts).toEqual(second.alerts);
  });
});
