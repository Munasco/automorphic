import { useState, useSyncExternalStore } from "react";
import { MoreHorizontalIcon } from "lucide-react";
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
  useChartTemplates,
  type ChartTemplate,
} from "./chartTemplates";
import { tradingWorkspaceStorage } from "./workspaceStorage";
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
function TemplateItems({ onSave, onManage, onAction = runTemplateAction }: TemplateActions) {
  const templates = useChartTemplates((state) => state.templates);
  const workspace = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    tradingWorkspaceStorage.getSnapshot,
  );
  return (
    <>
      {templates.map((template) => (
        <MenuItem
          key={template.id}
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
  const workspace = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    tradingWorkspaceStorage.getSnapshot,
  );
  const [mode, setMode] = useState(initialMode);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
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
        store.saveTemplate(name, useChartPreferences.getState());
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
                ? "Save chart template"
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
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-9 w-full rounded border border-zinc-600 bg-[#292929] px-2 text-sm outline-none focus:border-blue-400"
            />
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
                      disabled={!workspace.ready}
                      className="min-w-0 flex-1 px-3 py-3 text-left"
                      onClick={() =>
                        run(() => {
                          applyTemplate(template);
                          onClose();
                        })
                      }
                    >
                      <span className="block truncate text-sm">{template.name}</span>
                      <span className="text-xs text-zinc-400">
                        {Object.values(template.settings.indicators).filter(Boolean).length +
                          template.settings.extraIndicators.length}{" "}
                        indicators
                      </span>
                    </button>
                    <Menu>
                      <MenuTrigger
                        aria-label={`Options for ${template.name}`}
                        disabled={!workspace.ready}
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
            <footer className="flex shrink-0 justify-end border-t border-zinc-700 p-4">
              <button
                type="button"
                disabled={!workspace.ready}
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
