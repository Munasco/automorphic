import { RotateCcwIcon } from "lucide-react";
import { MenuItem } from "../ui/menu";
import { useChartPreferences } from "./chartPreferences";
import { drawingContextMenuItemClass } from "./drawingContextMenuStyles";

/** Reset visible panes and saved proportions for indicators that are currently hidden. */
export function ResetChartPaneSizes({
  menu = false,
  onReset,
}: {
  menu?: boolean;
  onReset?: () => void;
}) {
  const customSizes = useChartPreferences(
    (state) => Object.keys(state.paneStretchFactors).length > 0,
  );
  const reset = () => {
    useChartPreferences.getState().setPaneStretchFactors({});
    onReset?.();
  };
  const content = (
    <>
      <RotateCcwIcon className="size-4 shrink-0" aria-hidden="true" />
      Reset pane sizes
    </>
  );
  return menu ? (
    <MenuItem className={drawingContextMenuItemClass} disabled={!customSizes} onClick={reset}>
      {content}
    </MenuItem>
  ) : (
    <button
      type="button"
      disabled={!customSizes}
      onClick={reset}
      className="flex w-full items-center gap-2 rounded border border-white/15 px-2 py-2 text-xs hover:bg-white/5 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {content}
    </button>
  );
}
