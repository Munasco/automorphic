import { expect, it } from "vite-plus/test";
import { chartDataTableCsv } from "./chartDataTableCsv";
import {
  createChartDataTableRows,
  sortChartDataTableRows,
  type ChartDataTableRow,
} from "./chartDataTable";
it("exports all rows in sorted order without changing data or collapsing equal exchange times", () => {
  const rows: ChartDataTableRow[] = Array.from({ length: 120 }, (_, i) => ({
    chartTime: i,
    time: 1789000000.123456,
    open: i,
    high: i + 1,
    low: i - 1,
    close: i,
    volume: 0,
  }));
  const before = structuredClone(rows);
  const sorted = sortChartDataTableRows(rows, { field: "close", direction: "desc" });
  const lines = chartDataTableCsv(sorted, "NQ", "100T").trimEnd().split("\r\n");
  expect(lines).toHaveLength(121);
  expect(lines[1]).toContain(",1789000000.123456,119,119,120,118,119,0");
  expect(lines[120]).toContain(",1789000000.123456,0,0,1,-1,0,0");
  expect(rows).toEqual(before);
});
it("preserves exchange time, distinct chart keys and raw precision", () => {
  const rows = createChartDataTableRows([
    {
      time: 100,
      actualTime: 50.123456,
      open: -1.123456789,
      high: 0,
      low: -2,
      close: -1,
      volume: 0.123456789123,
    },
    { time: 101, actualTime: 50.123456, open: 2, high: 3, low: 1, close: 2 },
  ]);
  const csv = chartDataTableCsv(rows, "NQ", "5m");
  expect(csv).toContain(
    '"1970-01-01T00:00:50.123Z",50.123456,100,-1.123456789,0,-2,-1,0.123456789123',
  );
  expect(csv).toContain('"1970-01-01T00:00:50.123Z",50.123456,101,2,3,1,2,""');
});
it("escapes text and leaves invalid numeric readings empty while preserving zero", () => {
  const csv = chartDataTableCsv(
    [{ chartTime: 1, time: NaN, open: NaN, high: Infinity, low: -Infinity, close: 0 }],
    '=NQ,"test"\nrow',
    "@5m",
  );
  expect(csv).toContain('"\'=NQ,""test""\nrow","\'@5m","",,1,,,,0,""');
  expect(csv).not.toMatch(/NaN|Infinity/);
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(chartDataTableCsv([], "NQ", "5m").split("\r\n")).toHaveLength(2);
});
