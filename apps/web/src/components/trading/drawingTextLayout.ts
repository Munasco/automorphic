import type { ChartDrawing, DrawingGeometry } from "./drawingGeometry";

export const DEFAULT_DRAWING_TEXT_WRAP_WIDTH = 240;
export const DEFAULT_DRAWING_TEXT_BACKGROUND_COLOR = "#2962ff";
export const DEFAULT_DRAWING_TEXT_BACKGROUND_OPACITY = 0.2;
export const DEFAULT_DRAWING_TEXT_BORDER_COLOR = "#787b86";
export const DEFAULT_DRAWING_TEXT_BORDER_OPACITY = 1;
export interface DrawingTextLayout {
  rows: string[];
  rowWidths: number[];
  rowHeight: number;
  width: number;
  height: number;
  left: number;
  top: number;
  font: string;
  padding: number;
}
export interface DrawingTextMetrics {
  fontFamily: string;
  measure: (text: string, font: string) => number;
}
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function wrapParagraph(value: string, width: number, measure: (text: string) => number): string[] {
  if (!value) return [""];
  const rows: string[] = [];
  let row = "";
  for (const token of value.match(/\s+|\S+/gu) ?? []) {
    if (measure(row + token) <= width) {
      row += token;
      continue;
    }
    if (row) {
      rows.push(row);
      row = "";
      if (/^\s+$/u.test(token)) continue;
    }
    if (measure(token) <= width) {
      row = token;
      continue;
    }
    for (const { segment } of graphemes.segment(token)) {
      if (row && measure(row + segment) > width) {
        rows.push(row);
        row = "";
      }
      row += segment;
    }
  }
  if (row || !rows.length) rows.push(row);
  return rows;
}

/** Canvas, inline editing and hit geometry share the same displayed rows and box. */
export function measureDrawingText(
  drawing: ChartDrawing,
  text: NonNullable<DrawingGeometry["text"]>,
  fontFamily: string,
  measure: (text: string, font: string) => number,
): DrawingTextLayout {
  const size = text.fontSize ?? drawing.textFontSize ?? 14;
  const font = `${drawing.textItalic ? "italic " : ""}${drawing.textBold ? "bold " : ""}${size}px ${fontFamily}`;
  const padding = drawing.kind === "text" ? 4 : 0;
  const wrapped = drawing.kind === "text" && drawing.textWrap === true;
  const wrapWidth = Math.max(
    40,
    Math.min(4000, drawing.textWrapWidth ?? DEFAULT_DRAWING_TEXT_WRAP_WIDTH),
  );
  const widthOf = (row: string) => {
    const measured = measure(row, font);
    return Number.isFinite(measured) && measured >= 0
      ? measured
      : Array.from(row).length * size * 0.65;
  };
  const rows = text.value
    .split(/\r?\n/)
    .flatMap((row) => (wrapped ? wrapParagraph(row, wrapWidth - padding * 2, widthOf) : [row]));
  const rowWidths = rows.map(widthOf);
  const rowHeight = size * 1.2;
  const width = wrapped ? wrapWidth : Math.max(0, ...rowWidths) + padding * 2;
  const contentHeight = rows.length * rowHeight;
  const contentWidth = width - padding * 2;
  const height = contentHeight + padding * 2;
  return {
    rows,
    rowWidths,
    rowHeight,
    width,
    height,
    left:
      (wrapped
        ? 0
        : text.align === "right"
          ? -contentWidth
          : text.align === "center"
            ? -contentWidth / 2
            : 0) - padding,
    top:
      (text.baseline === "top"
        ? 0
        : text.baseline === "middle"
          ? -contentHeight / 2
          : -contentHeight) - padding,
    font,
    padding,
  };
}
