import { DRAWING_DEFAULTS_KEY } from "./drawingDefaults";
import { defaultDrawingTemplateSettings } from "./drawingTemplates";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  BarPrice,
  CandlestickData,
  Coordinate,
  IChartApi,
  IPaneApi,
  IPanePrimitive,
  Logical,
  ISeriesApi,
  MouseEventParams,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { createChartDrawingSession } from "./useChartDrawings";
import { sanitizeDrawingVisibility } from "./drawingVisibility";
import {
  buildDrawingGeometry,
  parallelChannelSettingsLevels,
  type ChartDrawing,
} from "./drawingGeometry";
import {
  parseDrawingsClipboard,
  parseDrawingClipboard,
  serializeDrawingClipboard,
} from "./drawingClipboard";
import { drawingProjection } from "./drawingPrimitive";

function fixture(symbol: string, initial: string | null = null, candles: CandlestickData[] = []) {
  let listener: ((event: MouseEventParams<Time>) => void) | undefined;
  const priceLines: unknown[] = [];
  const lines: Array<{ options: Record<string, unknown>; data: unknown[] }> = [];
  const series = {
    coordinateToPrice: (y: number) => 5000 - y,
    priceToCoordinate: (price: number) => 5000 - price,
    attachPrimitive: vi.fn(),
    detachPrimitive: vi.fn(),
    data: () => candles,
    dataByIndex: (index: number) => candles.find((candle) => candle.time === index * 100) ?? null,
    options: () => ({ priceScaleId: "right" }),
    getPane: () => ({ paneIndex: () => 0, getHeight: () => 500 }),
    createPriceLine: (options: unknown) => {
      priceLines.push(options);
      return options;
    },
    removePriceLine: (line: unknown) => {
      priceLines.splice(priceLines.indexOf(line), 1);
    },
  } as unknown as ISeriesApi<SeriesType>;
  const chart = {
    options: () => ({ layout: { fontFamily: "sans-serif" } }),
    timeScale: () => ({
      width: () => 1000,
      timeToCoordinate: (time: number) => time,
      coordinateToTime: (x: number) => x,
      coordinateToLogical: (x: number) => x / 100,
    }),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    subscribeClick: (callback: typeof listener) => {
      listener = callback;
    },
    unsubscribeClick: (callback: typeof listener) => {
      if (listener === callback) listener = undefined;
    },
    addSeries: (_definition: unknown, options: Record<string, unknown>) => {
      const line = {
        options,
        data: [] as unknown[],
        setData(data: unknown[]) {
          this.data = data;
        },
      };
      lines.push(line);
      return line;
    },
    removeSeries: (line: (typeof lines)[number]) => {
      lines.splice(lines.indexOf(line), 1);
    },
  } as unknown as IChartApi;
  let saved = initial;
  let savedWrites = 0;
  const controls = new Map<string, string>();
  const storage = {
    getItem: (key: string) =>
      key === "automorphic:drawing-controls:v1" || key === DRAWING_DEFAULTS_KEY
        ? (controls.get(key) ?? null)
        : saved,
    setItem: (key: string, value: string) => {
      if (key === "automorphic:drawing-controls:v1" || key === DRAWING_DEFAULTS_KEY)
        controls.set(key, value);
      else {
        saved = value;
        savedWrites++;
      }
    },
  };
  const change = vi.fn();
  const open = (
    intervalMinutes = 1,
    directPlacement = false,
    sessionStorage: Pick<Storage, "getItem" | "setItem"> = storage,
  ) =>
    createChartDrawingSession(
      chart,
      series,
      symbol,
      change,
      sessionStorage,
      intervalMinutes,
      undefined,
      directPlacement,
    );
  const click = (time: number | undefined, y = 100, paneIndex = 0, x = 50) =>
    listener?.({
      ...(time === undefined ? {} : { time: time as UTCTimestamp }),
      point: { x: x as Coordinate, y: y as Coordinate },
      paneIndex,
      seriesData: new Map(),
    });
  return {
    open,
    click,
    chart,
    series,
    priceLines,
    lines,
    change,
    saved: () => saved,
    controls,
    storage,
    writes: () => savedWrites,
    listener: () => listener,
  };
}

describe("drawing sessions sharing one workspace store", () => {
  const initial: ChartDrawing[] = ["a", "b"].map((id, index) => ({
    id,
    kind: "trend",
    color: "#2962ff",
    width: 2,
    text: `Label ${id}`,
    anchors: [
      { time: (100 + index * 200) as Time, price: 4900 - index * 200 },
      { time: (200 + index * 200) as Time, price: 4800 - index * 200 },
    ],
  }));
  const movedAnchors = [
    { time: 120 as Time, price: 4890 },
    { time: 220 as Time, price: 4790 },
  ];
  const setup = (objects = initial) => {
    const first = fixture("shared-session", JSON.stringify(objects));
    const second = fixture("shared-session");
    const a = first.open();
    const b = second.open(1, false, first.storage);
    return {
      a,
      b,
      first,
      second,
      saved: () => JSON.parse(first.saved()!) as ChartDrawing[],
      dispose: () => {
        a.dispose();
        b.dispose();
      },
    };
  };

  it.each(["cancel", "save"] as const)(
    "a sparse single template clears peer-only appearance without absorbing peer placement (%s)",
    (action) => {
      const { text: _text, ...source } = initial[0]!;
      const original: ChartDrawing = { ...source, lineStyle: "solid" };
      const f = setup([original]);
      try {
        f.a.selectDrawing(original.id);
        expect(f.a.openSettings()).toBe(true);
        f.b.updateDrawing(original.id, {
          anchors: movedAnchors,
          name: "Peer setup",
          locked: true,
          hidden: true,
          textBold: true,
          extendRight: true,
          textColor: "#ff0000",
        });
        const peer = f.saved()[0]!;
        const writes = f.first.writes();
        const template = {
          color: original.color,
          width: original.width,
          lineStyle: "solid" as const,
        };
        expect(f.a.previewSettings(template, { replace: true })).toBe(true);
        const expected: ChartDrawing = {
          ...original,
          anchors: movedAnchors,
          name: "Peer setup",
          locked: true,
          hidden: true,
        };
        expect(f.first.change.mock.lastCall![0].selected).toEqual(expected);
        expect(f.saved()).toEqual([peer]);
        expect(f.first.writes()).toBe(writes);
        if (action === "cancel") {
          f.a.closeSettings();
          expect(f.first.change.mock.lastCall![0].selected).toEqual(peer);
          expect(f.saved()).toEqual([peer]);
          expect(f.first.writes()).toBe(writes);
        } else {
          expect(f.a.applySettings({})).toBe(true);
          expect(f.saved()).toEqual([expected]);
          expect(f.b.getCommittedDrawings()).toEqual([expected]);
          expect(f.first.writes()).toBe(writes + 1);
          f.a.undo();
          expect(f.saved()).toEqual([peer]);
          f.a.redo();
          expect(f.saved()).toEqual([expected]);
          const reopened = f.first.open();
          expect(reopened.getCommittedDrawings()).toEqual([expected]);
          reopened.dispose();
        }
      } finally {
        f.dispose();
      }
    },
  );

  it.each(["cancel", "save"] as const)(
    "group template replacement preserves peer text/visibility and skips locked members (%s)",
    (action) => {
      const originals: ChartDrawing[] = [
        ...initial.map((drawing) => ({ ...drawing, lineStyle: "solid" as const })),
        { ...initial[1]!, id: "locked", lineStyle: "solid", locked: true },
      ];
      const f = setup(originals);
      try {
        f.a.selectDrawing("a");
        f.a.selectDrawing("b", { additive: true });
        f.a.selectDrawing("locked", { additive: true });
        expect(f.a.openSettings()).toBe(true);
        const visibility = sanitizeDrawingVisibility({
          hours: { enabled: false, min: 1, max: 24 },
        });
        f.b.updateDrawing("a", {
          anchors: movedAnchors,
          name: "Peer group member",
          text: "Peer annotation",
          visibility,
          textBold: true,
          extendRight: true,
        });
        f.b.updateDrawing("b", { textItalic: true, textColor: "#ff0000" });
        f.b.updateDrawing("locked", { color: "#00ff00", textBold: true, extendRight: true });
        const peers = f.saved();
        const writes = f.first.writes();
        expect(
          f.a.previewSettings(
            { color: originals[0]!.color, width: originals[0]!.width, lineStyle: "solid" },
            { replace: true },
          ),
        ).toBe(true);
        const expected: ChartDrawing[] = [
          {
            ...originals[0]!,
            anchors: movedAnchors,
            name: "Peer group member",
            text: "Peer annotation",
            visibility: sanitizeDrawingVisibility(visibility),
          },
          originals[1]!,
          peers[2]!,
        ];
        expect(f.first.change.mock.lastCall![0].selectedObjects).toEqual(expected);
        expect(f.saved()).toEqual(peers);
        expect(f.first.writes()).toBe(writes);
        if (action === "cancel") {
          f.a.closeSettings();
          expect(f.first.change.mock.lastCall![0].objects).toEqual(peers);
          expect(f.saved()).toEqual(peers);
          expect(f.first.writes()).toBe(writes);
        } else {
          expect(f.a.applySettings({})).toBe(true);
          expect(f.saved()).toEqual(expected);
          expect(f.b.getCommittedDrawings()).toEqual(expected);
          expect(f.first.writes()).toBe(writes + 1);
          f.a.undo();
          expect(f.saved()).toEqual(peers);
          f.a.redo();
          expect(f.saved()).toEqual(expected);
          const reopened = f.first.open();
          expect(reopened.getCommittedDrawings()).toEqual(expected);
          reopened.dispose();
        }
      } finally {
        f.dispose();
      }
    },
  );

  it.each(["before-preview", "after-preview"] as const)(
    "preserves another chart's endpoint coordinate change received %s through save, undo and reload",
    (timing) => {
      const f = setup();
      try {
        f.a.selectDrawing("a");
        f.a.openSettings();
        const local = [{ ...initial[0]!.anchors[0]!, price: 4910 }, initial[0]!.anchors[1]!];
        const remote = [initial[0]!.anchors[0]!, { ...initial[0]!.anchors[1]!, price: 4820 }];
        if (timing === "before-preview") f.b.updateDrawing("a", { anchors: remote });
        expect(f.a.previewSettings({ anchors: local })).toBe(true);
        if (timing === "after-preview") f.b.updateDrawing("a", { anchors: remote });
        expect(f.a.applySettings({})).toBe(true);
        const expected = [local[0], remote[1]];
        expect(f.saved()[0]!.anchors).toEqual(expected);
        expect(f.b.getCommittedDrawings()?.[0]?.anchors).toEqual(expected);
        f.a.undo();
        expect(f.saved()[0]!.anchors).toEqual(remote);
        f.a.redo();
        expect(f.saved()[0]!.anchors).toEqual(expected);
        const reloaded = f.first.open();
        expect(reloaded.getCommittedDrawings()?.[0]?.anchors).toEqual(expected);
        reloaded.dispose();
        f.b.undo();
        expect(f.saved()[0]!.anchors).toEqual(local);
      } finally {
        f.dispose();
      }
    },
  );

  it("merges a horizontal ray's bar and price edits on the same anchor and keeps each undo independent", () => {
    const ray: ChartDrawing = {
      ...initial[0]!,
      kind: "horizontal-ray",
      anchors: [initial[0]!.anchors[0]!],
    };
    const f = setup([ray]);
    try {
      f.a.selectDrawing("a");
      f.a.openSettings();
      expect(f.a.previewSettings({ anchors: [{ ...ray.anchors[0]!, price: 4910 }] })).toBe(true);
      f.b.updateDrawing("a", { anchors: [{ ...ray.anchors[0]!, time: 150 as Time }] });
      expect(f.a.applySettings({})).toBe(true);
      expect(f.saved()[0]!.anchors).toEqual([{ time: 150, price: 4910 }]);
      f.b.undo();
      expect(f.saved()[0]!.anchors).toEqual([{ time: 100, price: 4910 }]);
      f.a.undo();
      expect(f.saved()[0]!.anchors).toEqual(ray.anchors);
      f.a.redo();
      f.b.redo();
      expect(f.saved()[0]!.anchors).toEqual([{ time: 150, price: 4910 }]);
    } finally {
      f.dispose();
    }
  });

  it("preserves edits to different lines and publishes the same committed snapshot to both charts", () => {
    const f = setup();
    try {
      f.a.updateDrawing("a", { color: "#ff0000", anchors: movedAnchors });
      f.b.updateDrawing("b", { color: "#00ff00" });
      const expected = [
        { ...initial[0], color: "#ff0000", anchors: movedAnchors },
        { ...initial[1], color: "#00ff00" },
      ];
      expect(f.saved()).toEqual(expected);
      expect(f.a.getCommittedDrawings()).toEqual(expected);
      expect(f.b.getCommittedDrawings()).toEqual(expected);
    } finally {
      f.dispose();
    }
  });

  it("undoes and redoes only local edits without reverting another chart's changes", () => {
    const f = setup();
    try {
      f.a.updateDrawing("a", { color: "#ff0000" });
      f.b.updateDrawing("b", { color: "#00ff00" });
      f.a.undo();
      expect(f.saved()).toEqual([initial[0], { ...initial[1], color: "#00ff00" }]);
      f.a.redo();
      expect(f.saved()).toEqual([
        { ...initial[0], color: "#ff0000" },
        { ...initial[1], color: "#00ff00" },
      ]);
      f.b.undo();
      expect(f.saved()).toEqual([{ ...initial[0], color: "#ff0000" }, initial[1]]);
    } finally {
      f.dispose();
    }
  });

  it("keeps remote geometry when saving a local text/color settings draft with unchanged stale coordinates", () => {
    const f = setup();
    try {
      f.a.selectDrawing("a");
      f.a.openSettings();
      f.a.previewSettings({ text: "Local draft", color: "#ff0000" });
      f.b.updateDrawing("a", { anchors: movedAnchors });
      // The settings dialog submits its entire local draft, including untouched coordinates.
      expect(
        f.a.applySettings({
          anchors: initial[0]!.anchors,
          color: "#ff0000",
          width: 2,
          text: "Local draft",
        }),
      ).toBe(true);
      expect(f.saved()[0]).toEqual({
        ...initial[0],
        anchors: movedAnchors,
        color: "#ff0000",
        text: "Local draft",
      });
      f.a.undo();
      expect(f.saved()[0]).toEqual({ ...initial[0], anchors: movedAnchors });
    } finally {
      f.dispose();
    }
  });

  it.each([false, true])(
    "commits the controller-owned inline text draft after peer text updates (locally edited: %s)",
    (dirty) => {
      const f = setup();
      try {
        f.a.selectDrawing("a");
        expect(f.a.beginTextEdit()).toBe(true);
        if (dirty) f.a.previewText("Local multiline\nannotation");
        f.b.updateDrawing("a", { text: "Peer label" });
        const expectedText = dirty ? "Local multiline\nannotation" : "Peer label";
        expect(f.first.change.mock.lastCall![0].selected?.text).toBe(expectedText);
        const writes = f.first.writes();
        expect(f.a.commitText(undefined, "a")).toBe(true);
        expect(f.saved()[0]?.text).toBe(expectedText);
        if (dirty) {
          f.a.undo();
          expect(f.saved()[0]?.text).toBe("Peer label");
        } else {
          expect(f.first.writes()).toBe(writes);
          f.b.undo();
          expect(f.saved()[0]?.text).toBe(initial[0]!.text);
        }
      } finally {
        f.dispose();
      }
    },
  );

  it("keeps remote geometry and appearance while an inline text draft is committed", () => {
    const f = setup();
    try {
      f.a.selectDrawing("a");
      expect(f.a.beginTextEdit()).toBe(true);
      f.a.previewText("First row\nLocal draft");
      f.b.updateDrawing("a", { anchors: movedAnchors, color: "#00ff00" });
      expect(f.a.commitText("First row\nLocal draft", "a")).toBe(true);
      expect(f.saved()[0]).toEqual({
        ...initial[0],
        anchors: movedAnchors,
        color: "#00ff00",
        text: "First row\nLocal draft",
      });
      f.a.undo();
      expect(f.saved()[0]).toEqual({ ...initial[0], anchors: movedAnchors, color: "#00ff00" });
    } finally {
      f.dispose();
    }
  });

  it.each(["settings", "text"] as const)(
    "does not resurrect a peer-deleted drawing when its %s draft finishes or undoes",
    (editor) => {
      const f = setup();
      try {
        f.a.updateDrawing("a", { color: "#ff0000" });
        f.a.selectDrawing("a");
        if (editor === "settings") {
          f.a.openSettings();
          f.a.previewSettings({ text: "Pending" });
        } else {
          f.a.beginTextEdit();
          f.a.previewText("Pending");
        }
        f.b.deleteDrawing("a");
        if (editor === "settings") f.a.applySettings({ text: "Pending" });
        else f.a.commitText("Pending", "a");
        expect(f.saved()).toEqual([initial[1]]);
        f.a.undo();
        expect(f.saved()).toEqual([initial[1]]);
      } finally {
        f.dispose();
      }
    },
  );

  it.each([false, true])(
    "merges independent visibility range changes from settings (sparse: %s)",
    (sparse) => {
      const visibility = sanitizeDrawingVisibility(undefined);
      const original = { ...initial[0]!, ...(sparse ? {} : { visibility }) };
      const f = setup([original, initial[1]!]);
      try {
        f.a.selectDrawing("a");
        f.a.openSettings();
        f.a.previewSettings({
          visibility: { ...visibility, minutes: { ...visibility.minutes, max: 15 } },
        });
        f.b.updateDrawing("a", {
          visibility: { ...visibility, hours: { ...visibility.hours, max: 12 } },
        });
        expect(f.a.applySettings({})).toBe(true);
        expect(f.saved()[0]!.visibility).toEqual({
          ...visibility,
          minutes: { ...visibility.minutes, max: 15 },
          hours: { ...visibility.hours, max: 12 },
        });
        f.a.undo();
        expect(f.saved()[0]!.visibility).toEqual({
          ...visibility,
          hours: { ...visibility.hours, max: 12 },
        });
      } finally {
        f.dispose();
      }
    },
  );

  it.each([false, true])(
    "merges independent channel level appearance changes from settings (sparse: %s)",
    (sparse) => {
      const channel: ChartDrawing = {
        ...initial[0]!,
        kind: "channel",
        anchors: [...initial[0]!.anchors, { time: 150 as Time, price: 4700 }],
      };
      const levels = parallelChannelSettingsLevels(channel);
      const f = setup([{ ...channel, ...(sparse ? {} : { levels }) }, initial[1]!]);
      try {
        f.a.selectDrawing("a");
        f.a.openSettings();
        f.a.previewSettings({
          levels: levels.map((level) =>
            level.value === 0 ? { ...level, color: "#ff0000" } : level,
          ),
        });
        f.b.updateDrawing("a", {
          levels: levels.map((level) => (level.value === 1 ? { ...level, width: 4 } : level)),
        });
        expect(f.a.applySettings({})).toBe(true);
        expect(f.saved()[0]!.levels?.find((level) => level.value === 0)?.color).toBe("#ff0000");
        expect(f.saved()[0]!.levels?.find((level) => level.value === 1)?.width).toBe(4);
        f.a.undo();
        const restored = f.saved()[0]!;
        expect(restored.levels?.find((level) => level.value === 0)?.color ?? restored.color).toBe(
          channel.color,
        );
        expect(restored.levels?.find((level) => level.value === 1)?.width).toBe(4);
      } finally {
        f.dispose();
      }
    },
  );

  it("isolates symbols and storage identities, detaches disposed peers, and reloads the latest snapshot", () => {
    const nqKey = "automorphic:chart-drawings:v1:NQ";
    const esKey = "automorphic:chart-drawings:v1:ES";
    const values = new Map([
      [nqKey, JSON.stringify(initial)],
      [esKey, JSON.stringify(initial)],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const first = fixture("NQ"),
      peer = fixture("NQ"),
      otherSymbol = fixture("ES"),
      otherStore = fixture("NQ", JSON.stringify(initial));
    const a = first.open(1, false, storage),
      b = peer.open(1, false, storage),
      es = otherSymbol.open(1, false, storage),
      isolated = otherStore.open();
    try {
      a.updateDrawing("a", { color: "#ff0000" });
      expect(b.getCommittedDrawings()![0]!.color).toBe("#ff0000");
      expect(es.getCommittedDrawings()).toEqual(initial);
      expect(isolated.getCommittedDrawings()).toEqual(initial);
      expect(JSON.parse(values.get(esKey)!)).toEqual(initial);
      a.dispose();
      const oldEmissions = first.change.mock.calls.length;
      b.updateDrawing("b", { color: "#00ff00" });
      expect(first.change.mock.calls.length).toBe(oldEmissions);
      const replacement = first.open(1, false, storage);
      try {
        expect(replacement.getCommittedDrawings()).toEqual(b.getCommittedDrawings());
        replacement.updateDrawing("a", { text: "Reopened" });
        expect(b.getCommittedDrawings()![0]!.text).toBe("Reopened");
      } finally {
        replacement.dispose();
      }
    } finally {
      a.dispose();
      b.dispose();
      es.dispose();
      isolated.dispose();
    }
  });

  it("keeps drag previews private until committing one shared snapshot", () => {
    const f = setup();
    try {
      const peerEmissions = f.second.change.mock.calls.length;
      expect(f.a.beginDrag({ x: 200, y: 200 })).toBe(true);
      f.a.dragTo({ x: 250, y: 250 });
      const expected = [
        { ...initial[0], anchors: [initial[0]!.anchors[0], { time: 250, price: 4750 }] },
        initial[1],
      ];
      expect(f.first.change.mock.lastCall![0].objects).toEqual(expected);
      expect(f.a.getCommittedDrawings()).toEqual(initial);
      expect(f.b.getCommittedDrawings()).toEqual(initial);
      expect(f.second.change.mock.calls.length).toBe(peerEmissions);
      expect(f.saved()).toEqual(initial);
      expect(f.first.writes()).toBe(0);
      f.a.endDrag(true);
      expect(f.a.getCommittedDrawings()).toEqual(expected);
      expect(f.b.getCommittedDrawings()).toEqual(expected);
      expect(f.saved()).toEqual(expected);
      expect(f.first.writes()).toBe(1);
      f.a.undo();
      expect(f.saved()).toEqual(initial);
      expect(f.b.getCommittedDrawings()).toEqual(initial);
    } finally {
      f.dispose();
    }
  });

  it("cancels a drag without rolling back peer changes to the dragged line or another line", () => {
    const f = setup();
    try {
      expect(f.a.beginDrag({ x: 200, y: 200 })).toBe(true);
      f.a.dragTo({ x: 250, y: 250 });
      f.b.updateDrawing("a", { anchors: movedAnchors, color: "#ff0000" });
      f.b.updateDrawing("b", { text: "Peer annotation" });
      const expected = [
        { ...initial[0], anchors: movedAnchors, color: "#ff0000" },
        { ...initial[1], text: "Peer annotation" },
      ];
      f.a.endDrag(false);
      expect(f.saved()).toEqual(expected);
      expect(f.a.getCommittedDrawings()).toEqual(expected);
      expect(f.b.getCommittedDrawings()).toEqual(expected);
    } finally {
      f.dispose();
    }
  });
});

describe("Shift line alignment", () => {
  const previewDrawings = (f: ReturnType<typeof fixture>): readonly ChartDrawing[] =>
    f.change.mock.lastCall![0].objects;
  const anchorPoints = (f: ReturnType<typeof fixture>) =>
    previewDrawings(f)[0]!.anchors.map(({ time, price }) => ({ x: time, y: 5000 - price }));
  const straightKinds = [
    "trend",
    "ray",
    "extended-line",
    "info-line",
    "trend-angle",
    "arrow",
  ] as const;

  it.each(straightKinds)(
    "constrains %s placement to dominant-axis coordinates and commits once",
    (kind) => {
      const f = fixture(`shift-${kind}`);
      const session = f.open();
      session.setTool(kind);
      session.placeAt({ x: 100, y: 350 });
      session.placeAt({ x: 300, y: 270 }, { shiftKey: true });
      expect(anchorPoints(f)).toEqual([
        { x: 100, y: 350 },
        { x: 300, y: 350 },
      ]);
      expect(f.writes()).toBe(1);
      session.undo();
      expect(session.getCommittedDrawings()).toEqual([]);
      session.dispose();
    },
  );

  it.each([
    [
      { x: 300, y: 250 },
      { x: 100 + Math.hypot(200, 100) / Math.SQRT2, y: 191.89 },
    ],
    [
      { x: 120, y: 100 },
      { x: 100, y: 100 },
    ],
    [
      { x: 20, y: 150 },
      { x: 100, y: 150 },
    ],
    [
      { x: -100, y: 430 },
      { x: -100, y: 350 },
    ],
  ])("uses radial diagonals and raw vertical/horizontal extents for %j", (point, expected) => {
    const f = fixture("shift-octants");
    const session = f.open();
    session.setTool("trend");
    session.placeAt({ x: 100, y: 350 });
    session.placeAt(point, { shiftKey: true });
    const actual = anchorPoints(f)[1]!;
    expect(actual.x).toBeCloseTo(expected.x, 8);
    expect(actual.y).toBeCloseTo(expected.y, 8);
    session.dispose();
  });

  it("retains bar snapping and instrument ticks after projected diagonal alignment", () => {
    const f = fixture("shift-snapped-bars");
    const scale = f.chart.timeScale();
    vi.spyOn(f.chart, "timeScale").mockReturnValue({
      ...scale,
      coordinateToTime: (x: number) => Math.round(x) as UTCTimestamp,
    });
    const options = f.series.options();
    vi.spyOn(f.series, "options").mockReturnValue({
      ...options,
      priceFormat: { type: "price", minMove: 0.25, precision: 2 },
    });
    const session = f.open();
    session.setTool("trend");
    session.placeAt({ x: 100, y: 350 });
    session.placeAt({ x: 300, y: 200 }, { shiftKey: true });
    expect(anchorPoints(f)).toEqual([
      { x: 100, y: 350 },
      { x: 277, y: 173.25 },
    ]);
    session.dispose();
  });

  it.each([false, true])(
    "updates canvas preview with stationary Shift (native placement: %s)",
    (directPlacement) => {
      const f = fixture("shift-preview");
      const session = f.open(1, directPlacement);
      session.setTool("trend");
      session.placeAt({ x: 100, y: 350 });
      const move = vi.mocked(f.chart.subscribeCrosshairMove).mock.calls[0]![0];
      const primitive = vi.mocked(f.series.attachPrimitive).mock.calls[0]![0];
      const renderer = primitive.paneViews!()[0]!.renderer()!;
      const lineTo = vi.fn();
      const context = new Proxy(
        { lineTo, measureText: (text: string) => ({ width: text.length * 7 }) },
        {
          get: (target, key) => (key in target ? Reflect.get(target, key) : () => {}),
        },
      );
      const endpoint = () => {
        lineTo.mockClear();
        renderer.draw({
          useMediaCoordinateSpace: (draw: (scope: unknown) => void) => draw({ context }),
        } as unknown as Parameters<typeof renderer.draw>[0]);
        return lineTo.mock.calls[0];
      };
      if (directPlacement) session.previewAt({ x: 300, y: 250 });
      else move({ point: { x: 300 as Coordinate, y: 250 as Coordinate }, seriesData: new Map() });
      expect(endpoint()).toEqual([300, 250]);
      session.setShiftPressed(true);
      // The library may deliver an older event after the native modifier key has changed.
      if (directPlacement)
        move({ point: { x: 300 as Coordinate, y: 250 as Coordinate }, seriesData: new Map() });
      expect(endpoint()![0]).toBeCloseTo(258.113883);
      expect(endpoint()![1]).toBeCloseTo(191.89);
      session.setShiftPressed(false);
      expect(endpoint()).toEqual([300, 250]);
      if (directPlacement) session.previewAt({ x: 300, y: 270 }, { shiftKey: true });
      else
        move({
          point: { x: 300 as Coordinate, y: 270 as Coordinate },
          seriesData: new Map(),
          sourceEvent: { shiftKey: true } as NonNullable<MouseEventParams<Time>["sourceEvent"]>,
        });
      expect(endpoint()).toEqual([300, 350]);
      expect(f.writes()).toBe(0);
      if (directPlacement) {
        for (const point of [
          { x: -1, y: 250 },
          { x: 1001, y: 250 },
          { x: 300, y: -1 },
          { x: 300, y: 501 },
          { x: NaN, y: 250 },
        ]) {
          session.previewAt({ x: 300, y: 250 });
          expect(endpoint()).toEqual([300, 250]);
          session.previewAt(point);
          session.setShiftPressed(true);
          expect(endpoint()).toBeUndefined();
        }
        session.previewAt({ x: 300, y: 250 }, undefined, 1);
        session.setShiftPressed(true);
        expect(endpoint()).toBeUndefined();
      }
      session.clearPointerPreview();
      session.setShiftPressed(true);
      expect(endpoint()).toBeUndefined();
      session.cancel();
      session.setShiftPressed(false);
      expect(endpoint()).toBeUndefined();
      session.dispose();
      session.setShiftPressed(true);
      expect(f.writes()).toBe(0);
    },
  );

  it.each([0, 1])(
    "constrains endpoint %i about its opposite anchor and replays stationary key changes",
    (handle) => {
      const original: ChartDrawing = {
        id: "line",
        kind: "trend",
        color: "#2962ff",
        width: 2,
        anchors: [
          { time: 100 as Time, price: 4650 },
          { time: 300 as Time, price: 4750 },
        ],
      };
      const f = fixture(`shift-endpoint-${handle}`, JSON.stringify([original]));
      const session = f.open();
      session.selectDrawing("line");
      const start = handle === 0 ? { x: 100, y: 350 } : { x: 300, y: 250 };
      const pointer = handle === 0 ? { x: 100, y: 300 } : { x: 300, y: 270 };
      expect(session.beginDrag(start)).toBe(true);
      session.dragTo(pointer);
      expect(anchorPoints(f)[handle]).toEqual(pointer);
      session.setShiftPressed(true);
      expect(anchorPoints(f)[handle]).toEqual({ x: pointer.x, y: handle === 0 ? 250 : 350 });
      expect(previewDrawings(f)[0]!.anchors[1 - handle]).toEqual(original.anchors[1 - handle]);
      session.setShiftPressed(false);
      expect(anchorPoints(f)[handle]).toEqual(pointer);
      session.dragTo(pointer, { shiftKey: true });
      session.endDrag();
      expect(f.writes()).toBe(1);
      session.undo();
      expect(session.getCommittedDrawings()).toEqual([original]);
      session.dispose();
    },
  );

  it("switches whole-line axes and restores free movement on stationary Shift release", () => {
    const original: ChartDrawing = {
      id: "line",
      kind: "trend",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 4650 },
        { time: 300 as Time, price: 4750 },
      ],
    };
    const f = fixture("shift-body", JSON.stringify([original]));
    const session = f.open();
    expect(session.beginDrag({ x: 200, y: 300 })).toBe(true);
    session.dragTo({ x: 280, y: 320 }, { shiftKey: true });
    expect(anchorPoints(f)).toEqual([
      { x: 180, y: 350 },
      { x: 380, y: 250 },
    ]);
    session.dragTo({ x: 220, y: 380 }, { shiftKey: true });
    expect(anchorPoints(f)).toEqual([
      { x: 100, y: 430 },
      { x: 300, y: 330 },
    ]);
    session.setShiftPressed(false);
    expect(anchorPoints(f)).toEqual([
      { x: 120, y: 430 },
      { x: 320, y: 330 },
    ]);
    session.setShiftPressed(true);
    expect(anchorPoints(f)).toEqual([
      { x: 100, y: 430 },
      { x: 300, y: 330 },
    ]);
    session.endDrag(false);
    expect(session.getCommittedDrawings()).toEqual([original]);
    expect(f.writes()).toBe(0);
    session.dispose();
  });

  it.each([false, true])(
    "preserves locked coordinates exactly across a logarithmic inverse and bar snapping (group: %s)",
    (group) => {
      const original: ChartDrawing = {
        id: "a",
        kind: "trend",
        color: "#2962ff",
        width: 2,
        anchors: [
          { time: 100.375 as Time, price: 3.123456789 },
          { time: 300.125 as Time, price: 4.987654321 },
        ],
      };
      const other = {
        ...original,
        id: "b",
        anchors: original.anchors.map((anchor) => ({ ...anchor, price: anchor.price * 1.2 })),
      };
      const originals = group ? [original, other] : [original];
      const f = fixture("shift-log", JSON.stringify(originals));
      vi.spyOn(f.series, "priceToCoordinate").mockImplementation(
        (price) => (500 - 100 * Math.log(price)) as Coordinate,
      );
      vi.spyOn(f.series, "coordinateToPrice").mockImplementation(
        (y) => Math.exp((500 - y) / 100) as BarPrice,
      );
      const scale = f.chart.timeScale();
      vi.spyOn(f.chart, "timeScale").mockReturnValue({
        ...scale,
        coordinateToTime: (x: number) => Math.round(x) as UTCTimestamp,
      });
      const session = f.open();
      session.selectDrawing("a");
      if (group) session.selectDrawing("b", { additive: true });
      const origin = {
        x: 200.25,
        y:
          original.anchors.reduce((sum, anchor) => sum + 500 - 100 * Math.log(anchor.price), 0) / 2,
      };
      expect(session.beginDrag(origin)).toBe(true);
      session.dragTo({ x: origin.x + 80, y: origin.y + 20 }, { shiftKey: true });
      previewDrawings(f).forEach((drawing, index) => {
        expect(drawing.anchors.map((anchor) => anchor.price)).toEqual(
          originals[index]!.anchors.map((anchor) => anchor.price),
        );
        expect(drawing.anchors.map((anchor) => anchor.time)).toEqual([180, 380]);
      });
      session.dragTo({ x: origin.x + 20, y: origin.y + 80 }, { shiftKey: true });
      previewDrawings(f).forEach((drawing, index) => {
        expect(drawing.anchors.map((anchor) => anchor.time)).toEqual(
          originals[index]!.anchors.map((anchor) => anchor.time),
        );
        drawing.anchors.forEach((anchor) =>
          expect(anchor.price / 0.01).toBeCloseTo(Math.round(anchor.price / 0.01)),
        );
      });
      session.endDrag();
      expect(f.writes()).toBe(1);
      session.undo();
      expect(session.getCommittedDrawings()).toEqual(originals);
      session.dispose();
    },
  );

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])("restores origin without a write or phantom copy (group: %s, clone: %s)", (group, clone) => {
    const line = (id: string, y: number): ChartDrawing => ({
      id,
      kind: "trend",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 5000 - y },
        { time: 300 as Time, price: 5000 - y },
      ],
    });
    const originals = group ? [line("a", 200), line("b", 300)] : [line("a", 200)];
    const f = fixture("shift-origin", JSON.stringify(originals));
    const session = f.open();
    session.selectDrawing("a");
    if (group) session.selectDrawing("b", { additive: true });
    expect(session.beginDrag({ x: 200, y: 200 }, { clone, additive: group })).toBe(true);
    session.dragTo({ x: 280, y: 220 }, { shiftKey: true });
    const moved = previewDrawings(f).slice(clone ? originals.length : 0);
    expect(moved.map((drawing) => drawing.anchors[0])).toEqual(
      originals.map((drawing) => ({ ...drawing.anchors[0], time: 180 })),
    );
    session.dragTo({ x: 200, y: 200 }, { shiftKey: true });
    expect(previewDrawings(f)).toEqual(originals);
    session.endDrag();
    expect(f.writes()).toBe(0);
    // Returning to zero must not leave a stale clone id that loses the next preview.
    session.selectDrawing("a");
    if (group) session.selectDrawing("b", { additive: true });
    session.beginDrag({ x: 200, y: 200 }, { clone, additive: group });
    session.dragTo({ x: 280, y: 220 }, { shiftKey: true });
    session.dragTo({ x: 200, y: 200 }, { shiftKey: true });
    session.dragTo({ x: 220, y: 280 }, { shiftKey: true });
    const changed = previewDrawings(f).slice(clone ? originals.length : 0);
    expect(changed.map((drawing) => drawing.anchors[0])).toEqual(
      originals.map((drawing) => ({
        ...drawing.anchors[0],
        price: drawing.anchors[0]!.price - 80,
      })),
    );
    session.endDrag();
    expect(f.writes()).toBe(1);
    expect(session.getCommittedDrawings()).toHaveLength(originals.length * (clone ? 2 : 1));
    if (clone)
      expect(session.getCommittedDrawings()!.slice(0, originals.length)).toEqual(originals);
    session.undo();
    expect(session.getCommittedDrawings()).toEqual(originals);
    session.dispose();
  });

  it("chooses the movement axis before magnet snapping and preserves its locked price", () => {
    const original: ChartDrawing = {
      id: "a",
      kind: "trend",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 4800.12345 },
        { time: 300 as Time, price: 4800.12345 },
      ],
    };
    const f = fixture("shift-axis-magnet", JSON.stringify([original]), [
      { time: 200 as UTCTimestamp, open: 4500, high: 4500, low: 4500, close: 4500 },
    ]);
    const session = f.open();
    session.setMagnetMode("strong");
    expect(session.beginDrag({ x: 200, y: 199.87655 })).toBe(true);
    session.dragTo({ x: 280, y: 219.87655 }, { shiftKey: true });
    expect(previewDrawings(f)[0]!.anchors).toEqual([
      { time: 200, price: 4800.12345 },
      { time: 400, price: 4800.12345 },
    ]);
    session.endDrag(false);
    expect(session.getCommittedDrawings()).toEqual([original]);
    session.dispose();
  });

  it("constrains only the channel baseline and leaves its width placement free", () => {
    const f = fixture("shift-channel");
    const session = f.open();
    session.setTool("channel");
    session.placeAt({ x: 100, y: 350 });
    session.placeAt({ x: 300, y: 270 }, { shiftKey: true });
    session.placeAt({ x: 250, y: 225 }, { shiftKey: true });
    expect(anchorPoints(f)).toEqual([
      { x: 100, y: 350 },
      { x: 300, y: 350 },
      { x: 250, y: 225 },
    ]);
    session.dispose();
  });

  it("keeps the angle constraint after magnet OHLC snapping", () => {
    const f = fixture("shift-magnet", null, [
      { time: 100 as UTCTimestamp, open: 4650, high: 4650, low: 4650, close: 4650 },
      { time: 300 as UTCTimestamp, open: 4720, high: 4720, low: 4720, close: 4720 },
    ]);
    const session = f.open();
    session.setMagnetMode("strong");
    session.setTool("trend");
    session.placeAt({ x: 100, y: 350 });
    session.placeAt({ x: 300, y: 270 }, { shiftKey: true });
    expect(anchorPoints(f)).toEqual([
      { x: 100, y: 350 },
      { x: 300, y: 350 },
    ]);
    session.dispose();
  });
});

