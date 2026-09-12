import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DRAWING_ANCHORS,
  defaultChannelDrawingSettings,
  defaultDrawingAxisLabelSettings,
  defaultVerticalLineSettings,
  defaultDrawingLevelSettings,
  defaultRegressionDrawingSettings,
  isPitchforkDrawingTool,
  sanitizeDrawingSettings,
  type ChartDrawing,
  type DrawingKind,
  type DrawingSettings,
} from "./drawingGeometry";
import { tradingWorkspaceStorage } from "./workspaceStorage";

export const DRAWING_TEMPLATES_KEY = "automorphic:drawing-templates:v1";
export const MAX_TEMPLATES_PER_KIND = 20;
export type DrawingTemplateSettings = DrawingSettings &
  Pick<ChartDrawing, "color" | "width"> & { lineStyle: "solid" | "dashed" | "dotted" };
export type DrawingTemplate = {
  name: string;
  kind: DrawingKind;
  settings: DrawingTemplateSettings;
};

/** Factory appearance, independent of saved templates and the user's last edited style. */
export function defaultDrawingTemplateSettings(kind: DrawingKind): DrawingTemplateSettings {
  return {
    color: "#2962ff",
    width: 2,
    lineStyle: "solid",
    lineOpacity: 1,
    textOpacity: 1,
    ...defaultDrawingAxisLabelSettings(kind),
    ...defaultVerticalLineSettings(kind),
    ...defaultDrawingLevelSettings(kind),
    ...defaultChannelDrawingSettings(kind),
    ...defaultRegressionDrawingSettings(kind),
    // Factory-only values: sparse saved pitchforks retain their historical fallback palette.
    ...(isPitchforkDrawingTool(kind)
      ? {
          color: "#f23645",
          backgroundOpacity: 0.2,
          levels: (
            [
              [0.25, "#ffb74d"],
              [0.382, "#81c784"],
              [0.5, "#089981"],
              [0.618, "#089981"],
              [0.75, "#00bcd4"],
              [1, "#2962ff"],
              [1.5, "#9c27b0"],
              [1.75, "#e91e63"],
              [2, "#f77c80"],
            ] as const
          ).map(([value, color]) => ({
            value,
            color,
            visible: value === 0.5 || value === 1,
          })),
        }
      : {}),
  };
}

/** Replace appearance completely while preserving the target object's identity and placement. */
export function applyDrawingTemplate(
  drawing: ChartDrawing,
  patch: Partial<ChartDrawing>,
): ChartDrawing {
  const settings = templateSettings(patch);
  if (!settings) return drawing;
  return {
    ...settings,
    id: drawing.id,
    kind: drawing.kind,
    anchors: drawing.anchors,
    ...(drawing.name !== undefined ? { name: drawing.name } : {}),
    ...(drawing.locked !== undefined ? { locked: drawing.locked } : {}),
    ...(drawing.hidden !== undefined ? { hidden: drawing.hidden } : {}),
  };
}

function templateSettings(value: unknown): DrawingTemplateSettings | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (
    typeof source.color !== "string" ||
    !/^#[a-f\d]{6}$/i.test(source.color) ||
    typeof source.width !== "number" ||
    ![1, 2, 3, 4].includes(source.width)
  )
    return null;
  return {
    ...sanitizeDrawingSettings(source),
    color: source.color,
    width: source.width,
    lineStyle:
      source.lineStyle === "dashed" || source.lineStyle === "dotted" ? source.lineStyle : "solid",
  };
}

export function normalizeDrawingTemplates(value: unknown): DrawingTemplate[] {
  if (!Array.isArray(value)) return [];
  const templates: DrawingTemplate[] = [];
  const counts = new Map<DrawingKind, number>();
  const names = new Set<string>();
  for (const item of value.slice(0, Object.keys(DRAWING_ANCHORS).length * MAX_TEMPLATES_PER_KIND)) {
    if (
      !item ||
      typeof item !== "object" ||
      !Object.hasOwn(DRAWING_ANCHORS, item.kind) ||
      typeof item.name !== "string"
    )
      continue;
    const kind = item.kind as DrawingKind;
    const name = item.name.trim().slice(0, 80);
    const settings = templateSettings(item.settings);
    const identity = JSON.stringify([kind, name]);
    if (
      !name ||
      !settings ||
      names.has(identity) ||
      (counts.get(kind) ?? 0) >= MAX_TEMPLATES_PER_KIND
    )
      continue;
    templates.push({ kind, name, settings });
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    names.add(identity);
  }
  return templates;
}

export function saveDrawingTemplate(
  templates: readonly DrawingTemplate[],
  drawing: ChartDrawing,
  rawName: string,
): DrawingTemplate[] | null {
  const name = rawName.trim().slice(0, 80);
  const settings = templateSettings(drawing);
  if (!name || !settings) return null;
  const current = normalizeDrawingTemplates(templates);
  const existing = current.findIndex((item) => item.kind === drawing.kind && item.name === name);
  if (
    existing < 0 &&
    current.filter((item) => item.kind === drawing.kind).length >= MAX_TEMPLATES_PER_KIND
  )
    return null;
  const template = { kind: drawing.kind, name, settings };
  const next =
    existing < 0
      ? [...current, template]
      : current.map((item, index) => (index === existing ? template : item));
  // Leave room for Zustand's envelope within the workspace API's 256 KiB limit.
  return JSON.stringify(next).length <= 250_000 ? next : null;
}

export const useDrawingTemplates = create<{
  templates: DrawingTemplate[];
  saveTemplate: (drawing: ChartDrawing, name: string) => boolean;
  deleteTemplate: (kind: DrawingKind, name: string) => void;
}>()(
  persist(
    (set, get) => ({
      templates: [],
      saveTemplate: (drawing, name) => {
        const templates = saveDrawingTemplate(get().templates, drawing, name);
        if (!templates) return false;
        set({ templates });
        return true;
      },
      deleteTemplate: (kind, name) =>
        set((state) => ({
          templates: state.templates.filter((item) => item.kind !== kind || item.name !== name),
        })),
    }),
    {
      name: DRAWING_TEMPLATES_KEY,
      storage: createJSONStorage(() => tradingWorkspaceStorage),
      skipHydration: true,
      merge: (persisted, current) => ({
        ...current,
        templates: normalizeDrawingTemplates(
          persisted && typeof persisted === "object" && "templates" in persisted
            ? persisted.templates
            : undefined,
        ),
      }),
    },
  ),
);

tradingWorkspaceStorage.registerHydrator(() => {
  useDrawingTemplates.setState(useDrawingTemplates.getInitialState(), true);
  return useDrawingTemplates.persist.rehydrate();
});
