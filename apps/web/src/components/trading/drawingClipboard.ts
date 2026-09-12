import { parseChartDrawings, type ChartDrawing } from "./drawingGeometry";

const CLIPBOARD_TYPE = "automorphic.chart-drawing";
const MAX_CLIPBOARD_LENGTH = 256 * 1024;

/** The same coordinate/style validation as workspace drawings; no executable clipboard content. */
export function parseDrawingClipboard(text: string): ChartDrawing | null {
  if (typeof text !== "string" || text.length > MAX_CLIPBOARD_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const envelope = value as Record<string, unknown>;
    if (envelope.type !== CLIPBOARD_TYPE || envelope.version !== 1) return null;
    const drawing = envelope.drawing;
    if (!drawing || typeof drawing !== "object" || Array.isArray(drawing)) return null;
    return parseChartDrawings(JSON.stringify([drawing]))[0] ?? null;
  } catch {
    return null;
  }
}

/** Serialization reparses once so nested anchors/levels are independent and unknown fields are omitted. */
export function serializeDrawingClipboard(drawing: ChartDrawing): string | null {
  try {
    const text = JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, drawing });
    const normalized = parseDrawingClipboard(text);
    return normalized
      ? JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, drawing: normalized })
      : null;
  } catch {
    return null;
  }
}
