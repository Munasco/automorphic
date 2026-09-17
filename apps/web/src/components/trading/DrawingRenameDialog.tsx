import { useRef, useState } from "react";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import type { ChartDrawing } from "./drawingGeometry";
import { drawingKindLabel } from "./drawingNames";

export function DrawingRenameDialog({
  drawing,
  onRename,
  onClose,
  returnFocus,
}: {
  drawing: ChartDrawing;
  onRename: (id: string, name: string) => boolean;
  onClose: () => void;
  returnFocus: () => HTMLElement | null;
}) {
  const [name, setName] = useState(drawing.name ?? "");
  const input = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup
        bottomStickOnMobile={false}
        initialFocus={() => {
          input.current?.select();
          return input.current;
        }}
        finalFocus={returnFocus}
        style={{ background: "#202020", transition: "none" }}
        backdropStyle={{ background: "transparent", transition: "none" }}
        className="w-[380px] max-w-[calc(100vw-32px)] rounded-lg border border-white/10 p-6 text-zinc-100 data-starting-style:scale-100 data-starting-style:opacity-100 data-ending-style:scale-100 data-ending-style:opacity-100"
      >
        <DialogTitle className="mb-5 text-lg font-medium">Rename drawing</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onRename(drawing.id, name);
            onClose();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") return;
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
            event.stopPropagation();
          }}
        >
          <label
            className="mb-2 block text-sm text-zinc-300"
            htmlFor={`drawing-name-${drawing.id}`}
          >
            Name
          </label>
          <input
            ref={input}
            id={`drawing-name-${drawing.id}`}
            value={name}
            placeholder={drawingKindLabel(drawing.kind)}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            className="h-9 w-full rounded border border-white/20 bg-transparent px-2 text-sm outline-none focus:border-blue-400"
          />
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
              className="h-9 rounded bg-[#2962ff] px-4 text-sm text-white hover:bg-blue-500"
            >
              Save
            </button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
