import type { ChartAlertEvent } from "./chartAlerts";
import type { DrawingAlertEvent } from "./drawingAlerts";
import { drawingAlertTargetLabel } from "./drawingAlertPresentation";

export type ChartAlertLogEntry =
  | (ChartAlertEvent & { kind: "price" })
  | (DrawingAlertEvent & { kind: "drawing" });

function cell(value: string | number): string {
  if (typeof value === "number") return String(value);
  // Keep user text as text when the CSV is opened in a spreadsheet.
  const safe = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Input order is the visible log order, including the user's search and sort choices. */
export function chartAlertLogCsv(events: readonly ChartAlertLogEntry[]): string {
  const rows: (string | number)[][] = [
    [
      "Triggered at (UTC)",
      "Type",
      "Symbol",
      "Name",
      "Message",
      "Condition",
      "Target",
      "Target price",
      "Trigger price",
      "Interval",
      "Alert ID",
      "Event ID",
    ],
  ];
  for (const event of events) {
    rows.push([
      new Date(event.triggeredAt).toISOString(),
      event.kind === "price" ? "Price" : "Drawing",
      event.symbol,
      event.name ?? "",
      event.message ?? "",
      event.condition,
      event.kind === "drawing" ? drawingAlertTargetLabel(event) : String(event.target),
      event.kind === "price" || event.targetKind === "price" ? event.target : "",
      event.price,
      event.kind === "drawing" ? event.intervalKey : "",
      event.alertId,
      event.id,
    ]);
  }
  return `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
