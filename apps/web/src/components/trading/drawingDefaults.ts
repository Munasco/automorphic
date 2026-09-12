import { DRAWING_ANCHORS, type ChartDrawing, type DrawingKind } from "./drawingGeometry";
import {
  defaultDrawingTemplateSettings,
  normalizeDrawingTemplates,
  type DrawingTemplateSettings,
} from "./drawingTemplates";

export const DRAWING_DEFAULTS_KEY = "automorphic:drawing-defaults:v1";
export type DrawingDefaults = Partial<Record<DrawingKind, Omit<DrawingTemplateSettings, "text">>>;
type Storage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/** Reuse template validation but never carry the previous object's user-authored text. */
export function drawingDefaultAppearance(
  kind: DrawingKind,
  value: unknown,
): DrawingDefaults[DrawingKind] | null {
  const template = normalizeDrawingTemplates([{ name: "appearance", kind, settings: value }])[0];
  if (!template) return null;
  const settings = { ...template.settings };
  delete settings.text;
  return settings;
}

export function normalizeDrawingDefaults(value: unknown): DrawingDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: DrawingDefaults = {};
  for (const [key, appearance] of Object.entries(value)) {
    if (!Object.hasOwn(DRAWING_ANCHORS, key)) continue;
    const kind = key as DrawingKind;
    const settings = drawingDefaultAppearance(kind, appearance);
    if (settings) result[kind] = settings;
  }
  return result;
}

/** Read the session's active workspace on each operation; no cross-workspace module cache. */
export function createDrawingDefaults(storage?: Storage) {
  let cachedJson: string | null | undefined;
  let cachedDefaults: DrawingDefaults = {};
  const read = (): DrawingDefaults => {
    let json: string | null;
    try {
      json = storage?.getItem(DRAWING_DEFAULTS_KEY) ?? null;
    } catch {
      cachedJson = undefined;
      cachedDefaults = {};
      return cachedDefaults;
    }
    if (json === cachedJson) return cachedDefaults;
    cachedJson = json;
    cachedDefaults = {};
    try {
      if (json && json.length <= 250_000)
        cachedDefaults = normalizeDrawingDefaults(JSON.parse(json));
    } catch {
      /* Cache invalid records too, until the workspace value changes. */
    }
    return cachedDefaults;
  };
  return {
    get(kind: DrawingKind) {
      return read()[kind] ?? defaultDrawingTemplateSettings(kind);
    },
    remember(drawing: ChartDrawing) {
      const appearance = drawingDefaultAppearance(drawing.kind, drawing);
      if (!appearance) return false;
      const defaults = read();
      if (JSON.stringify(defaults[drawing.kind]) === JSON.stringify(appearance)) return false;
      const json = JSON.stringify({ ...defaults, [drawing.kind]: appearance });
      if (json.length > 250_000) return false;
      try {
        storage?.setItem(DRAWING_DEFAULTS_KEY, json);
        return storage !== undefined;
      } catch {
        return false;
      }
    },
  };
}

export function drawingAppearanceChanged(previous: ChartDrawing, next: ChartDrawing): boolean {
  return (
    JSON.stringify(
      drawingDefaultAppearance(previous.kind, {
        ...defaultDrawingTemplateSettings(previous.kind),
        ...previous,
      }),
    ) !==
    JSON.stringify(
      drawingDefaultAppearance(next.kind, {
        ...defaultDrawingTemplateSettings(next.kind),
        ...next,
      }),
    )
  );
}
