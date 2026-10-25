import { useState } from "react";

export function IndicatorNameField({
  value,
  placeholder,
  label,
  onCommit,
}: {
  value: string;
  placeholder: string;
  label: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState({ value, text: value });
  if (draft.value !== value) setDraft({ value, text: value });
  const restore = () => setDraft({ value, text: value });
  const commit = () => {
    const next = draft.text.trim();
    if (next.length > 80) {
      restore();
      return;
    }
    if (next !== value) onCommit(next);
    setDraft({ value: next, text: next });
  };
  return (
    <label className="flex flex-col gap-1.5">
      Name
      <input
        aria-label={label}
        type="text"
        maxLength={80}
        placeholder={placeholder}
        value={draft.text}
        className="min-w-0 rounded border border-white/15 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-400"
        onChange={(event) => setDraft({ value, text: event.target.value })}
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
    </label>
  );
}
