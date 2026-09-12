import { useState } from "react";

/** Keep incomplete edits out of persisted settings until the user commits the field. */
export function IndicatorNumberField({
  label,
  value,
  resetKey,
  min,
  max,
  step,
  className,
  onCommit,
}: {
  label: string;
  value: number;
  resetKey: number | undefined;
  min: number;
  max: number;
  step: number;
  className?: string;
  onCommit: (value: number) => boolean;
}) {
  const [draft, setDraft] = useState(() => ({ value, resetKey, text: String(value) }));
  if (draft.value !== value || draft.resetKey !== resetKey)
    setDraft({ value, resetKey, text: String(value) });

  const restore = () => setDraft({ value, resetKey, text: String(value) });
  const commit = () => {
    const text = draft.text.trim();
    const next = Number(text);
    if (!text || !Number.isFinite(next) || (next !== value && !onCommit(next))) {
      restore();
      return;
    }
    setDraft({ value, resetKey, text: String(next) });
  };
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      className={className}
      value={draft.text}
      onChange={(event) => setDraft({ value, resetKey, text: event.target.value })}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          restore();
        }
      }}
    />
  );
}