describe("selected drawing keyboard nudges", () => {
  const line = (id = "a", patch: Partial<ChartDrawing> = {}): ChartDrawing => ({
    id,
    kind: "trend",
    color: "#2962ff",
    width: 2,
    anchors: [
      { time: 100 as Time, price: 4800 },
      { time: 300 as Time, price: 4800 },
    ],
    ...patch,
  });
  const setup = (objects = [line()]) => {
    const f = fixture("nudge", JSON.stringify(objects));
    const scale = f.chart.timeScale();
    vi.spyOn(f.chart, "timeScale").mockReturnValue({
      ...scale,
      logicalToCoordinate: (bar: number) => (bar * 100) as Coordinate,
    });
    const options = f.series.options();
    vi.spyOn(f.series, "options").mockReturnValue({
      ...options,
      priceFormat: { type: "price", minMove: 0.25, precision: 2 },
    });
    const session = f.open();
    session.selectDrawing(objects[0]!.id);
    return { f, session };
  };

  it("commits one undo entry per nudge and persists the restored bar positions", () => {
    const { f, session } = setup();
    for (let index = 0; index < 3; index++)
      expect(session.nudgeSelected({ bars: 1, ticks: 0 })).toBe(true);
    expect(session.getCommittedDrawings()![0]!.anchors).toEqual([
      { time: 400, price: 4800 },
      { time: 600, price: 4800 },
    ]);
    expect(f.writes()).toBe(3);
    session.undo();
    const restored = session.getCommittedDrawings();
    expect(restored![0]!.anchors).toEqual([
      { time: 300, price: 4800 },
      { time: 500, price: 4800 },
    ]);
    expect(session.nudgeSelected({ bars: 0, ticks: 0 })).toBe(false);
    session.redo();
    expect(session.getCommittedDrawings()![0]!.anchors[0]!.time).toBe(400);
    session.undo();
    session.dispose();
    const reopened = f.open();
    expect(reopened.getCommittedDrawings()).toEqual(restored);
    reopened.dispose();
  });

  it.each([false, true])(
    "keeps surviving selection across undo/redo and a subsequent nudge (group: %s)",
    (group) => {
      const originals = group ? [line(), line("b")] : [line()];
      const { f, session } = setup(originals);
      if (group) session.selectDrawing("b", { additive: true });
      const ids = originals.map((drawing) => drawing.id);
      session.nudgeSelected({ bars: 1, ticks: 0 });
      session.nudgeSelected({ bars: 1, ticks: 0 });
      session.undo();
      expect(f.change.mock.calls.at(-1)![0].selectedIds).toEqual(ids);
      session.redo();
      expect(f.change.mock.calls.at(-1)![0].selectedIds).toEqual(ids);
      session.undo();
      expect(session.nudgeSelected({ bars: -1, ticks: 0 })).toBe(true);
      expect(session.getCommittedDrawings()).toEqual(originals);
      expect(f.change.mock.calls.at(-1)![0].selectedIds).toEqual(ids);
      session.dispose();
    },
  );

  it("filters a removed primary selection but keeps surviving group members, without selecting recreated items", () => {
    const { f, session } = setup();
    session.setTool("trend");
    session.placeAt({ x: 100, y: 300 });
    session.placeAt({ x: 300, y: 300 });
    const created = session.getCommittedDrawings()![1]!;
    session.selectDrawing("a", { additive: true });
    session.selectDrawing(created.id);
    expect(f.change.mock.calls.at(-1)![0].selectedIds).toEqual([created.id, "a"]);
    expect(f.change.mock.calls.at(-1)![0].selected.id).toBe(created.id);
    session.undo();
    expect(f.change.mock.calls.at(-1)![0].selectedIds).toEqual(["a"]);
    expect(f.change.mock.calls.at(-1)![0].selected.id).toBe("a");
    session.redo();
    expect(f.change.mock.calls.at(-1)![0].selectedIds).toEqual(["a"]);
    session.nudgeSelected({ bars: 1, ticks: 0 });
    expect(session.getCommittedDrawings()![1]).toEqual(created);
    session.dispose();
  });

  it("does not invent selection after undoing deletion or recreating an undone drawing", () => {
    const { f, session } = setup();
    session.deleteSelected();
    session.undo();
    expect(session.getCommittedDrawings()).toEqual([line()]);
    expect(f.change.mock.calls.at(-1)![0].selectedIds).toEqual([]);
    expect(session.nudgeSelected({ bars: 1, ticks: 0 })).toBe(false);
    session.setTool("trend");
    session.placeAt({ x: 100, y: 300 });
    session.placeAt({ x: 300, y: 300 });
    session.undo();
    expect(f.change.mock.calls.at(-1)![0].selectedIds).toEqual([]);
    session.redo();
    expect(f.change.mock.calls.at(-1)![0].selectedIds).toEqual([]);
    expect(session.nudgeSelected({ bars: 1, ticks: 0 })).toBe(false);
    session.dispose();
  });

  it("adds ticks as price deltas without changing off-tick geometry or untouched times", () => {
    const original = line("a", {
      anchors: [
        { time: 100.125 as Time, price: 4358.56123 },
        { time: 300.375 as Time, price: 4374.86789 },
      ],
    });
    const { f, session } = setup([original]);
    // Price nudging must not use pixel/log-scale movement or time/bar projection.
    vi.spyOn(f.series, "priceToCoordinate").mockImplementation(() => {
      throw new Error("unexpected price projection");
    });
    vi.spyOn(f.series, "coordinateToPrice").mockImplementation(() => {
      throw new Error("unexpected price inverse");
    });
    expect(session.nudgeSelected({ bars: 0, ticks: 1 })).toBe(true);
    expect(session.getCommittedDrawings()![0]!.anchors).toEqual([
      { time: 100.125, price: 4358.81123 },
      { time: 300.375, price: 4375.11789 },
    ]);
    expect(session.nudgeSelected({ bars: 0, ticks: -1 })).toBe(true);
    expect(session.getCommittedDrawings()).toEqual([original]);
    session.dispose();
  });

  it("retains fractional bars across session gaps and beyond the final loaded bar", () => {
    const times = [1000, 1300, 1600, 88000, 88300];
    const candles = times.map((time) => ({
      time: time as UTCTimestamp,
      open: 4800,
      high: 4900,
      low: 4700,
      close: 4800,
    }));
    const original = line("a", {
      anchors: [
        { time: 1450 as Time, price: 4800.12345 },
        { time: 88075 as Time, price: 4800.6789 },
      ],
    });
    const f = fixture("nudge-gap", JSON.stringify([original]), candles);
    const scale = f.chart.timeScale();
    vi.spyOn(f.chart, "timeScale").mockReturnValue({
      ...scale,
      timeToCoordinate: (time: Time) =>
        times.includes(time as number)
          ? ((100 + times.indexOf(time as number) * 20) as Coordinate)
          : null,
      coordinateToLogical: (x: number) => ((x - 100) / 20) as Logical,
      logicalToCoordinate: (bar: number) =>
        (Number.isInteger(bar) ? 100 + bar * 20 : 0) as Coordinate,
      coordinateToTime: (x: number) => (times[Math.round((x - 100) / 20)] as Time) ?? null,
    });
    const session = f.open();
    session.selectDrawing("a");
    const dataReads = vi.spyOn(f.series, "data");
    expect(session.nudgeSelected({ bars: 1, ticks: 0 })).toBe(true);
    expect(dataReads).toHaveBeenCalledTimes(1);
    expect(session.getCommittedDrawings()![0]!.anchors).toEqual([
      { time: 44800, price: 4800.12345 },
      { time: 88375, price: 4800.6789 },
    ]);
    expect(session.nudgeSelected({ bars: -1, ticks: 0 })).toBe(true);
    expect(dataReads).toHaveBeenCalledTimes(2);
    expect(session.getCommittedDrawings()).toEqual([original]);
    session.dispose();
  });

  it("moves groups atomically while retaining locks and drawing-specific coordinate rules", () => {
    const originals = [
      line(),
      line("locked", { locked: true }),
      line("horizontal", { kind: "horizontal", anchors: [{ time: 100 as Time, price: 4800 }] }),
      line("vertical", { kind: "vertical", anchors: [{ time: 100 as Time, price: 4800 }] }),
      line("regression", { kind: "regression-trend" }),
    ];
    const { f, session } = setup(originals);
    for (const drawing of originals.slice(1)) session.selectDrawing(drawing.id, { additive: true });
    expect(session.nudgeSelected({ bars: 1, ticks: 1 })).toBe(true);
    const moved = session.getCommittedDrawings()!;
    expect(moved[0]!.anchors).toEqual([
      { time: 200, price: 4800.25 },
      { time: 400, price: 4800.25 },
    ]);
    expect(moved[1]).toEqual(originals[1]);
    expect(moved[2]!.anchors).toEqual([{ time: 100, price: 4800.25 }]);
    expect(moved[3]!.anchors).toEqual([{ time: 200, price: 4800 }]);
    expect(moved[4]!.anchors).toEqual([
      { time: 200, price: 4800 },
      { time: 400, price: 4800 },
    ]);
    expect(f.writes()).toBe(1);
    session.undo();
    expect(session.getCommittedDrawings()).toEqual(originals);
    session.dispose();
  });

  it.each(["locked", "horizontal", "vertical", "regression-trend"] as const)(
    "does not create history for an ineffective %s nudge",
    (kind) => {
      const original = line(
        "a",
        kind === "locked"
          ? { locked: true }
          : kind === "regression-trend"
            ? { kind }
            : { kind, anchors: [{ time: 100 as Time, price: 4800 }] },
      );
      const { f, session } = setup([original]);
      expect(
        session.nudgeSelected({
          bars: kind === "horizontal" || kind === "locked" ? 1 : 0,
          ticks: kind === "horizontal" || kind === "locked" ? 0 : 1,
        }),
      ).toBe(false);
      expect(f.writes()).toBe(0);
      expect(session.getCommittedDrawings()).toEqual([original]);
      session.dispose();
    },
  );

  it("rejects invalid input and cancels the entire group nudge if any anchor cannot project", () => {
    const originals = [
      line(),
      line("b", {
        anchors: [
          { time: 500 as Time, price: 4700 },
          { time: 700 as Time, price: 4700 },
        ],
      }),
    ];
    const { f, session } = setup(originals);
    session.selectDrawing("b", { additive: true });
    for (const move of [
      { bars: 0.5, ticks: 0 },
      { bars: 0, ticks: Infinity },
      { bars: NaN, ticks: 1 },
    ])
      expect(session.nudgeSelected(move)).toBe(false);
    const scale = f.chart.timeScale();
    vi.spyOn(f.chart, "timeScale").mockReturnValue({
      ...scale,
      logicalToCoordinate: (bar: number) => (bar === 6 ? null : ((bar * 100) as Coordinate)),
    });
    expect(session.nudgeSelected({ bars: 1, ticks: 0 })).toBe(false);
    expect(session.getCommittedDrawings()).toEqual(originals);
    expect(f.writes()).toBe(0);
    session.dispose();
  });

  it.each(["drawing", "settings", "text", "drag", "marquee", "context", "hidden", "disposed"])(
    "does not interrupt an active %s state",
    (state) => {
      const original = line();
      const { f, session } = setup([original]);
      if (state === "drawing") session.setTool("trend");
      if (state === "settings") session.openSettings();
      if (state === "text") expect(session.beginTextEdit()).toBe(true);
      if (state === "drag") expect(session.beginDrag({ x: 200, y: 200 })).toBe(true);
      if (state === "marquee") expect(session.beginMarquee({ x: 400, y: 400 })).toBe(true);
      if (state === "context")
        expect(session.openContextMenu({ x: 200, y: 200 }, { x: 200, y: 200 })).toBe(true);
      if (state === "hidden") session.toggleHidden();
      if (state === "disposed") session.dispose();
      expect(session.nudgeSelected({ bars: 1, ticks: 1 })).toBe(false);
      expect(f.writes()).toBe(0);
      if (state !== "disposed") expect(session.getCommittedDrawings()).toEqual([original]);
      session.dispose();
    },
  );
});

describe("drawing bar coordinate inputs", () => {
  it("rounds fractional bar inputs before the native integer-only projection and keeps price unchanged", () => {
    const start = 1_700_000_000;
    const candles = Array.from({ length: 50 }, (_, index) => ({
      time: (start + index * 300) as UTCTimestamp,
      open: 32000,
      high: 33000,
      low: 31000,
      close: 32000,
    }));
    const f = fixture("fractional-coordinate-bars", null, candles);
    const scale = f.chart.timeScale();
    const logicalToCoordinate = vi.fn(
      (index: number) => (Number.isInteger(index) ? index * 10 : 0) as Coordinate,
    );
    vi.spyOn(f.chart, "timeScale").mockReturnValue({
      ...scale,
      logicalToCoordinate,
      coordinateToLogical: (x: number) => (x === 0 ? -0 : Math.round(x / 10)) as Logical,
      coordinateToTime: (x: number) => candles[Math.round(x / 10)]?.time ?? null,
      timeToCoordinate: (time: Time) => {
        const index = candles.findIndex((candle) => candle.time === time);
        return index < 0 ? null : ((index * 10) as Coordinate);
      },
    });
    // Bar coordinates are independent of whether the anchor price is projectable.
    vi.spyOn(f.series, "priceToCoordinate").mockReturnValue(null);
    const session = f.open();
    expect(session.anchorAtBar(12.6, 31852.83)).toEqual({
      time: start + 13 * 300,
      price: 31852.83,
    });
    expect(logicalToCoordinate).toHaveBeenLastCalledWith(13);
    expect(session.anchorAtBar(12.4, 31852.83)).toEqual({
      time: start + 12 * 300,
      price: 31852.83,
    });
    expect(session.anchorAtBar(12, 31852.83)).toEqual({ time: start + 12 * 300, price: 31852.83 });
    for (const [input, expected] of [
      [52.4, 52],
      [-2.6, -3],
      [0, 0],
    ] as const) {
      const anchor = session.anchorAtBar(input, 31852.83)!;
      expect(anchor).toEqual({ time: start + expected * 300, price: 31852.83 });
      expect(session.anchorBar(anchor)).toBe(expected);
    }
    expect(f.writes()).toBe(0);
    const calls = logicalToCoordinate.mock.calls.length;
    expect(session.anchorAtBar(NaN, 100)).toBeNull();
    expect(session.anchorAtBar(Infinity, 100)).toBeNull();
    expect(session.anchorAtBar(Number.MAX_SAFE_INTEGER + 1, 100)).toBeNull();
    expect(session.anchorAtBar(12, NaN)).toBeNull();
    expect(logicalToCoordinate).toHaveBeenCalledTimes(calls);
    session.dispose();
    expect(session.anchorAtBar(12, 100)).toBeNull();
    expect(session.anchorBar({ time: start as Time, price: 100 })).toBeNull();
  });

  it("declines unavailable or nonfinite bar projection instead of coercing to the first bar", () => {
    const f = fixture("bar-coordinate-unavailable");
    const scale = f.chart.timeScale();
    const logicalToCoordinate = vi.fn((): Coordinate | null => null);
    vi.spyOn(f.chart, "timeScale").mockReturnValue({ ...scale, logicalToCoordinate });
    const session = f.open();
    expect(session.anchorAtBar(12.6, 100)).toBeNull();
    logicalToCoordinate.mockReturnValue(NaN as Coordinate);
    expect(session.anchorAtBar(12.6, 100)).toBeNull();
    logicalToCoordinate.mockImplementation(() => {
      throw Error("Disposed scale");
    });
    expect(session.anchorAtBar(12.6, 100)).toBeNull();
    expect(f.writes()).toBe(0);
    session.dispose();
  });
});

