/** Empty and sign-only strings remain editable drafts, not numeric chart updates. */
export function isDrawingIntegerDraft(value: string): boolean {
  return /^-?\d*/.exec(value)?.[0] === value;
}

export function acceptsDrawingIntegerInsertion(
  input: Pick<HTMLInputElement, "value" | "selectionStart" | "selectionEnd">,
  inserted: string,
): boolean {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  return isDrawingIntegerDraft(input.value.slice(0, start) + inserted + input.value.slice(end));
}
