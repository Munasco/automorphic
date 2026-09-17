import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { randomUUID } from "../../lib/utils";
import { normalizeChartPreferences } from "./chartPreferences";
import { DEFAULT_INITIAL_BALANCE, type InitialBalanceSettings } from "./initialBalanceSettings";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import { hashKey } from "@tanstack/react-query";

export const CHART_TEMPLATES_KEY = "automorphic:chart-templates:v1";
export const MAX_CHART_TEMPLATES = 20;
export type ChartTemplateSettings = Omit<
  ReturnType<typeof normalizeChartPreferences>,
  "favoriteIndicators" | "favoriteChartIntervals" | "replaySpeed" | "objectTreeFilter"
>;
export type ChartTemplate = { id: string; name: string; settings: ChartTemplateSettings };
const MAX_PAYLOAD_SIZE = 250_000;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const validName = (name: unknown): name is string =>
  typeof name === "string" && name.trim().length > 0 && name.trim().length <= 80;
const nameKey = (name: string) => name.trim().toLowerCase();

function captureInitialBalance(settings: InitialBalanceSettings): InitialBalanceSettings {
  return Object.fromEntries(
    Object.keys(DEFAULT_INITIAL_BALANCE).map((key) => [
      key,
      settings[key as keyof InitialBalanceSettings],
    ]),
  ) as InitialBalanceSettings;
}

/** Capture only chart display and indicator settings, never personal favorites or replay state. */
export function captureChartTemplateSettings(value: unknown): ChartTemplateSettings {
  const {
    favoriteIndicators: _favorites,
    favoriteChartIntervals: _intervalFavorites,
    replaySpeed: _replaySpeed,
    objectTreeFilter: _objectTreeFilter,
    ...settings
  } = normalizeChartPreferences(value);
  return structuredClone({
    ...settings,
    initialBalance: captureInitialBalance(settings.initialBalance),
    extraIndicators: settings.extraIndicators.map((instance) =>
      instance.initialBalance
        ? { ...instance, initialBalance: captureInitialBalance(instance.initialBalance) }
        : instance,
    ),
  });
}

/** Object key order is irrelevant; indicator arrays and their order remain significant. */
export function chartTemplateSettingsKey(value: unknown): string {
  return hashKey([captureChartTemplateSettings(value)]);
}

export function normalizeChartTemplates(value: unknown): ChartTemplate[] {
  if (!Array.isArray(value)) return [];
  const templates: ChartTemplate[] = [];
  const names = new Set<string>(),
    ids = new Set<string>();
  for (const item of value.slice(0, MAX_CHART_TEMPLATES)) {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !item.id.trim() ||
      item.id.length > 100 ||
      ids.has(item.id) ||
      !validName(item.name) ||
      names.has(nameKey(item.name)) ||
      !record(item.settings)
    )
      continue;
    const template = {
      id: item.id,
      name: item.name.trim(),
      settings: captureChartTemplateSettings(item.settings),
    };
    if (JSON.stringify([...templates, template]).length > MAX_PAYLOAD_SIZE) continue;
    templates.push(template);
    ids.add(template.id);
    names.add(nameKey(template.name));
  }
  return templates;
}

function assertReady() {
  if (!tradingWorkspaceStorage.getSnapshot().ready)
    throw Error("Wait for your workspace to finish loading.");
}
function checkedName(name: string, templates: readonly ChartTemplate[], exceptId?: string) {
  if (!validName(name)) throw Error("Enter a template name between 1 and 80 characters.");
  if (templates.some((item) => item.id !== exceptId && nameKey(item.name) === nameKey(name)))
    throw Error("A chart template with that name already exists.");
  return name.trim();
}
function checkSize(templates: readonly ChartTemplate[]) {
  if (JSON.stringify(templates).length > MAX_PAYLOAD_SIZE)
    throw Error("Chart templates are full. Remove a template before saving another.");
}

export const useChartTemplates = create<{
  templates: ChartTemplate[];
  saveTemplate: (name: string, settings: unknown) => string;
  duplicateTemplate: (id: string) => string | null;
  renameTemplate: (id: string, name: string) => boolean;
  updateTemplate: (id: string, settings: unknown) => boolean;
  deleteTemplate: (id: string) => boolean;
}>()(
  persist(
    (set, get) => ({
      templates: [],
      duplicateTemplate: (id) => {
        assertReady();
        const templates = get().templates;
        const source = templates.find((template) => template.id === id);
        if (!source) return null;
        const names = new Set(templates.map((template) => nameKey(template.name)));
        for (let copy = 1; ; copy++) {
          const suffix = copy === 1 ? " copy" : ` copy ${copy}`;
          const stem = source.name.slice(0, 80 - suffix.length).replace(/[\uD800-\uDBFF]$/u, "");
          const name = `${stem.trimEnd()}${suffix}`;
          if (!names.has(nameKey(name))) return get().saveTemplate(name, source.settings);
        }
      },
      saveTemplate: (name, settings) => {
        assertReady();
        const current = get().templates;
        const normalizedName = checkedName(name, current);
        if (current.length >= MAX_CHART_TEMPLATES)
          throw Error("Remove a chart template before adding another (20 per workspace).");
        const id = randomUUID();
        const templates = [
          ...current,
          { id, name: normalizedName, settings: captureChartTemplateSettings(settings) },
        ];
        checkSize(templates);
        set({ templates });
        return id;
      },
      renameTemplate: (id, name) => {
        assertReady();
        const current = get().templates;
        const existing = current.find((item) => item.id === id);
        if (!existing) return false;
        const normalizedName = checkedName(name, current, id);
        if (normalizedName === existing.name) return true;
        const templates = current.map((item) =>
          item === existing ? { ...item, name: normalizedName } : item,
        );
        checkSize(templates);
        set({ templates });
        return true;
      },
      updateTemplate: (id, value) => {
        assertReady();
        const current = get().templates;
        const existing = current.find((item) => item.id === id);
        if (!existing) return false;
        const settings = captureChartTemplateSettings(value);
        if (JSON.stringify(settings) === JSON.stringify(existing.settings)) return true;
        const templates = current.map((item) => (item === existing ? { ...item, settings } : item));
        checkSize(templates);
        set({ templates });
        return true;
      },
      deleteTemplate: (id) => {
        assertReady();
        const current = get().templates;
        if (!current.some((item) => item.id === id)) return false;
        set({ templates: current.filter((item) => item.id !== id) });
        return true;
      },
    }),
    {
      name: CHART_TEMPLATES_KEY,
      storage: createJSONStorage(() => tradingWorkspaceStorage),
      skipHydration: true,
      partialize: ({ templates }) => ({ templates }),
      merge: (saved, current) => ({
        ...current,
        templates: normalizeChartTemplates(record(saved) ? saved.templates : undefined),
      }),
    },
  ),
);

tradingWorkspaceStorage.registerHydrator(() => {
  useChartTemplates.setState(useChartTemplates.getInitialState(), true);
  return useChartTemplates.persist.rehydrate();
});
