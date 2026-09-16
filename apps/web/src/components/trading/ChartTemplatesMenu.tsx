import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CheckIcon, MoreHorizontalIcon } from "lucide-react";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
} from "../ui/menu";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import { ChartIcon } from "./ChartIcon";
import { useChartPreferences } from "./chartPreferences";
import {
  captureChartTemplateSettings,
  chartTemplateSettingsKey,
  useChartTemplates,
  type ChartTemplate,
} from "./chartTemplates";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import {
  MAX_CHART_TEMPLATE_FILE_BYTES,
  serializeChartTemplate,
  parseChartTemplateFile,
  chartTemplateFileName,
} from "./chartTemplateTransfer";
import {
  drawingContextMenuItemClass,
  drawingContextMenuPopupClass,
} from "./drawingContextMenuStyles";

const menuStyle = { background: "#292929", border: "1px solid #575757", backdropFilter: "none" };
type TemplateActions = {
  onSave: () => void;
  onManage: () => void;
  onAction?: (action: () => void) => void;
};
function applyTemplate(template: ChartTemplate) {
  if (!tradingWorkspaceStorage.getSnapshot().ready) throw Error("The workspace is still loading.");
  useChartPreferences.setState(captureChartTemplateSettings(template.settings));
}
const runTemplateAction = (action: () => void) => action();
function useMatchingTemplates(templates: readonly ChartTemplate[]) {
  const current = useChartPreferences(chartTemplateSettingsKey);
  const saved = useMemo(
    () =>
      templates.map((template) => ({
        id: template.id,
        key: chartTemplateSettingsKey(template.settings),
      })),
    [templates],
  );
  return useMemo(
    () =>
      new Set(saved.filter((template) => template.key === current).map((template) => template.id)),
    [saved, current],
  );
}
function TemplateItems({ onSave, onManage, onAction = runTemplateAction }: TemplateActions) {
  const templates = useChartTemplates((state) => state.templates);
  const matching = useMatchingTemplates(templates);
  const workspace = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    tradingWorkspaceStorage.getSnapshot,
  );
  return (
    <>
      {templates.map((template) => (
        <MenuItem
          key={template.id}
          aria-current={workspace.ready && matching.has(template.id) ? "true" : undefined}
          disabled={!workspace.ready}
          className={drawingContextMenuItemClass}
          onClick={() =>
            onAction(() => {
              try {
                applyTemplate(template);
              } catch (error) {
                toastManager.add({
                  type: "error",
                  title: "Couldn't apply template",
                  description: error instanceof Error ? error.message : "Try again.",
                });
              }
            })
          }
        >
          <CheckIcon
            aria-hidden="true"
            className={
              workspace.ready && matching.has(template.id)
                ? "size-4 shrink-0"
                : "invisible size-4 shrink-0"
            }
          />
          {template.name}
        </MenuItem>
      ))}
      {templates.length ? <MenuSeparator /> : null}
      <MenuItem
        disabled={!workspace.ready}
        className={drawingContextMenuItemClass}
        onClick={() => onAction(onSave)}
      >
        Save as…
      </MenuItem>
      <MenuItem
        disabled={!workspace.ready}
        className={drawingContextMenuItemClass}
        onClick={() => onAction(onManage)}
      >
        Manage templates…
      </MenuItem>
    </>
  );
}
export function ChartTemplatesControl(props: TemplateActions) {
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={<MenuTrigger />}
          aria-label="Chart templates"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-white/5 hover:text-zinc-100 focus-visible:outline focus-visible:outline-blue-400"
        >
          <ChartIcon name="layout-grid-add" className="size-[18px]" />
        </TooltipTrigger>
        <TooltipPopup>Chart templates</TooltipPopup>
      </Tooltip>
      <MenuPopup align="start" className={drawingContextMenuPopupClass} style={menuStyle}>
        <TemplateItems {...props} />
      </MenuPopup>
    </Menu>
  );
}
export function ChartTemplateSubmenu(props: TemplateActions) {
  return (
    <MenuSub>
      <MenuSubTrigger className={drawingContextMenuItemClass}>
        <ChartIcon name="layout-grid-add" />
        Chart template
      </MenuSubTrigger>
      <MenuSubPopup className={drawingContextMenuPopupClass} style={menuStyle}>
        <TemplateItems {...props} />
      </MenuSubPopup>
    </MenuSub>
  );
}