describe("drawing price ticks", () => {
  const tickOptions = (f: ReturnType<typeof fixture>, minMove: number, precision = 2) => {
    vi.spyOn(f.series, "options").mockReturnValue({
      ...f.series.options(),
      priceFormat: { type: "price", minMove, precision },
    });
  };
  it("separates decimal display from committed tick normalization and exposes the instrument step", () => {
    const f = fixture("tick-coordinates");
    tickOptions(f, 0.25);
    const session = f.open();
    expect(session.coordinatePriceStep()).toBe(0.25);
    expect(session.coordinatePricePrecision()).toBe(2);
    expect(session.coordinatePrice(31852.83)).toBe(31852.83);
    expect(session.normalizeCoordinatePrice(31852.83)).toBe(31852.75);
    expect(session.normalizeCoordinatePrice(31852.9)).toBe(31853);
    expect(session.normalizeCoordinatePrice(31852.75 + session.coordinatePriceStep())).toBe(31853);
    tickOptions(f, 0.05);
    expect(session.normalizeCoordinatePrice(0.1 + 0.2)).toBe(0.3);
    expect(session.normalizeCoordinatePrice(-10.08)).toBe(-10.1);
    tickOptions(f, 0.00001, 5);
    expect(session.coordinatePriceStep()).toBe(0.00001);
    expect(session.coordinatePricePrecision()).toBe(5);
    expect(session.normalizeCoordinatePrice(1.2345678)).toBe(1.23457);
    tickOptions(f, NaN, 3);
    expect(session.coordinatePriceStep()).toBe(0.001);
    expect(session.normalizeCoordinatePrice(1.23456)).toBe(1.235);
    expect(session.normalizeCoordinatePrice(NaN)).toBeNaN();
    expect(session.normalizeCoordinatePrice(Infinity)).toBe(Infinity);
    tickOptions(f, 1, 0);
    expect(session.coordinatePricePrecision()).toBe(0);
    expect(session.coordinatePrice(12.75)).toBe(13);
    tickOptions(f, 0.01, NaN);
    expect(session.coordinatePricePrecision()).toBe(2);
    expect(session.coordinatePrice(12.345)).toBe(12.35);
    expect(f.writes()).toBe(0);
    session.dispose();
  });

  it("quantizes pointer placement and freehand anchors even with magnet disabled", () => {
    const f = fixture("tick-placement");
    tickOptions(f, 0.25);
    vi.spyOn(f.series, "coordinateToPrice").mockImplementation((y) => (32000 - y) as BarPrice);
    vi.spyOn(f.series, "priceToCoordinate").mockImplementation(
      (price) => (32000 - price) as Coordinate,
    );
    const session = f.open();
    session.setTool("horizontal");
    f.click(100, 147.17);
    expect(session.getCommittedDrawings()![0]!.anchors[0]!.price).toBe(31852.75);
    session.setTool("brush");
    expect(session.beginDrag({ x: 100, y: 147.1 })).toBe(true);
    session.dragTo({ x: 110, y: 151.08 });
    session.endDrag(true);
    expect(session.getCommittedDrawings()![1]!.anchors.map((anchor) => anchor.price)).toEqual([
      31853, 31849,
    ]);
    session.dispose();
  });

  it("quantizes body translation with one common price delta and changes only the dragged endpoint on handle edits", () => {
    const drawing: ChartDrawing = {
      id: "line",
      kind: "trend",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 31852.75 },
        { time: 300 as Time, price: 33030.25 },
      ],
    };
    const f = fixture("tick-drag", JSON.stringify([drawing]));
    tickOptions(f, 0.25);
    const pricePerPixel = 54.25 / 3;
    vi.spyOn(f.series, "coordinateToPrice").mockImplementation(
      (y) => (34000 - y * pricePerPixel) as BarPrice,
    );
    vi.spyOn(f.series, "priceToCoordinate").mockImplementation(
      (price) => ((34000 - price) / pricePerPixel) as Coordinate,
    );
    const session = f.open();
    const y = ((34000 - 31852.75) / pricePerPixel + (34000 - 33030.25) / pricePerPixel) / 2;
    expect(session.beginDrag({ x: 200, y })).toBe(true);
    session.dragTo({ x: 216, y: y + 3 });
    session.endDrag(true);
    const moved = session.getCommittedDrawings()![0]!;
    expect(moved.anchors.map((anchor) => anchor.price)).toEqual([31798.5, 32976]);
    expect(
      moved.anchors.map((anchor, index) => anchor.price - drawing.anchors[index]!.price),
    ).toEqual([-54.25, -54.25]);
    session.undo();
    const firstY = (34000 - drawing.anchors[0]!.price) / pricePerPixel;
    expect(session.beginDrag({ x: 100, y: firstY })).toBe(true);
    session.dragTo({ x: 120, y: firstY + 3.01 });
    session.endDrag(true);
    const edited = session.getCommittedDrawings()![0]!;
    expect(edited.anchors[0]!.price).toBe(31798.25);
    expect(edited.anchors[1]).toEqual(drawing.anchors[1]);
    session.undo();
    expect(session.getCommittedDrawings()).toEqual([drawing]);
    session.dispose();
  });

  it("preserves stored and duplicated precision and keeps angle-coordinate transforms continuous", () => {
    const drawing: ChartDrawing = {
      id: "angle",
      kind: "trend-angle",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 4800.13 },
        { time: 300 as Time, price: 4900.17 },
      ],
    };
    const f = fixture("tick-angle", JSON.stringify([drawing]));
    tickOptions(f, 0.25);
    const session = f.open();
    expect(session.getCommittedDrawings()).toEqual([drawing]);
    session.duplicateDrawing(drawing.id);
    expect(session.getCommittedDrawings()![1]!.anchors).toEqual(drawing.anchors);
    const anchors = session.anchorsAtAngle(drawing, 30)!;
    expect(anchors[0]).toEqual(drawing.anchors[0]);
    expect(anchors[1]!.price).not.toBe(session.normalizeCoordinatePrice(anchors[1]!.price));
    expect(session.drawingAngle({ ...drawing, anchors })).toBeCloseTo(30, 8);
    session.dispose();
  });
});

describe("vertical extensions through indicator panes", () => {
  it("selects, opens settings/context and drags an extended line in time only with undo and cancellation", () => {
    const drawing: ChartDrawing = {
      id: "vertical",
      kind: "vertical",
      anchors: [{ time: 100 as Time, price: 9000 }],
      color: "#2962ff",
      width: 2,
    };
    const f = fixture("pane-interactions", JSON.stringify([drawing]));
    const source = f.series.getPane();
    vi.spyOn(f.series, "getPane").mockReturnValue(source);
    const indicator = {
      attachPrimitive: vi.fn(),
      detachPrimitive: vi.fn(),
    } as unknown as IPaneApi<Time>;
    f.chart.panes = () => [source, indicator];
    const session = f.open();
    f.click(100, 70, 1, 100);
    expect(f.change.mock.lastCall![0].selected?.id).toBe(drawing.id);
    expect(session.openSettings({ x: 100, y: 70 }, 1)).toBe(true);
    expect(f.change.mock.lastCall![0].settingsOpen).toBe(true);
    session.closeSettings();
    expect(session.openContextMenu({ x: 100, y: 70 }, { x: 200, y: 600 }, 1)).toBe(true);
    expect(f.change.mock.lastCall![0].contextPoint).toEqual({ x: 200, y: 600 });
    session.closeContextMenu();
    expect(session.blocksChartPan({ x: 100, y: 70 }, 1)).toBe(true);
    expect(session.beginDrag({ x: 100, y: 70 }, { paneIndex: 1 })).toBe(true);
    session.dragTo({ x: 160, y: 500 });
    session.endDrag(true);
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([{ time: 160, price: 9000 }]);
    session.undo();
    expect(session.getCommittedDrawings()![0]!.anchors).toEqual(drawing.anchors);
    expect(session.beginDrag({ x: 100, y: 70 }, { paneIndex: 1 })).toBe(true);
    session.dragTo({ x: 200, y: -50 });
    session.endDrag(false);
    expect(session.getCommittedDrawings()![0]!.anchors).toEqual(drawing.anchors);
    session.updateDrawing(drawing.id, { locked: true });
    expect(session.beginDrag({ x: 100, y: 70 }, { paneIndex: 1 })).toBe(false);
    expect(session.openSettings({ x: 100, y: 70 }, 1)).toBe(true);
    session.closeSettings();
    session.updateDrawing(drawing.id, { extendAcrossPanes: false });
    expect(session.blocksChartPan({ x: 100, y: 70 }, 1)).toBe(false);
    expect(session.openSettings({ x: 100, y: 70 }, 1)).toBe(false);
    session.dispose();
  });
  it("applies settings drafts, cancellation, interval visibility, deletion and undo to pane strokes", () => {
    const drawing: ChartDrawing = {
      id: "vertical",
      kind: "vertical",
      anchors: [{ time: 100 as Time, price: 4900 }],
      color: "#2962ff",
      width: 2,
    };
    const f = fixture("pane-extensions", JSON.stringify([drawing]));
    const sourcePane = f.series.getPane();
    vi.spyOn(f.series, "getPane").mockReturnValue(sourcePane);
    const primitives = new Set<IPanePrimitive<Time>>();
    const pane = {
      attachPrimitive: (primitive: IPanePrimitive<Time>) => {
        primitives.add(primitive);
      },
      detachPrimitive: (primitive: IPanePrimitive<Time>) => {
        primitives.delete(primitive);
        primitive.detached?.();
      },
    } as unknown as IPaneApi<Time>;
    f.chart.panes = () => [sourcePane, pane];
    const session = f.open(5);
    expect(primitives.size).toBe(1);
    session.selectDrawing(drawing.id);
    session.openSettings();
    session.previewSettings({ extendAcrossPanes: false });
    expect(primitives.size).toBe(0);
    session.closeSettings();
    expect(primitives.size).toBe(1);
    session.updateDrawing(drawing.id, { extendAcrossPanes: false });
    expect(primitives.size).toBe(0);
    expect(JSON.parse(f.saved()!)[0].extendAcrossPanes).toBe(false);
    session.undo();
    expect(primitives.size).toBe(1);
    session.toggleHidden();
    expect(primitives.size).toBe(0);
    session.toggleHidden();
    expect(primitives.size).toBe(1);
    session.updateDrawing(drawing.id, {
      visibility: sanitizeDrawingVisibility({ minutes: { enabled: true, min: 15, max: 30 } }),
    });
    expect(primitives.size).toBe(0);
    session.undo();
    expect(primitives.size).toBe(1);
    session.deleteDrawing(drawing.id);
    expect(primitives.size).toBe(0);
    session.undo();
    expect(primitives.size).toBe(1);
    session.dispose();
    expect(primitives.size).toBe(0);
  });
});

describe("drawing copy and paste", () => {
  const original: ChartDrawing = {
    id: "clipboard-source",
    kind: "fib",
    anchors: [
      { time: 100 as Time, price: 4900 },
      { time: 300 as Time, price: 4800 },
    ],
    color: "#123456",
    width: 3,
    lineStyle: "dashed",
    name: "Research",
    locked: true,
    hidden: true,
    text: "Measured range",
    textBold: true,
    textOpacity: 0.4,
    levels: [{ value: 0.618, visible: true, color: "#ff9800" }],
  };

  it("copies a locked drawing read-only and pastes independent styled copies with atomic undo and reload", () => {
    const f = fixture("clipboard", JSON.stringify([original])),
      session = f.open();
    expect(session.copySelectedSerialized()).toBeNull();
    session.selectDrawing(original.id);
    const text = session.copySelectedSerialized()!;
    expect(parseDrawingClipboard(text)).toEqual(original);
    expect(f.writes()).toBe(0);
    expect(session.pasteDrawing(text)).toBe(true);
    expect(f.writes()).toBe(1);
    const after = f.saved()!,
      objects = JSON.parse(after);
    expect(objects[0]).toEqual(original);
    expect(objects[1]).toEqual({
      ...original,
      anchors: original.anchors.map((anchor) => ({ ...anchor, price: anchor.price + 40 })),
      id: expect.any(String),
      name: "Research copy",
      locked: false,
      hidden: false,
    });
    expect(objects[1].id).not.toBe(original.id);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selected: expect.objectContaining({ id: objects[1].id }),
        tool: "cursor",
      }),
    );
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([original]);
    session.redo();
    expect(f.saved()).toBe(after);
    expect(session.pasteDrawing(text)).toBe(true);
    const state = f.change.mock.calls.at(-1)![0];
    expect(new Set(state.objects.map((drawing: ChartDrawing) => drawing.id)).size).toBe(3);
    expect(state.objects[1].anchors).not.toBe(state.objects[2].anchors);
    expect(state.objects[2].anchors).toEqual(state.objects[1].anchors);
    expect(state.objects[1].levels[0]).not.toBe(state.objects[2].levels[0]);
    session.dispose();
    const reopened = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 3 }));
    reopened.dispose();
  });

  it("moves each pasted anchor 40 screen pixels upward on a logarithmic scale without changing times", () => {
    const source: ChartDrawing = {
      ...original,
      anchors: [
        { time: 100 as Time, price: 100 },
        { time: 300 as Time, price: 200 },
      ],
    };
    const f = fixture("clipboard-log", JSON.stringify([source]));
    const project = (price: number) => 500 - Math.log(price) * 100;
    vi.spyOn(f.series, "priceToCoordinate").mockImplementation(
      (price) => project(price) as Coordinate,
    );
    vi.spyOn(f.series, "coordinateToPrice").mockImplementation(
      (y) => Math.exp((500 - y) / 100) as BarPrice,
    );
    const session = f.open();
    expect(session.pasteDrawing(serializeDrawingClipboard(source)!)).toBe(true);
    const [unchanged, pasted] = JSON.parse(f.saved()!) as ChartDrawing[];
    expect(unchanged).toEqual(source);
    pasted!.anchors.forEach((anchor, index) => {
      expect(anchor.time).toBe(source.anchors[index]!.time);
      expect(project(anchor.price)).toBeCloseTo(project(source.anchors[index]!.price) - 40, 10);
    });
    expect(pasted!.anchors[0]!.price - source.anchors[0]!.price).not.toBeCloseTo(
      pasted!.anchors[1]!.price - source.anchors[1]!.price,
    );
    expect(f.writes()).toBe(1);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([source]);
    session.dispose();
  });

  it.each([
    "missing-coordinate",
    "invalid-coordinate",
    "missing-price",
    "invalid-price",
    "throws",
    "invalid-shape",
  ])("rejects %s projection atomically while retaining the current edit", (failure) => {
    const source = { ...original, kind: "ellipse" as const };
    const f = fixture(`clipboard-projection-${failure}`, JSON.stringify([source])),
      session = f.open();
    session.selectDrawing(source.id);
    session.openSettings();
    session.previewSettings({ color: "#00ff00" });
    const before = f.change.mock.calls.length,
      saved = f.saved(),
      writes = f.writes();
    if (failure === "missing-coordinate")
      vi.spyOn(f.series, "priceToCoordinate")
        .mockReturnValueOnce(100 as Coordinate)
        .mockReturnValueOnce(null);
    if (failure === "invalid-coordinate")
      vi.spyOn(f.series, "priceToCoordinate").mockReturnValue(Number.NaN as Coordinate);
    if (failure === "missing-price") vi.spyOn(f.series, "coordinateToPrice").mockReturnValue(null);
    if (failure === "invalid-price")
      vi.spyOn(f.series, "coordinateToPrice").mockReturnValue(Number.POSITIVE_INFINITY as BarPrice);
    if (failure === "throws")
      vi.spyOn(f.series, "priceToCoordinate").mockImplementation(() => {
        throw new Error("Chart removed");
      });
    if (failure === "invalid-shape")
      vi.spyOn(f.series, "coordinateToPrice").mockReturnValue(100 as BarPrice);
    expect(session.pasteDrawing(serializeDrawingClipboard(source)!)).toBe(false);
    expect(f.change.mock.calls.length).toBe(before);
    expect(f.saved()).toBe(saved);
    expect(f.writes()).toBe(writes);
    vi.restoreAllMocks();
    session.applySettings({ color: "#00ff00" });
    expect(JSON.parse(f.saved()!)).toEqual([{ ...source, color: "#00ff00" }]);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([source]);
    session.dispose();
  });

  it("uses the clicked drawing for system clipboard writes and reports denied or unavailable access", async () => {
    const f = fixture("clipboard-system", JSON.stringify([original])),
      session = f.open();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    try {
      expect(await session.copyDrawing(original.id)).toBe(true);
      expect(parseDrawingClipboard(writeText.mock.calls[0]![0])).toEqual(original);
      expect(await session.copyDrawing("missing")).toBe(false);
      expect(writeText).toHaveBeenCalledTimes(1);
      writeText.mockRejectedValueOnce(new Error("Denied"));
      expect(await session.copyDrawing(original.id)).toBe(false);
      vi.stubGlobal("navigator", {});
      expect(await session.copyDrawing(original.id)).toBe(false);
      expect(f.writes()).toBe(0);
      session.dispose();
      expect(await session.copyDrawing(original.id)).toBe(false);
    } finally {
      session.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("ignores invalid text without cancelling active placement or changing history", () => {
    const f = fixture("clipboard-invalid"),
      session = f.open();
    session.setTool("rectangle");
    f.click(100, 100);
    const before = f.change.mock.calls.length;
    expect(session.pasteDrawing("hello world")).toBe(false);
    expect(
      session.pasteDrawing('{"type":"automorphic.chart-drawing","version":1,"drawing":{}}'),
    ).toBe(false);
    expect(f.change.mock.calls.length).toBe(before);
    expect(f.writes()).toBe(0);
    f.click(200, 200);
    expect(JSON.parse(f.saved()!)).toHaveLength(1);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    session.dispose();
    expect(session.pasteDrawing(serializeDrawingClipboard(original)!)).toBe(false);
    expect(session.copySelectedSerialized()).toBeNull();
  });

  it("discards preview settings before paste and cannot later restore those uncommitted edits", () => {
    const f = fixture("clipboard-settings", JSON.stringify([original])),
      session = f.open();
    session.selectDrawing(original.id);
    session.openSettings();
    session.previewSettings({ color: "#00ff00", text: "Not saved" });
    const text = session.copySelectedSerialized()!;
    expect(parseDrawingClipboard(text)).toEqual(original);
    expect(session.pasteDrawing(text)).toBe(true);
    expect(f.writes()).toBe(1);
    session.closeSettings();
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([original]);
    session.dispose();
  });

  it("cancels a transient clone before one paste and does not save pending standalone text", () => {
    const f = fixture("clipboard-draft"),
      session = f.open();
    session.setTool("rectangle");
    f.click(100, 100);
    f.click(200, 200);
    const before = f.saved()!,
      text = session.copySelectedSerialized()!,
      writes = f.writes();
    session.beginDrag({ x: 150, y: 100 }, { clone: true });
    session.dragTo({ x: 250, y: 150 });
    expect(session.copySelectedSerialized()).toBeNull();
    expect(session.pasteDrawing(text)).toBe(true);
    session.endDrag();
    expect(JSON.parse(f.saved()!)).toHaveLength(2);
    expect(f.writes()).toBe(writes + 1);
    session.undo();
    expect(f.saved()).toBe(before);
    session.setTool("text");
    f.click(400, 300);
    session.previewText("Pending draft");
    expect(session.copySelectedSerialized()).toBeNull();
    expect(session.pasteDrawing(text)).toBe(true);
    expect(JSON.parse(f.saved()!).map((drawing: ChartDrawing) => drawing.kind)).toEqual([
      "rectangle",
      "rectangle",
    ]);
    session.undo();
    expect(f.saved()).toBe(before);
    session.dispose();
  });

  it("refuses a paste at the 100-object limit without evicting or mutating drawings", () => {
    const originals = Array.from({ length: 100 }, (_, index) => ({
      ...original,
      id: `source-${index}`,
    }));
    const f = fixture("clipboard-cap", JSON.stringify(originals)),
      session = f.open();
    session.selectDrawing("source-50");
    const text = session.copySelectedSerialized()!,
      before = f.change.mock.calls.length;
    expect(session.pasteDrawing(text)).toBe(false);
    expect(f.writes()).toBe(0);
    expect(f.change.mock.calls.length).toBe(before);
    expect(JSON.parse(f.saved()!)).toEqual(originals);
    session.dispose();
  });
});

describe("direct drawing placement", () => {
  it("ignores chart placement clicks and commits two consecutive rectangle points exactly once", () => {
    const f = fixture("direct-rectangle"),
      session = f.open(1, true);
    session.setTool("rectangle");
    f.click(900, 400, 0, 900);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 0, pending: false }),
    );
    expect(session.placeAt({ x: 100, y: 120 })).toBe(true);
    // A chart-generated click between native pointer events must not add another anchor.
    f.click(500, 300, 0, 500);
    expect(f.saved()).toBeNull();
    expect(session.placeAt({ x: 450, y: 175 })).toBe(true);
    expect(f.writes()).toBe(1);
    const saved = f.saved();
    expect(JSON.parse(saved!)).toEqual([
      expect.objectContaining({
        kind: "rectangle",
        anchors: [
          { time: 100, price: 4880 },
          { time: 450, price: 4825 },
        ],
      }),
    ]);
    expect(session.placeAt({ x: 700, y: 250 })).toBe(false);
    expect(f.saved()).toBe(saved);
    expect(f.writes()).toBe(1);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ canUndo: false }));
    session.redo();
    expect(f.saved()).toBe(saved);
    session.dispose();
    const restored = f.open(1, true);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 1 }));
    expect(f.saved()).toBe(saved);
    restored.dispose();
  });

  it("uses actual point projection and candle OHLC magnet snapping for direct anchors", () => {
    const f = fixture("direct-magnet", null, [
      { time: 100 as UTCTimestamp, open: 4890, high: 4940, low: 4840, close: 4870 },
      { time: 300 as UTCTimestamp, open: 4790, high: 4810, low: 4750, close: 4760 },
    ]);
    const session = f.open(1, true);
    session.toggleMagnet();
    session.setTool("rectangle");
    session.placeAt({ x: 104, y: 115 });
    session.placeAt({ x: 304, y: 205 });
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 100, price: 4890 },
      { time: 300, price: 4790 },
    ]);
    expect(f.writes()).toBe(1);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    session.redo();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 100, price: 4890 },
      { time: 300, price: 4790 },
    ]);
    session.dispose();
  });

  it("uses pointer selection and ignores duplicate chart clicks in direct-placement mode", () => {
    const f = fixture("direct-cursor"),
      session = f.open(1, true);
    session.setTool("rectangle");
    session.placeAt({ x: 100, y: 100 });
    session.placeAt({ x: 200, y: 200 });
    const saved = f.saved();
    session.beginDrag({ x: 800, y: 400 });
    f.click(800, 400, 0, 800);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ selected: null }));
    const emissions = f.change.mock.calls.length;
    expect(session.placeAt({ x: 100, y: 100 })).toBe(false);
    expect(f.change.mock.calls).toHaveLength(emissions);
    session.beginDrag({ x: 100, y: 100 });
    session.endDrag();
    f.click(800, 400, 0, 800);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ kind: "rectangle" }) }),
    );
    expect(f.saved()).toBe(saved);
    expect(f.writes()).toBe(1);
    session.dispose();
  });
});

describe("modifier-drag cloning", () => {
  it("keeps the original unchanged while previewing a styled clone, then commits one undoable copy", () => {
    const f = fixture("clone-drag-commit"),
      session = f.open();
    session.setTool("rectangle");
    f.click(100, 100);
    f.click(200, 200);
    session.updateSelected({
      name: "Opening range",
      color: "#123456",
      background: true,
      backgroundOpacity: 0.3,
    });
    const before = f.saved(),
      original = JSON.parse(before!)[0],
      writes = f.writes();
    const defaults = f.controls.get(DRAWING_DEFAULTS_KEY);
    expect(session.beginDrag({ x: 150, y: 100 }, { clone: true })).toBe(true);
    session.dragTo({ x: 200, y: 125 });
    session.dragTo({ x: 250, y: 150 });
    expect(f.saved()).toBe(before);
    expect(f.writes()).toBe(writes);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        count: 2,
        objects: [
          original,
          expect.objectContaining({
            name: "Opening range copy",
            color: "#123456",
            backgroundOpacity: 0.3,
          }),
        ],
      }),
    );
    session.endDrag();
    expect(f.writes()).toBe(writes + 1);
    const after = f.saved(),
      [unchanged, clone] = JSON.parse(after!);
    expect(unchanged).toEqual(original);
    expect(clone.id).not.toBe(original.id);
    expect(clone.anchors).toEqual([
      { time: 200, price: 4850 },
      { time: 300, price: 4750 },
    ]);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ id: clone.id }) }),
    );
    expect(f.controls.get(DRAWING_DEFAULTS_KEY)).toBe(defaults);
    session.undo();
    expect(f.saved()).toBe(before);
    session.redo();
    expect(f.saved()).toBe(after);
    session.dispose();
    const reopened = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 2 }));
    reopened.dispose();
  });

  it.each(["pointercancel", "escape", "undo", "tool", "return", "dispose"])(
    "abandons a clone on %s without storing it or changing the source",
    (action) => {
      const f = fixture(`clone-drag-cancel-${action}`),
        session = f.open();
      session.setTool("rectangle");
      f.click(100, 100);
      f.click(200, 200);
      const before = f.saved(),
        writes = f.writes();
      session.beginDrag({ x: 150, y: 100 }, { clone: true });
      session.dragTo({ x: 250, y: 150 });
      if (action === "pointercancel") session.endDrag(false);
      else if (action === "escape") session.cancel();
      else if (action === "undo") session.undo();
      else if (action === "tool") session.setTool("trend");
      else if (action === "return") {
        session.dragTo({ x: 150, y: 100 });
        session.endDrag();
      } else session.dispose();
      expect(f.saved()).toBe(before);
      expect(f.writes()).toBe(writes);
      if (action !== "dispose") {
        expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 1 }));
        session.undo();
        expect(JSON.parse(f.saved()!)).toEqual([]);
      }
      session.dispose();
    },
  );

  it("does not clone on a click or pointer jitter, and modifier endpoint drags still resize", () => {
    const f = fixture("clone-drag-click"),
      session = f.open();
    session.setTool("rectangle");
    f.click(100, 100);
    f.click(200, 200);
    const before = f.saved(),
      writes = f.writes();
    session.beginDrag({ x: 150, y: 100 }, { clone: true });
    session.dragTo({ x: 151, y: 101 });
    session.endDrag();
    expect(f.saved()).toBe(before);
    expect(f.writes()).toBe(writes);
    session.beginDrag({ x: 100, y: 100 }, { clone: true });
    session.dragTo({ x: 120, y: 120 });
    session.endDrag();
    const result = JSON.parse(f.saved()!);
    expect(result).toHaveLength(1);
    expect(result[0].anchors).toEqual([
      { time: 120, price: 4880 },
      { time: 200, price: 4800 },
    ]);
    session.dispose();
  });

  it("snaps a clone using one reference point while preserving both original anchors and clone shape", () => {
    const f = fixture("clone-drag-magnet", null, [
      { time: 200 as UTCTimestamp, open: 4890, high: 4940, low: 4840, close: 4870 },
    ]);
    const session = f.open();
    session.setTool("rectangle");
    f.click(100, 100);
    f.click(200, 200);
    const original = JSON.parse(f.saved()!)[0];
    session.toggleMagnet();
    session.beginDrag({ x: 150, y: 100 }, { clone: true });
    session.dragTo({ x: 254, y: 115 });
    session.endDrag();
    const [source, clone] = JSON.parse(f.saved()!);
    expect(source).toEqual(original);
    expect(clone.anchors).toEqual([
      { time: 200, price: 4890 },
      { time: 300, price: 4790 },
    ]);
    session.dispose();
  });

  it("rejects cloning locked drawings and refuses to evict an existing drawing at capacity", () => {
    const f = fixture("clone-drag-locked"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    session.updateSelected({ locked: true });
    const before = f.saved(),
      writes = f.writes();
    expect(session.beginDrag({ x: 400, y: 100 }, { clone: true })).toBe(false);
    session.dragTo({ x: 500, y: 150 });
    session.endDrag();
    expect(f.saved()).toBe(before);
    expect(f.writes()).toBe(writes);
    session.dispose();
    const full = JSON.stringify(
      Array.from({ length: 100 }, (_, i) => ({
        ...JSON.parse(before!)[0],
        id: `full-${i}`,
        locked: false,
      })),
    );
    const capacity = fixture("clone-drag-capacity", full),
      bounded = capacity.open();
    expect(bounded.beginDrag({ x: 400, y: 100 }, { clone: true })).toBe(false);
    bounded.dragTo({ x: 500, y: 150 });
    bounded.endDrag();
    expect(capacity.saved()).toBe(full);
    expect(capacity.writes()).toBe(0);
    bounded.dispose();
  });

  it("removes horizontal clone previews on cancellation and preserves an existing redo branch", () => {
    const f = fixture("clone-drag-redo"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    session.setTool("horizontal");
    f.click(200, 200);
    const twoLines = f.saved();
    session.undo();
    const oneLine = f.saved(),
      writes = f.writes();
    session.beginDrag({ x: 400, y: 100 }, { clone: true });
    session.dragTo({ x: 500, y: 150 });
    expect(f.priceLines).toMatchObject([{ price: 4900 }, { price: 4850 }]);
    session.endDrag(false);
    expect(f.priceLines).toMatchObject([{ price: 4900 }]);
    expect(f.priceLines).toHaveLength(1);
    expect(f.saved()).toBe(oneLine);
    expect(f.writes()).toBe(writes);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ canRedo: true }));
    session.redo();
    expect(f.saved()).toBe(twoLines);
    session.dispose();
  });
});

