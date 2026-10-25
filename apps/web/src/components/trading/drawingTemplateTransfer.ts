import { normalizeDrawingTemplates, type DrawingTemplate } from "./drawingTemplates";

export const MAX_DRAWING_TEMPLATE_FILE_BYTES = 250_000;
const FORMAT = "automorphic-drawing-template";
function checkSize(text: string) {
  if (new TextEncoder().encode(text).byteLength > MAX_DRAWING_TEMPLATE_FILE_BYTES)
    throw Error("Choose a drawing template smaller than 250 KB.");
}
function checkedTemplate(value: unknown): DrawingTemplate {
  if (
    !value ||
    typeof value !== "object" ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.trim().length > 80
  )
    throw Error("The template needs a name between 1 and 80 characters.");
  const template = normalizeDrawingTemplates([value])[0];
  if (!template) throw Error("This template has an invalid drawing tool or settings.");
  return template;
}
export function serializeDrawingTemplate(template: DrawingTemplate): string {
  const normalized = checkedTemplate(template);
  const text = JSON.stringify({ format: FORMAT, version: 1, ...normalized }, null, 2);
  checkSize(text);
  return text;
}
export function parseDrawingTemplateFile(text: string): DrawingTemplate {
  checkSize(text);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error("This file isn't valid JSON. Choose an exported drawing template.");
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("format" in value) ||
    value.format !== FORMAT ||
    !("version" in value) ||
    value.version !== 1
  )
    throw Error("Choose an Automorphic drawing template with a supported version.");
  return checkedTemplate(value);
}
export function drawingTemplateFileName(template: DrawingTemplate): string {
  const name = template.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${template.kind}-${name || "template"}.json`;
}
