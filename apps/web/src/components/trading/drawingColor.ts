export interface DrawingColorHsv {
  h: number;
  s: number;
  v: number;
}

export function normalizeDrawingColorHex(value: string): string | null {
  const match = /^#?([a-f\d]{6})$/i.exec(value.trim());
  return match ? `#${match[1]!.toLowerCase()}` : null;
}

export function drawingHexToHsv(value: string): DrawingColorHsv | null {
  const hex = normalizeDrawingColorHex(value);
  if (!hex) return null;
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels as [number, number, number];
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const sector =
    delta === 0
      ? 0
      : max === r
        ? ((g - b) / delta) % 6
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4;
  return { h: (sector * 60 + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

export function drawingHsvToHex({ h, s, v }: DrawingColorHsv): string | null {
  if (![h, s, v].every(Number.isFinite)) return null;
  const hue = ((h % 360) + 360) % 360;
  const value = Math.max(0, Math.min(1, v));
  const chroma = value * Math.max(0, Math.min(1, s));
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = value - chroma;
  const rgb =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return `#${rgb
    .map((channel) =>
      Math.round((channel + offset) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Coordinates are relative to the control; captured drags may extend beyond its bounds. */
export function drawingColorAtPoint(
  current: DrawingColorHsv,
  control: "plane" | "hue",
  point: { x: number; y: number },
  size: { width: number; height: number },
): DrawingColorHsv | null {
  if (
    ![point.x, point.y, size.width, size.height].every(Number.isFinite) ||
    size.width <= 0 ||
    size.height <= 0
  )
    return null;
  const x = Math.max(0, Math.min(1, point.x / size.width));
  const y = Math.max(0, Math.min(1, point.y / size.height));
  if (control === "plane") return { ...current, s: x, v: 1 - y };
  // The hue handle travels within a three-pixel inset at each end of the strip.
  if (size.height <= 6) return null;
  return { ...current, h: Math.max(0, Math.min(1, (point.y - 3) / (size.height - 6))) * 360 };
}