describe("bulk drawing controls", () => {
  it("locks mixed drawings together, preserves individual state on one undo, and restores locks", () => {
    const f = fixture("bulk-lock"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    session.setTool("horizontal");
    f.click(200, 200);
    const [first, second] = JSON.parse(f.saved()!);
    session.updateDrawing(first.id, { locked: true });
    const original = f.saved();
    const writes = f.writes();
    session.toggleLocked();
    expect(f.writes()).toBe(writes + 1);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ allLocked: true }));
    expect(JSON.parse(f.saved()!).map((item: { locked: boolean }) => item.locked)).toEqual([
      true,
      true,
    ]);
    session.undo();
    expect(f.saved()).toBe(original);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ allLocked: false }));
    session.redo();
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ allLocked: true }));
    restored.toggleLocked();
    expect(JSON.parse(f.saved()!).map((item: { locked: boolean }) => item.locked)).toEqual([
      false,
      false,
    ]);
    restored.selectDrawing(second.id);
    expect(restored.beginDrag({ x: 50, y: 200 })).toBe(true);
    restored.endDrag(false);
    restored.dispose();
  });

  it("removes only unlocked drawings by default, keeps a locked selection, and permits explicit removal", () => {
    const f = fixture("bulk-remove"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    session.setTool("horizontal");
    f.click(200, 200);
    const [first] = JSON.parse(f.saved()!);
    session.updateDrawing(first.id, { locked: true });
    session.selectDrawing(first.id);
    const original = f.saved();
    const writes = f.writes();
    session.removeDrawings();
    expect(f.writes()).toBe(writes + 1);
    expect(JSON.parse(f.saved()!)).toHaveLength(1);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selected: expect.objectContaining({ id: first.id }),
        allLocked: true,
      }),
    );
    session.removeDrawings();
    expect(f.writes()).toBe(writes + 1);
    session.undo();
    expect(f.saved()).toBe(original);
    session.removeDrawings(true);
    expect(f.saved()).toBe("[]");
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: null, allLocked: false }),
    );
    session.undo();
    expect(f.saved()).toBe(original);
    session.clear();
    expect(f.saved()).toBe("[]");
    session.dispose();
  });

  it("discards uncommitted settings before bulk decisions and preserves the canonical values in undo", () => {
    for (const action of ["lock", "remove"] as const) {
      const f = fixture(`bulk-draft-${action}`),
        session = f.open();
      session.setTool("horizontal");
      f.click(100, 100);
      const original = f.saved();
      session.openSettings();
      session.previewSettings({ locked: true, color: "#ff0000" });
      if (action === "lock") session.toggleLocked();
      else session.removeDrawings();
      expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ settingsOpen: false }));
      if (action === "lock")
        expect(JSON.parse(f.saved()!)[0]).toMatchObject({
          color: JSON.parse(original!)[0].color,
          locked: true,
        });
      else expect(f.saved()).toBe("[]");
      session.undo();
      expect(f.saved()).toBe(original);
      session.dispose();
    }
  });

  it("persists the removal preference alongside magnet and keep-drawing settings with safe legacy defaults", () => {
    const key = "automorphic:drawing-controls:v1";
    const f = fixture("bulk-controls");
    f.controls.set(
      key,
      JSON.stringify({ magnetMode: "strong", keepDrawing: true, alwaysRemoveLocked: "true" }),
    );
    const session = f.open();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        alwaysRemoveLocked: false,
        magnetMode: "strong",
        keepDrawing: true,
      }),
    );
    session.setAlwaysRemoveLocked(true);
    session.toggleMagnet();
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ alwaysRemoveLocked: true, magnetMode: "off", keepDrawing: true }),
    );
    restored.toggleMagnet();
    restored.setAlwaysRemoveLocked(false);
    expect(JSON.parse(f.controls.get(key)!)).toEqual({
      magnetMode: "strong",
      lastMagnetMode: "strong",
      keepDrawing: true,
      alwaysRemoveLocked: false,
    });
    expect(f.writes()).toBe(0);
    restored.dispose();
  });
});

describe("native chart drawing lifecycle", () => {
  it("places a horizontal line at the clicked price and restores it after chart recreation", () => {
    const f = fixture("draw-test-horizontal");
    const first = f.open();
    first.setTool("horizontal");
    f.click(undefined, 125);
    expect(f.priceLines).toMatchObject([
      { price: 4875, lineVisible: false, axisLabelVisible: true },
    ]);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "cursor", count: 1, pending: false }),
    );
    first.dispose();
    expect(f.priceLines).toEqual([]);
    expect(f.listener()).toBeUndefined();
    const second = f.open();
    expect(f.priceLines).toMatchObject([
      { price: 4875, lineVisible: false, axisLabelVisible: true },
    ]);
    second.clear();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    second.dispose();
  });

  it("retains backwards trend anchors, ignores identical clicks, and avoids inserting artificial series data", () => {
    const f = fixture("draw-test-trend"),
      session = f.open();
    session.setTool("trend");
    f.click(200, 100);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "trend", count: 0, pending: true }),
    );
    f.click(200, 100);
    expect(f.lines).toHaveLength(0);
    f.click(100, 150);
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 200, price: 4900 },
      { time: 100, price: 4850 },
    ]);
    expect(f.lines).toHaveLength(0);
    session.dispose();
  });

  it.each([
    [100, 150],
    [150, 100],
  ])("creates and restores same-bar trend endpoints at y %s and %s", (firstY, secondY) => {
    const f = fixture(`vertical-trend-${firstY}`),
      session = f.open();
    session.setTool("trend");
    f.click(200, firstY);
    f.click(200, secondY);
    const [created] = JSON.parse(f.saved()!) as ChartDrawing[];
    expect(created?.anchors).toEqual([
      { time: 200, price: 5000 - firstY },
      { time: 200, price: 5000 - secondY },
    ]);
    expect(f.lines).toHaveLength(0);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    session.redo();
    expect(JSON.parse(f.saved()!)).toEqual([created]);
    session.dispose();
    const reopened = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ objects: [created] }));
    reopened.dispose();
  });

  it("cancels an unfinished trend without removing a committed drawing, then undoes it", () => {
    const f = fixture("draw-test-undo"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100);
    session.setTool("trend");
    f.click(100);
    session.undo();
    expect(f.priceLines).toHaveLength(1);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "cursor", count: 1, pending: false }),
    );
    session.undo();
    expect(f.priceLines).toHaveLength(0);
    expect(JSON.parse(f.saved()!)).toEqual([]);
    session.dispose();
  });

  it("ignores other panes; cancelling never persists half a drawing", () => {
    const f = fixture("draw-test-cancel"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100, 1);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "trend", count: 0, pending: false }),
    );
    f.click(100);
    session.cancel();
    f.click(200);
    expect(f.lines).toEqual([]);
    expect(f.saved()).toBeNull();
    session.dispose();
  });

  it("rejects corrupt records and identical trend endpoints during persistence restore", () => {
    const f = fixture(
      "draw-test-invalid",
      JSON.stringify([
        { kind: "horizontal", price: "NaN" },
        { kind: "horizontal", price: 4200 },
        {
          kind: "trend",
          from: { time: "2026-02-30", price: 1 },
          to: { time: "2026-03-01", price: 2 },
        },
        { kind: "trend", from: { time: 100, price: 1 }, to: { time: 100, price: 1 } },
      ]),
    );
    const session = f.open();
    expect(f.priceLines).toHaveLength(1);
    expect(f.lines).toHaveLength(0);
    session.dispose();
    session.dispose();
    expect(f.listener()).toBeUndefined();
  });
  it("creates every new tool with the right anchor count and restores it after recreation", () => {
    const f = fixture("drawing-tools"),
      session = f.open();
    for (const kind of [
      "ray",
      "horizontal-ray",
      "vertical",
      "rectangle",
      "fib",
      "channel",
      "text",
    ] as const) {
      session.setTool(kind);
      f.click(100, 100);
      if (["ray", "rectangle", "fib", "channel"].includes(kind)) f.click(200, 200);
      if (kind === "channel") {
        expect(f.change).toHaveBeenLastCalledWith(
          expect.objectContaining({ tool: "channel", pending: true }),
        );
        f.click(150, 250);
      }
      if (kind === "text") session.commitText("Annotation");
    }
    expect(JSON.parse(f.saved()!).map((item: { kind: string }) => item.kind)).toEqual([
      "ray",
      "horizontal-ray",
      "vertical",
      "rectangle",
      "fib",
      "channel",
      "text",
    ]);
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 7 }));
    restored.dispose();
  });

  it("selects a drawing, persists edits and repositioning, and supports delete/undo/clear/undo", () => {
    const f = fixture("drawing-edits"),
      session = f.open();
    session.setTool("rectangle");
    f.click(100, 100);
    f.click(200, 200);
    f.click(400, 400, 0, 400);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ selected: null }));
    f.click(150, 100, 0, 150);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ kind: "rectangle" }) }),
    );
    session.updateSelected({ color: "#ff0000", width: 3 });
    const before = JSON.parse(f.saved()!)[0];
    session.redrawSelected();
    f.click(300, 120);
    expect(JSON.parse(f.saved()!)[0].anchors[0].time).toBe(100);
    f.click(500, 220);
    expect(JSON.parse(f.saved()!)[0]).toMatchObject({
      id: before.id,
      color: "#ff0000",
      width: 3,
      anchors: [{ time: 300 }, { time: 500 }],
    });
    session.deleteSelected();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    session.undo();
    expect(JSON.parse(f.saved()!)).toHaveLength(1);
    session.clear();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 0, canUndo: true }));
    session.undo();
    expect(JSON.parse(f.saved()!)).toHaveLength(1);
    session.dispose();
  });

  it("persists text annotations and ignores degenerate ray clicks", () => {
    const f = fixture("drawing-text"),
      session = f.open();
    session.setTool("ray");
    f.click(100, 100);
    f.click(100, 100);
    expect(f.saved()).toBeNull();
    session.cancel();
    session.setTool("text");
    f.click(100, 100);
    session.commitText("Buy only above range");
    expect(JSON.parse(f.saved()!)[0].text).toBe("Buy only above range");
    session.dispose();
  });

  it("moves a complete drawing without changing its shape, commits once, and restores undo/redo", () => {
    const f = fixture("drawing-drag"),
      session = f.open();
    session.setTool("rectangle");
    f.click(100, 100);
    f.click(200, 200);
    const before = f.saved();
    expect(session.beginDrag({ x: 150, y: 100 })).toBe(true);
    session.dragTo({ x: 175, y: 125 });
    session.dragTo({ x: 200, y: 150 });
    expect(f.saved()).toBe(before);
    session.endDrag();
    const after = f.saved();
    expect(JSON.parse(after!)[0].anchors).toEqual([
      { time: 150, price: 4850 },
      { time: 250, price: 4750 },
    ]);
    session.undo();
    expect(f.saved()).toBe(before);
    session.redo();
    expect(f.saved()).toBe(after);
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 1 }));
    restored.dispose();
  });

  it("resizes only the chosen handle, rejects collapsed anchors, and cancels without persistence", () => {
    const f = fixture("drawing-resize"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    const before = f.saved();
    expect(session.beginDrag({ x: 200, y: 200 })).toBe(true);
    session.dragTo({ x: 100, y: 100 });
    session.endDrag();
    expect(f.saved()).toBe(before);
    session.beginDrag({ x: 200, y: 200 });
    session.dragTo({ x: 300, y: 250 });
    session.cancel();
    expect(f.saved()).toBe(before);
    session.beginDrag({ x: 200, y: 200 });
    session.dragTo({ x: 300, y: 250 });
    session.endDrag();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 100, price: 4900 },
      { time: 300, price: 4750 },
    ]);
    session.dispose();
  });

  it("persists locks and line styles, makes hidden drawings inert, and invalidates redo on new edits", () => {
    const f = fixture("drawing-lock"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    session.updateSelected({ locked: true, lineStyle: "dotted" });
    expect(session.beginDrag({ x: 300, y: 100 })).toBe(false);
    session.dispose();
    const restored = f.open();
    f.click(100, 100);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selected: expect.objectContaining({ locked: true, lineStyle: "dotted" }),
      }),
    );
    restored.updateSelected({ locked: false });
    restored.toggleHidden();
    expect(f.priceLines).toHaveLength(0);
    expect(restored.beginDrag({ x: 300, y: 100 })).toBe(false);
    restored.toggleHidden();
    expect(f.priceLines).toHaveLength(1);
    expect(restored.beginDrag({ x: 300, y: 100 })).toBe(true);
    restored.dragTo({ x: 400, y: 150 });
    restored.endDrag();
    expect(f.priceLines).toMatchObject([{ price: 4850 }]);
    restored.undo();
    expect(f.priceLines).toMatchObject([{ price: 4900 }]);
    restored.setTool("text");
    f.click(200, 200);
    restored.commitText("New annotation");
    restored.redo();
    expect(JSON.parse(f.saved()!).map((drawing: { kind: string }) => drawing.kind)).toEqual([
      "horizontal",
      "text",
    ]);
    restored.dispose();
  });

  it("snaps placement to nearby OHLC only while magnet is enabled and leaves gaps free", () => {
    const f = fixture("drawing-magnet-placement", null, [
      { time: 100 as UTCTimestamp, open: 4890, high: 4940, low: 4840, close: 4870 },
    ]);
    const session = f.open();
    session.setTool("horizontal");
    f.click(100, 115, 0, 100);
    expect(f.priceLines).toMatchObject([{ price: 4885 }]);
    session.toggleMagnet();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ magnet: true }));
    for (const [y, price] of [
      [115, 4890],
      [55, 4940],
      [165, 4840],
      [135, 4870],
    ]) {
      session.setTool("horizontal");
      f.click(100, y, 0, 104);
      expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 100, price }]);
    }
    session.setTool("text");
    f.click(100, 10, 0, 100);
    session.commitText("Above candle");
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 100, price: 4990 }]);
    session.setTool("text");
    f.click(300, 115, 0, 300);
    session.commitText("Future annotation");
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 300, price: 4885 }]);
    session.toggleMagnet();
    session.setTool("horizontal");
    f.click(100, 115, 0, 100);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 100, price: 4885 }]);
    session.dispose();
  });

  it("snaps dragged handles and translates whole drawings without distorting their shape", () => {
    const f = fixture("drawing-magnet-drag", null, [
      { time: 200 as UTCTimestamp, open: 4860, high: 4900, low: 4800, close: 4840 },
      { time: 300 as UTCTimestamp, open: 4760, high: 4790, low: 4740, close: 4750 },
    ]);
    const session = f.open();
    session.setTool("rectangle");
    f.click(100, 100);
    f.click(200, 200);
    session.toggleMagnet();
    expect(session.beginDrag({ x: 150, y: 100 })).toBe(true);
    session.dragTo({ x: 253, y: 137 });
    session.endDrag();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 200, price: 4860 },
      { time: 300, price: 4760 },
    ]);
    session.undo();
    expect(session.beginDrag({ x: 200, y: 200 })).toBe(true);
    // First click selects the object; a second gesture addresses its resize handle.
    session.endDrag();
    expect(session.beginDrag({ x: 200, y: 200 })).toBe(true);
    session.dragTo({ x: 304, y: 246 });
    session.endDrag();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 100, price: 4900 },
      { time: 300, price: 4750 },
    ]);
    session.undo();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 100, price: 4900 },
      { time: 200, price: 4800 },
    ]);
    session.dispose();
  });
  it("manages object names, visibility and locks independently and restores them", () => {
    const f = fixture("object-manager"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    const firstId = JSON.parse(f.saved()!)[0].id;
    session.setTool("rectangle");
    f.click(200, 200);
    f.click(300, 300);
    const secondId = JSON.parse(f.saved()!)[1].id;
    session.selectDrawing(firstId);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objects: expect.arrayContaining([
          expect.objectContaining({ id: firstId }),
          expect.objectContaining({ id: secondId }),
        ]),
        selected: expect.objectContaining({ id: firstId }),
      }),
    );
    session.updateDrawing(firstId, { name: "  Entry  ", hidden: true, locked: true });
    expect(f.priceLines).toHaveLength(0);
    expect(session.beginDrag({ x: 50, y: 100 })).toBe(false);
    session.selectDrawing(secondId);
    session.updateDrawing(secondId, { hidden: true });
    expect(session.beginDrag({ x: 250, y: 200 })).toBe(false);
    session.undo();
    expect(session.beginDrag({ x: 250, y: 200 })).toBe(true);
    session.endDrag(false);
    session.redo();
    expect(session.beginDrag({ x: 250, y: 200 })).toBe(false);
    session.dispose();
    const restored = f.open();
    expect(f.priceLines).toHaveLength(0);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objects: expect.arrayContaining([
          expect.objectContaining({ id: firstId, name: "Entry", hidden: true, locked: true }),
          expect.objectContaining({ id: secondId, hidden: true }),
        ]),
      }),
    );
    restored.updateDrawing(firstId, { hidden: false });
    expect(f.priceLines).toHaveLength(1);
    expect(restored.beginDrag({ x: 50, y: 100 })).toBe(false);
    restored.updateDrawing(firstId, { locked: false });
    expect(restored.beginDrag({ x: 50, y: 100 })).toBe(true);
    restored.endDrag(false);
    restored.dispose();
  });

  it("duplicates independent objects and undoes deletion without losing metadata", () => {
    const f = fixture("object-copy"),
      session = f.open();
    session.setTool("text");
    f.click(100, 100);
    session.commitText("Wait for breakout");
    const originalId = JSON.parse(f.saved()!)[0].id;
    session.updateDrawing(originalId, { name: "Plan", text: "Wait for breakout", locked: true });
    session.duplicateDrawing(originalId);
    const objects = JSON.parse(f.saved()!);
    const copyId = objects[1].id;
    expect(copyId).not.toBe(originalId);
    expect(objects[1]).toMatchObject({
      name: "Plan copy",
      text: "Wait for breakout",
      locked: false,
      anchors: objects[0].anchors,
    });
    session.updateDrawing(copyId, { name: "Alternate", text: "Wait for retest" });
    expect(JSON.parse(f.saved()!)[0]).toMatchObject({ name: "Plan", text: "Wait for breakout" });
    session.deleteDrawing(originalId);
    expect(JSON.parse(f.saved()!).map((item: { id: string }) => item.id)).toEqual([copyId]);
    session.undo();
    expect(JSON.parse(f.saved()!)).toHaveLength(2);
    session.redo();
    expect(JSON.parse(f.saved()!)).toHaveLength(1);
    session.selectDrawing(copyId);
    session.redrawSelected();
    f.click(300, 200);
    expect(JSON.parse(f.saved()!)[0]).toMatchObject({
      name: "Alternate",
      text: "Wait for retest",
      anchors: [{ time: 300, price: 4800 }],
    });
    const saved = f.saved();
    session.deleteDrawing("missing");
    session.updateDrawing("missing", { name: "Invalid" });
    expect(f.saved()).toBe(saved);
    session.dispose();
  });
  it("places all fixed geometric tools with complete anchors and round-trips them", () => {
    const f = fixture("geometric-placement"),
      session = f.open();
    const examples = [
      ["arrow-marker", 2],
      ["arrow", 2],
      ["arrow-up", 1],
      ["arrow-down", 1],
      ["rotated-rectangle", 3],
      ["circle", 2],
      ["ellipse", 2],
      ["triangle", 3],
      ["arc", 3],
      ["curve", 3],
      ["double-curve", 4],
    ] as const;
    for (const [kind, count] of examples) {
      const before = f.saved();
      session.setTool(kind);
      const points = [
        [100, 100],
        [200, 200],
        [150, 250],
        [250, 100],
      ] as const;
      points.slice(0, count).forEach(([time, y], index) => {
        f.click(time, y, 0, time);
        if (index < count - 1) expect(f.saved()).toBe(before);
      });
      expect(JSON.parse(f.saved()!).at(-1)).toMatchObject({ kind, anchors: expect.any(Array) });
      expect(JSON.parse(f.saved()!).at(-1).anchors).toHaveLength(count);
    }
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objects: expect.arrayContaining(
          examples.map(([kind]) => expect.objectContaining({ kind })),
        ),
      }),
    );
    restored.dispose();
  });

  it("finishes variable paths explicitly, ignores double-click duplicate endpoints, and cancels partial replacements", () => {
    const f = fixture("variable-path"),
      session = f.open();
    for (const kind of ["path", "polyline"] as const) {
      session.setTool(kind);
      f.click(100, 100, 0, 100);
      expect(session.finishDrawing()).toBe(false);
      f.click(200, 200, 0, 200);
      f.click(300, 150, 0, 300);
      f.click(300, 150, 0, 300);
      expect(f.change).toHaveBeenLastCalledWith(
        expect.objectContaining({ pending: true, tool: kind }),
      );
      expect(session.finishDrawing()).toBe(true);
      expect(JSON.parse(f.saved()!).at(-1).anchors).toHaveLength(3);
      expect(session.finishDrawing()).toBe(false);
    }
    const before = f.saved();
    session.redrawSelected();
    f.click(400, 150, 0, 400);
    session.cancel();
    expect(f.saved()).toBe(before);
    session.undo();
    expect(JSON.parse(f.saved()!)).toHaveLength(1);
    session.redo();
    expect(f.saved()).toBe(before);
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 2 }));
    restored.dispose();
  });

  it("samples freehand gestures, commits once on release, and edits their original handles", () => {
    const f = fixture("freehand"),
      session = f.open();
    for (const kind of ["brush", "highlighter"] as const) {
      const before = f.saved();
      session.setTool(kind);
      f.click(100, 100, 0, 100);
      expect(f.saved()).toBe(before);
      expect(session.beginDrag({ x: 100, y: 100 })).toBe(true);
      session.dragTo({ x: 101, y: 100 });
      session.dragTo({ x: 120, y: 100 });
      session.dragTo({ x: 140, y: 120 });
      expect(f.saved()).toBe(before);
      session.endDrag();
      const after = f.saved();
      expect(JSON.parse(after!).at(-1).anchors).toEqual([
        { time: 100, price: 4900 },
        { time: 120, price: 4900 },
        { time: 140, price: 4880 },
      ]);
      session.undo();
      expect(JSON.parse(f.saved()!)).toEqual(JSON.parse(before ?? "[]"));
      session.redo();
      expect(f.saved()).toBe(after);
    }
    const latest = JSON.parse(f.saved()!).at(-1);
    session.selectDrawing(latest.id);
    expect(session.beginDrag({ x: 140, y: 120 })).toBe(true);
    session.dragTo({ x: 160, y: 140 });
    session.endDrag();
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([
      { time: 100, price: 4900 },
      { time: 120, price: 4900 },
      { time: 160, price: 4860 },
    ]);
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ count: 2 }));
    restored.dispose();
  });

  it("discards cancelled and point-only strokes without consuming undo history", () => {
    const f = fixture("cancel-stroke"),
      session = f.open();
    session.setTool("brush");
    session.beginDrag({ x: 100, y: 100 });
    session.endDrag();
    expect(f.saved()).toBeNull();
    session.beginDrag({ x: 100, y: 100 });
    session.dragTo({ x: 200, y: 200 });
    session.endDrag(false);
    expect(f.saved()).toBeNull();
    session.beginDrag({ x: 100, y: 100 });
    session.dragTo({ x: 200, y: 200 });
    session.cancel();
    session.endDrag();
    expect(f.saved()).toBeNull();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ pending: false, canUndo: false, tool: "cursor" }),
    );
    session.dispose();
  });

  it("distinguishes weak, strong and off magnets without inventing candles in gaps", () => {
    const f = fixture("magnet-modes", null, [
        { time: 100 as UTCTimestamp, open: 4890, high: 4940, low: 4840, close: 4870 },
      ]),
      session = f.open();
    session.setKeepDrawing(true);
    session.setTool("horizontal");
    session.setMagnetMode("weak");
    f.click(105, 10, 0, 105);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 105, price: 4990 }]);
    session.setMagnetMode("strong");
    f.click(105, 10, 0, 105);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 100, price: 4940 }]);
    f.click(300, 10, 0, 300);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 300, price: 4990 }]);
    session.toggleMagnet();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ magnet: false, magnetMode: "off" }),
    );
    f.click(105, 115, 0, 105);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 105, price: 4885 }]);
    session.toggleMagnet();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ magnet: true, magnetMode: "strong" }),
    );
    session.setMagnetMode("weak");
    f.click(105, 115, 0, 105);
    expect(JSON.parse(f.saved()!).at(-1).anchors).toEqual([{ time: 100, price: 4890 }]);
    session.dispose();
  });

  it("repeats completed fixed, path and freehand tools while repositioning remains a single edit", () => {
    const f = fixture("keep-drawing"),
      session = f.open();
    session.setKeepDrawing(true);
    session.setTool("arrow-up");
    f.click(100, 100);
    f.click(200, 100);
    expect(JSON.parse(f.saved()!)).toHaveLength(2);
    session.setTool("path");
    for (let n = 0; n < 2; n++) {
      f.click(100, 100);
      f.click(200, 200);
      expect(session.finishDrawing()).toBe(true);
      expect(f.change).toHaveBeenLastCalledWith(
        expect.objectContaining({ tool: "path", pending: false }),
      );
    }
    session.setTool("highlighter");
    for (let n = 0; n < 2; n++) {
      session.beginDrag({ x: 100, y: 100 });
      session.dragTo({ x: 200, y: 200 });
      session.endDrag();
      expect(f.change).toHaveBeenLastCalledWith(
        expect.objectContaining({ tool: "highlighter", pending: false }),
      );
    }
    expect(JSON.parse(f.saved()!)).toHaveLength(6);
    session.redrawSelected();
    session.beginDrag({ x: 300, y: 100 });
    session.dragTo({ x: 400, y: 200 });
    session.endDrag();
    expect(JSON.parse(f.saved()!)).toHaveLength(6);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "cursor", keepDrawing: true }),
    );
    session.setKeepDrawing(false);
    session.setTool("arrow-down");
    f.click(100, 100);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "cursor", keepDrawing: false }),
    );
    session.dispose();
  });
  it("restores control preferences across chart recreation and remembers a disabled strong magnet", () => {
    const f = fixture("drawing-controls"),
      session = f.open();
    session.setMagnetMode("strong");
    session.setKeepDrawing(true);
    session.toggleMagnet();
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ magnetMode: "off", magnet: false, keepDrawing: true }),
    );
    restored.toggleMagnet();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ magnetMode: "strong", magnet: true, keepDrawing: true }),
    );
    expect(f.saved()).toBeNull();
    restored.dispose();
  });
});

describe("drawing settings interactions", () => {
  it("opens settings only on a drawing and selects right-click targets", () => {
    const f = fixture("settings-hit");
    const session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    expect(session.openSettings({ x: 150, y: 150 })).toBe(true);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ settingsOpen: true }));
    session.closeSettings();
    expect(session.openSettings({ x: 700, y: 400 })).toBe(false);
    expect(session.openContextMenu({ x: 150, y: 150 }, { x: 650, y: 450 })).toBe(true);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contextPoint: { x: 650, y: 450 },
        selected: expect.objectContaining({ kind: "trend" }),
      }),
    );
    session.closeContextMenu();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ contextPoint: null }));
    session.dispose();
  });
  it("persists one settings edit, undoes it atomically and rejects invalid coordinates", () => {
    const f = fixture("settings-save");
    const session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    const before = JSON.parse(f.saved()!)[0];
    session.updateSelected({
      extendLeft: true,
      endMarker: "arrow",
      text: "A+ setup",
      textFontSize: 18,
      textBold: true,
      showPriceLabel: true,
      anchors: [
        { time: 100 as UTCTimestamp, price: 4900 },
        { time: 250 as UTCTimestamp, price: 4750 },
      ],
    });
    expect(JSON.parse(f.saved()!)[0]).toMatchObject({
      extendLeft: true,
      endMarker: "arrow",
      text: "A+ setup",
      textFontSize: 18,
      anchors: [
        { time: 100, price: 4900 },
        { time: 250, price: 4750 },
      ],
    });
    session.undo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(before);
    session.redo();
    session.selectDrawing(before.id);
    const valid = f.saved();
    session.updateSelected({ anchors: [{ time: 100 as UTCTimestamp, price: 4900 }] });
    expect(f.saved()).toBe(valid);
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objects: [
          expect.objectContaining({ text: "A+ setup", extendLeft: true, endMarker: "arrow" }),
        ],
      }),
    );
    restored.dispose();
  });
  it("respects horizontal price label settings without losing the price line", () => {
    const f = fixture("settings-price-label");
    const session = f.open();
    session.setTool("horizontal");
    f.click(undefined, 125);
    session.updateSelected({ showPriceLabel: false });
    expect(f.priceLines).toMatchObject([{ price: 4875, axisLabelVisible: false }]);
    session.updateSelected({ showPriceLabel: true });
    expect(f.priceLines).toMatchObject([{ price: 4875, axisLabelVisible: true }]);
    session.dispose();
  });
});

