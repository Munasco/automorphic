import { Slider } from "@base-ui/react/slider";
import { cn } from "../../lib/utils";
import { Check } from "./DrawingStyleControls";
import { DrawingNumberField } from "./DrawingNumberField";
import { DEFAULT_DRAWING_VISIBILITY, type DrawingVisibility } from "./drawingVisibility";

const rowClass = "flex h-[50px] min-w-[419.07px] items-center";
const thumbClass =
  "size-3 rounded-full border-2 border-[#dbdbdb] bg-black outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export function DrawingVisibilitySettings({
  visibility,
  onChange,
}: {
  visibility: DrawingVisibility;
  onChange: (visibility: DrawingVisibility) => void;
}) {
  return (
    <>
      <div className={rowClass}>
        <Check
          label="Ticks"
          checked={visibility.ticks}
          onChange={(ticks) => onChange({ ...visibility, ticks })}
        />
      </div>
      {(["seconds", "minutes", "hours", "days", "weeks", "months"] as const).map((unit) => {
        const range = visibility[unit];
        const limit = DEFAULT_DRAWING_VISIBILITY[unit].max;
        const setRange = (patch: Partial<DrawingVisibility[typeof unit]>) =>
          onChange({ ...visibility, [unit]: { ...range, ...patch } });
        return (
          <div key={unit} className={rowClass}>
            <span className="w-[102.07px] shrink-0">
              <Check
                label={unit[0]!.toUpperCase() + unit.slice(1)}
                checked={range.enabled}
                onChange={(enabled) => setRange({ enabled })}
              />
            </span>
            <DrawingNumberField
              label={`${unit} minimum`}
              disabled={!range.enabled}
              min={1}
              max={range.max}
              value={range.min}
              onValueChange={(min) => setRange({ min: Math.max(1, Math.min(range.max, min)) })}
              className="mr-[9px]"
            />
            <Slider.Root
              disabled={!range.enabled}
              min={1}
              max={limit}
              value={[range.min, range.max]}
              thumbAlignment="edge"
              onValueChange={(values) => setRange({ min: values[0]!, max: values[1]! })}
              className={cn("mr-2 w-[100px] shrink-0", !range.enabled && "opacity-40")}
            >
              <Slider.Control className="relative flex h-[34px] w-full touch-none items-center">
                <Slider.Track className="relative h-[10px] w-full rounded-full bg-[#3d3d3d]">
                  <Slider.Indicator className="rounded-full bg-[#dbdbdb]" />
                  <Slider.Thumb
                    index={0}
                    getAriaLabel={() => `${unit} minimum slider`}
                    className={thumbClass}
                  />
                  <Slider.Thumb
                    index={1}
                    getAriaLabel={() => `${unit} maximum slider`}
                    className={thumbClass}
                  />
                </Slider.Track>
              </Slider.Control>
            </Slider.Root>
            <DrawingNumberField
              label={`${unit} maximum`}
              disabled={!range.enabled}
              min={range.min}
              max={limit}
              value={range.max}
              onValueChange={(max) => setRange({ max: Math.min(limit, Math.max(range.min, max)) })}
            />
          </div>
        );
      })}
      <div className={rowClass}>
        <Check
          label="Ranges"
          checked={visibility.ranges}
          onChange={(ranges) => onChange({ ...visibility, ranges })}
        />
      </div>
    </>
  );
}
