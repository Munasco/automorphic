import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { cn } from "../../lib/utils";
import type { ComponentProps } from "react";

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
  popupProps,
  itemClassName,
  variant,
  icon,
}: {
  id?: string;
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  popupClassName?: string;
  popupProps?: Pick<
    ComponentProps<typeof SelectPopup>,
    "align" | "sideOffset" | "className" | "popupClassName"
  >;
  itemClassName?: string;
  variant?: "default" | "ghost";
  icon?: ComponentProps<typeof SelectTrigger>["icon"];
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
        icon={icon}
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
        {...popupProps}
      >
        {options.map(([key, text]) => (
          <SelectItem hideIndicator key={key} value={key} className={itemClassName}>
            {text}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