describe("parallel channel coordinate offsets", () => {
  it.each([
    {
      name: "linear",
      times: [100, 300, 200],
      prices: [100, 300, 250],
      log: false,
      initial: 50,
      offset: -25,
      expected: 175,
    },
    {
      name: "gapped time",
      times: [100, 100000, 200],
      prices: [100, 300, 250],
      log: false,
      initial: 50,
      offset: 25,
      expected: 225,
    },
    {
      name: "logarithmic",
      times: [100, 300, 200],
      prices: [100, 400, 250],
      log: true,
      initial: 50,
      offset: -25,
      expected: 175,
    },
  ])(
    "reads and commits $name offsets in chart space while preserving anchor time",
    ({ name, times, prices, log, initial, offset, expected }) => {
      const original: ChartDrawing = {
        id: "parallel",
        kind: "channel",
        color: "#2962ff",
        width: 2,
        anchors: times.map((time, index) => ({ time: time as Time, price: prices[index]! })),
      };
      const f = fixture(`channel-coordinate-${name}`, JSON.stringify([original]));
      // Three consecutive chart bars may be separated by a weekend or session gap in real time.
      const positions = new Map([
        [times[0]!, 100],
        [times[1]!, 300],
        [times[2]!, 200],
      ]);
      const scale = f.chart.timeScale();
      vi.spyOn(f.chart, "timeScale").mockReturnValue({
        ...scale,
        timeToCoordinate: (time: Time) =>
          (positions.get(Number(time)) as Coordinate | undefined) ?? null,
      });
      if (log) {
        vi.spyOn(f.series, "priceToCoordinate").mockImplementation((price) =>
          price > 0 ? (-Math.log(price) as Coordinate) : null,
        );
        vi.spyOn(f.series, "coordinateToPrice").mockImplementation(
          (coordinate) => Math.exp(-coordinate) as BarPrice,
        );
      }
      const session = f.open();
      session.selectDrawing(original.id);
      expect(session.channelPriceOffset(original)).toBeCloseTo(initial, 10);
      const anchors = session.channelAnchorsAtOffset(original, offset)!;
      expect(anchors.slice(0, 2)).toEqual(original.anchors.slice(0, 2));
      expect(anchors[2]?.time).toBe(original.anchors[2]?.time);
      expect(anchors[2]?.price).toBeCloseTo(expected, 10);
      expect(session.channelPriceOffset({ ...original, anchors })).toBeCloseTo(offset, 10);
      expect(original.anchors[2]?.price).toBe(prices[2]);
      session.openSettings();
      session.previewSettings({ anchors });
      expect(f.change).toHaveBeenLastCalledWith(
        expect.objectContaining({ selected: { ...original, anchors } }),
      );
      expect(f.writes()).toBe(0);
      session.closeSettings();
      expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ selected: original }));
      expect(JSON.parse(f.saved()!)).toEqual([original]);
      session.openSettings();
      session.previewSettings({ anchors });
      session.applySettings({});
      expect(f.writes()).toBe(1);
      expect(JSON.parse(f.saved()!)).toEqual([{ ...original, anchors }]);
      session.undo();
      expect(JSON.parse(f.saved()!)).toEqual([original]);
      session.redo();
      expect(JSON.parse(f.saved()!)).toEqual([{ ...original, anchors }]);
      if (log) expect(session.channelAnchorsAtOffset(original, -300)).toBeNull();
      session.dispose();
    },
  );

  it("declines offsets when the baseline cannot be projected or the result is invalid", () => {
    const original: ChartDrawing = {
      id: "parallel",
      kind: "channel",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 100 },
        { time: 300 as Time, price: 300 },
        { time: 200 as Time, price: 250 },
      ],
    };
    const f = fixture("channel-coordinate-invalid"),
      session = f.open();
    expect(session.channelAnchorsAtOffset(original, NaN)).toBeNull();
    expect(session.channelAnchorsAtOffset(original, Infinity)).toBeNull();
    expect(session.channelPriceOffset({ ...original, kind: "triangle" })).toBeNull();
    expect(
      session.channelPriceOffset({
        ...original,
        anchors: [original.anchors[0]!, original.anchors[0]!, original.anchors[2]!],
      }),
    ).toBeNull();
    vi.spyOn(f.series, "coordinateToPrice").mockReturnValue(null);
    expect(session.channelPriceOffset(original)).toBeNull();
    expect(session.channelAnchorsAtOffset(original, 25)).toBeNull();
    expect(f.writes()).toBe(0);
    session.dispose();
  });
});

describe("trend-angle coordinate helpers", () => {
  const original: ChartDrawing = {
    id: "angle",
    kind: "trend-angle",
    color: "#2962ff",
    width: 2,
    anchors: [
      { time: 253 as Time, price: 4720 },
      { time: 439 as Time, price: 4785 },
    ],
  };
  it("preserves exact angle and length when native time lookup snaps, including market gaps and empty edges", () => {
    const times = [100, 200, 100_000, 100_100];
    const positions = new Map(times.map((time, index) => [time, 100 + index * 100]));
    const candles = times.map((time) => ({
      time: time as UTCTimestamp,
      open: 4800,
      high: 4900,
      low: 4700,
      close: 4800,
    }));
    const f = fixture("angle-snapped-time", null, candles);
    const scale = f.chart.timeScale();
    vi.spyOn(f.chart, "timeScale").mockReturnValue({
      ...scale,
      timeToCoordinate: (time: Time) =>
        (positions.get(Number(time)) as Coordinate | undefined) ?? null,
      coordinateToTime: (x: number) =>
        times.reduce((nearest, time) =>
          Math.abs(positions.get(time)! - x) < Math.abs(positions.get(nearest)! - x)
            ? time
            : nearest,
        ) as Time,
    });
    const session = f.open();
    const drawing: ChartDrawing = {
      ...original,
      anchors: [
        { time: 100 as Time, price: 4800 },
        { time: 200 as Time, price: 4900 },
      ],
    };
    const project = drawingProjection(f.chart, f.series);
    const first = project.project(drawing.anchors[0]!)!;
    const length = Math.hypot(100, 100);
    for (const degrees of [30, 180, -45]) {
      const anchors = session.anchorsAtAngle(drawing, degrees)!;
      const end = project.project(anchors[1]!)!;
      expect(end.x).toBeCloseTo(first.x + Math.cos((degrees * Math.PI) / 180) * length, 8);
      expect(end.y).toBeCloseTo(first.y - Math.sin((degrees * Math.PI) / 180) * length, 8);
      expect(Math.hypot(end.x - first.x, end.y - first.y)).toBeCloseTo(length, 8);
      expect(Math.abs(session.drawingAngle({ ...drawing, anchors })!)).toBeCloseTo(
        Math.abs(degrees),
        8,
      );
    }
    const rotated = { ...drawing, anchors: session.anchorsAtAngle(drawing, 30)! };
    const origin = { time: 100_000 as Time, price: 4700 };
    const translated = session.anchorsAtOrigin(rotated, origin)!;
    const a = project.project(translated[0]!)!,
      b = project.project(translated[1]!)!;
    expect(translated[0]).toEqual(origin);
    expect(b.x).toBeGreaterThan(400); // beyond the final candle, using its real interval
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(length, 8);
    expect(session.drawingAngle({ ...drawing, anchors: translated })).toBeCloseTo(30, 8);
    expect(f.writes()).toBe(0);
    session.dispose();
  });
  it("rotates the second projected endpoint at fixed length and saves through the normal draft transaction", () => {
    const f = fixture("angle-coordinate", JSON.stringify([original]));
    const session = f.open();
    const length = Math.hypot(186, 65);
    expect(session.drawingAngle(original)).toBeCloseTo((Math.atan2(65, 186) * 180) / Math.PI, 10);
    const anchors = session.anchorsAtAngle(original, 45)!;
    expect(anchors[0]).toEqual(original.anchors[0]);
    expect(Number(anchors[1]!.time)).toBeCloseTo(253 + length / Math.sqrt(2), 10);
    expect(anchors[1]!.price).toBeCloseTo(4720 + length / Math.sqrt(2), 10);
    expect(session.drawingAngle({ ...original, anchors })).toBeCloseTo(45, 10);
    expect(f.writes()).toBe(0);
    session.selectDrawing(original.id);
    session.openSettings();
    expect(session.previewSettings({ anchors })).toBe(true);
    expect(f.writes()).toBe(0);
    session.closeSettings();
    expect(session.getCommittedDrawings()).toEqual([original]);
    session.openSettings();
    session.previewSettings({ anchors });
    session.applySettings({});
    expect(JSON.parse(f.saved()!)).toEqual([{ ...original, anchors }]);
    expect(f.writes()).toBe(1);
    session.undo();
    expect(session.getCommittedDrawings()).toEqual([original]);
    session.redo();
    expect(session.getCommittedDrawings()).toEqual([{ ...original, anchors }]);
    session.dispose();
  });

  it("translates Point1 in projected space across nonlinear time and price scales", () => {
    const f = fixture("angle-origin");
    const scale = f.chart.timeScale();
    vi.spyOn(f.chart, "timeScale").mockReturnValue({
      ...scale,
      timeToCoordinate: (time: Time) => (100 * Math.log2(Number(time))) as Coordinate,
      coordinateToTime: (x: number) => (2 ** (x / 100)) as Time,
    });
    vi.spyOn(f.series, "priceToCoordinate").mockImplementation(
      (price) => (500 - 100 * Math.log(price)) as Coordinate,
    );
    vi.spyOn(f.series, "coordinateToPrice").mockImplementation(
      (y) => Math.exp((500 - y) / 100) as BarPrice,
    );
    const session = f.open();
    const drawing = {
      ...original,
      anchors: [
        { time: 4 as Time, price: 100 },
        { time: 8 as Time, price: 200 },
      ],
    };
    const angle = session.drawingAngle(drawing)!;
    const origin = { time: 16 as Time, price: 50 };
    const anchors = session.anchorsAtOrigin(drawing, origin)!;
    expect(anchors[0]).toEqual(origin);
    expect(Number(anchors[1]!.time)).toBeCloseTo(32, 10);
    expect(anchors[1]!.price).toBeCloseTo(100, 10);
    expect(session.drawingAngle({ ...drawing, anchors })).toBeCloseTo(angle, 10);
    const rotated = session.anchorsAtAngle(drawing, -30)!;
    expect(session.drawingAngle({ ...drawing, anchors: rotated })).toBeCloseTo(-30, 10);
    expect(drawing.anchors).toEqual([
      { time: 4, price: 100 },
      { time: 8, price: 200 },
    ]);
    expect(f.writes()).toBe(0);
    session.dispose();
  });

  it.each([0, 90, -90, 180, -180, 405])(
    "supports %s degrees without changing Point1 or pixel length",
    (degrees) => {
      const f = fixture("angle-cardinal"),
        session = f.open();
      const anchors = session.anchorsAtAngle(original, degrees)!;
      expect(anchors[0]).toEqual(original.anchors[0]);
      expect(Math.hypot(Number(anchors[1]!.time) - 253, anchors[1]!.price - 4720)).toBeCloseTo(
        Math.hypot(186, 65),
        10,
      );
      const expected =
        (Math.atan2(Math.sin((degrees * Math.PI) / 180), Math.cos((degrees * Math.PI) / 180)) *
          180) /
        Math.PI;
      expect(Math.abs(session.drawingAngle({ ...original, anchors })!)).toBeCloseTo(
        Math.abs(expected),
        10,
      );
      session.dispose();
    },
  );

  it("reads the current chart scale instead of preserving a stale data-space angle", () => {
    const f = fixture("angle-rescale"),
      session = f.open();
    const before = session.drawingAngle(original)!;
    vi.spyOn(f.series, "priceToCoordinate").mockImplementation(
      (price) => (2 * (5000 - price)) as Coordinate,
    );
    expect(session.drawingAngle(original)).toBeCloseTo((Math.atan2(130, 186) * 180) / Math.PI, 10);
    expect(session.drawingAngle(original)).not.toBe(before);
    session.dispose();
  });

  it("rejects invalid or unavailable transforms without mutating a drawing or writing storage", () => {
    const f = fixture("angle-invalid"),
      session = f.open();
    expect(session.anchorsAtAngle(original, NaN)).toBeNull();
    expect(session.anchorsAtAngle(original, Infinity)).toBeNull();
    expect(session.drawingAngle({ ...original, kind: "trend" })).toBeNull();
    expect(
      session.anchorsAtAngle(
        { ...original, anchors: [original.anchors[0]!, original.anchors[0]!] },
        45,
      ),
    ).toBeNull();
    expect(session.anchorsAtOrigin(original, { time: NaN as Time, price: 100 })).toBeNull();
    expect(session.anchorsAtOrigin(original, { time: 100 as Time, price: Infinity })).toBeNull();
    const inverse = vi.spyOn(f.series, "coordinateToPrice").mockReturnValue(null);
    expect(session.anchorsAtAngle(original, 45)).toBeNull();
    expect(session.anchorsAtOrigin(original, original.anchors[0]!)).toBeNull();
    inverse.mockImplementation(() => {
      throw Error("Disposed scale");
    });
    expect(session.anchorsAtAngle(original, 45)).toBeNull();
    vi.spyOn(f.series, "priceToCoordinate").mockReturnValue(NaN as Coordinate);
    expect(session.drawingAngle(original)).toBeNull();
    expect(session.anchorsAtOrigin(original, original.anchors[0]!)).toBeNull();
    expect(f.writes()).toBe(0);
    session.dispose();
    expect(session.drawingAngle(original)).toBeNull();
    expect(session.anchorsAtAngle(original, 45)).toBeNull();
    expect(session.anchorsAtOrigin(original, original.anchors[0]!)).toBeNull();
  });
});

describe("drawing settings preview transactions", () => {
  it("previews and saves same-bar trendline coordinates in one reversible edit", () => {
    const f = fixture("same-bar-trend-settings"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    const [original] = JSON.parse(f.saved()!) as ChartDrawing[];
    const anchors = [
      { time: 152 as Time, price: 4410.32 },
      { time: 152 as Time, price: 4420.1 },
    ];
    const writes = f.writes();
    session.openSettings();
    expect(session.previewSettings({ anchors })).toBe(true);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ anchors }) }),
    );
    expect(f.writes()).toBe(writes);
    session.closeSettings();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ selected: original }));
    session.openSettings();
    expect(session.previewSettings({ anchors, extendLeft: true, extendRight: true })).toBe(true);
    expect(session.applySettings({})).toBe(true);
    const [saved] = JSON.parse(f.saved()!) as ChartDrawing[];
    expect(saved).toMatchObject({ anchors, extendLeft: true, extendRight: true });
    expect(f.writes()).toBe(writes + 1);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([original]);
    session.redo();
    expect(JSON.parse(f.saved()!)).toEqual([saved]);
    session.dispose();
    const reopened = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ objects: [saved] }));
    reopened.dispose();
  });

  it("previews channel levels without writes, cancels, then saves all settings in one undoable edit", () => {
    const original = {
      id: "parallel",
      kind: "channel",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100, price: 4900 },
        { time: 300, price: 4800 },
        { time: 200, price: 4800 },
      ],
    };
    const f = fixture("channel-settings-transaction", JSON.stringify([original]));
    const session = f.open();
    session.selectDrawing(original.id);
    const patch = {
      levels: [
        { value: 0, visible: false },
        {
          value: -0.5,
          visible: true,
          color: "#ff0000",
          width: 4,
          lineStyle: "dashed" as const,
          opacity: 0.35,
        },
      ],
      extendLeft: true,
      extendRight: true,
      background: true,
      backgroundColor: "#00ff00",
      backgroundOpacity: 0.25,
    };
    session.openSettings();
    session.previewSettings(patch);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining(patch) }),
    );
    expect(f.writes()).toBe(0);
    session.closeSettings();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ selected: original }));
    expect(JSON.parse(f.saved()!)).toEqual([original]);
    session.openSettings();
    session.previewSettings(patch);
    session.applySettings({});
    expect(f.writes()).toBe(1);
    expect(JSON.parse(f.saved()!)).toEqual([{ ...original, ...patch }]);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([original]);
    session.redo();
    expect(JSON.parse(f.saved()!)).toEqual([{ ...original, ...patch }]);
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ objects: [expect.objectContaining(patch)] }),
    );
    restored.dispose();
  });
  it("previews immediately while keeping persisted drawings and undo history unchanged until OK", () => {
    const f = fixture("settings-preview-apply");
    const session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    const before = f.saved();
    const beforeWrites = f.writes();
    expect(session.openSettings()).toBe(true);
    expect(
      session.previewSettings({
        color: "#ff0000",
        width: 3,
        anchors: [{ time: 100 as UTCTimestamp, price: 4800 }],
      }),
    ).toBe(true);
    expect(session.previewSettings({ showPriceLabel: false, text: "Range" })).toBe(true);
    expect(f.priceLines).toMatchObject([
      { price: 4800, color: "#ff0000", lineWidth: 3, axisLabelVisible: false },
    ]);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selected: expect.objectContaining({ color: "#ff0000" }),
        objects: [expect.objectContaining({ color: "#2962ff" })],
      }),
    );
    expect(f.saved()).toBe(before);
    expect(f.writes()).toBe(beforeWrites);
    expect(session.applySettings({ textBold: true })).toBe(true);
    expect(f.writes()).toBe(beforeWrites + 1);
    const after = f.saved();
    expect(JSON.parse(after!)[0]).toMatchObject({
      color: "#ff0000",
      width: 3,
      text: "Range",
      textBold: true,
      showPriceLabel: false,
    });
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ settingsOpen: false }));
    session.undo();
    expect(f.saved()).toBe(before);
    session.redo();
    expect(f.saved()).toBe(after);
    expect(session.applySettings({ color: "#00ff00" })).toBe(false);
    session.dispose();
  });

  it.each(["close", "escape", "tool", "undo", "drag-miss", "context-miss"])(
    "discards preview on %s without committing an undo step",
    (action) => {
      const f = fixture(`settings-preview-${action}`);
      const session = f.open();
      session.setTool("horizontal");
      f.click(100, 100);
      const before = f.saved(),
        beforeWrites = f.writes();
      session.openSettings();
      session.previewSettings({ color: "#ff0000", showPriceLabel: false });
      if (action === "close") session.closeSettings();
      else if (action === "escape") session.cancel();
      else if (action === "tool") session.setTool("circle");
      else if (action === "drag-miss") session.beginDrag({ x: 700, y: 400 });
      else if (action === "context-miss")
        session.openContextMenu({ x: 700, y: 400 }, { x: 700, y: 400 });
      else session.undo();
      expect(f.saved()).toBe(before);
      expect(f.writes()).toBe(beforeWrites);
      expect(f.priceLines).toMatchObject([{ color: "#2962ff", axisLabelVisible: true }]);
      expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ settingsOpen: false }));
      session.undo();
      expect(JSON.parse(f.saved()!)).toEqual([]);
      session.dispose();
    },
  );

  it("keeps redo after cancelled previews and avoids a history entry for unchanged OK", () => {
    const f = fixture("settings-preview-redo");
    const session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    session.updateSelected({ color: "#ff0000" });
    const edited = f.saved();
    session.undo();
    f.click(100, 100);
    session.openSettings();
    session.previewSettings({ color: "#00ff00" });
    session.closeSettings();
    session.redo();
    expect(f.saved()).toBe(edited);
    f.click(100, 100);
    session.openSettings();
    const beforeWrites = f.writes();
    expect(
      session.applySettings({
        color: "#ff0000",
        anchors: [{ time: 100 as UTCTimestamp, price: 4900 }],
      }),
    ).toBe(true);
    expect(f.writes()).toBe(beforeWrites);
    session.undo();
    expect(JSON.parse(f.saved()!)[0].color).toBe("#2962ff");
    f.click(100, 100);
    session.openSettings();
    session.previewSettings({ color: "#00ff00" });
    session.applySettings({});
    const green = f.saved();
    session.redo();
    expect(f.saved()).toBe(green);
    session.dispose();
  });

  it("rejects invalid coordinates atomically and sanitizes unsupported settings during preview", () => {
    const f = fixture("settings-preview-invalid");
    const session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    const before = f.saved();
    session.openSettings();
    expect(
      session.previewSettings({
        color: "#ff0000",
        anchors: [{ time: 100 as UTCTimestamp, price: 4900 }],
      }),
    ).toBe(false);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ color: "#2962ff" }) }),
    );
    expect(session.previewSettings({ color: "#ff0000", textFontSize: 999 })).toBe(true);
    expect(
      session.applySettings({
        anchors: [
          { time: 100 as UTCTimestamp, price: 4900 },
          { time: 100 as UTCTimestamp, price: 4900 },
        ],
      }),
    ).toBe(false);
    expect(f.saved()).toBe(before);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        settingsOpen: true,
        selected: expect.objectContaining({ color: "#ff0000" }),
      }),
    );
    session.closeSettings();
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ objects: [expect.objectContaining({ color: "#2962ff" })] }),
    );
    restored.dispose();
  });

  it("never persists a preview through other object actions or session disposal", () => {
    const f = fixture("settings-preview-exit");
    const session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    const id = JSON.parse(f.saved()!)[0].id as string;
    session.openSettings();
    session.previewSettings({ color: "#ff0000" });
    session.duplicateDrawing(id);
    expect(JSON.parse(f.saved()!).map((drawing: { color: string }) => drawing.color)).toEqual([
      "#2962ff",
      "#2962ff",
    ]);
    session.openSettings();
    session.previewSettings({ color: "#ff0000" });
    session.clear();
    session.undo();
    expect(JSON.parse(f.saved()!).map((drawing: { color: string }) => drawing.color)).toEqual([
      "#2962ff",
      "#2962ff",
    ]);
    session.selectDrawing(id);
    session.openSettings();
    session.previewSettings({ color: "#ff0000" });
    const beforeDispose = f.saved();
    session.dispose();
    expect(f.saved()).toBe(beforeDispose);
    const restored = f.open();
    expect(f.priceLines.every((line) => (line as { color: string }).color === "#2962ff")).toBe(
      true,
    );
    restored.dispose();
  });

  it("filters interval visibility for rendering and hit selection while retaining saved objects", () => {
    const visibility = sanitizeDrawingVisibility({
      minutes: { enabled: true, min: 1, max: 5 },
      hours: { enabled: false },
    });
    const drawing = {
      id: "range-only",
      kind: "horizontal",
      color: "#729bff",
      width: 2,
      anchors: [{ time: 100, price: 4900 }],
      visibility,
    };
    const f = fixture("drawing-interval-visibility", JSON.stringify([drawing]));
    const session = f.open(15);
    expect(f.priceLines).toEqual([]);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 1, objects: [expect.objectContaining({ id: drawing.id })] }),
    );
    f.click(100, 100);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ selected: null }));
    expect(session.beginDrag({ x: 200, y: 100 })).toBe(false);
    session.selectDrawing(drawing.id);
    session.openSettings();
    expect(
      session.previewSettings({
        visibility: sanitizeDrawingVisibility({
          minutes: { enabled: true, min: 1, max: 30 },
          hours: { enabled: false },
        }),
      }),
    ).toBe(true);
    expect(f.priceLines).toHaveLength(1);
    session.closeSettings();
    expect(f.priceLines).toHaveLength(0);
    expect(JSON.parse(f.saved()!)[0].visibility).toEqual(visibility);
    session.dispose();
    const fiveMinute = f.open(5);
    expect(f.priceLines).toHaveLength(1);
    expect(fiveMinute.isVisible(JSON.parse(f.saved()!)[0])).toBe(true);
    fiveMinute.dispose();
  });
});

describe("drawing template transactions", () => {
  it("previews a sparse replacement without leaking old styling or changing object metadata, then cancels", () => {
    const f = fixture("template-preview"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    session.updateSelected({
      name: "Setup",
      locked: true,
      hidden: true,
      text: "Old label",
      textBold: true,
      extendRight: true,
      levels: [{ value: 0.5, visible: true }],
    });
    const original = JSON.parse(f.saved()!)[0];
    const writes = f.writes();
    session.openSettings();
    expect(
      session.previewSettings(
        { color: "#123456", width: 3, anchors: [], name: "Injected", locked: false, hidden: false },
        { replace: true },
      ),
    ).toBe(true);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selected: {
          id: original.id,
          kind: original.kind,
          anchors: original.anchors,
          name: "Setup",
          locked: true,
          hidden: true,
          color: "#123456",
          width: 3,
          lineStyle: "solid",
        },
      }),
    );
    expect(f.writes()).toBe(writes);
    session.closeSettings();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: original, settingsOpen: false }),
    );
    expect(JSON.parse(f.saved()!)[0]).toEqual(original);
    session.dispose();
  });

  it("applies replacement plus later edits atomically, preserves edited coordinates, and undoes the entire transaction", () => {
    const f = fixture("template-apply"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    session.updateSelected({
      textBold: true,
      text: "Old label",
      extendRight: true,
      color: "#ff0000",
    });
    const original = JSON.parse(f.saved()!)[0];
    const writes = f.writes();
    const anchors = [
      { time: 150 as UTCTimestamp, price: 4850 },
      { time: 250 as UTCTimestamp, price: 4750 },
    ];
    session.openSettings();
    session.previewSettings({ anchors });
    session.previewSettings({ color: "#123456", width: 2 }, { replace: true });
    session.previewSettings({ text: "After template" });
    expect(
      session.applySettings(
        { color: "#123456", width: 2, lineStyle: "dotted", text: "After template" },
        { replace: true },
      ),
    ).toBe(true);
    const result = JSON.parse(f.saved()!)[0];
    expect(result).toEqual({
      id: original.id,
      kind: "trend",
      anchors,
      color: "#123456",
      width: 2,
      lineStyle: "dotted",
      text: "After template",
    });
    expect(f.writes()).toBe(writes + 1);
    session.undo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(original);
    session.redo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(result);
    session.dispose();
    const restored = f.open();
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ objects: [result] }));
    restored.dispose();
  });

  it("rejects incomplete or invalid replacements without altering the current preview or committing history", () => {
    const f = fixture("template-invalid"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    const original = JSON.parse(f.saved()!)[0];
    const writes = f.writes();
    session.openSettings();
    session.previewSettings({ text: "Draft" });
    expect(session.previewSettings({ color: "#123456" }, { replace: true })).toBe(false);
    expect(session.applySettings({ color: "invalid", width: 2 }, { replace: true })).toBe(false);
    expect(f.writes()).toBe(writes);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ settingsOpen: true, selected: { ...original, text: "Draft" } }),
    );
    expect(session.applySettings({})).toBe(true);
    expect(JSON.parse(f.saved()!)[0]).toEqual({ ...original, text: "Draft" });
    session.undo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(original);
    session.dispose();
  });
});

describe("drawing hover state", () => {
  const line = {
    id: "hover-line",
    kind: "horizontal",
    color: "#729bff",
    width: 2,
    anchors: [{ time: 100, price: 4900 }],
  };
  it("emits only when the hovered object changes, never selects or persists from idle movement", () => {
    const f = fixture("hover-state", JSON.stringify([line])),
      session = f.open();
    f.change.mockClear();
    session.hover({ x: 400, y: 100 });
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hovered: expect.objectContaining({ id: line.id }),
        selected: null,
      }),
    );
    for (let x = 410; x < 600; x++) session.hover({ x, y: 100 });
    expect(f.change).toHaveBeenCalledTimes(1);
    expect(f.writes()).toBe(0);
    session.hover(null);
    session.hover(null);
    expect(f.change).toHaveBeenCalledTimes(2);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ hovered: null }));
    session.hover({ x: 400, y: 100 });
    session.setTool("circle");
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ hovered: null }));
    session.hover({ x: 400, y: 100 });
    expect(f.change).toHaveBeenCalledTimes(4);
    session.dispose();
  });
  it("keeps locked drawing hits from panning without moving anchors and clears hover during settings", () => {
    const f = fixture("hover-lock", JSON.stringify([{ ...line, locked: true }])),
      session = f.open();
    session.hover({ x: 400, y: 100 });
    expect(session.beginDrag({ x: 400, y: 100 })).toBe(false);
    expect(session.blocksChartPan({ x: 400, y: 100 })).toBe(true);
    expect(session.blocksChartPan({ x: 400, y: 300 })).toBe(false);
    session.dragTo({ x: 500, y: 200 });
    session.endDrag();
    expect(f.writes()).toBe(0);
    session.openSettings();
    session.hover({ x: 400, y: 100 });
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ hovered: null, settingsOpen: true }),
    );
    session.closeSettings();
    session.toggleHidden();
    session.hover({ x: 400, y: 100 });
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ hovered: null, hidden: true }),
    );
    session.dispose();
  });
});

