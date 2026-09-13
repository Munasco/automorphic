import { parseChartDrawings, type ChartDrawing } from "./drawingGeometry";

const CLIPBOARD_TYPE = "automorphic.chart-drawing";
const GROUP_CLIPBOARD_TYPE = "automorphic.chart-drawings";
const MAX_CLIPBOARD_LENGTH = 256 * 1024;
const MAX_CLIPBOARD_DRAWINGS = 100;

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

/** Reject malformed groups as a whole rather than silently pasting a partial selection. */
export function parseDrawingsClipboard(text: string): ChartDrawing[] | null {
  if (typeof text !== "string" || text.length > MAX_CLIPBOARD_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const envelope = value as Record<string, unknown>;
    if (envelope.type === CLIPBOARD_TYPE) {
      const single = parseDrawingClipboard(text);
      return single ? [single] : null;
    }
    if (envelope.type !== GROUP_CLIPBOARD_TYPE || envelope.version !== 1) return null;
    const originals = envelope.drawings;
    if (!Array.isArray(originals) || !originals.length || originals.length > MAX_CLIPBOARD_DRAWINGS)
      return null;
    const drawings = parseChartDrawings(JSON.stringify(originals));
    if (
      drawings.length !== originals.length ||
      new Set(drawings.map(({ id }) => id)).size !== drawings.length
    )
      return null;
    return drawings;
  } catch {
    return null;
  }
}

/** Keep single-object copies compatible with older clients; groups retain back-to-front order. */
export function serializeDrawingsClipboard(drawings: readonly ChartDrawing[]): string | null {
  if (!drawings.length || drawings.length > MAX_CLIPBOARD_DRAWINGS) return null;
  if (drawings.length === 1) return serializeDrawingClipboard(drawings[0]!);
  try {
    const normalized = parseDrawingsClipboard(
      JSON.stringify({
        type: GROUP_CLIPBOARD_TYPE,
        version: 1,
        drawings,
      }),
    );
    if (!normalized) return null;
    const text = JSON.stringify({ type: GROUP_CLIPBOARD_TYPE, version: 1, drawings: normalized });
    return text.length <= MAX_CLIPBOARD_LENGTH ? text : null;
  } catch {
    return null;
  }
}
