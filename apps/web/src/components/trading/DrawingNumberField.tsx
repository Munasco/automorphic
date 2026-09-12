import { NumberField } from "@base-ui/react/number-field";
import { cn } from "../../lib/utils";
import { ChartIcon } from "./ChartIcon";

const numberFormat: Intl.NumberFormatOptions = {
  useGrouping: false,
  maximumFractionDigits: 20,
};

export function DrawingNumberField({
  label,
  value,
  onValueChange,
  step,
  min,
  max,
  disabled = false,
  readOnly = false,
  showSteppers = true,
  className,
}: {
  label: string;
  value: number | null;
  onValueChange: (value: number) => void;
  step?: number | "any";
  min?: number;
  max?: number;
  disabled?: boolean;
  readOnly?: boolean;
  showSteppers?: boolean;
  className?: string;
}) {
  return (
    <NumberField.Root
      value={value}
      onValueChange={(next) => {
        // Base UI owns the editable string, including empty/sign-only/decimal drafts.
        // Chart previews continue to receive only complete finite numbers.
        if (next !== null && Number.isFinite(next) && next !== value) onValueChange(next);
      }}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      readOnly={readOnly}
      format={numberFormat}
      allowWheelScrub={false}
      className={cn(
        "group/drawing-number relative flex h-[34px] w-[100px] shrink-0 rounded border border-white/15 bg-transparent text-sm leading-[18px] text-zinc-200 focus-within:border-blue-500 data-disabled:cursor-not-allowed data-disabled:opacity-40",
        className,
      )}
    >
      <NumberField.Input
        aria-label={label}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            event.preventBaseUIHandler();
            // Commit formatting while retaining this field and the open dialog.
            event.currentTarget.blur();
            event.currentTarget.focus({ preventScroll: true });
            return;
          }
          // Modified arrows select text instead of applying a larger numeric step.
          if (event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown"))
            event.preventBaseUIHandler();
        }}
        className={cn(
          "h-full w-full min-w-0 rounded bg-transparent py-0 pl-[7px] pr-[7px] text-left text-sm leading-[18px] outline-none disabled:cursor-not-allowed",
          showSteppers &&
            "group-hover/drawing-number:pr-[27px] group-focus-within/drawing-number:pr-[27px]",
        )}
      />
      {showSteppers ? (
        <div className="invisible absolute inset-y-0.5 right-0.5 flex w-[22px] flex-col group-hover/drawing-number:visible group-focus-within/drawing-number:visible">
          <NumberField.Increment
            tabIndex={-1}
            disabled={readOnly}
            aria-label={`Increase ${label}`}
            className="flex min-h-0 flex-1 items-center justify-center rounded-tr text-zinc-400 hover:bg-white/10 hover:text-zinc-200 focus-visible:outline focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChartIcon name="chevron-down" className="size-3 rotate-180" />
          </NumberField.Increment>
          <NumberField.Decrement
            tabIndex={-1}
            disabled={readOnly}
            aria-label={`Decrease ${label}`}
            className="flex min-h-0 flex-1 items-center justify-center rounded-br text-zinc-400 hover:bg-white/10 hover:text-zinc-200 focus-visible:outline focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChartIcon name="chevron-down" className="size-3" />
          </NumberField.Decrement>
        </div>
      ) : null}
    </NumberField.Root>
  );
}
