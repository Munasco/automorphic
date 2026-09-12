import { MenuItem, MenuSub, MenuSubPopup, MenuSubTrigger } from "../ui/menu";
import type { ChartInterval } from "./tradingIntervals";
import { createDrawingVisibilityPreset, type DrawingVisibility } from "./drawingVisibility";
import {
  drawingContextMenuItemClass,
  drawingContextMenuPopupClass,
  drawingContextMenuStyle,
} from "./drawingContextMenuStyles";

export function DrawingVisibilitySubmenu({
  interval,
  onApply,
}: {
  interval: number | ChartInterval;
  onApply: (visibility: DrawingVisibility) => void;
}) {
  return (
    <MenuSub>
      <MenuSubTrigger className={drawingContextMenuItemClass}>
        <span aria-hidden="true" className="size-4.5 shrink-0" />
        Visibility on intervals
      </MenuSubTrigger>
      <MenuSubPopup
        aria-label="Visibility on intervals"
        alignOffset={-6}
        className={drawingContextMenuPopupClass}
        style={drawingContextMenuStyle}
      >
        {(
          [
            ["above", "Current interval and above"],
            ["below", "Current interval and below"],
            ["only", "Current interval only"],
            ["all", "All intervals"],
          ] as const
        ).map(([preset, label]) => {
          const visibility = createDrawingVisibilityPreset(interval, preset);
          return (
            <MenuItem
              key={preset}
              className={drawingContextMenuItemClass}
              disabled={!visibility}
              onClick={() => {
                if (visibility) onApply(visibility);
              }}
            >
              {label}
            </MenuItem>
          );
        })}
      </MenuSubPopup>
    </MenuSub>
  );
}
