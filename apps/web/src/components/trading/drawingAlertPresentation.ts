import { isRectangleRegionCondition, type DrawingAlertEvent } from "./drawingAlerts";

/** Time targets must never pass through the price formatter (including synthetic tick keys). */
export function drawingAlertTargetLabel(event: DrawingAlertEvent): string {
  if (event.targetKind === "price" && event.fibLevel !== undefined)
    return `Fib ${event.fibLevel} · ${event.target.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
  if (event.targetKind === "price" && event.channelRange)
    return `${isRectangleRegionCondition(event.condition) ? "Rectangle" : "Channel"} ${event.channelRange.lower.toLocaleString("en-US", { maximumFractionDigits: 6 })} – ${event.channelRange.upper.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
  if (event.targetKind === "price")
    return `${event.condition === "above-rectangle" ? "Upper rectangle" : event.condition === "below-rectangle" ? "Lower rectangle" : event.channelBoundary === "upper" ? "Upper channel" : event.channelBoundary === "lower" ? "Lower channel" : "Line"} ${event.target.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
  if (event.intervalKey.startsWith("tick:")) return "Vertical line";
  const time = event.targetTime;
  if (typeof time === "number") {
    const date = new Date(time * 1000);
    if (!Number.isFinite(date.getTime())) return "Vertical line";
    return `Vertical line · ${new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date)}`;
  }
  const date =
    typeof time === "string"
      ? time
      : `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
  return `Vertical line · ${date}`;
}
