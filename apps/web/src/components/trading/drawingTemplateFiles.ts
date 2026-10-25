import { toastManager } from "../ui/toast";
import type { DrawingKind } from "./drawingGeometry";
import { useDrawingTemplates, type DrawingTemplate } from "./drawingTemplates";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import {
  MAX_DRAWING_TEMPLATE_FILE_BYTES,
  parseDrawingTemplateFile,
  serializeDrawingTemplate,
  drawingTemplateFileName,
} from "./drawingTemplateTransfer";

const failure = (error: unknown) =>
  toastManager.add({
    type: "error",
    title: "Couldn't transfer drawing template",
    description: error instanceof Error ? error.message : "Try again.",
  });

export function exportDrawingTemplate(template: DrawingTemplate) {
  try {
    const url = URL.createObjectURL(
      new Blob([serializeDrawingTemplate(template)], { type: "application/json" }),
    );
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = drawingTemplateFileName(template);
      link.click();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) {
    failure(error);
  }
}

export async function importDrawingTemplateFile(
  file: Pick<File, "size" | "text">,
  kind: DrawingKind,
  destination: ReturnType<typeof tradingWorkspaceStorage.capture>,
): Promise<string> {
  if (file.size > MAX_DRAWING_TEMPLATE_FILE_BYTES)
    throw Error("Choose a drawing template smaller than 250 KB.");
  const template = parseDrawingTemplateFile(await file.text());
  if (
    !tradingWorkspaceStorage.getSnapshot().ready ||
    tradingWorkspaceStorage.capture() !== destination
  )
    throw Error("The workspace changed. Import the template again in the intended workspace.");
  if (template.kind !== kind)
    throw Error(`This is a ${template.kind} template. Select that drawing tool to import it.`);
  return useDrawingTemplates.getState().importTemplate(template);
}

/** Capture the destination before the native picker opens; switching workspaces cancels the import. */
export function chooseDrawingTemplateFile(kind: DrawingKind) {
  if (!tradingWorkspaceStorage.getSnapshot().ready) {
    failure(Error("Wait for your workspace to finish loading."));
    return;
  }
  const destination = tradingWorkspaceStorage.capture();
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.hidden = true;
  input.addEventListener("cancel", () => input.remove(), { once: true });
  input.addEventListener(
    "change",
    () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      void importDrawingTemplateFile(file, kind, destination)
        .then((name) =>
          toastManager.add({
            type: "success",
            title: "Drawing template imported",
            description: name,
          }),
        )
        .catch(failure);
    },
    { once: true },
  );
  document.body.append(input);
  try {
    input.click();
  } catch (error) {
    input.remove();
    failure(error);
  }
}
