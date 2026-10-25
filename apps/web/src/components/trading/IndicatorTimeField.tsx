import { useState } from "react";

/** Keep incomplete edits out of persisted settings until the user commits the field. */
export function IndicatorTimeField({
  label,
  value,
  resetKey,
  className,
  onCommit,
}: {
  label: string;
  value: string;
  resetKey: number | undefined;
  className?: string;
  onCommit: (value: string) => boolean;
}) {
  const [draft, setDraft] = useState(() => ({ value, resetKey, text: value }));
  if (draft.value !== value || draft.resetKey !== resetKey)
    setDraft({ value, resetKey, text: value });

  const restore = () => setDraft({ value, resetKey, text: value });
  const commit = () => {
    const next = draft.text.trim();
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(next) || (next !== value && !onCommit(next))) {
      restore();
      return;
    }
    setDraft({ value, resetKey, text: next });
  };
  return (
    <input
      type="time"
      aria-label={label}
      step={60}
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
