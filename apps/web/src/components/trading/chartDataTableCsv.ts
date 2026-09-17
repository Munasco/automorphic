import type { ChartDataTableRow } from "./chartDataTable";
function cell(value: string | number | undefined): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = value ?? "";
  const safe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
/** Export every supplied row in table order, including distinct bars at the same exchange time. */
export function chartDataTableCsv(
  rows: readonly ChartDataTableRow[],
  symbol: string,
  interval: string,
): string {
  const lines = [
    [
      "Symbol",
      "Interval",
      "Time (UTC)",
      "Unix time",
      "Chart bar key",
      "Open",
      "High",
      "Low",
      "Close",
      "Volume",
    ]
      .map(cell)
      .join(","),
  ];
  for (const row of rows) {
    const date = new Date(row.time * 1000);
    lines.push(
      [
        symbol,
        interval,
        Number.isFinite(date.getTime()) ? date.toISOString() : "",
        row.time,
        row.chartTime,
        row.open,
        row.high,
        row.low,
        row.close,
        row.volume,
      ]
        .map(cell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
