import { describe, expect, it, vi } from "vite-plus/test";
import { createChartDataTableRows, sortChartDataTableRows } from "./chartDataTable";
import { chartDataTableCsv } from "./chartDataTableCsv";
import {
  CHART_DATA_TABLE_SCOPE_KEY,
  filterChartDataTableRows,
  readChartDataTableScope,
  writeChartDataTableScope,
  type ChartDataTableScope,
} from "./chartDataTableScope";

const rows = createChartDataTableRows(
  [10, 20, 30, 40].map((time, index) => ({
    time,
    actualTime: 100,
    open: index,
    high: index + 1,
    low: index - 1,
    close: index,
    volume: index,
  })),
);
const indexAt = (time: number) => [10, 20, 30, 40].indexOf(time);

describe("table chart range", () => {
  it("selects individual tick bars by chart position even when exchange times collide", () => {
    const selected = filterChartDataTableRows(rows, "visible", { from: 1, to: 2 }, indexAt);
    expect(selected.map((row) => row.chartTime)).toEqual([20, 30]);
    expect(selected.map((row) => row.time)).toEqual([100, 100]);
    expect(selected[0]).toBe(rows[1]);
    expect(rows).toHaveLength(4);
  });
  it("tracks fractional viewport bounds, scrolling, whitespace and the full range", () => {
    expect(
      filterChartDataTableRows(rows, "visible", { from: 0.5, to: 2.5 }, indexAt).map(
        (row) => row.chartTime,
      ),
    ).toEqual([10, 20, 30, 40]);
    expect(
      filterChartDataTableRows(rows, "visible", { from: 2, to: 3 }, indexAt).map(
        (row) => row.chartTime,
      ),
    ).toEqual([30, 40]);
    expect(filterChartDataTableRows(rows, "visible", { from: 5, to: 8 }, indexAt)).toEqual([]);
    expect(filterChartDataTableRows(rows, "visible", { from: -10, to: 10 }, indexAt)).toEqual(rows);
  });
  it.each([null, { from: NaN, to: 3 }, { from: 1, to: Infinity }, { from: 3, to: 1 }])(
    "does not export all bars for unavailable range %j",
    (range) => {
      expect(filterChartDataTableRows(rows, "visible", range, indexAt)).toEqual([]);
    },
  );
  it("excludes missing/nonfinite chart indices", () => {
    expect(
      filterChartDataTableRows(rows, "visible", { from: -5, to: 5 }, (time) =>
        time === 10 ? null : time === 20 ? NaN : time === 30 ? Infinity : 3,
      ),
    ).toEqual([rows[3]]);
  });
  it("all loaded bars bypasses range lookup and replay never invents unrevealed rows", () => {
    const lookup = vi.fn(indexAt);
    expect(filterChartDataTableRows(rows, "all", null, lookup)).toBe(rows);
    expect(lookup).not.toHaveBeenCalled();
    expect(
      filterChartDataTableRows(rows.slice(0, 2), "visible", { from: 0, to: 3 }, indexAt),
    ).toEqual(rows.slice(0, 2));
  });
  it("exports precisely the filtered rows in the selected table order", () => {
    const selected = sortChartDataTableRows(
      filterChartDataTableRows(rows, "visible", { from: 1, to: 2 }, indexAt),
      { field: "close", direction: "desc" },
    );
    const csv = chartDataTableCsv(selected, "NQ", "5m");
    expect(selected.map((row) => row.close)).toEqual([2, 1]);
    expect(csv.trim().split(/\r?\n/)).toHaveLength(3);
  });
});

function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}
describe("persisted table scope", () => {
  it("round-trips scopes, skips unchanged writes and isolates workspaces", () => {
    const saved = storage(),
      other = storage();
    writeChartDataTableScope(saved, "visible");
    expect(saved.setItem).toHaveBeenCalledWith(CHART_DATA_TABLE_SCOPE_KEY, '{"scope":"visible"}');
    expect(readChartDataTableScope(saved)).toBe("visible");
    expect(readChartDataTableScope(other)).toBe("all");
    writeChartDataTableScope(saved, "visible");
    expect(saved.setItem).toHaveBeenCalledTimes(1);
    writeChartDataTableScope(saved, "all");
    expect(readChartDataTableScope(saved)).toBe("all");
  });
  it.each([null, "{", "null", '"visible"', "[]", "{}", '{"scope":true}', '{"scope":"other"}'])(
    "defaults invalid persisted scope %s",
    (raw) => {
      const saved = storage(raw);
      expect(readChartDataTableScope(saved)).toBe("all");
      writeChartDataTableScope(saved, "bad" as ChartDataTableScope);
      expect(saved.setItem).not.toHaveBeenCalled();
    },
  );
  it("tolerates unavailable reads and propagates write failures to the UI", () => {
    expect(
      readChartDataTableScope({
        getItem: () => {
          throw Error("offline");
        },
      }),
    ).toBe("all");
    expect(() =>
      writeChartDataTableScope(
        {
          getItem: () => null,
          setItem: () => {
            throw Error("offline");
          },
        },
        "visible",
      ),
    ).toThrow("offline");
  });
});