export function ChartTemplatesDialog({
  initialMode,
  onClose,
}: {
  initialMode: "save" | "manage";
  onClose: () => void;
}) {
  const store = useChartTemplates();
  const matching = useMatchingTemplates(store.templates);
  const workspace = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    tradingWorkspaceStorage.getSnapshot,
  );
  const [mode, setMode] = useState(initialMode);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<{
    settings: ChartTemplate["settings"];
    projectId: string | null;
  } | null>(null);
  async function importFile(file: File) {
    const projectId = tradingWorkspaceStorage.getSnapshot().projectId;
    setImporting(true);
    try {
      if (file.size > MAX_CHART_TEMPLATE_FILE_BYTES)
        throw Error("Choose a template smaller than 250 KB.");
      const template = parseChartTemplateFile(await file.text());
      if (tradingWorkspaceStorage.getSnapshot().projectId !== projectId)
        throw Error("The workspace changed. Choose the template again.");
      setImported({ settings: template.settings, projectId });
      setName(template.name);
      setMode("save");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import the template.");
    } finally {
      setImporting(false);
    }
  }
  function exportTemplate(template: ChartTemplate) {
    const url = URL.createObjectURL(
      new Blob([serializeChartTemplate(template)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = chartTemplateFileName(template.name);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const form = mode === "save" || editingId !== null;
  function run(action: () => void) {
    try {
      action();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the template.");
    }
  }
  function save() {
    run(() => {
      if (editingId) {
        if (!store.renameTemplate(editingId, name))
          throw Error("This template is no longer available.");
        setEditingId(null);
        setName("");
      } else {
        if (imported && tradingWorkspaceStorage.getSnapshot().projectId !== imported.projectId)
          throw Error("The workspace changed. Choose the template again.");
        store.saveTemplate(name, imported?.settings ?? useChartPreferences.getState());
        onClose();
      }
    });
  }
  const buttonClass =
    "rounded border border-zinc-600 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-40";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup
        bottomStickOnMobile={false}
        backdropStyle={{ background: "transparent", backdropFilter: "none" }}
        className="flex w-[460px] flex-col overflow-hidden rounded-md border border-zinc-700 bg-[#1f1f1f] p-0 text-zinc-200"
      >
        <header className="shrink-0 border-b border-zinc-700 px-5 py-4 pr-12">
          <DialogTitle className="text-lg">
            {editingId
              ? "Rename template"
              : mode === "save"
                ? imported
                  ? "Import chart template"
                  : "Save chart template"
                : "Chart templates"}
          </DialogTitle>
        </header>
        {form ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
            className="min-h-0 overflow-y-auto p-5"
          >
            <label className="block text-sm" htmlFor="chart-template-name">
              Name
            </label>
            <input
              id="chart-template-name"
              aria-label="Template name"
              autoComplete="off"
              autoFocus
              maxLength={80}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
              className="mt-2 h-9 w-full rounded border border-zinc-600 bg-[#292929] px-2 text-sm outline-none focus:border-blue-400"
            />
            {imported ? (
              <p className="mt-3 text-xs text-zinc-400">
                {Object.values(imported.settings.indicators).filter(Boolean).length +
                  imported.settings.extraIndicators.length}{" "}
                indicators. Save this template, then select it to apply it to your chart.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  if (editingId) {
                    setEditingId(null);
                    setError("");
                  } else if (imported) {
                    setImported(null);
                    setMode("manage");
                    setName("");
                    setError("");
                  } else onClose();
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!workspace.ready || !name.trim()}
                className="rounded bg-zinc-100 px-3 py-1.5 text-sm text-zinc-950 hover:bg-white disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="min-h-0 overflow-auto p-2">
              {store.templates.length ? (
                store.templates.map((template) => (
                  <div
                    key={template.id}
                    className="group flex items-center rounded hover:bg-white/5"
                  >
                    <button
                      type="button"
                      aria-current={
                        workspace.ready && matching.has(template.id) ? "true" : undefined
                      }
                      disabled={!workspace.ready || importing}
                      className="min-w-0 flex-1 px-3 py-3 text-left"
                      onClick={() =>
                        run(() => {
                          applyTemplate(template);
                          onClose();
                        })
                      }
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <span className="truncate">{template.name}</span>
                        {workspace.ready && matching.has(template.id) && (
                          <CheckIcon
                            aria-label="Matches current chart"
                            className="size-4 shrink-0"
                          />
                        )}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {Object.values(template.settings.indicators).filter(Boolean).length +
                          template.settings.extraIndicators.length}{" "}
                        indicators
                      </span>
                    </button>
                    <Menu>
                      <MenuTrigger
                        aria-label={`Options for ${template.name}`}
                        disabled={!workspace.ready || importing}
                        className="mr-2 inline-flex size-8 items-center justify-center rounded opacity-0 hover:bg-white/10 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </MenuTrigger>
                      <MenuPopup style={menuStyle}>
                        <MenuItem
                          onClick={() =>
                            run(() => {
                              if (
                                !store.updateTemplate(template.id, useChartPreferences.getState())
                              )
                                throw Error("This template is no longer available.");
                            })
                          }
                        >
                          Update from chart
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            setEditingId(template.id);
                            setName(template.name);
                            setError("");
                          }}
                        >
                          Rename
                        </MenuItem>
                        <MenuItem onClick={() => run(() => exportTemplate(template))}>
                          Export…
                        </MenuItem>
                        <MenuItem
                          variant="destructive"
                          onClick={() =>
                            run(() => {
                              if (!store.deleteTemplate(template.id))
                                throw Error("This template is no longer available.");
                            })
                          }
                        >
                          Delete
                        </MenuItem>
                      </MenuPopup>
                    </Menu>
                  </div>
                ))
              ) : (
                <p className="p-6 text-center text-sm text-zinc-400">No saved templates.</p>
              )}
            </div>
            {error ? (
              <p role="alert" className="px-5 py-2 text-sm text-red-400">
                {error}
              </p>
            ) : null}
            <footer className="flex shrink-0 justify-end gap-2 border-t border-zinc-700 p-4">
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                aria-label="Import chart template file"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void importFile(file);
                }}
              />
              <button
                type="button"
                disabled={!workspace.ready || importing}
                className={buttonClass}
                onClick={() => fileInput.current?.click()}
              >
                {importing ? "Importing…" : "Import…"}
              </button>
              <button
                type="button"
                disabled={!workspace.ready || importing}
                className={buttonClass}
                onClick={() => {
                  setMode("save");
                  setName("");
                  setError("");
                }}
              >
                Save as…
              </button>
            </footer>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
