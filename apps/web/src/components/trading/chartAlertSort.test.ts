import { describe, expect, it, vi } from "vite-plus/test";
import {
  CHART_ALERT_SORT_KEY,
  CHART_ALERT_SORT_OPTIONS,
  compareChartAlerts,
  readChartAlertSort,
  writeChartAlertSort,
  type ChartAlertSort,
} from "./chartAlertSort";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}

describe("saved alert sorting", () => {
  it.each(CHART_ALERT_SORT_OPTIONS)("round-trips %s", (sort) => {
    const storage = memoryStorage('{"sort":"oldest"}');
    writeChartAlertSort(storage, sort);
    expect(readChartAlertSort(storage)).toBe(sort);
    if (sort !== "oldest")
      expect(storage.setItem).toHaveBeenCalledWith(CHART_ALERT_SORT_KEY, JSON.stringify({ sort }));
    storage.setItem.mockClear();
    writeChartAlertSort(storage, sort);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    null,
    "newest",
    '"name"',
    "null",
    "[]",
    "{}",
    '{"sort":null}',
    '{"sort":"other"}',
    '{"sort":1}',
    "{",
  ])("defaults malformed or legacy value %s", (value) => {
    const storage = memoryStorage(value);
    expect(readChartAlertSort(storage)).toBe("newest");
    writeChartAlertSort(storage, "newest");
    writeChartAlertSort(storage, "invalid" as ChartAlertSort);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("uses the default when reading storage fails", () => {
    expect(
      readChartAlertSort({
        getItem: () => {
          throw new Error("Unavailable");
        },
      }),
    ).toBe("newest");
  });
});

describe("alert and trigger snapshot ordering", () => {
  const rows = [
    { symbol: "NQ", name: "Setup 10", message: "Target 10", time: 10 },
    { symbol: "SI", name: "Setup 2", message: "Target 2", time: 30 },
    { symbol: "GC", time: 20 },
  ];
  const ordered = (sort: ChartAlertSort) =>
    [...rows].sort((a, b) => compareChartAlerts(a, b, sort)).map((row) => row.symbol);

  it("orders creation or trigger times in both directions", () => {
    expect(ordered("newest")).toEqual(["SI", "GC", "NQ"]);
    expect(ordered("oldest")).toEqual(["NQ", "GC", "SI"]);
    expect(rows.map((row) => row.time)).toEqual([10, 30, 20]);
  });

  it("sorts symbols, fallback names and numeric names/messages naturally", () => {
    expect(ordered("symbol")).toEqual(["GC", "NQ", "SI"]);
    expect(ordered("name")).toEqual(["GC", "SI", "NQ"]);
    expect(ordered("message")).toEqual(["GC", "SI", "NQ"]);
    expect(
      compareChartAlerts({ symbol: "NQ", name: "  ", time: 1 }, { symbol: "SI", time: 2 }, "name"),
    ).toBeLessThan(0);
  });

  it("breaks case-insensitive text ties by newest time while preserving exact ties", () => {
    for (const sort of ["symbol", "name", "message"] as const) {
      const first = { symbol: "nq", name: "Setup 2", message: "  target 2 ", time: 10 };
      const second = { symbol: "NQ", name: "setup 2", message: "TARGET 2", time: 20 };
      expect(compareChartAlerts(first, second, sort)).toBeGreaterThan(0);
      expect(compareChartAlerts({ ...first, time: 20 }, second, sort)).toBe(0);
    }
  });

  it("uses historical name and message snapshots rather than current alert metadata", () => {
    const history = [
      { symbol: "NQ", name: "Z breakout", message: "Crossed 2", time: 50 },
      { symbol: "NQ", name: "A reversal", message: "Crossed 10", time: 10 },
    ];
    expect([...history].sort((a, b) => compareChartAlerts(a, b, "name"))).toEqual([
      history[1],
      history[0],
    ]);
    expect([...history].sort((a, b) => compareChartAlerts(a, b, "message"))).toEqual(history);
  });
});
