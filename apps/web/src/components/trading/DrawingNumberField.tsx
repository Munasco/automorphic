import { NumberField } from "@base-ui/react/number-field";
import { cn } from "../../lib/utils";
import { ChartIcon } from "./ChartIcon";
import { acceptsDrawingIntegerInsertion, isDrawingIntegerDraft } from "./drawingIntegerInput";

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
  integerOnly = false,
  precision,
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
  integerOnly?: boolean;
  precision?: number;
  className?: string;
}) {
  return (
    <NumberField.Root
      value={value}
      onValueChange={(next) => {
        // Base UI owns the editable string, including empty/sign-only/decimal drafts.
        // Chart previews continue to receive only complete finite numbers.
        if (
          next !== null &&
          Number.isFinite(next) &&
          (!integerOnly || Number.isInteger(next)) &&
          next !== value
        )
          onValueChange(next);
      }}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      readOnly={readOnly}
      format={
        precision === undefined
          ? numberFormat
          : { ...numberFormat, minimumFractionDigits: precision, maximumFractionDigits: precision }
      }
      allowWheelScrub={false}
      className={cn(
        "group/drawing-number relative flex h-[34px] w-[100px] shrink-0 rounded-[6px] border border-[#575757] bg-transparent text-sm leading-[18px] text-[#dbdbdb] hover:border-[#8c8c8c] after:pointer-events-none after:absolute after:-inset-px after:rounded-[6px] after:border-2 after:border-transparent focus-within:after:border-[#2962ff] data-disabled:cursor-not-allowed data-disabled:opacity-40",
        className,
      )}
    >
      <NumberField.Input
        aria-label={label}
        onChange={(event) => {
          // Covers paste, drop and replacement input without rewriting the field or its selection.
          if (integerOnly && !isDrawingIntegerDraft(event.currentTarget.value))
            event.preventBaseUIHandler();
        }}
        onPaste={(event) => {
          if (
            integerOnly &&
            !acceptsDrawingIntegerInsertion(
              event.currentTarget,
              event.clipboardData.getData("text"),
            )
          )
            event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (
            integerOnly &&
            event.key.length === 1 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            !acceptsDrawingIntegerInsertion(event.currentTarget, event.key)
          ) {
            event.preventDefault();
            event.preventBaseUIHandler();
            return;
          }
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
          showSteppers && "m-0.5 h-7 w-[calc(100%_-_28px)] pl-[5px] pr-0.5",
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
            <ChartIcon name="chevron-down" className="size-[18px] rotate-180" />
          </NumberField.Increment>
          <NumberField.Decrement
            tabIndex={-1}
            disabled={readOnly}
            aria-label={`Decrease ${label}`}
            className="flex min-h-0 flex-1 items-center justify-center rounded-br text-zinc-400 hover:bg-white/10 hover:text-zinc-200 focus-visible:outline focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChartIcon name="chevron-down" className="size-[18px]" />
          </NumberField.Decrement>
        </div>
      ) : null}
    </NumberField.Root>
  );
}