describe("inline drawing text transactions", () => {
  it("creates standalone text as one undoable edit without persisting an empty placeholder", () => {
    const f = fixture("standalone-text-create"),
      session = f.open();
    session.setTool("text");
    f.click(100, 120);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        textEditing: true,
        settingsOpen: false,
        tool: "cursor",
        canUndo: false,
        selected: expect.objectContaining({
          kind: "text",
          text: "",
          anchors: [{ time: 100, price: 4880 }],
        }),
      }),
    );
    session.previewText("Entry\nwait for retest");
    expect(f.saved()).toBeNull();
    expect(f.writes()).toBe(0);
    expect(session.commitText()).toBe(true);
    expect(f.writes()).toBe(1);
    const saved = f.saved();
    expect(JSON.parse(saved!)).toEqual([
      expect.objectContaining({ kind: "text", text: "Entry\nwait for retest" }),
    ]);
    expect(session.commitText("duplicate blur")).toBe(false);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ canUndo: false }));
    session.redo();
    expect(f.saved()).toBe(saved);
    session.dispose();
  });

  it.each(["escape", "cancel", "empty", "tool", "dispose"])(
    "discards a new standalone text draft on %s without saving or adding undo history",
    (action) => {
      const f = fixture(`standalone-text-abandon-${action}`),
        session = f.open();
      session.setTool("text");
      f.click(100, 100);
      session.previewText("Unsaved note");
      if (action === "escape") session.cancel();
      else if (action === "cancel") session.cancelTextEdit();
      else if (action === "empty") session.commitText("");
      else if (action === "tool") session.setTool("trend");
      else session.dispose();
      expect(f.saved()).toBeNull();
      expect(f.writes()).toBe(0);
      if (action !== "dispose") {
        expect(f.change).toHaveBeenLastCalledWith(
          expect.objectContaining({ textEditing: false, count: 0, canUndo: false }),
        );
        session.undo();
        expect(f.writes()).toBe(0);
      }
      session.dispose();
    },
  );

  it("reopens saved standalone text, cancels drafts and commits a separate undoable revision", () => {
    const f = fixture("standalone-text-reedit"),
      session = f.open();
    session.setTool("text");
    f.click(100, 100);
    session.commitText("Original note");
    const original = f.saved();
    expect(session.beginTextEdit()).toBe(true);
    session.previewText("Cancelled revision");
    session.cancelTextEdit();
    expect(f.saved()).toBe(original);
    expect(f.writes()).toBe(1);
    expect(session.beginTextEdit()).toBe(true);
    session.previewText("Saved revision");
    expect(session.commitText()).toBe(true);
    expect(f.writes()).toBe(2);
    const edited = f.saved();
    expect(JSON.parse(edited!)[0]).toEqual({
      ...JSON.parse(original!)[0],
      text: "Saved revision",
    });
    session.undo();
    expect(f.saved()).toBe(original);
    session.redo();
    expect(f.saved()).toBe(edited);
    session.dispose();
  });

  it("resumes repeated Text placement after committing, but leaves it after cancelling", () => {
    const f = fixture("standalone-text-repeat"),
      session = f.open();
    session.setKeepDrawing(true);
    session.setTool("text");
    f.click(100, 100);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "cursor", textEditing: true }),
    );
    session.commitText("First note");
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "text", textEditing: false }),
    );
    f.click(200, 200);
    session.previewText("Cancel second");
    session.cancel();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: "cursor", textEditing: false }),
    );
    expect(JSON.parse(f.saved()!)).toHaveLength(1);
    expect(f.writes()).toBe(1);
    session.dispose();
  });

  it("previews multiline text without opening settings, commits once and restores it atomically with undo", () => {
    const f = fixture("inline-text-commit"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    const before = f.saved(),
      writes = f.writes();
    expect(session.beginTextEdit()).toBe(true);
    expect(session.previewText("Watch")).toBe(true);
    expect(session.previewText("Watch\nretest")).toBe(true);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        textEditing: true,
        settingsOpen: false,
        selected: expect.objectContaining({ text: "Watch\nretest" }),
      }),
    );
    expect(f.saved()).toBe(before);
    expect(f.writes()).toBe(writes);
    expect(session.previewSettings({ color: "#ff0000" })).toBe(false);
    expect(session.commitText()).toBe(true);
    expect(f.writes()).toBe(writes + 1);
    const after = f.saved();
    expect(JSON.parse(after!)[0].text).toBe("Watch\nretest");
    expect(session.commitText("duplicate blur")).toBe(false);
    session.undo();
    expect(f.saved()).toBe(before);
    session.redo();
    expect(f.saved()).toBe(after);
    session.dispose();
  });

  it.each(["escape", "cancel", "tool", "settings", "context", "dispose"])(
    "discards inline text on %s without saving the draft",
    (action) => {
      const f = fixture(`inline-text-${action}`),
        session = f.open();
      session.setTool("horizontal");
      f.click(100, 100);
      const before = f.saved(),
        writes = f.writes();
      session.beginTextEdit();
      session.previewText("Unfinished");
      if (action === "escape") session.cancel();
      else if (action === "cancel") session.cancelTextEdit();
      else if (action === "tool") session.setTool("trend");
      else if (action === "settings") session.openSettings();
      else if (action === "context")
        session.openContextMenu({ x: 400, y: 100 }, { x: 400, y: 100 });
      else session.dispose();
      expect(f.saved()).toBe(before);
      expect(f.writes()).toBe(writes);
      if (action !== "dispose")
        expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ textEditing: false }));
      session.dispose();
    },
  );

  it("preserves long multiline Unicode edits through preview, commit, cancel, undo and reload", () => {
    const text = `${"x".repeat(139)}📈\n${"确认回踩 e\u0301 — wait for confirmation.\n".repeat(20)}`;
    const f = fixture("inline-long-text"),
      session = f.open();
    session.setTool("horizontal-ray");
    f.click(100, 100);
    const before = f.saved(),
      writes = f.writes();
    expect(session.beginTextEdit()).toBe(true);
    expect(session.previewText(text)).toBe(true);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ text }) }),
    );
    expect(f.saved()).toBe(before);
    expect(session.commitText()).toBe(true);
    expect(f.writes()).toBe(writes + 1);
    expect(session.getCommittedDrawings()![0]!.text).toBe(text);
    const after = f.saved();
    expect(session.beginTextEdit()).toBe(true);
    expect(session.previewText(`${text}Discard this revision`)).toBe(true);
    session.cancelTextEdit();
    expect(session.getCommittedDrawings()![0]!.text).toBe(text);
    expect(f.saved()).toBe(after);
    expect(f.writes()).toBe(writes + 1);
    session.undo();
    expect(f.saved()).toBe(before);
    session.redo();
    expect(f.saved()).toBe(after);
    session.dispose();
    const restored = fixture("inline-long-text", after).open();
    expect(restored.getCommittedDrawings()![0]!.text).toBe(text);
    restored.dispose();
  });

  it("keeps complete text in direct updates, settings drafts and explicit text commits", () => {
    const text = `${"Trading plan 📊\n".repeat(30)}Wait for the retest.`,
      revised = `${text}\n风险 first; conviction second.`;
    const f = fixture("settings-long-text"),
      session = f.open();
    session.setTool("horizontal-ray");
    f.click(100, 100);
    const id = session.getCommittedDrawings()![0]!.id;
    session.updateDrawing(id, { text });
    const before = f.saved(),
      writes = f.writes();
    expect(session.getCommittedDrawings()![0]!.text).toBe(text);
    expect(session.openSettings()).toBe(true);
    expect(session.previewSettings({ text: revised })).toBe(true);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ text: revised }) }),
    );
    session.closeSettings();
    expect(f.saved()).toBe(before);
    expect(f.writes()).toBe(writes);
    expect(session.openSettings()).toBe(true);
    expect(session.applySettings({ text: revised })).toBe(true);
    expect(session.getCommittedDrawings()![0]!.text).toBe(revised);
    expect(f.writes()).toBe(writes + 1);
    session.undo();
    expect(f.saved()).toBe(before);
    session.redo();
    expect(session.getCommittedDrawings()![0]!.text).toBe(revised);
    session.selectDrawing(id);
    expect(session.beginTextEdit()).toBe(true);
    expect(session.commitText(text, id)).toBe(true);
    expect(session.getCommittedDrawings()![0]!.text).toBe(text);
    const after = f.saved();
    session.dispose();
    const restored = fixture("settings-long-text", after).open();
    expect(restored.getCommittedDrawings()![0]!.text).toBe(text);
    restored.dispose();
  });

  it("does not create an empty-text history entry and rejects commits from another drawing", () => {
    const f = fixture("inline-text-empty"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    const before = f.saved(),
      writes = f.writes();
    session.beginTextEdit();
    session.previewText("");
    expect(session.commitText("")).toBe(true);
    expect(f.saved()).toBe(before);
    expect(f.writes()).toBe(writes);
    session.beginTextEdit();
    session.previewText("x".repeat(200));
    expect(session.commitText("wrong", "other-id")).toBe(false);
    expect(session.commitText()).toBe(true);
    expect(JSON.parse(f.saved()!)[0].text).toBe("x".repeat(200));
    session.undo();
    expect(f.saved()).toBe(before);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([]);
    session.dispose();
  });

  it("edits locked annotation text undoably while keeping body and endpoint drags locked", () => {
    const f = fixture("inline-text-locked"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    session.updateSelected({ locked: true });
    const before = f.saved(),
      original = JSON.parse(before!)[0],
      writes = f.writes();
    for (const point of [
      { x: 150, y: 150 },
      { x: 100, y: 100 },
    ]) {
      expect(session.beginDrag(point)).toBe(false);
      session.dragTo({ x: 300, y: 300 });
      session.endDrag();
    }
    expect(f.saved()).toBe(before);
    expect(f.writes()).toBe(writes);
    expect(session.beginTextEdit()).toBe(true);
    expect(session.previewText("Locked price level")).toBe(true);
    expect(f.saved()).toBe(before);
    expect(session.commitText()).toBe(true);
    expect(f.writes()).toBe(writes + 1);
    expect(JSON.parse(f.saved()!)[0]).toEqual({ ...original, text: "Locked price level" });
    const after = f.saved();
    session.undo();
    expect(f.saved()).toBe(before);
    session.redo();
    expect(f.saved()).toBe(after);
    expect(session.beginDrag({ x: 100, y: 100 })).toBe(false);
    session.dragTo({ x: 400, y: 400 });
    session.endDrag();
    expect(f.saved()).toBe(after);
    session.dispose();
  });

  it("requires a visible line and keeps inline and settings editors mutually exclusive", () => {
    const f = fixture("inline-text-eligibility"),
      session = f.open();
    expect(session.beginTextEdit()).toBe(false);
    session.setTool("rectangle");
    f.click(100, 100);
    f.click(200, 200);
    expect(session.beginTextEdit()).toBe(false);
    session.setTool("horizontal");
    f.click(300, 100);
    session.updateSelected({ hidden: true });
    expect(session.beginTextEdit()).toBe(false);
    session.updateSelected({ hidden: false });
    session.openSettings();
    expect(session.beginTextEdit()).toBe(false);
    session.closeSettings();
    expect(session.beginTextEdit()).toBe(true);
    session.previewText("Draft");
    session.undo();
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ textEditing: false, count: 2 }),
    );
    expect(JSON.parse(f.saved()!).at(-1).text).toBeUndefined();
    session.dispose();
  });
});

describe("parallel channel construction handles", () => {
  const shape: ChartDrawing = {
    id: "parallel",
    kind: "channel",
    color: "#2962ff",
    width: 2,
    anchors: [
      { time: 100 as Time, price: 4900 },
      { time: 300 as Time, price: 4800 },
      { time: 200 as Time, price: 4700 },
    ],
    levels: [
      { value: 0.2, visible: true },
      { value: 0.8, visible: true },
    ],
  };
  it.each([
    {
      name: "baseline first",
      from: [100, 100],
      to: [140, 140],
      expected: [
        [140, 4860],
        [300, 4800],
        [200, 4687.5],
      ],
    },
    {
      name: "baseline midpoint",
      from: [200, 150],
      to: [240, 190],
      expected: [
        [100, 4880],
        [300, 4780],
        [200, 4700],
      ],
    },
    {
      name: "baseline second",
      from: [300, 200],
      to: [260, 240],
      expected: [
        [100, 4900],
        [260, 4760],
        [200, 4662.5],
      ],
    },
    {
      name: "opposite first",
      from: [100, 250],
      to: [140, 290],
      expected: [
        [140, 4860],
        [300, 4800],
        [200, 4687.5],
      ],
    },
    {
      name: "opposite midpoint",
      from: [200, 300],
      to: [240, 340],
      expected: [
        [100, 4900],
        [300, 4800],
        [200, 4680],
      ],
    },
    {
      name: "opposite second",
      from: [300, 350],
      to: [260, 390],
      expected: [
        [100, 4900],
        [260, 4760],
        [200, 4662.5],
      ],
    },
  ])(
    "edits $name at construction ratios despite customized rails in one reversible write",
    ({ name, from, to, expected }) => {
      const f = fixture(`parallel-${name}`, JSON.stringify([shape]));
      const session = f.open();
      expect(session.beginDrag({ x: from[0]!, y: from[1]! })).toBe(true);
      session.dragTo({ x: to[0]!, y: to[1]! });
      expect(f.writes()).toBe(0);
      session.endDrag();
      expect(f.writes()).toBe(1);
      const edited = JSON.parse(f.saved()!)[0];
      expect(edited.anchors).toEqual(expected.map(([time, price]) => ({ time, price })));
      expect(edited.levels).toEqual(shape.levels);
      session.undo();
      expect(JSON.parse(f.saved()!)).toEqual([shape]);
      session.redo();
      expect(JSON.parse(f.saved()!)).toEqual([edited]);
      session.dispose();
      const reopened = f.open();
      reopened.selectDrawing(shape.id);
      expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ selected: edited }));
      reopened.dispose();
    },
  );
  it("keeps midpoint movement along its existing rail inert and cancels an actual resize", () => {
    const f = fixture("parallel-midpoint-cancel", JSON.stringify([shape]));
    const session = f.open();
    expect(session.beginDrag({ x: 200, y: 150 })).toBe(true);
    session.dragTo({ x: 240, y: 170 });
    session.endDrag();
    expect(f.writes()).toBe(0);
    session.beginDrag({ x: 200, y: 300 });
    session.dragTo({ x: 240, y: 340 });
    session.endDrag(false);
    expect(f.writes()).toBe(0);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ selected: shape }));
    expect(JSON.parse(f.saved()!)).toEqual([shape]);
    session.dispose();
  });
  it("retains width after the endpoint snaps to a candle across a timestamp gap", () => {
    const original = {
      ...shape,
      anchors: [
        shape.anchors[0]!,
        { ...shape.anchors[1]!, time: 100000 as Time },
        shape.anchors[2]!,
      ],
    };
    const f = fixture("parallel-snapped-candle", JSON.stringify([original]));
    const scale = f.chart.timeScale();
    vi.spyOn(f.chart, "timeScale").mockReturnValue({
      ...scale,
      timeToCoordinate: (time: Time) =>
        (Number(time) === 100000 ? 300 : Number(time)) as Coordinate,
      coordinateToTime: (x: number) => {
        const center = Math.round(x / 100) * 100;
        return (center === 300 ? 100000 : center) as Time;
      },
    });
    const session = f.open();
    expect(session.beginDrag({ x: 100, y: 100 })).toBe(true);
    session.dragTo({ x: 140, y: 140 });
    session.endDrag();
    const edited = JSON.parse(f.saved()!)[0];
    expect(edited.anchors).toEqual([
      { time: 100, price: 4860 },
      { time: 100000, price: 4800 },
      { time: 200, price: 4680 },
    ]);
    expect(session.channelPriceOffset(edited)).toBe(session.channelPriceOffset(original));
    session.dispose();
  });
  it("preserves the width when the stored third anchor lies outside the endpoint times", () => {
    const original = {
      ...shape,
      anchors: [shape.anchors[0]!, shape.anchors[1]!, { time: 500 as Time, price: 4550 }],
    };
    const f = fixture("parallel-exterior-anchor", JSON.stringify([original]));
    const session = f.open();
    expect(session.beginDrag({ x: 100, y: 250 })).toBe(true);
    session.dragTo({ x: 140, y: 290 });
    session.endDrag();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 140, price: 4860 },
      { time: 300, price: 4800 },
      { time: 500, price: 4575 },
    ]);
    session.dispose();
  });
});

describe("channel corner editing", () => {
  const shape = (kind: "flat-channel" | "disjoint-channel") => ({
    id: "channel",
    kind,
    color: "#729bff",
    width: 2,
    anchors: [
      { time: 100, price: 4750 },
      { time: 350, price: 4810 },
      { time: 900, price: 4540 },
    ],
  });
  it.each([
    {
      kind: "flat-channel",
      from: [100, 460],
      to: [150, 500],
      expected: [
        [150, 4750],
        [350, 4810],
        [900, 4500],
      ],
    },
    {
      kind: "flat-channel",
      from: [350, 460],
      to: [400, 500],
      expected: [
        [100, 4750],
        [400, 4810],
        [900, 4500],
      ],
    },
    {
      kind: "disjoint-channel",
      from: [100, 400],
      to: [150, 470],
      expected: [
        [150, 4820],
        [350, 4810],
        [900, 4540],
      ],
    },
    {
      kind: "disjoint-channel",
      from: [350, 460],
      to: [450, 510],
      expected: [
        [100, 4750],
        [350, 4810],
        [900, 4490],
      ],
    },
    {
      kind: "disjoint-channel",
      from: [100, 250],
      to: [150, 280],
      expected: [
        [150, 4720],
        [350, 4810],
        [900, 4540],
      ],
    },
    {
      kind: "disjoint-channel",
      from: [350, 190],
      to: [450, 230],
      expected: [
        [100, 4750],
        [450, 4770],
        [900, 4580],
      ],
    },
  ] as const)(
    "couples $kind corner $from correctly in one undoable write",
    ({ kind, from, to, expected }) => {
      const original = shape(kind);
      const f = fixture(`corner-${kind}`, JSON.stringify([original]));
      const session = f.open();
      expect(session.beginDrag({ x: from[0], y: from[1] })).toBe(true);
      session.dragTo({ x: to[0], y: to[1] });
      expect(f.writes()).toBe(0);
      session.endDrag();
      expect(f.writes()).toBe(1);
      expect(JSON.parse(f.saved()!)[0].anchors).toEqual(
        expected.map(([time, price]) => ({ time, price })),
      );
      session.undo();
      expect(JSON.parse(f.saved()!)[0]).toEqual(original);
      session.redo();
      expect(JSON.parse(f.saved()!)[0].anchors).toEqual(
        expected.map(([time, price]) => ({ time, price })),
      );
      session.dispose();
    },
  );
  it("snaps a derived corner at its visible candle rather than the ignored third timestamp", () => {
    const original = shape("flat-channel");
    const f = fixture("channel-magnet", JSON.stringify([original]), [
      { time: 200 as UTCTimestamp, open: 4550, high: 4570, low: 4500, close: 4560 },
    ]);
    const session = f.open();
    session.setMagnetMode("strong");
    session.beginDrag({ x: 100, y: 460 });
    session.dragTo({ x: 205, y: 452 });
    session.endDrag();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 200, price: 4750 },
      { time: 350, price: 4810 },
      { time: 900, price: 4550 },
    ]);
    session.dispose();
  });
});

describe("regression bar-range interaction", () => {
  it("ignores clicked prices and vertical drag, then edits either fitted endpoint in one undoable write", () => {
    const initial = {
      id: "regression",
      kind: "regression-trend",
      color: "#ffffff",
      width: 2,
      anchors: [
        { time: 100, price: 9999 },
        { time: 300, price: -9999 },
      ],
    };
    const candles = [100, 200, 300, 400].map((time, index) => ({
      time: time as UTCTimestamp,
      open: 4900 - index * 100,
      high: 4900 - index * 100,
      low: 4900 - index * 100,
      close: 4900 - index * 100,
    }));
    const f = fixture("regression-drag", JSON.stringify([initial]), candles),
      session = f.open();
    expect(session.beginDrag({ x: 100, y: 100 })).toBe(true);
    session.dragTo({ x: 100, y: 180 });
    session.endDrag();
    expect(f.writes()).toBe(0);
    expect(session.beginDrag({ x: 300, y: 300 })).toBe(true);
    session.dragTo({ x: 400, y: 450 });
    session.endDrag();
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual([
      { time: 100, price: 9999 },
      { time: 400, price: -9999 },
    ]);
    expect(f.writes()).toBe(1);
    session.undo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(initial);
    session.dispose();
  });
});

describe("Fibonacci time placement and editing", () => {
  it.each(["fib-time-zone", "fib-trend-time"] as const)(
    "places %s with its own anchor count, then drags and restores its baseline",
    (kind) => {
      const f = fixture(`fib-time-${kind}`),
        session = f.open();
      session.setTool(kind);
      f.click(100, 100);
      f.click(200, 200);
      if (kind === "fib-trend-time") {
        expect(f.writes()).toBe(0);
        f.click(400, 150);
      }
      expect(f.writes()).toBe(1);
      const original = JSON.parse(f.saved()!)[0];
      expect(original.anchors).toHaveLength(kind === "fib-time-zone" ? 2 : 3);
      expect(session.beginDrag({ x: 100, y: 100 })).toBe(true);
      session.dragTo({ x: 150, y: 130 });
      session.endDrag();
      expect(JSON.parse(f.saved()!)[0].anchors[0]).toEqual({ time: 150, price: 4870 });
      session.undo();
      expect(JSON.parse(f.saved()!)[0]).toEqual(original);
      session.dispose();
    },
  );
});

describe("selected drawing template application", () => {
  const original = {
    id: "template-target",
    kind: "trend",
    anchors: [
      { time: 100, price: 4900 },
      { time: 300, price: 4800 },
    ],
    color: "#729bff",
    width: 2,
    lineStyle: "dotted",
    name: "Research line",
    locked: true,
    hidden: true,
    text: "Old text",
    extendLeft: true,
    showPriceLabel: true,
  };
  it("atomically replaces sparse appearance on locked drawings while preserving identity, placement and metadata", () => {
    const f = fixture("selected-template", JSON.stringify([original])),
      session = f.open();
    session.selectDrawing(original.id);
    const patch = {
      color: "#ff0000",
      width: 3,
      id: "malicious",
      kind: "rectangle",
      anchors: [{ time: 900 as Time, price: 0 }],
      locked: false,
      hidden: false,
      name: "Changed",
    };
    expect(session.applySelectedTemplate(patch)).toBe(true);
    expect(f.writes()).toBe(1);
    const updated = JSON.parse(f.saved()!)[0];
    expect(updated).toEqual({
      id: original.id,
      kind: original.kind,
      anchors: original.anchors,
      color: "#ff0000",
      width: 3,
      lineStyle: "solid",
      name: original.name,
      locked: true,
      hidden: true,
    });
    session.undo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(original);
    session.redo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(updated);
    const writes = f.writes();
    expect(session.applySelectedTemplate({ color: "#ff0000", width: 3 })).toBe(false);
    expect(f.writes()).toBe(writes);
    session.dispose();
  });
  it("discards uncommitted settings and coordinates before applying and cannot restore them on later cancellation", () => {
    const f = fixture("selected-template-draft", JSON.stringify([original])),
      session = f.open();
    session.selectDrawing(original.id);
    session.openSettings();
    session.previewSettings({
      color: "#00ff00",
      anchors: [
        { time: 200 as Time, price: 4700 },
        { time: 400 as Time, price: 4600 },
      ],
    });
    expect(session.applySelectedTemplate({ color: "#ff0000", width: 1 })).toBe(true);
    expect(f.writes()).toBe(1);
    expect(JSON.parse(f.saved()!)[0].anchors).toEqual(original.anchors);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ settingsOpen: false, textEditing: false }),
    );
    session.closeSettings();
    expect(f.writes()).toBe(1);
    session.undo();
    expect(JSON.parse(f.saved()!)[0]).toEqual(original);
    session.dispose();
  });
  it("does nothing for invalid templates, missing selection or disposal", () => {
    const f = fixture("selected-template-invalid", JSON.stringify([original])),
      session = f.open();
    expect(session.applySelectedTemplate({ color: "#ff0000", width: 2 })).toBe(false);
    session.selectDrawing(original.id);
    session.openSettings();
    expect(session.applySelectedTemplate({ color: "#ff0000" })).toBe(false);
    expect(session.applySelectedTemplate({ color: "invalid", width: 2 })).toBe(false);
    expect(f.writes()).toBe(0);
    expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ settingsOpen: true }));
    session.dispose();
    expect(session.applySelectedTemplate({ color: "#ff0000", width: 2 })).toBe(false);
    expect(f.writes()).toBe(0);
  });
});

describe("native horizontal opacity", () => {
  it("keeps the native body hidden while retaining an opaque axis label and persists template opacity", () => {
    const f = fixture("horizontal-opacity"),
      session = f.open();
    session.setTool("horizontal");
    f.click(100, 100);
    session.updateSelected({ color: "#ff8000", lineOpacity: 0.5 });
    expect(f.priceLines[0]).toMatchObject({
      color: "rgba(255, 128, 0, 0.5)",
      axisLabelColor: "#ff8000",
      lineVisible: false,
      axisLabelVisible: true,
    });
    session.updateSelected({ lineOpacity: 0 });
    expect(f.priceLines[0]).toMatchObject({
      color: "rgba(255, 128, 0, 0)",
      axisLabelColor: "#ff8000",
      lineVisible: false,
    });
    expect(
      session.applySelectedTemplate({
        color: "#123456",
        width: 2,
        lineOpacity: 0.5,
        textOpacity: 0,
      }),
    ).toBe(true);
    expect(JSON.parse(f.saved()!)[0]).toMatchObject({ lineOpacity: 0.5, textOpacity: 0 });
    session.dispose();
    const restored = f.open();
    expect(f.priceLines[0]).toMatchObject({
      color: "rgba(18, 52, 86, 0.5)",
      axisLabelColor: "#123456",
      lineVisible: false,
    });
    restored.dispose();
  });
});

