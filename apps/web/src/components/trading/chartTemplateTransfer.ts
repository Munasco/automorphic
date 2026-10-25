import {
  captureChartTemplateSettings,
  type ChartTemplate,
  type ChartTemplateSettings,
} from "./chartTemplates";

export const MAX_CHART_TEMPLATE_FILE_BYTES = 250_000;
const FORMAT = "automorphic-chart-template";
const encoder = new TextEncoder();
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function checkedName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80)
    throw Error("The template needs a name between 1 and 80 characters.");
  return value.trim();
}
function checkSize(text: string) {
  if (encoder.encode(text).byteLength > MAX_CHART_TEMPLATE_FILE_BYTES)
    throw Error("Choose a template smaller than 250 KB.");
}

export function serializeChartTemplate(template: ChartTemplate): string {
  const text = JSON.stringify(
    {
      format: FORMAT,
      version: 1,
      name: checkedName(template.name),
      settings: captureChartTemplateSettings(template.settings),
    },
    null,
    2,
  );
  checkSize(text);
  return text;
}

export function parseChartTemplateFile(text: string): {
  name: string;
  settings: ChartTemplateSettings;
} {
  checkSize(text);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error("This file isn't valid JSON. Choose an exported chart template.");
  }
  if (!record(value) || value.format !== FORMAT || value.version !== 1)
    throw Error("Choose an Automorphic chart template with a supported version.");
  if (!record(value.settings)) throw Error("This template is missing its chart settings.");
  return { name: checkedName(value.name), settings: captureChartTemplateSettings(value.settings) };
}

export function chartTemplateFileName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${slug || "chart-template"}.json`;
}
