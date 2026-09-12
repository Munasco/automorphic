import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { cn } from "../../lib/utils";

/** The same control used by Appearance settings, sized by its surrounding layout. */
export function TradingSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  popupClassName,
  variant,
}: {
  id?: string;
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  popupClassName?: string;
  variant?: "default" | "ghost";
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectTrigger
        id={id}
        size="sm"
        variant={variant}
        aria-label={label}
        className={cn("min-w-0", className)}
      >
        <SelectValue>{options.find(([key]) => key === value)?.[1] ?? value}</SelectValue>
      </SelectTrigger>
      <SelectPopup
        align="end"
        alignItemWithTrigger={false}
        sideOffset={8}
        className={popupClassName}
        popupClassName={popupClassName ?? ""}
      >
        {options.map(([key, text]) => (
          <SelectItem hideIndicator key={key} value={key}>
            {text}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
