import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const workspace = vi.hoisted(() => ({
  active: "first",
  hydrating: false,
  values: new Map<string, string>(),
  writes: [] as Array<{ project: string; key: string; value: string }>,
  hydrators: [] as Array<() => void | Promise<void>>,
}));
vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    getItem: (key: string) => workspace.values.get(`${workspace.active}:${key}`) ?? null,
    setItem: (key: string, value: string) => {
      // The real workspace router suppresses writes during its registered hydration phase.
      if (workspace.hydrating) return;
      workspace.values.set(`${workspace.active}:${key}`, value);
      workspace.writes.push({ project: workspace.active, key, value });
    },
    removeItem: vi.fn(),
    registerHydrator: (hydrate: () => void | Promise<void>) => workspace.hydrators.push(hydrate),
  },
}));
import {
  DRAWING_CUSTOM_COLORS_KEY,
  MAX_DRAWING_CUSTOM_COLORS,
  normalizeDrawingCustomColors,
  useDrawingCustomColors,
} from "./drawingCustomColors";

async function hydrate(project: string) {
  workspace.active = project;
  workspace.hydrating = true;
  try {
    await Promise.all(workspace.hydrators.map((callback) => callback()));
  } finally {
    workspace.hydrating = false;
  }
}

beforeEach(() => {
  workspace.hydrating = true;
  useDrawingCustomColors.setState(useDrawingCustomColors.getInitialState(), true);
  workspace.hydrating = false;
  workspace.active = "first";
  workspace.values.clear();
  workspace.writes.length = 0;
});

describe("custom drawing colors", () => {
  it("normalizes and deduplicates six-digit hex while rejecting other stored data", () => {
    for (const value of [null, undefined, {}, "#abcdef", 12])
      expect(normalizeDrawingCustomColors(value)).toEqual([]);
    expect(
      normalizeDrawingCustomColors([
        " #ABCDEF ",
        "abcdef",
        "#123456",
        "#fff",
        "red",
        "rgb(1,2,3)",
        "#12345678",
        "#zzzzzz",
        null,
        123,
        { color: "#000000" },
      ]),
    ).toEqual(["#abcdef", "#123456"]);
    const oversized = Array.from(
      { length: 60 },
      (_, index) => `#${index.toString(16).padStart(6, "0")}`,
    );
    expect(normalizeDrawingCustomColors(oversized)).toEqual(
      oversized.slice(0, MAX_DRAWING_CUSTOM_COLORS),
    );
  });

  it("shares additions with all subscribers and persists only palette data", () => {
    const first = vi.fn(),
      second = vi.fn();
    const unsubscribeFirst = useDrawingCustomColors.subscribe(first),
      unsubscribeSecond = useDrawingCustomColors.subscribe(second);
    try {
      expect(useDrawingCustomColors.getState().addColor("ABCDEF")).toBe(true);
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      expect(workspace.writes).toHaveLength(1);
      expect(workspace.writes[0]).toEqual({
        project: "first",
        key: DRAWING_CUSTOM_COLORS_KEY,
        value: JSON.stringify({ state: { colors: ["#abcdef"] }, version: 0 }),
      });
      // A remounted picker reads the same shared snapshot without copying local state.
      expect(useDrawingCustomColors.getState().colors).toEqual(["#abcdef"]);
      expect(useDrawingCustomColors.getState().addColor("#aBcDeF")).toBe(true);
      expect(useDrawingCustomColors.getState().addColor("not a color")).toBe(false);
      expect(workspace.writes).toHaveLength(1);
      expect(first).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribeFirst();
      unsubscribeSecond();
    }
  });

  it("evicts only the oldest color when the bounded palette receives a new distinct color", () => {
    const colors = Array.from(
      { length: MAX_DRAWING_CUSTOM_COLORS },
      (_, index) => `#${index.toString(16).padStart(6, "0")}`,
    );
    for (const color of colors) useDrawingCustomColors.getState().addColor(color);
    const writes = workspace.writes.length;
    useDrawingCustomColors.getState().addColor(colors[0]!);
    expect(workspace.writes).toHaveLength(writes);
    expect(useDrawingCustomColors.getState().colors).toEqual(colors);
    useDrawingCustomColors.getState().addColor("#abcdef");
    expect(useDrawingCustomColors.getState().colors).toEqual([...colors.slice(1), "#abcdef"]);
  });

  it("restores app reloads and swaps workspaces without leaking colors or writing reset defaults", async () => {
    useDrawingCustomColors.getState().addColor("#112233");
    useDrawingCustomColors.getState().addColor("#445566");
    await hydrate("first");
    expect(useDrawingCustomColors.getState().colors).toEqual(["#112233", "#445566"]);
    expect(workspace.writes).toHaveLength(2);
    await hydrate("second");
    expect(useDrawingCustomColors.getState().colors).toEqual([]);
    useDrawingCustomColors.getState().addColor("#abcdef");
    await hydrate("first");
    expect(useDrawingCustomColors.getState().colors).toEqual(["#112233", "#445566"]);
    await hydrate("second");
    expect(useDrawingCustomColors.getState().colors).toEqual(["#abcdef"]);
    expect(workspace.writes.map((write) => write.project)).toEqual(["first", "first", "second"]);
  });

  it("sanitizes hydrated records and never restores persisted action properties", async () => {
    workspace.values.set(
      `first:${DRAWING_CUSTOM_COLORS_KEY}`,
      JSON.stringify({
        state: { colors: ["ABCDEF", "#abcdef", "bad", "#123456"], addColor: "not executable" },
        version: 0,
      }),
    );
    await hydrate("first");
    expect(useDrawingCustomColors.getState().colors).toEqual(["#abcdef", "#123456"]);
    expect(typeof useDrawingCustomColors.getState().addColor).toBe("function");
    workspace.values.set(`second:${DRAWING_CUSTOM_COLORS_KEY}`, "invalid JSON");
    await hydrate("second");
    expect(useDrawingCustomColors.getState().colors).toEqual([]);
    expect(workspace.writes).toEqual([]);
  });
});
