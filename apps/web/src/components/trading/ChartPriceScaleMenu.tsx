import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import {
  MenuCheckboxItem,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
} from "../ui/menu";
import { useChartPreferences } from "./chartPreferences";
import { PRICE_SCALE_OPTIONS } from "./ChartToolbar";
import { drawingContextMenuItemClass } from "./drawingContextMenuStyles";
import { ChartIcon } from "./ChartIcon";

export function ChartPriceScaleMenu({
  chart,
  series,
  onClose,
  onOpenSettings,
}: {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const settings = useChartPreferences();
  const run = (action: () => void) => {
    onClose();
    action();
  };
  return (
    <>
      <MenuCheckboxItem
        className={drawingContextMenuItemClass}
        checked={series.priceScale().options().autoScale}
        onCheckedChange={(autoScale) => run(() => series.priceScale().applyOptions({ autoScale }))}
      >
        Auto fit
      </MenuCheckboxItem>
      <MenuItem
        className={drawingContextMenuItemClass}
        onClick={() =>
          run(() => {
            series.priceScale().applyOptions({ autoScale: true });
            chart.timeScale().fitContent();
          })
        }
      >
        <ChartIcon name="maximize" />
        Reset chart view
      </MenuItem>
      <MenuSeparator />
      <MenuRadioGroup
        value={settings.priceScaleMode}
        onValueChange={(value) => {
          const option = PRICE_SCALE_OPTIONS.find(([mode]) => mode === value);
          if (option) run(() => settings.setPriceScaleMode(option[0]));
        }}
      >
        {PRICE_SCALE_OPTIONS.map(([value, label]) => (
          <MenuRadioItem key={value} value={value} className={drawingContextMenuItemClass}>
            <span className="flex items-center gap-3">
              <span className="flex size-4 shrink-0 items-center">
                <MenuRadioItemIndicator />
              </span>
              {label}
            </span>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
      <MenuSeparator />
      <MenuCheckboxItem
        className={drawingContextMenuItemClass}
        checked={settings.invertScale}
        onCheckedChange={() => run(settings.toggleInvertScale)}
      >
        Invert scale
      </MenuCheckboxItem>
      <MenuCheckboxItem
        className={drawingContextMenuItemClass}
        checked={settings.showPriceLine}
        onCheckedChange={() => run(settings.togglePriceLine)}
      >
        Price line
      </MenuCheckboxItem>
      <MenuCheckboxItem
        className={drawingContextMenuItemClass}
        checked={settings.showPriceLabel}
        onCheckedChange={() => run(settings.togglePriceLabel)}
      >
        Last value label
      </MenuCheckboxItem>
      <MenuSeparator />
      <MenuItem className={drawingContextMenuItemClass} onClick={() => run(onOpenSettings)}>
        <ChartIcon name="adjustments-horizontal" />
        Chart settings
      </MenuItem>
    </>
  );
}
