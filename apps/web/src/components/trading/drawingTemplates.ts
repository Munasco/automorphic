import {
  DEFAULT_DRAWING_TEXT_BACKGROUND_COLOR,
  DEFAULT_DRAWING_TEXT_BACKGROUND_OPACITY,
  DEFAULT_DRAWING_TEXT_BORDER_COLOR,
  DEFAULT_DRAWING_TEXT_BORDER_OPACITY,
} from "./drawingTextLayout";
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
    ...(kind === "text"
      ? {
          background: false,
          backgroundColor: DEFAULT_DRAWING_TEXT_BACKGROUND_COLOR,
          backgroundOpacity: DEFAULT_DRAWING_TEXT_BACKGROUND_OPACITY,
          textBorder: false,
          textBorderColor: DEFAULT_DRAWING_TEXT_BORDER_COLOR,
          textBorderOpacity: DEFAULT_DRAWING_TEXT_BORDER_OPACITY,
          textWrap: false,
        }
      : {}),
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
    // Explicit resets/new tools get the reference palette; legacy channel fallbacks stay unchanged.
    ...(kind === "flat-channel" || kind === "disjoint-channel"
      ? { color: kind === "flat-channel" ? "#ff9800" : "#089981", backgroundOpacity: 0.2 }
      : {}),
    ...(kind === "channel"
      ? {
          background: true,
          backgroundOpacity: 0.2,
          levels: [-0.25, 0, 0.25, 0.5, 0.75, 1, 1.25].map((value) => ({
            value,
            visible: value === 0 || value === 0.5 || value === 1,
            color: "#2962ff",
            width: value === 0 || value === 1 ? 2 : 1,
            lineStyle: value === 0.5 ? ("dashed" as const) : ("solid" as const),
          })),
        }
      : {}),
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
  duplicateTemplate: (kind: DrawingKind, name: string) => string;
  deleteTemplate: (kind: DrawingKind, name: string) => void;
  renameTemplate: (kind: DrawingKind, name: string, nextName: string) => void;
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
      duplicateTemplate: (kind, name) => {
        const current = get().templates;
        const source = current.find((item) => item.kind === kind && item.name === name);
        if (!source) throw Error("This template is no longer available.");
        const siblings = current.filter((item) => item.kind === kind);
        if (siblings.length >= MAX_TEMPLATES_PER_KIND)
          throw Error("Template limit reached. Delete a template before duplicating another.");
        let copyName = "";
        for (let index = 1; ; index++) {
          const suffix = index === 1 ? " copy" : ` copy ${index}`;
          // Keep the saved name limit without splitting an emoji at the cut point.
          const base = source.name.slice(0, 80 - suffix.length).replace(/[\uD800-\uDBFF]$/, "");
          copyName = `${base}${suffix}`;
          if (!siblings.some((item) => item.name === copyName)) break;
        }
        const templates = [
          ...current,
          { ...source, name: copyName, settings: structuredClone(source.settings) },
        ];
        if (JSON.stringify(templates).length > 250_000)
          throw Error("Template storage is full. Remove a template before duplicating another.");
        set({ templates });
        return copyName;
      },
      renameTemplate: (kind, name, nextName) => {
        const current = get().templates;
        const existing = current.find((item) => item.kind === kind && item.name === name);
        if (!existing) throw Error("This template is no longer available.");
        if (typeof nextName !== "string" || !nextName.trim() || nextName.trim().length > 80)
          throw Error("Enter a template name between 1 and 80 characters.");
        const normalizedName = nextName.trim();
        if (normalizedName === name) return;
        if (current.some((item) => item.kind === kind && item.name === normalizedName))
          throw Error("A template with this name already exists for this drawing tool.");
        const templates = current.map((item) =>
          item === existing ? { ...item, name: normalizedName } : item,
        );
        if (JSON.stringify(templates).length > 250_000)
          throw Error("Template storage is full. Use a shorter name or remove a template.");
        set({ templates });
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
