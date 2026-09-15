import { PencilIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { MenuItem, MenuSeparator, MenuSub, MenuSubPopup, MenuSubTrigger } from "../ui/menu";
import {
  drawingContextMenuStyle,
  drawingContextMenuPopupClass,
  drawingContextMenuItemClass as templateMenuRowClass,
} from "./drawingContextMenuStyles";
import { ChartIcon } from "./ChartIcon";
import type { ChartDrawing } from "./drawingGeometry";
import type { DrawingPatch } from "./useChartDrawings";
import {
  defaultDrawingTemplateSettings,
  MAX_TEMPLATES_PER_KIND,
  useDrawingTemplates,
} from "./drawingTemplates";

export function DrawingTemplateMenu({
  drawing,
  onApply,
  compact = false,
}: {
  drawing: ChartDrawing;
  compact?: boolean;
  onApply: (patch: DrawingPatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renameFrom, setRenameFrom] = useState<string>();
  const allTemplates = useDrawingTemplates((state) => state.templates);
  const deleteTemplate = useDrawingTemplates((state) => state.deleteTemplate);
  const templates = allTemplates.filter((template) => template.kind === drawing.kind);
  const menuClass =
    "h-8 w-full whitespace-nowrap rounded px-2 text-left text-sm text-zinc-200 hover:bg-white/10";
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label="Drawing templates"
          title={compact ? "Drawing templates" : undefined}
          className={cn(
            "flex shrink-0 items-center justify-center gap-2 rounded text-sm text-zinc-200 hover:bg-white/10",
            compact
              ? "size-[38px] aria-expanded:bg-white/10"
              : "h-[34px] w-[100px] justify-between gap-0 border border-white/20 px-[11px] text-sm",
          )}
        >
          {compact ? (
            <ChartIcon name="layout-grid-add" className="size-7" />
          ) : (
            <>
              Template <ChartIcon name="chevron-down" className="size-[18px] shrink-0" />
            </>
          )}
        </PopoverTrigger>
        <PopoverPopup
          instant
          side="bottom"
          align="start"
          style={{ background: "#1f1f1f", backdropFilter: "none" }}
          className="w-max min-w-[120px] max-w-72"
          viewportClassName="p-1.5"
        >
          <PopoverTitle className="sr-only">Drawing templates</PopoverTitle>
          <button
            type="button"
            className={menuClass}
            onClick={() => {
              setOpen(false);
              setSaving(true);
            }}
          >
            Save as…
          </button>
          <button
            type="button"
            className={menuClass}
            onClick={() => {
              onApply(defaultDrawingTemplateSettings(drawing.kind));
              setOpen(false);
            }}
          >
            Apply defaults
          </button>
          {templates.length ? (
            <div
              className="mt-1 max-h-60 overflow-y-auto border-t border-white/10 pt-1"
              aria-label="Saved drawing templates"
            >
              {templates.map((template) => (
                <div key={template.name} className="flex items-center rounded hover:bg-white/10">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate px-3 py-2 text-left text-[13px] text-zinc-200"
                    onClick={() => {
                      onApply(template.settings);
                      setOpen(false);
                    }}
                  >
                    {template.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Rename template ${template.name}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-white"
                    onClick={() => {
                      setOpen(false);
                      setRenameFrom(template.name);
                      setSaving(true);
                    }}
                  >
                    <PencilIcon className="size-3.5" />
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
          ) : null}
        </PopoverPopup>
      </Popover>
      {saving ? (
        <DrawingTemplateSaveDialog
          drawing={drawing}
          renameFrom={renameFrom}
          onClose={() => {
            setSaving(false);
            setRenameFrom(undefined);
          }}
        />
      ) : null}
    </>
  );
}

/** Mount outside transient menus so closing their root does not dismiss the save form. */
export function DrawingTemplateSaveDialog({
  drawing,
  renameFrom,
  onClose,
}: {
  drawing: ChartDrawing;
  renameFrom?: string | undefined;
  onClose: () => void;
}) {
  const [name, setName] = useState(renameFrom ?? "");
  const [error, setError] = useState("");
  const allTemplates = useDrawingTemplates((state) => state.templates);
  const saveTemplate = useDrawingTemplates((state) => state.saveTemplate);
  const renameTemplate = useDrawingTemplates((state) => state.renameTemplate);
  const templates = allTemplates.filter((template) => template.kind === drawing.kind);
  const existing = templates.some((template) => template.name === name.trim());
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup
        bottomStickOnMobile={false}
        style={{ background: "#202020", transition: "none" }}
        backdropStyle={{ background: "transparent", transition: "none" }}
        className="w-[380px] max-w-[calc(100vw-32px)] rounded-lg border border-white/10 p-6 text-zinc-100 data-starting-style:scale-100 data-starting-style:opacity-100 data-ending-style:scale-100 data-ending-style:opacity-100"
      >
        <DialogTitle className="mb-5 text-lg font-medium">
          {renameFrom === undefined ? "Save Drawing Template As…" : "Rename drawing template"}
        </DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            try {
              if (renameFrom !== undefined) renameTemplate(drawing.kind, renameFrom, name);
              else if (!saveTemplate(drawing, name)) {
                setError("Template limit reached. Delete a template before saving another.");
                return;
              }
              onClose();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Could not update the template.");
            }
          }}
        >
          <label
            className="mb-2 block text-sm text-zinc-300"
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
            className="h-9 w-full rounded border border-white/20 bg-transparent px-2 text-sm outline-none focus:border-blue-400"
          />
          {renameFrom === undefined && templates.length >= MAX_TEMPLATES_PER_KIND && !existing ? (
            <p className="mt-2 text-xs text-zinc-400">
              20 templates saved. Replace or delete one to save another.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded border border-white/20 px-4 text-sm hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                !name.trim() ||
                (renameFrom === undefined &&
                  !existing &&
                  templates.length >= MAX_TEMPLATES_PER_KIND)
              }
              className="h-9 rounded bg-[#2962ff] px-4 text-sm text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {renameFrom !== undefined ? "Rename" : existing ? "Replace" : "Save"}
            </button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function TemplateMenuSpacer() {
  return <span aria-hidden="true" className="size-4.5 shrink-0" />;
}

export function DrawingTemplateSubmenu({
  drawing,
  onApply,
  onSave,
  onRename,
}: {
  drawing: ChartDrawing;
  onApply: (patch: DrawingPatch) => void;
  onSave: () => void;
  onRename: (name: string) => void;
}) {
  const allTemplates = useDrawingTemplates((state) => state.templates);
  const templates = allTemplates.filter((template) => template.kind === drawing.kind);
  const deleteTemplate = useDrawingTemplates((state) => state.deleteTemplate);
  return (
    <MenuSub>
      <MenuSubTrigger className={templateMenuRowClass}>
        <TemplateMenuSpacer />
        Template
      </MenuSubTrigger>
      <MenuSubPopup
        aria-label="Drawing templates"
        className={drawingContextMenuPopupClass}
        style={drawingContextMenuStyle}
        alignOffset={-6}
      >
        <MenuItem className={templateMenuRowClass} onClick={onSave}>
          Save as…
        </MenuItem>
        <MenuItem
          className={templateMenuRowClass}
          onClick={() => onApply(defaultDrawingTemplateSettings(drawing.kind))}
        >
          Apply default
        </MenuItem>
        {templates.length ? <MenuSeparator /> : null}
        {templates.map((template) => (
          <div key={template.name} className="group flex items-center">
            <MenuItem
              className={cn(templateMenuRowClass, "min-w-0 flex-1")}
              onClick={() => onApply(template.settings)}
            >
              <span className="truncate">{template.name}</span>
            </MenuItem>
            <MenuItem
              aria-label={`Rename template ${template.name}`}
              className="size-8 min-h-8 shrink-0 justify-center px-0 py-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-highlighted:opacity-100 sm:min-h-8"
              onClick={() => onRename(template.name)}
            >
              <PencilIcon className="size-4" />
            </MenuItem>
            <MenuItem
              aria-label={`Delete template ${template.name}`}
              closeOnClick={false}
              className="size-8 min-h-8 shrink-0 justify-center px-0 py-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-highlighted:opacity-100 sm:min-h-8"
              onClick={() => deleteTemplate(template.kind, template.name)}
            >
              <ChartIcon name="trash" className="size-4.5" />
            </MenuItem>
          </div>
        ))}
      </MenuSubPopup>
    </MenuSub>
  );
}
