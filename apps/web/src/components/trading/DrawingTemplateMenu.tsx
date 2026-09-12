import { useState } from "react";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { ChartIcon } from "./ChartIcon";
import type { ChartDrawing } from "./drawingGeometry";
import type { DrawingPatch } from "./useChartDrawings";
import { MAX_TEMPLATES_PER_KIND, useDrawingTemplates } from "./drawingTemplates";

export function DrawingTemplateMenu({
  drawing,
  onApply,
}: {
  drawing: ChartDrawing;
  onApply: (patch: DrawingPatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const allTemplates = useDrawingTemplates((state) => state.templates);
  const saveTemplate = useDrawingTemplates((state) => state.saveTemplate);
  const deleteTemplate = useDrawingTemplates((state) => state.deleteTemplate);
  const templates = allTemplates.filter((template) => template.kind === drawing.kind);
  const existing = templates.some((template) => template.name === name.trim());
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError("");
      }}
    >
      <PopoverTrigger
        aria-label="Drawing templates"
        className="flex h-[34px] items-center gap-2 rounded border border-white/20 px-3 text-sm text-zinc-200 hover:bg-white/10"
      >
        Template <ChartIcon name="chevron-down" className="size-3" />
      </PopoverTrigger>
      <PopoverPopup
        side="top"
        align="start"
        style={{ background: "#1f1f1f", backdropFilter: "none" }}
        className="w-72"
        viewportClassName="p-3"
      >
        <PopoverTitle className="mb-3 text-sm">Template</PopoverTitle>
        {templates.length ? (
          <div className="mb-3 max-h-60 overflow-y-auto" aria-label="Saved drawing templates">
            {templates.map((template) => (
              <div key={template.name} className="flex items-center rounded hover:bg-white/10">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm text-zinc-200"
                  onClick={() => {
                    onApply(template.settings);
                    setOpen(false);
                  }}
                >
                  {template.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete template ${template.name}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-red-300"
                  onClick={() => deleteTemplate(template.kind, template.name)}
                >
                  <ChartIcon name="trash" className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-3 text-xs text-zinc-400">No templates for this drawing type.</p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!saveTemplate(drawing, name)) {
              setError("Template limit reached. Delete a template before saving another.");
              return;
            }
            setName("");
            setError("");
          }}
        >
          <label
            className="mb-1 block text-xs text-zinc-400"
            htmlFor={`drawing-template-name-${drawing.id}`}
          >
            Template name
          </label>
          <input
            id={`drawing-template-name-${drawing.id}`}
            value={name}
            maxLength={80}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
            placeholder="Name this style"
            className="h-[34px] w-full rounded border border-white/20 bg-transparent px-2 text-sm text-zinc-100 outline-none focus:border-blue-400"
          />
          <button
            type="submit"
            disabled={!name.trim() || (!existing && templates.length >= MAX_TEMPLATES_PER_KIND)}
            className="mt-2 h-8 w-full rounded bg-zinc-100 text-sm text-zinc-950 hover:bg-white disabled:opacity-40"
          >
            {existing ? "Replace template" : "Save template"}
          </button>
          {templates.length >= MAX_TEMPLATES_PER_KIND && !existing ? (
            <p className="mt-2 text-xs text-zinc-400">
              20 templates saved. Replace or delete one to save another.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {error}
            </p>
          ) : null}
        </form>
      </PopoverPopup>
    </Popover>
  );
}