describe("drawing tool appearance inheritance", () => {
  it("does not replace recent defaults when an older differently styled object's coordinates or lock change", () => {
    const f = fixture("defaults-old-object"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    session.setTool("trend");
    f.click(300, 100);
    f.click(400, 200);
    session.updateSelected({ color: "#00ff00", width: 4 });
    const remembered = f.controls.get(DRAWING_DEFAULTS_KEY);
    expect(session.openSettings({ x: 150, y: 150 })).toBe(true);
    session.applySettings({
      locked: true,
      anchors: [
        { time: 120 as UTCTimestamp, price: 4900 },
        { time: 220 as UTCTimestamp, price: 4800 },
      ],
    });
    expect(f.controls.get(DRAWING_DEFAULTS_KEY)).toBe(remembered);
    session.dispose();
  });
  it("inherits committed appearance on the next object without copying text or identity", () => {
    const f = fixture("defaults-inherit"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    const first = JSON.parse(f.saved()!)[0];
    expect(first.color).toBe("#2962ff");
    session.updateSelected({
      color: "#ff0000",
      width: 4,
      lineStyle: "dotted",
      text: "Secret note",
      name: "Named",
      locked: true,
      textBold: true,
      textFontSize: 22,
    });
    session.setTool("trend");
    f.click(300, 100);
    f.click(400, 200);
    const next = JSON.parse(f.saved()!)[1];
    expect(next).toMatchObject({
      kind: "trend",
      color: "#ff0000",
      width: 4,
      lineStyle: "dotted",
      textBold: true,
      textFontSize: 22,
    });
    expect(next.id).not.toBe(first.id);
    expect(next.text).toBeUndefined();
    expect(next.name).toBeUndefined();
    expect(next.locked).toBeUndefined();
    expect(next.hidden).toBeUndefined();
    session.setTool("horizontal");
    f.click(500, 150);
    expect(JSON.parse(f.saved()!).at(-1).color).toBe("#2962ff");
    session.dispose();
    const restored = f.open();
    restored.setTool("trend");
    f.click(600, 100);
    f.click(700, 200);
    expect(JSON.parse(f.saved()!).at(-1).color).toBe("#ff0000");
    restored.dispose();
  });
  it("remembers explicit templates/reset only on apply and ignores cancelled edits and placement changes", () => {
    const f = fixture("defaults-transactions"),
      session = f.open();
    session.setTool("trend");
    f.click(100, 100);
    f.click(200, 200);
    session.updateSelected({ color: "#ff0000", width: 3 });
    const remembered = f.controls.get(DRAWING_DEFAULTS_KEY);
    session.openSettings();
    session.previewSettings({ color: "#00ff00", width: 4 });
    session.closeSettings();
    expect(f.controls.get(DRAWING_DEFAULTS_KEY)).toBe(remembered);
    session.updateSelected({
      locked: true,
      name: "Renamed",
      text: "Only note",
      anchors: [
        { time: 150 as UTCTimestamp, price: 4900 },
        { time: 250 as UTCTimestamp, price: 4800 },
      ],
    });
    expect(f.controls.get(DRAWING_DEFAULTS_KEY)).toBe(remembered);
    session.applySelectedTemplate({ color: "#123456", width: 1, lineStyle: "dashed" });
    expect(JSON.parse(f.controls.get(DRAWING_DEFAULTS_KEY)!).trend.color).toBe("#123456");
    session.openSettings();
    session.previewSettings(defaultDrawingTemplateSettings("trend"), { replace: true });
    session.closeSettings();
    expect(JSON.parse(f.controls.get(DRAWING_DEFAULTS_KEY)!).trend.color).toBe("#123456");
    session.openSettings();
    session.applySettings(defaultDrawingTemplateSettings("trend"), { replace: true });
    expect(JSON.parse(f.controls.get(DRAWING_DEFAULTS_KEY)!).trend.color).toBe("#2962ff");
    session.setTool("trend");
    f.click(300, 100);
    f.click(400, 200);
    expect(JSON.parse(f.saved()!).at(-1)).toMatchObject({
      color: "#2962ff",
      width: 2,
      lineStyle: "solid",
    });
    session.dispose();
  });
});

describe("drawing visual order", () => {
  const objects = ["a", "b", "c", "d"].map((id) => ({
    id,
    kind: "trend",
    anchors: [
      { time: 100, price: 4900 },
      { time: 200, price: 4800 },
    ],
    color: "#2962ff",
    width: 2,
    lineStyle: "solid",
    name: `Drawing ${id}`,
    ...(id === "c" ? { locked: true } : {}),
  }));
  it.each([
    ["front", ["a", "b", "d", "c"]],
    ["forward", ["a", "b", "d", "c"]],
    ["backward", ["a", "c", "b", "d"]],
    ["back", ["c", "a", "b", "d"]],
  ] as const)(
    "persists %s in one undo step while preserving object identity and selection",
    (direction, expected) => {
      const f = fixture(`order-${direction}`, JSON.stringify(objects)),
        session = f.open();
      session.selectDrawing("c");
      expect(session.reorderSelected(direction)).toBe(true);
      expect(f.writes()).toBe(1);
      const reordered = JSON.parse(f.saved()!);
      expect(reordered.map((item: { id: string }) => item.id)).toEqual(expected);
      for (const original of objects)
        expect(reordered.find((item: { id: string }) => item.id === original.id)).toEqual(original);
      expect(f.change).toHaveBeenLastCalledWith(
        expect.objectContaining({ selected: expect.objectContaining({ id: "c", locked: true }) }),
      );
      session.undo();
      expect(JSON.parse(f.saved()!)).toEqual(objects);
      session.redo();
      expect(JSON.parse(f.saved()!)).toEqual(reordered);
      session.dispose();
      const restored = f.open();
      expect(f.change).toHaveBeenLastCalledWith(expect.objectContaining({ objects: reordered }));
      restored.dispose();
    },
  );
  it("moves exactly one position and preserves hidden and locked flags", () => {
    const f = fixture("order-single", JSON.stringify(objects)),
      session = f.open();
    session.selectDrawing("a");
    session.reorderSelected("forward");
    expect(JSON.parse(f.saved()!).map((item: { id: string }) => item.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
    session.selectDrawing("d");
    session.reorderSelected("backward");
    expect(JSON.parse(f.saved()!).map((item: { id: string }) => item.id)).toEqual([
      "b",
      "a",
      "d",
      "c",
    ]);
    session.selectDrawing("c");
    session.updateSelected({ hidden: true });
    session.reorderSelected("back");
    expect(JSON.parse(f.saved()!)[0]).toMatchObject({ id: "c", hidden: true, locked: true });
    session.dispose();
  });
  it("does not write, clear redo, or create undo entries at either boundary", () => {
    const f = fixture("order-boundaries", JSON.stringify(objects)),
      session = f.open();
    expect(session.reorderSelected("front")).toBe(false);
    session.selectDrawing("d");
    expect(session.reorderSelected("front")).toBe(false);
    expect(session.reorderSelected("forward")).toBe(false);
    session.selectDrawing("a");
    expect(session.reorderSelected("back")).toBe(false);
    expect(session.reorderSelected("backward")).toBe(false);
    expect(f.writes()).toBe(0);
    session.reorderSelected("front");
    session.undo();
    session.selectDrawing("a");
    session.reorderSelected("back");
    session.redo();
    expect(JSON.parse(f.saved()!).map((item: { id: string }) => item.id)).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
    session.dispose();
    expect(session.reorderSelected("back")).toBe(false);
  });
  it("hit-selects the topmost overlapping object after reordering", () => {
    const f = fixture("order-hit", JSON.stringify(objects)),
      session = f.open();
    f.click(150, 150, 0, 150);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ id: "d" }) }),
    );
    session.reorderSelected("back");
    f.click(150, 150, 0, 150);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ id: "c" }) }),
    );
    session.selectDrawing("a");
    session.reorderSelected("front");
    f.click(150, 150, 0, 150);
    expect(f.change).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: expect.objectContaining({ id: "a" }) }),
    );
    session.dispose();
  });
  it("cancels drafts and a live drag before recording only the order change", () => {
    const f = fixture("order-cancel", JSON.stringify(objects)),
      session = f.open();
    session.selectDrawing("b");
    session.openSettings();
    session.previewSettings({ color: "#ff0000", text: "Draft" });
    session.reorderSelected("front");
    expect(JSON.parse(f.saved()!).at(-1)).toEqual(objects[1]);
    expect(f.controls.get(DRAWING_DEFAULTS_KEY)).toBeUndefined();
    expect(session.beginDrag({ x: 150, y: 150 })).toBe(true);
    session.dragTo({ x: 180, y: 180 });
    session.reorderSelected("back");
    expect(JSON.parse(f.saved()!)[0]).toEqual(objects[1]);
    expect(f.writes()).toBe(2);
    session.undo();
    expect(JSON.parse(f.saved()!).map((item: { id: string }) => item.id)).toEqual([
      "a",
      "c",
      "d",
      "b",
    ]);
    expect(JSON.parse(f.saved()!).at(-1)).toEqual(objects[1]);
    session.dispose();
  });
});

describe("drawing multiselection", () => {
  const line = (id: string, y: number, patch: Partial<ChartDrawing> = {}): ChartDrawing => ({
    id,
    kind: "trend",
    color: "#2962ff",
    width: 2,
    anchors: [
      { time: 100 as Time, price: 5000 - y },
      { time: 300 as Time, price: 5000 - y },
    ],
    ...patch,
  });
  const setup = (objects = [line("a", 100), line("b", 200)]) => {
    const f = fixture("multiselect", JSON.stringify(objects)),
      session = f.open();
    const state = () => f.change.mock.calls.at(-1)![0];
    session.selectDrawing("a");
    session.selectDrawing("b", { additive: true });
    return { f, session, state, objects };
  };
  it("toggles membership, preserves a group on ordinary member selection, and clears on empty click and Escape", () => {
    const { f, session, state } = setup();
    expect(state().selectedIds).toEqual(["a", "b"]);
    expect(state().selectedObjects.map((drawing: ChartDrawing) => drawing.id)).toEqual(["a", "b"]);
    session.selectDrawing("a");
    expect(state().selectedIds).toEqual(["a", "b"]);
    expect(state().selected.id).toBe("a");
    session.selectDrawing("a", { additive: true });
    expect(state().selectedIds).toEqual(["b"]);
    session.selectDrawing("a", { additive: true });
    f.click(700, 450, 0, 700);
    expect(state().selectedIds).toEqual([]);
    session.selectDrawing("a");
    session.cancel();
    expect(state().selectedIds).toEqual([]);
    expect(f.writes()).toBe(0);
    session.dispose();
  });
  it("modifier clicks add and remove membership without cloning or persisting, including jitter", () => {
    const { f, session, state } = setup();
    session.selectDrawing("b", { additive: true });
    expect(session.beginDrag({ x: 200, y: 200 }, { clone: true, additive: true })).toBe(true);
    session.dragTo({ x: 201, y: 201 });
    session.endDrag();
    expect(state().selectedIds).toEqual(["a", "b"]);
    session.beginDrag({ x: 200, y: 100 }, { clone: true, additive: true });
    session.endDrag();
    expect(state().selectedIds).toEqual(["b"]);
    expect(state().count).toBe(2);
    expect(f.writes()).toBe(0);
    session.dispose();
  });
  it("moves a group from a former endpoint with one undo/write and keeps locked members fixed", () => {
    const { f, session, state, objects } = setup([
      line("a", 100),
      line("b", 200),
      line("locked", 300, { locked: true }),
    ]);
    session.selectDrawing("locked", { additive: true });
    expect(session.beginDrag({ x: 100, y: 100 })).toBe(true);
    session.dragTo({ x: 120, y: 110 });
    session.dragTo({ x: 140, y: 130 });
    expect(f.writes()).toBe(0);
    session.endDrag();
    expect(f.writes()).toBe(1);
    const moved = JSON.parse(f.saved()!);
    expect(moved[0].anchors).toEqual([
      { time: 140, price: 4870 },
      { time: 340, price: 4870 },
    ]);
    expect(moved[1].anchors).toEqual([
      { time: 140, price: 4770 },
      { time: 340, price: 4770 },
    ]);
    expect(moved[2]).toEqual(objects[2]);
    expect(state().selectedIds).toEqual(["a", "b", "locked"]);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual(objects);
    session.redo();
    expect(JSON.parse(f.saved()!)).toEqual(moved);
    session.dispose();
  });
  it("clones a group after dragging, preserves originals, and restores originals and selection on cancellation", () => {
    const { f, session, state, objects } = setup();
    session.beginDrag({ x: 200, y: 100 }, { clone: true, additive: true });
    session.dragTo({ x: 250, y: 125 });
    expect(state().count).toBe(4);
    expect(state().objects.slice(0, 2)).toEqual(objects);
    expect(state().selectedIds.every((id: string) => id !== "a" && id !== "b")).toBe(true);
    expect(f.writes()).toBe(0);
    session.endDrag(false);
    expect(state().objects).toEqual(objects);
    expect(state().selectedIds).toEqual(["a", "b"]);
    session.beginDrag({ x: 200, y: 100 }, { clone: true, additive: true });
    session.dragTo({ x: 250, y: 125 });
    session.endDrag();
    const cloned = JSON.parse(f.saved()!);
    expect(f.writes()).toBe(1);
    expect(cloned.slice(0, 2)).toEqual(objects);
    expect(cloned.slice(2).map((drawing: ChartDrawing) => drawing.anchors)).toEqual([
      [
        { time: 150, price: 4875 },
        { time: 350, price: 4875 },
      ],
      [
        { time: 150, price: 4775 },
        { time: 350, price: 4775 },
      ],
    ]);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual(objects);
    session.redo();
    expect(JSON.parse(f.saved()!)).toEqual(cloned);
    session.dispose();
    const reloaded = f.open();
    expect(state().objects).toEqual(
      cloned.map(({ locked: _locked, ...drawing }: ChartDrawing) => drawing),
    );
    reloaded.dispose();
  });
  it("edits common appearance and deletes groups atomically, preserving locks and individual geometry", () => {
    const { f, session, state, objects } = setup([
      line("a", 100),
      line("b", 200),
      line("locked", 300, { locked: true }),
    ]);
    session.selectDrawing("locked", { additive: true });
    session.updateSelected({
      color: "#ff0000",
      width: 3,
      anchors: [{ time: 0 as Time, price: 0 }],
    });
    expect(f.writes()).toBe(1);
    expect(
      state()
        .objects.slice(0, 2)
        .map((drawing: ChartDrawing) => drawing.color),
    ).toEqual(["#ff0000", "#ff0000"]);
    expect(state().objects.map((drawing: ChartDrawing) => drawing.anchors)).toEqual(
      objects.map((drawing) => drawing.anchors),
    );
    expect(state().objects[2]).toEqual(objects[2]);
    session.updateSelected({ color: "bad" });
    expect(f.writes()).toBe(1);
    session.undo();
    expect(state().objects).toEqual(objects);
    expect(state().selectedIds).toEqual(["a", "b", "locked"]);
    const writes = f.writes();
    session.deleteSelected();
    expect(f.writes()).toBe(writes + 1);
    expect(state().objects).toEqual([objects[2]]);
    expect(state().selectedIds).toEqual(["locked"]);
    session.undo();
    expect(state().objects).toEqual(objects);
    session.dispose();
  });
  it("cleans hidden and interval-invisible group members and clears globally hidden selection", () => {
    const { session, state } = setup();
    session.updateDrawing("b", { hidden: true });
    expect(state().selectedIds).toEqual(["a"]);
    session.updateDrawing("b", { hidden: false });
    session.selectDrawing("b", { additive: true });
    session.updateDrawing("a", {
      visibility: sanitizeDrawingVisibility({ minutes: { enabled: true, min: 5, max: 30 } }),
    });
    expect(state().selectedIds).toEqual(["b"]);
    session.toggleHidden();
    expect(state().selectedIds).toEqual([]);
    session.dispose();
  });
  it("rejects capacity-overflow clones and invalid group projection atomically", () => {
    const objects = Array.from({ length: 99 }, (_, i) =>
      line(i === 0 ? "a" : i === 1 ? "b" : `extra${i}`, i < 2 ? 100 + i * 100 : 400),
    );
    const { f, session, state } = setup(objects);
    expect(session.beginDrag({ x: 200, y: 100 }, { clone: true })).toBe(false);
    expect(state().count).toBe(99);
    expect(f.writes()).toBe(0);
    expect(session.beginDrag({ x: 200, y: 100 })).toBe(true);
    vi.spyOn(f.series, "coordinateToPrice").mockReturnValue(null);
    session.dragTo({ x: 250, y: 120 });
    session.endDrag();
    expect(state().objects).toEqual(objects);
    expect(f.writes()).toBe(0);
    vi.restoreAllMocks();
    session.dispose();
  });
});

describe("group drawing transactions", () => {
  const setup = () => {
    const objects: ChartDrawing[] = [
      {
        id: "a",
        kind: "trend",
        anchors: [
          { time: 100 as Time, price: 4900 },
          { time: 300 as Time, price: 4800 },
        ],
        color: "#123456",
        width: 1,
        text: "First",
        visibility: sanitizeDrawingVisibility({ minutes: { min: 1, max: 5 } }),
      },
      {
        id: "b",
        kind: "rectangle",
        anchors: [
          { time: 200 as Time, price: 4700 },
          { time: 400 as Time, price: 4600 },
        ],
        color: "#abcdef",
        width: 3,
        text: "Second",
        visibility: sanitizeDrawingVisibility({ minutes: { min: 1, max: 30 } }),
      },
    ];
    const f = fixture("group-settings", JSON.stringify(objects)),
      session = f.open();
    session.selectDrawing("b");
    session.selectDrawing("a", { additive: true });
    return { f, session, objects, state: () => f.change.mock.calls.at(-1)![0] };
  };
  it("previews only patched common fields, cancels every member, and commits one undo/write", () => {
    const { f, session, objects, state } = setup();
    expect(session.openSettings()).toBe(true);
    expect(session.previewSettings({ width: 2 })).toBe(true);
    expect(state().selectedObjects.map((d: ChartDrawing) => [d.color, d.width, d.text])).toEqual([
      ["#abcdef", 2, "Second"],
      ["#123456", 2, "First"],
    ]);
    expect(state().objects).toEqual(objects);
    expect(f.writes()).toBe(0);
    session.closeSettings();
    expect(state().objects).toEqual(objects);
    expect(state().selectedObjects.map((d: ChartDrawing) => d.width)).toEqual([3, 1]);
    session.openSettings();
    session.previewSettings({ color: "#ff0000" });
    expect(session.applySettings({ width: 4 })).toBe(true);
    expect(f.writes()).toBe(1);
    expect(state().objects).toEqual(objects.map((d) => ({ ...d, color: "#ff0000", width: 4 })));
    session.undo();
    expect(state().objects).toEqual(objects);
    session.redo();
    expect(state().objects.map((d: ChartDrawing) => d.width)).toEqual([4, 4]);
    session.dispose();
  });
  it("retains temporarily invisible draft members and preserves untouched mixed visibility ranges", () => {
    const { f, session, objects, state } = setup();
    session.openSettings();
    expect(
      session.previewSelectedVisibility({ hours: { enabled: false }, minutes: { enabled: false } }),
    ).toBe(true);
    expect(state().selectedIds).toEqual(["b", "a"]);
    expect(state().settingsOpen).toBe(true);
    expect(state().selectedObjects.map((d: ChartDrawing) => d.visibility?.minutes.max)).toEqual([
      30, 5,
    ]);
    session.closeSettings();
    expect(state().objects).toEqual(objects);
    expect(f.writes()).toBe(0);
    session.openSettings();
    session.previewSelectedVisibility({ hours: { enabled: false } });
    session.applySettings({});
    expect(
      state().objects.map((d: ChartDrawing) => [
        d.visibility?.hours.enabled,
        d.visibility?.minutes.max,
      ]),
    ).toEqual([
      [false, 5],
      [false, 30],
    ]);
    expect(f.writes()).toBe(1);
    session.dispose();
  });
  it("computes relative displacement from the original snapshot, preserves style previews, and rejects bad projections atomically", () => {
    const { f, session, objects, state } = setup();
    const scale = f.chart.timeScale();
    f.chart.timeScale = () =>
      ({ ...scale, logicalToCoordinate: (bar: number) => (bar * 100) as Coordinate }) as ReturnType<
        IChartApi["timeScale"]
      >;
    session.openSettings();
    session.previewSettings({ width: 2 });
    expect(session.previewSelectedDisplacement({ bars: 2, price: 5 })).toBe(true);
    expect(session.previewSelectedDisplacement({ bars: 1, price: -10, priceMultiplier: 2 })).toBe(
      true,
    );
    const expected = objects.map((d) => ({
      ...d,
      width: 2,
      anchors: d.anchors.map((a) => ({ time: Number(a.time) + 100, price: a.price * 2 - 10 })),
    }));
    expect(state().selectedObjects).toEqual([expected[1], expected[0]]);
    expect(session.previewSelectedDisplacement({ bars: 1.5, price: 1 })).toBe(false);
    expect(
      session.previewSelectedDisplacement({ bars: 0, price: 1, priceMultiplier: Infinity }),
    ).toBe(false);
    f.chart.timeScale = () =>
      ({ ...scale, logicalToCoordinate: () => null }) as ReturnType<IChartApi["timeScale"]>;
    expect(session.previewSelectedDisplacement({ bars: 3, price: 0 })).toBe(false);
    expect(state().selectedObjects).toEqual([expected[1], expected[0]]);
    expect(f.writes()).toBe(0);
    session.applySettings({});
    expect(state().objects).toEqual(expected);
    expect(f.writes()).toBe(1);
    session.undo();
    expect(state().objects).toEqual(objects);
    session.dispose();
  });
  it("copies reverse-click selections in visual order and pastes/duplicates independent groups atomically", () => {
    const { f, session, objects, state } = setup();
    const text = session.copySelectedSerialized()!;
    expect(parseDrawingsClipboard(text)).toEqual(objects);
    expect(session.pasteDrawing(text)).toBe(true);
    expect(f.writes()).toBe(1);
    const pasted: ChartDrawing[] = state().objects.slice(2);
    expect(pasted.map((d) => d.kind)).toEqual(["trend", "rectangle"]);
    expect(pasted.map((d) => d.anchors)).toEqual(
      objects.map((d) => d.anchors.map((a) => ({ ...a, price: a.price + 40 }))),
    );
    expect(new Set(state().objects.map((d: ChartDrawing) => d.id)).size).toBe(4);
    expect(state().selectedIds).toEqual(pasted.map((d) => d.id));
    session.undo();
    expect(state().objects).toEqual(objects);
    session.selectDrawing("b");
    session.selectDrawing("a", { additive: true });
    const writes = f.writes();
    session.duplicateSelected();
    expect(f.writes()).toBe(writes + 1);
    expect(
      state()
        .objects.slice(2)
        .map((d: ChartDrawing) => d.anchors),
    ).toEqual(objects.map((d) => d.anchors));
    session.updateSelected({ color: "#ffffff" });
    expect(state().objects.slice(0, 2)).toEqual(objects);
    session.dispose();
  });
  it("moves selected objects together in visual order and templates preserve each object's identity and geometry", () => {
    const { f, session, objects, state } = setup();
    session.duplicateSelected();
    session.selectDrawing("a");
    session.selectDrawing("b", { additive: true });
    const order = state().objects.map((d: ChartDrawing) => d.id),
      writes = f.writes();
    expect(session.reorderSelected("front")).toBe(true);
    expect(state().objects.map((d: ChartDrawing) => d.id)).toEqual([...order.slice(2), "a", "b"]);
    expect(f.writes()).toBe(writes + 1);
    session.undo();
    expect(state().objects.map((d: ChartDrawing) => d.id)).toEqual(order);
    expect(state().selectedIds).toEqual(["a", "b"]);
    expect(session.applySelectedTemplate({ color: "#ff0000", width: 2 })).toBe(true);
    expect(
      state()
        .objects.slice(0, 2)
        .map((d: ChartDrawing) => [d.id, d.kind, d.anchors, d.text]),
    ).toEqual(objects.map((d) => [d.id, d.kind, d.anchors, d.text]));
    expect(
      state()
        .objects.slice(0, 2)
        .every((d: ChartDrawing) => d.color === "#ff0000" && d.width === 2),
    ).toBe(true);
    session.dispose();
  });
});

describe("group drawing geometry preservation", () => {
  it("restores exact off-tick anchors when clearing displacement and does not round prices on bar-only shifts", () => {
    const objects: ChartDrawing[] = ["a", "b"].map((id, index) => ({
      id,
      kind: "trend",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 4900.123 + index },
        { time: 200 as Time, price: 4800.456 + index },
      ],
    }));
    const f = fixture("group-offtick", JSON.stringify(objects)),
      session = f.open();
    const scale = f.chart.timeScale();
    f.chart.timeScale = () =>
      ({ ...scale, logicalToCoordinate: (bar: number) => (bar * 100) as Coordinate }) as ReturnType<
        IChartApi["timeScale"]
      >;
    session.selectDrawing("a");
    session.selectDrawing("b", { additive: true });
    session.openSettings();
    session.previewSelectedDisplacement({ bars: 1, price: 0 });
    expect(
      f.change.mock.calls.at(-1)![0].selectedObjects.map((d: ChartDrawing) => d.anchors),
    ).toEqual(objects.map((d) => d.anchors.map((a) => ({ ...a, time: Number(a.time) + 100 }))));
    session.previewSelectedDisplacement({ bars: 0, price: 3 });
    session.previewSelectedDisplacement({ bars: 0, price: 0 });
    session.applySettings({});
    expect(f.change.mock.calls.at(-1)![0].objects).toEqual(objects);
    expect(f.writes()).toBe(0);
    session.dispose();
  });
  it("updates explicit channel/regression rails independently without changing their ratios or visibility", () => {
    const channel: ChartDrawing = {
      id: "channel",
      kind: "channel",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 4900 },
        { time: 300 as Time, price: 4900 },
        { time: 100 as Time, price: 4800 },
      ],
      levels: [
        { value: 0.2, visible: true, color: "#ff0000", width: 1 },
        { value: 1, visible: false, color: "#00ff00", width: 2 },
      ],
    };
    const regression: ChartDrawing = {
      id: "regression",
      kind: "regression-trend",
      color: "#ff0000",
      width: 1,
      anchors: [
        { time: 100 as Time, price: 4900 },
        { time: 300 as Time, price: 4800 },
      ],
      regressionUpperLine: {
        visible: false,
        color: "#abcdef",
        width: 1,
        lineStyle: "dashed",
        opacity: 0.5,
      },
    };
    const f = fixture("group-explicit-rails", JSON.stringify([channel, regression])),
      session = f.open();
    session.selectDrawing("channel");
    session.selectDrawing("regression", { additive: true });
    session.openSettings();
    session.previewSettings({ color: "#123456", width: 3, lineStyle: "dotted" });
    session.applySettings({});
    const next = JSON.parse(f.saved()!);
    expect(next[0].levels).toEqual(
      channel.levels!.map((level) => ({
        ...level,
        color: "#123456",
        width: 3,
        lineStyle: "dotted",
      })),
    );
    expect(next[1].regressionUpperLine).toEqual({
      ...regression.regressionUpperLine,
      color: "#123456",
      width: 3,
      lineStyle: "dotted",
    });
    expect(next[1].regressionBaseLine.color).toBe("#123456");
    expect(next[1].regressionLowerLine.color).toBe("#123456");
    expect(f.writes()).toBe(1);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual([channel, regression]);
    session.dispose();
  });
  it("moves vertical, horizontal, and parallel-channel members as bodies without altering their structural constraints", () => {
    const objects: ChartDrawing[] = [
      {
        id: "a",
        kind: "channel",
        color: "#2962ff",
        width: 2,
        anchors: [
          { time: 100 as Time, price: 4900 },
          { time: 300 as Time, price: 4850 },
          { time: 100 as Time, price: 4800 },
        ],
      },
      {
        id: "b",
        kind: "horizontal",
        color: "#ff0000",
        width: 2,
        anchors: [{ time: 200 as Time, price: 4700 }],
      },
      {
        id: "c",
        kind: "vertical",
        color: "#00ff00",
        width: 2,
        anchors: [{ time: 400 as Time, price: 4600 }],
      },
    ];
    const f = fixture("group-mixed-move", JSON.stringify(objects)),
      session = f.open();
    session.selectDrawing("a");
    session.selectDrawing("b", { additive: true });
    session.selectDrawing("c", { additive: true });
    expect(session.beginDrag({ x: 200, y: 125 })).toBe(true);
    session.dragTo({ x: 250, y: 145 });
    session.endDrag();
    expect(JSON.parse(f.saved()!).map((d: ChartDrawing) => d.anchors)).toEqual([
      [
        { time: 150, price: 4880 },
        { time: 350, price: 4830 },
        { time: 150, price: 4780 },
      ],
      [{ time: 200, price: 4680 }],
      [{ time: 450, price: 4600 }],
    ]);
    session.undo();
    expect(JSON.parse(f.saved()!)).toEqual(objects);
    session.dispose();
  });
});

describe("marquee drawing selection", () => {
  const make = () => {
    const objects: ChartDrawing[] = [
      {
        id: "a",
        kind: "trend",
        color: "#2962ff",
        width: 2,
        anchors: [
          { time: 100 as Time, price: 4900 },
          { time: 300 as Time, price: 4900 },
        ],
      },
      {
        id: "b",
        kind: "rectangle",
        color: "#ff0000",
        width: 2,
        anchors: [
          { time: 400 as Time, price: 4800 },
          { time: 600 as Time, price: 4700 },
        ],
      },
      {
        id: "locked",
        kind: "trend",
        color: "#00ff00",
        width: 2,
        locked: true,
        anchors: [
          { time: 200 as Time, price: 4650 },
          { time: 350 as Time, price: 4650 },
        ],
      },
      {
        id: "hidden",
        kind: "trend",
        color: "#00ff00",
        width: 2,
        hidden: true,
        anchors: [
          { time: 100 as Time, price: 4890 },
          { time: 300 as Time, price: 4890 },
        ],
      },
      {
        id: "other-interval",
        kind: "trend",
        color: "#00ff00",
        width: 2,
        visibility: sanitizeDrawingVisibility({ minutes: { enabled: true, min: 5, max: 30 } }),
        anchors: [
          { time: 100 as Time, price: 4880 },
          { time: 300 as Time, price: 4880 },
        ],
      },
    ];
    const f = fixture("marquee", JSON.stringify(objects)),
      session = f.open();
    return { f, session, objects, state: () => f.change.mock.calls.at(-1)![0] };
  };
  it("normalizes reverse rectangle drags and selects visible geometry without writing or creating objects", () => {
    const { f, session, objects, state } = make();
    expect(session.beginMarquee({ x: 650, y: 320 })).toBe(true);
    session.updateMarquee({ x: 50, y: 50 });
    expect(state().selectionRect).toEqual({ x: 50, y: 50, width: 600, height: 270 });
    expect(state().selectedIds).toEqual(["a", "b"]);
    expect(state().objects).toEqual(objects);
    expect(f.writes()).toBe(0);
    session.endMarquee();
    expect(state().selectionRect).toBeNull();
    expect(state().selectedIds).toEqual(["a", "b"]);
    expect(f.writes()).toBe(0);
    session.dispose();
  });
  it("merges an additive marquee once, includes locked objects, and rejects their movement", () => {
    const { f, session, state } = make();
    session.selectDrawing("a");
    session.beginMarquee({ x: 150, y: 330 }, { additive: true });
    session.updateMarquee({ x: 370, y: 370 });
    session.endMarquee();
    expect(state().selectedIds).toEqual(["a", "locked"]);
    session.beginMarquee({ x: 50, y: 50 }, { additive: true });
    session.updateMarquee({ x: 370, y: 370 });
    session.endMarquee();
    expect(state().selectedIds).toEqual(["a", "locked"]);
    expect(session.beginDrag({ x: 250, y: 350 })).toBe(false);
    expect(f.writes()).toBe(0);
    session.dispose();
  });
  it("restores exact selection and primary on cancellation or Escape, including after a selection replacement", () => {
    const { f, session, state } = make();
    session.selectDrawing("a");
    session.selectDrawing("b", { additive: true });
    session.selectDrawing("a");
    session.beginMarquee({ x: 150, y: 330 });
    session.updateMarquee({ x: 370, y: 370 });
    expect(state().selectedIds).toEqual(["locked"]);
    session.endMarquee(false);
    expect(state().selectedIds).toEqual(["a", "b"]);
    expect(state().selected.id).toBe("a");
    session.beginMarquee({ x: 150, y: 330 });
    session.updateMarquee({ x: 370, y: 370 });
    session.cancel();
    expect(state().selectionRect).toBeNull();
    expect(state().selectedIds).toEqual(["a", "b"]);
    expect(state().selected.id).toBe("a");
    expect(f.writes()).toBe(0);
    session.dispose();
  });
  it("routes modifier blank-area drag through marquee while modifier object drag still clones", () => {
    const { f, session, state } = make();
    expect(session.beginDrag({ x: 50, y: 50 }, { clone: true, additive: true })).toBe(true);
    session.dragTo({ x: 650, y: 320 });
    session.endDrag();
    expect(state().selectedIds).toEqual(["a", "b"]);
    expect(state().count).toBe(5);
    expect(f.writes()).toBe(0);
    expect(session.beginDrag({ x: 200, y: 100 }, { clone: true, additive: true })).toBe(true);
    session.dragTo({ x: 220, y: 130 });
    session.endDrag();
    expect(state().count).toBe(7);
    expect(f.writes()).toBe(1);
    session.dispose();
  });
  it("ignores jitter and invalid coordinates, clips bounds, and leaves redo history intact", () => {
    const { f, session, state } = make();
    session.selectDrawing("a");
    session.updateSelected({ width: 3 });
    session.undo();
    expect(state().canRedo).toBe(true);
    const writes = f.writes();
    session.selectDrawing("b");
    session.beginMarquee({ x: 50, y: 50 });
    session.updateMarquee({ x: 51, y: 51 });
    session.updateMarquee({ x: NaN, y: 60 });
    session.endMarquee();
    expect(state().selectedIds).toEqual(["b"]);
    expect(state().selectionRect).toBeNull();
    session.beginMarquee({ x: 50, y: 50 });
    session.updateMarquee({ x: 2000, y: 2000 });
    expect(state().selectionRect).toEqual({ x: 50, y: 50, width: 950, height: 450 });
    session.endMarquee();
    expect(state().selectedIds).toEqual(["a", "b", "locked"]);
    expect(state().canRedo).toBe(true);
    expect(f.writes()).toBe(writes);
    session.redo();
    expect(state().objects[0].width).toBe(3);
    session.dispose();
  });
  it("rejects foreign panes, invalid origins, drawing mode, hidden charts, and disposed sessions", () => {
    const { session } = make();
    expect(session.beginMarquee({ x: 50, y: 50 }, { paneIndex: 1 })).toBe(false);
    expect(session.beginMarquee({ x: -1, y: 50 })).toBe(false);
    expect(session.beginMarquee({ x: 50, y: Infinity })).toBe(false);
    session.setTool("trend");
    expect(session.beginMarquee({ x: 50, y: 50 })).toBe(false);
    session.setTool("cursor");
    session.toggleHidden();
    expect(session.beginMarquee({ x: 50, y: 50 })).toBe(false);
    session.dispose();
    expect(session.beginMarquee({ x: 50, y: 50 })).toBe(false);
  });
});

