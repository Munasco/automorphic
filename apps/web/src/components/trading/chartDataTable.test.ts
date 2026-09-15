import { describe, expect, it, vi } from "vite-plus/test";
import {
  CHART_DATA_TABLE_COLUMNS,
  CHART_DATA_TABLE_SORT_KEY,
  DEFAULT_CHART_DATA_TABLE_SORT,
  createChartDataTableRows,
  readChartDataTableSort,
  sortChartDataTableRows,
  writeChartDataTableSort,
  type ChartDataTableSort,
} from "./chartDataTable";

const bar = (time: number, value: number) => ({
  time,
  open: value,
  high: value,
  low: value,
  close: value,
  volume: value,
});

describe("OHLCV data table", () => {
  it("preserves exact raw prices and volume and keeps exchange timestamps separate from unique chart keys", () => {
    const bars = [
      { ...bar(1000.000001, 123.456789012345), actualTime: 1000 },
      { ...bar(1000.000002, 123.456789012346), actualTime: 1000 },
      { ...bar(2000, -0), volume: 0 },
    ];
    const before = structuredClone(bars);
    const rows = createChartDataTableRows(bars);
    expect(rows.map((row) => row.time)).toEqual([1000, 1000, 2000]);
    expect(rows.map((row) => row.chartTime)).toEqual([1000.000001, 1000.000002, 2000]);
    expect(rows.map((row) => row.close)).toEqual(bars.map((item) => item.close));
    expect(rows[2]!.volume).toBe(0);
    expect(Object.is(rows[2]!.open, -0)).toBe(true);
    expect(bars).toEqual(before);
    expect(rows[0]).not.toBe(bars[0]);
  });

  it.each(CHART_DATA_TABLE_COLUMNS)(
    "sorts %s numerically in either direction with stable ties",
    (field) => {
      const rows = createChartDataTableRows([bar(1, 30), bar(2, 2), bar(3, 2), bar(4, -5)]).map(
        (row, index) => ({ ...row, [field]: [30, 2, 2, -5][index]! }),
      );
      expect(
        sortChartDataTableRows(rows, { field, direction: "asc" }).map((row) => row.chartTime),
      ).toEqual([4, 2, 3, 1]);
      expect(
        sortChartDataTableRows(rows, { field, direction: "desc" }).map((row) => row.chartTime),
      ).toEqual([1, 2, 3, 4]);
      expect(rows.map((row) => row.chartTime)).toEqual([1, 2, 3, 4]);
    },
  );

  it("sorts duplicate exchange timestamps stably instead of exposing synthetic tick offsets", () => {
    const rows = createChartDataTableRows([
      { ...bar(20, 1), actualTime: 100 },
      { ...bar(30, 2), actualTime: 50 },
      { ...bar(10, 3), actualTime: 100 },
    ]);
    expect(sortChartDataTableRows(rows).map((row) => row.chartTime)).toEqual([20, 10, 30]);
    expect(createChartDataTableRows([{ ...bar(5, 1), actualTime: NaN }])[0]!.time).toBe(5);
  });

  it("keeps missing and nonfinite volume last without treating missing as zero", () => {
    const { volume: _volume, ...missing } = bar(1, 1);
    const rows = createChartDataTableRows([
      missing,
      bar(2, 0),
      bar(3, 100),
      { ...bar(4, 1), volume: NaN },
      { ...bar(5, 1), volume: Infinity },
    ]);
    expect(rows[0]).not.toHaveProperty("volume");
    expect(
      sortChartDataTableRows(rows, { field: "volume", direction: "asc" }).map(
        (row) => row.chartTime,
      ),
    ).toEqual([2, 3, 1, 4, 5]);
    expect(
      sortChartDataTableRows(rows, { field: "volume", direction: "desc" }).map(
        (row) => row.chartTime,
      ),
    ).toEqual([3, 2, 1, 4, 5]);
  });

  it("orders extreme finite numbers and recomputed bar corrections without rounding or mutating earlier rows", () => {
    const bars = [bar(1, Number.MAX_VALUE), bar(2, -Number.MAX_VALUE), bar(3, 1)];
    const previous = createChartDataTableRows(bars);
    expect(
      sortChartDataTableRows(previous, { field: "close", direction: "asc" }).map(
        (row) => row.chartTime,
      ),
    ).toEqual([2, 3, 1]);
    const corrected = createChartDataTableRows(
      bars.map((item) => (item.time === 3 ? { ...item, close: -2 } : item)),
    );
    expect(corrected[2]!.close).toBe(-2);
    expect(previous[2]!.close).toBe(1);
    expect(sortChartDataTableRows([])).toEqual([]);
  });
});

function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}
describe("saved chart table ordering", () => {
  it.each(CHART_DATA_TABLE_COLUMNS)(
    "round-trips both %s directions and skips unchanged writes",
    (field) => {
      const saved = storage();
      for (const direction of ["asc", "desc"] as const) {
        const sort = { field, direction };
        writeChartDataTableSort(saved, sort);
        expect(readChartDataTableSort(saved)).toEqual(sort);
        const writes = saved.setItem.mock.calls.length;
        writeChartDataTableSort(saved, { ...sort });
        expect(saved.setItem).toHaveBeenCalledTimes(writes);
      }
      expect(
        saved.setItem.mock.calls.every(
          ([key, value]) =>
            key === CHART_DATA_TABLE_SORT_KEY && typeof JSON.parse(value) === "object",
        ),
      ).toBe(true);
    },
  );
  it.each([
    null,
    "time",
    "{",
    "[]",
    "null",
    "{}",
    '{"field":"time"}',
    '{"field":"bad","direction":"asc"}',
    '{"field":"close","direction":"ASC"}',
  ])("defaults invalid saved value %s without writing", (raw) => {
    const saved = storage(raw);
    expect(readChartDataTableSort(saved)).toEqual(DEFAULT_CHART_DATA_TABLE_SORT);
    writeChartDataTableSort(saved, {
      field: "bad",
      direction: "asc",
    } as unknown as ChartDataTableSort);
    writeChartDataTableSort(saved, DEFAULT_CHART_DATA_TABLE_SORT);
    expect(saved.setItem).not.toHaveBeenCalled();
  });
  it("isolates storage instances and tolerates unavailable reads", () => {
    const first = storage(),
      second = storage();
    writeChartDataTableSort(first, { field: "volume", direction: "asc" });
    expect(readChartDataTableSort(second)).toEqual(DEFAULT_CHART_DATA_TABLE_SORT);
    expect(readChartDataTableSort(first)).toEqual({ field: "volume", direction: "asc" });
    expect(
      readChartDataTableSort({
        getItem: () => {
          throw Error("Unavailable");
        },
      }),
    ).toEqual(DEFAULT_CHART_DATA_TABLE_SORT);
  });
});