describe("group template preview", () => {
  it("replaces sparse appearance for each draft while retaining individual metadata, geometry and visibility, and cancels atomically", () => {
    const objects: ChartDrawing[] = [
      {
        id: "a",
        kind: "trend",
        color: "#123456",
        width: 1,
        background: true,
        backgroundColor: "#ff0000",
        textBold: true,
        text: "Alpha",
        name: "Line",
        anchors: [
          { time: 100 as Time, price: 4900 },
          { time: 200 as Time, price: 4800 },
        ],
        visibility: sanitizeDrawingVisibility({ minutes: { max: 5 } }),
      },
      {
        id: "b",
        kind: "rectangle",
        color: "#abcdef",
        width: 3,
        background: true,
        backgroundColor: "#00ff00",
        textItalic: true,
        text: "Beta",
        name: "Box",
        anchors: [
          { time: 300 as Time, price: 4700 },
          { time: 400 as Time, price: 4600 },
        ],
        visibility: sanitizeDrawingVisibility({ minutes: { max: 30 } }),
      },
    ];
    const f = fixture("group-template-preview", JSON.stringify(objects)),
      session = f.open(),
      state = () => f.change.mock.calls.at(-1)![0];
    session.selectDrawing("a");
    session.selectDrawing("b", { additive: true });
    session.openSettings();
    expect(
      session.previewSettings(
        {
          color: "#ffffff",
          width: 2,
          text: "Do not overwrite",
          visibility: sanitizeDrawingVisibility({ minutes: { enabled: false } }),
        },
        { replace: true },
      ),
    ).toBe(true);
    expect(state().selectedObjects).toEqual(
      objects.map(
        ({
          background: _background,
          backgroundColor: _backgroundColor,
          textBold: _bold,
          textItalic: _italic,
          ...drawing
        }) => ({ ...drawing, color: "#ffffff", width: 2, lineStyle: "solid" }),
      ),
    );
    expect(state().objects).toEqual(objects);
    expect(f.writes()).toBe(0);
    session.closeSettings();
    expect(state().selectedObjects).toEqual(objects);
    session.openSettings();
    expect(session.previewSettings({ color: "invalid", width: 2 }, { replace: true })).toBe(false);
    expect(state().selectedObjects).toEqual(objects);
    session.previewSettings({ color: "#ffffff", width: 2 }, { replace: true });
    expect(session.applySettings({}, { replace: true })).toBe(true);
    expect(f.writes()).toBe(1);
    const saved = f.saved();
    session.undo();
    expect(state().objects).toEqual(objects);
    session.redo();
    expect(f.saved()).toBe(saved);
    session.dispose();
  });
});

describe("wrapped Text width resizing", () => {
  const make = (patch: Partial<ChartDrawing> = {}, useDefaultWidth = false) => {
    const original: ChartDrawing = {
      id: "wrapped-text",
      kind: "text",
      color: "#2962ff",
      width: 2,
      text: "Plan the trade",
      textWrap: true,
      textWrapWidth: 240,
      background: true,
      backgroundColor: "#123456",
      anchors: [{ time: 100 as Time, price: 4800 }],
      ...patch,
    };
    if (useDefaultWidth) delete original.textWrapWidth;
    const f = fixture("text-width", JSON.stringify([original])),
      session = f.open();
    session.selectDrawing(original.id);
    const handle = (drawing = original) => {
      const projection = drawingProjection(f.chart, f.series);
      return buildDrawingGeometry(
        drawing,
        projection.project,
        projection.priceY,
        projection.width,
        projection.height,
      ).handles[1]!;
    };
    return { f, session, original, handle, state: () => f.change.mock.calls.at(-1)![0] };
  };
  it("resizes only the outer CSS width, commits one undo/write, and reloads the same width", () => {
    const { f, session, original, handle, state } = make();
    const point = handle();
    expect(session.beginDrag(point)).toBe(true);
    session.dragTo({ x: point.x + 30, y: point.y + 50 });
    session.dragTo({ x: point.x + 80, y: point.y - 30 });
    expect(state().objects).toEqual([{ ...original, textWrapWidth: 320 }]);
    expect(f.writes()).toBe(0);
    session.endDrag();
    expect(f.writes()).toBe(1);
    expect(JSON.parse(f.saved()!)).toEqual([{ ...original, textWrapWidth: 320 }]);
    session.undo();
    expect(state().objects).toEqual([original]);
    session.redo();
    expect(state().objects[0].textWrapWidth).toBe(320);
    session.dispose();
    const reloaded = f.open();
    expect(state().objects[0].textWrapWidth).toBe(320);
    expect(state().objects[0].anchors).toEqual(original.anchors);
    reloaded.dispose();
  });
  it.each(["cancel", "escape", "tool"] as const)(
    "restores the original width after %s without persisting a preview",
    (action) => {
      const { f, session, original, handle, state } = make();
      const point = handle();
      session.beginDrag(point);
      session.dragTo({ x: point.x + 100, y: point.y });
      expect(state().objects[0].textWrapWidth).toBe(340);
      if (action === "cancel") session.endDrag(false);
      else if (action === "escape") session.cancel();
      else session.setTool("cursor");
      expect(state().objects).toEqual([original]);
      expect(f.writes()).toBe(0);
      session.endDrag();
      expect(f.writes()).toBe(0);
      session.dispose();
    },
  );
  it("clamps at40 and4000 pixels and modifier resizing never clones or changes anchors", () => {
    const { f, session, original, handle, state } = make();
    const point = handle();
    expect(session.beginDrag(point, { clone: true, additive: true })).toBe(true);
    session.dragTo({ x: point.x - 1000, y: point.y });
    expect(state().objects[0].textWrapWidth).toBe(40);
    session.dragTo({ x: point.x + 5000, y: point.y });
    session.endDrag();
    expect(state().count).toBe(1);
    expect(state().objects[0].textWrapWidth).toBe(4000);
    expect(state().objects[0].anchors).toEqual(original.anchors);
    expect(f.writes()).toBe(1);
    session.dispose();
  });
  it("uses the default outer width without materializing it for clicks, vertical motion, invalid points, or returning to origin", () => {
    const { f, session, original, handle, state } = make({}, true);
    const point = handle();
    session.beginDrag(point);
    session.dragTo({ x: point.x + 1, y: point.y + 1 });
    session.endDrag();
    expect(f.writes()).toBe(0);
    session.beginDrag(point);
    session.dragTo({ x: point.x, y: point.y + 100 });
    session.dragTo({ x: NaN, y: point.y });
    session.endDrag();
    expect(f.writes()).toBe(0);
    session.beginDrag(point);
    session.dragTo({ x: point.x + 50, y: point.y });
    expect(state().objects[0].textWrapWidth).toBe(290);
    session.dragTo(point);
    session.endDrag();
    expect(state().objects[0].textWrapWidth).toBeUndefined();
    expect(state().objects[0].anchors).toEqual(original.anchors);
    expect(f.writes()).toBe(0);
    session.dispose();
  });
  it("retains fractional outer widths without rounding during vertical-only motion", () => {
    const { f, session, original, handle, state } = make({ textWrapWidth: 240.5 });
    const point = handle();
    session.beginDrag(point);
    session.dragTo({ x: point.x, y: point.y + 40 });
    session.endDrag();
    expect(state().objects).toEqual([original]);
    expect(f.writes()).toBe(0);
    session.beginDrag(point);
    session.dragTo({ x: point.x + 10.25, y: point.y });
    session.endDrag();
    expect(state().objects[0].textWrapWidth).toBe(250.75);
    session.dispose();
  });
  it.each(["left", "center", "right"] as const)(
    "keeps the outer origin fixed while resizing %s-aligned wrapped text",
    (textAlignment) => {
      const { session, original, handle, state } = make({ textAlignment });
      const point = handle();
      expect(session.beginDrag(point)).toBe(true);
      session.dragTo({ x: point.x + 64, y: point.y });
      session.endDrag();
      const resized = state().objects[0];
      expect(resized.textWrapWidth).toBe(304);
      expect(resized.anchors).toEqual(original.anchors);
      expect(handle(resized).x).toBe(point.x + 64);
      session.dispose();
    },
  );
  it("does not resize locked text or a wrapped Text that belongs to a selected group", () => {
    const { f, session, original, handle, state } = make();
    const point = handle();
    session.updateSelected({ locked: true });
    const beforeLocked = f.saved();
    expect(session.beginDrag(point)).toBe(false);
    session.dragTo({ x: point.x + 80, y: point.y });
    session.endDrag();
    expect(f.saved()).toBe(beforeLocked);
    session.updateDrawing(original.id, { locked: false });
    session.duplicateSelected();
    const otherId = state().selected.id;
    session.updateDrawing(otherId, { anchors: [{ time: 400 as Time, price: 4700 }] });
    session.selectDrawing(original.id);
    session.selectDrawing(otherId, { additive: true });
    expect(session.beginDrag(point)).toBe(true);
    session.dragTo({ x: point.x + 40, y: point.y + 20 });
    session.endDrag();
    expect(state().objects.map((drawing: ChartDrawing) => drawing.textWrapWidth)).toEqual([
      240, 240,
    ]);
    expect(state().objects[0].anchors).toEqual([{ time: 140, price: 4780 }]);
    session.dispose();
  });
});

describe("parallel channel endpoint coordinate edits", () => {
  it.each([
    {
      name: "linear first price",
      log: false,
      index: 0,
      prices: [100, 300, 250],
      next: { time: 100, price: 200 },
      expected: 300,
    },
    {
      name: "linear second price",
      log: false,
      index: 1,
      prices: [100, 300, 250],
      next: { time: 300, price: 500 },
      expected: 350,
    },
    {
      name: "logarithmic first price",
      log: true,
      index: 0,
      prices: [100, 400, 250],
      next: { time: 100, price: 400 },
      expected: 450,
    },
    {
      name: "logarithmic second price",
      log: true,
      index: 1,
      prices: [100, 400, 250],
      next: { time: 300, price: 900 },
      expected: 350,
    },
  ])(
    "preserves numeric offset for $name and saves/cancels as one settings transaction",
    ({ name, log, index, prices, next, expected }) => {
      const original: ChartDrawing = {
        id: "endpoint",
        kind: "channel",
        color: "#2962ff",
        width: 2,
        anchors: [100, 300, 200].map((time, i) => ({ time: time as Time, price: prices[i]! })),
      };
      const f = fixture(`channel-endpoint-${name}`, JSON.stringify([original]));
      if (log) {
        vi.spyOn(f.series, "priceToCoordinate").mockImplementation((price) =>
          price > 0 ? (-Math.log(price) as Coordinate) : null,
        );
        vi.spyOn(f.series, "coordinateToPrice").mockImplementation((y) => Math.exp(-y) as BarPrice);
      }
      const session = f.open();
      session.selectDrawing(original.id);
      session.openSettings();
      const oldOffset = session.channelPriceOffset(original)!;
      const anchors = session.channelAnchorsAtEndpoint(original, index, {
        ...next,
        time: next.time as Time,
      })!;
      expect(anchors[index]).toEqual(next);
      expect(anchors[1 - index]).toEqual(original.anchors[1 - index]);
      expect(anchors[2]!.time).toBe(original.anchors[2]!.time);
      expect(anchors[2]!.price).toBeCloseTo(expected, 10);
      expect(session.channelPriceOffset({ ...original, anchors })).toBeCloseTo(oldOffset, 10);
      expect(original.anchors[2]!.price).toBe(prices[2]);
      expect(f.writes()).toBe(0);
      session.previewSettings({ anchors });
      expect(f.writes()).toBe(0);
      session.closeSettings();
      expect(f.change.mock.calls.at(-1)![0].objects).toEqual([original]);
      session.openSettings();
      session.previewSettings({ anchors });
      session.applySettings({});
      expect(f.writes()).toBe(1);
      expect(JSON.parse(f.saved()!)).toEqual([{ ...original, anchors }]);
      session.undo();
      expect(JSON.parse(f.saved()!)).toEqual([original]);
      session.redo();
      expect(JSON.parse(f.saved()!)).toEqual([{ ...original, anchors }]);
      session.dispose();
    },
  );
  it.each([
    { name: "first bar", index: 0, time: 0, expected: 310 },
    { name: "second bar", index: 1, time: 2000000, expected: 230 },
    {
      name: "first bar past second with exterior width anchor",
      index: 0,
      time: 2000000,
      expected: 1750,
    },
  ])(
    "uses actual chart positions for $name across nonuniform timestamp spacing",
    ({ name, index, time, expected }) => {
      const original: ChartDrawing = {
        id: "gapped-endpoint",
        kind: "channel",
        color: "#2962ff",
        width: 2,
        anchors: [
          { time: 100 as Time, price: 100 },
          { time: 1000000 as Time, price: 500 },
          { time: 200 as Time, price: 250 },
        ],
      };
      const f = fixture(`channel-endpoint-${name}`, JSON.stringify([original]));
      const positions = new Map([
          [0, 0],
          [100, 100],
          [200, 200],
          [1000000, 500],
          [2000000, 600],
        ]),
        scale = f.chart.timeScale();
      vi.spyOn(f.chart, "timeScale").mockReturnValue({
        ...scale,
        timeToCoordinate: (value: Time) =>
          (positions.get(Number(value)) as Coordinate | undefined) ?? null,
      });
      const session = f.open();
      const anchors = session.channelAnchorsAtEndpoint(original, index, {
        time: time as Time,
        price: original.anchors[index]!.price,
      })!;
      expect(anchors[index]!.time).toBe(time);
      expect(anchors[2]!.time).toBe(200);
      expect(anchors[2]!.price).toBeCloseTo(expected, 10);
      expect(session.channelPriceOffset({ ...original, anchors })).toBeCloseTo(50, 10);
      expect(f.writes()).toBe(0);
      expect(JSON.parse(f.saved()!)).toEqual([original]);
      session.dispose();
    },
  );
  it("rejects invalid endpoints and unavailable projections without changing the current settings preview", () => {
    const original: ChartDrawing = {
      id: "invalid-endpoint",
      kind: "channel",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 100 },
        { time: 300 as Time, price: 400 },
        { time: 200 as Time, price: 50 },
      ],
    };
    const f = fixture("channel-endpoint-invalid", JSON.stringify([original])),
      session = f.open();
    session.selectDrawing(original.id);
    session.openSettings();
    session.previewSettings({ color: "#ff0000" });
    const next = { time: 100 as Time, price: 200 };
    expect(session.channelAnchorsAtEndpoint(original, 2, next)).toBeNull();
    expect(session.channelAnchorsAtEndpoint(original, -1, next)).toBeNull();
    expect(session.channelAnchorsAtEndpoint(original, 0.5, next)).toBeNull();
    expect(session.channelAnchorsAtEndpoint({ ...original, kind: "triangle" }, 0, next)).toBeNull();
    expect(session.channelAnchorsAtEndpoint(original, 0, { ...next, price: NaN })).toBeNull();
    expect(
      session.channelAnchorsAtEndpoint(original, 0, { ...next, time: NaN as Time }),
    ).toBeNull();
    expect(session.channelAnchorsAtEndpoint(original, 0, original.anchors[1]!)).toBeNull();
    const projected = vi.spyOn(f.series, "priceToCoordinate");
    projected.mockReturnValue(null);
    expect(session.channelAnchorsAtEndpoint(original, 0, next)).toBeNull();
    projected.mockImplementation(() => {
      throw new Error("detached price scale");
    });
    expect(session.channelAnchorsAtEndpoint(original, 0, next)).toBeNull();
    projected.mockRestore();
    vi.spyOn(f.series, "priceToCoordinate").mockImplementation((price) =>
      price > 0 ? (-Math.log(price) as Coordinate) : null,
    );
    vi.spyOn(f.series, "coordinateToPrice").mockImplementation((y) => Math.exp(-y) as BarPrice);
    // Old numeric offset is -150. The edited log baseline is100, so preserving it would require a negative third price.
    expect(
      session.channelAnchorsAtEndpoint(original, 1, { time: 300 as Time, price: 100 }),
    ).toBeNull();
    expect(session.channelAnchorsAtEndpoint(original, 0, { ...next, price: -1 })).toBeNull();
    expect(f.change.mock.calls.at(-1)![0].selected.color).toBe("#ff0000");
    expect(f.writes()).toBe(0);
    expect(JSON.parse(f.saved()!)).toEqual([original]);
    session.dispose();
    expect(session.channelAnchorsAtEndpoint(original, 0, next)).toBeNull();
  });
  it("keeps exact coordinates for unchanged endpoints and leaves fractional recomputed offsets unrounded", () => {
    const original: ChartDrawing = {
      id: "exact-endpoint",
      kind: "channel",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 100 },
        { time: 400 as Time, price: 400 },
        { time: 200 as Time, price: 250.123456 },
      ],
    };
    const f = fixture("channel-endpoint-exact", JSON.stringify([original]));
    vi.spyOn(f.series, "priceToCoordinate").mockImplementation((price) =>
      price > 0 ? (-Math.log(price) as Coordinate) : null,
    );
    vi.spyOn(f.series, "coordinateToPrice").mockImplementation((y) => Math.exp(-y) as BarPrice);
    const session = f.open();
    const unchanged = session.channelAnchorsAtEndpoint(original, 0, { ...original.anchors[0]! })!;
    expect(unchanged).toEqual(original.anchors);
    const offset = session.channelPriceOffset(original)!;
    const anchors = session.channelAnchorsAtEndpoint(original, 0, {
      time: 100 as Time,
      price: 123.45,
    })!;
    expect(session.channelPriceOffset({ ...original, anchors })).toBeCloseTo(offset, 10);
    expect(anchors[2]!.price).not.toBe(session.normalizeCoordinatePrice(anchors[2]!.price));
    expect(f.writes()).toBe(0);
    session.dispose();
  });
});

describe("human-readable copy names", () => {
  it.each(["paste", "duplicate-selected", "duplicate-object"] as const)(
    "%s persists human-readable unnamed tool names, with one undoable operation",
    (operation) => {
      const original: ChartDrawing = {
        id: "unnamed-regression",
        kind: "regression-trend",
        anchors: [
          { time: 100 as Time, price: 4900 },
          { time: 300 as Time, price: 4800 },
        ],
        color: "#123456",
        width: 1,
      };
      const f = fixture(`copy-name-${operation}`, JSON.stringify([original]));
      const session = f.open();
      session.selectDrawing(original.id);
      if (operation === "paste")
        expect(session.pasteDrawing(session.copySelectedSerialized()!)).toBe(true);
      else if (operation === "duplicate-selected") session.duplicateSelected();
      else session.duplicateDrawing(original.id);
      const saved = f.saved();
      expect(JSON.parse(saved!)).toEqual([
        original,
        expect.objectContaining({ name: "Regression trend copy" }),
      ]);
      expect(f.writes()).toBe(1);
      session.undo();
      expect(JSON.parse(f.saved()!)).toEqual([original]);
      session.redo();
      expect(f.saved()).toBe(saved);
      session.dispose();
      const reopened = f.open();
      expect(reopened.getCommittedDrawings()?.[1]?.name).toBe("Regression trend copy");
      reopened.dispose();
    },
  );

  it.each([false, true])(
    "modifier drag uses display labels in preview and persisted clones (group: %s)",
    (group) => {
      const original: ChartDrawing = {
        id: "unnamed-ray",
        kind: "horizontal-ray",
        anchors: [{ time: 100 as Time, price: 4900 }],
        color: "#123456",
        width: 1,
      };
      const second: ChartDrawing = {
        ...original,
        id: "named-ray",
        anchors: [{ time: 100 as Time, price: 4800 }],
        name: "A+ setup",
        text: "Retest",
      };
      const originals = group ? [original, second] : [original];
      const f = fixture(`copy-name-drag-${group}`, JSON.stringify(originals));
      const session = f.open();
      session.selectDrawing(original.id);
      if (group) session.selectDrawing(second.id, { additive: true });
      expect(session.beginDrag({ x: 150, y: 100 }, { clone: true })).toBe(true);
      session.dragTo({ x: 200, y: 125 });
      const expectedNames = group
        ? ["Horizontal Ray copy", "A+ setup copy"]
        : ["Horizontal Ray copy"];
      expect(
        f.change.mock.lastCall![0].objects.slice(originals.length).map((d: ChartDrawing) => d.name),
      ).toEqual(expectedNames);
      expect(f.writes()).toBe(0);
      session.endDrag();
      expect(JSON.parse(f.saved()!).slice(0, originals.length)).toEqual(originals);
      expect(
        JSON.parse(f.saved()!)
          .slice(originals.length)
          .map((d: ChartDrawing) => d.name),
      ).toEqual(expectedNames);
      expect(f.writes()).toBe(1);
      session.undo();
      expect(JSON.parse(f.saved()!)).toEqual(originals);
      session.dispose();
    },
  );
});

describe("explicit hidden object-tree selection", () => {
  const make = (reason: "hidden" | "interval" | "global") => {
    const objects: ChartDrawing[] = ["a", "b", "c"].map((id, index) => ({
      id,
      kind: "trend",
      color: "#2962ff",
      width: 2,
      anchors: [
        { time: 100 as Time, price: 4900 - index * 100 },
        { time: 300 as Time, price: 4900 - index * 100 },
      ],
      ...(index < 2 && reason === "hidden" ? { hidden: true } : {}),
      ...(index < 2 && reason === "interval"
        ? { visibility: sanitizeDrawingVisibility({ minutes: { enabled: false } }) }
        : {}),
    }));
    const f = fixture(`tree-invisible-${reason}`, JSON.stringify(objects));
    const session = f.open();
    if (reason === "global") session.toggleHidden();
    const select = () => {
      session.cancel();
      session.selectDrawing("a", { includeHidden: true });
      session.selectDrawing("b", { additive: true, includeHidden: true });
    };
    const state = () => f.change.mock.lastCall![0];
    return { f, session, objects, select, state };
  };

  it.each(["hidden", "interval", "global"] as const)(
    "explicitly selects multiple %s drawings without changing persistence or canvas visibility",
    (reason) => {
      const { f, session, select, state } = make(reason);
      select();
      expect(state().selectedIds).toEqual(["a", "b"]);
      expect(state().selectedObjects.map((d: ChartDrawing) => d.id)).toEqual(["a", "b"]);
      expect(state().selectedObjects.every((d: ChartDrawing) => !session.isVisible(d))).toBe(true);
      expect(f.writes()).toBe(0);
      session.selectDrawing("a", { additive: true, includeHidden: true });
      expect(state().selectedIds).toEqual(["b"]);
      session.dispose();
    },
  );

  it.each(["duplicate", "delete", "reorder"] as const)(
    "persists and undoes %s of hidden selected rows atomically",
    (operation) => {
      const { f, session, objects, select, state } = make("hidden");
      select();
      if (operation === "duplicate") {
        session.duplicateSelected();
        expect(state().objects).toHaveLength(5);
        expect(
          state()
            .objects.slice(3)
            .map((d: ChartDrawing) => d.hidden),
        ).toEqual([true, true]);
        expect(state().selectedIds).toHaveLength(2);
        expect(state().selectedIds.every((id: string) => !objects.some((d) => d.id === id))).toBe(
          true,
        );
      } else if (operation === "delete") {
        session.deleteSelected();
        expect(state().objects).toEqual([objects[2]]);
      } else {
        expect(session.reorderSelected("front")).toBe(true);
        expect(state().objects.map((d: ChartDrawing) => d.id)).toEqual(["c", "a", "b"]);
      }
      expect(f.writes()).toBe(1);
      const saved = f.saved();
      session.undo();
      expect(state().objects).toEqual(objects);
      session.redo();
      expect(f.saved()).toBe(saved);
      session.dispose();
      const reopened = f.open();
      const normalized = (objects: readonly ChartDrawing[]) =>
        objects.map((drawing) => ({ ...drawing, locked: !!drawing.locked }));
      expect(normalized(reopened.getCommittedDrawings()!)).toEqual(normalized(JSON.parse(saved!)));
      reopened.dispose();
    },
  );

  it.each(["hidden", "interval"] as const)(
    "%s tree selections are not moved by chart dragging or keyboard nudges",
    (reason) => {
      const { f, session, objects, select, state } = make(reason);
      select();
      expect(session.nudgeSelected({ bars: 0, ticks: 1 })).toBe(false);
      expect(session.beginDrag({ x: 150, y: 100 })).toBe(false);
      expect(f.writes()).toBe(0);
      select();
      session.selectDrawing("c", { additive: true, includeHidden: true });
      expect(session.beginDrag({ x: 150, y: 300 })).toBe(true);
      session.dragTo({ x: 170, y: 320 });
      session.endDrag();
      expect(state().objects.slice(0, 2)).toEqual(objects.slice(0, 2));
      expect(state().objects[2].anchors).not.toEqual(objects[2]!.anchors);
      session.undo();
      select();
      session.selectDrawing("c", { additive: true, includeHidden: true });
      expect(session.nudgeSelected({ bars: 0, ticks: 1 })).toBe(true);
      expect(state().objects.slice(0, 2)).toEqual(objects.slice(0, 2));
      expect(state().objects[2].anchors).not.toEqual(objects[2]!.anchors);
      session.dispose();
    },
  );

  it.each(["hidden", "interval", "global"] as const)(
    "tree permission does not make %s drawings hit-testable or marquee-selectable",
    (reason) => {
      const { f, session, select, state } = make(reason);
      select();
      expect(session.blocksChartPan({ x: 150, y: 100 })).toBe(false);
      expect(session.blocksChartPan({ x: 150, y: 200 })).toBe(false);
      session.cancel();
      if (reason === "global") {
        expect(session.beginMarquee({ x: 50, y: 50 })).toBe(false);
        expect(session.nudgeSelected({ bars: 0, ticks: 1 })).toBe(false);
      } else {
        expect(session.beginMarquee({ x: 50, y: 50 })).toBe(true);
        session.dragTo({ x: 350, y: 250 });
        session.endMarquee();
        expect(state().selectedIds).toEqual([]);
      }
      expect(f.writes()).toBe(0);
      session.dispose();
    },
  );
});
